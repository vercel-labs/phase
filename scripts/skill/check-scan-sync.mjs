#!/usr/bin/env node

/**
 * Verifies the audit skill's documentation stays in sync with the scanner
 * and that reference links resolve:
 *
 * 1. audit.md's signal table lists exactly the SIGNALS in scan.mjs, with
 *    matching severity and noise tiers.
 * 2. Every signal's fix pointer resolves to a real reference file, and its
 *    anchor to a real heading.
 * 3. audit.md's sample scan output equals the committed golden.
 * 4. Every relative link in references/*.md resolves (file and anchor).
 *
 * Exit code 0 = in sync, 1 = drift detected. Zero dependencies.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { SIGNALS } from '../../skills/phase/scripts/scan.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const refsDir = join(root, 'skills', 'phase', 'references');
const auditPath = join(refsDir, 'audit.md');
const goldenPath = join(
  root,
  'skills/phase/evals/scenarios/audit-planted-defects/expected-scan.txt',
);

let errors = 0;

function fail(message) {
  console.error(`DRIFT: ${message}`);
  errors++;
}

// GitHub-style heading slugs: lowercase, strip punctuation, spaces to dashes.
function slugify(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\w\- ]/g, '')
    .replace(/ /g, '-');
}

// Headings and non-code lines of a markdown file (code fences excluded).
function parseMarkdown(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const anchors = new Set();
  const proseLines = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(````|```)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    proseLines.push(line);
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (heading) anchors.add(slugify(heading[1]));
  }
  return { anchors, proseLines };
}

const markdownCache = new Map();
function markdownInfo(path) {
  if (!markdownCache.has(path)) markdownCache.set(path, parseMarkdown(path));
  return markdownCache.get(path);
}

// --- 1. Signal table matches SIGNALS ---

const audit = readFileSync(auditPath, 'utf8');
const tableRows = new Map();
const rowRe =
  /^\| `([a-z-]+)`\s+\| (critical|high|medium|dedup)\s+\| (precise|normal|noisy)\s+\|/gm;
let row;
while ((row = rowRe.exec(audit)) !== null) {
  tableRows.set(row[1], { severity: row[2], noise: row[3] });
}

for (const signal of SIGNALS) {
  const documented = tableRows.get(signal.id);
  if (!documented) {
    fail(`audit.md signal table is missing \`${signal.id}\``);
    continue;
  }
  if (documented.severity !== signal.severity) {
    fail(
      `audit.md lists ${signal.id} as ${documented.severity}, scan.mjs says ${signal.severity}`,
    );
  }
  if (documented.noise !== signal.noise) {
    fail(
      `audit.md lists ${signal.id} noise as ${documented.noise}, scan.mjs says ${signal.noise}`,
    );
  }
}
for (const id of tableRows.keys()) {
  if (!SIGNALS.some((s) => s.id === id)) {
    fail(`audit.md signal table lists \`${id}\`, which scan.mjs does not have`);
  }
}

// --- 2. Fix pointers resolve ---

for (const signal of SIGNALS) {
  const match = /^references\/([\w./-]+?)(?:#([\w-]+))?$/.exec(signal.fix);
  if (!match) {
    fail(`${signal.id} fix pointer is malformed: ${signal.fix}`);
    continue;
  }
  const [, file, anchor] = match;
  const filePath = join(refsDir, file);
  if (!existsSync(filePath)) {
    fail(`${signal.id} fix points to missing file: ${signal.fix}`);
    continue;
  }
  if (anchor && !markdownInfo(filePath).anchors.has(anchor)) {
    fail(`${signal.id} fix anchor not found: ${signal.fix}`);
  }
}

// --- 3. Golden sample in audit.md matches the committed golden ---

const goldenBlock =
  /<!-- scan-golden:begin -->\s*\n```\n([\s\S]*?)```\s*\n<!-- scan-golden:end -->/.exec(
    audit,
  );
if (!goldenBlock) {
  fail('audit.md is missing the scan-golden block');
} else {
  const golden = readFileSync(goldenPath, 'utf8');
  if (goldenBlock[1] !== golden) {
    fail(
      'audit.md sample scan output differs from expected-scan.txt (regenerate the block from the golden)',
    );
  }
}

// --- 4. Relative links in references resolve ---

// Underscore-prefixed files are templates with placeholder links.
const referenceFiles = readdirSync(refsDir).filter(
  (f) => f.endsWith('.md') && !f.startsWith('_'),
);
const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;

for (const fileName of referenceFiles) {
  const filePath = join(refsDir, fileName);
  const { proseLines } = markdownInfo(filePath);
  for (const line of proseLines) {
    let link;
    while ((link = linkRe.exec(line)) !== null) {
      const target = link[1];
      if (/^[a-z]+:/.test(target)) continue; // absolute URL

      const [pathPart, anchor] = target.split('#');
      const targetPath =
        pathPart === '' ? filePath : resolve(refsDir, pathPart);
      if (!existsSync(targetPath)) {
        fail(`${fileName} links to missing file: ${target}`);
        continue;
      }
      if (anchor && targetPath.endsWith('.md')) {
        if (!markdownInfo(targetPath).anchors.has(anchor)) {
          fail(`${fileName} links to missing anchor: ${target}`);
        }
      }
    }
  }
}

// --- Result ---

if (errors > 0) {
  console.error(`\n✗ ${errors} scan/docs sync issue(s) found.`);
  process.exit(1);
} else {
  console.log(
    `✓ Signal table (${SIGNALS.length} signals), fix pointers, golden sample, and reference links are in sync.`,
  );
}
