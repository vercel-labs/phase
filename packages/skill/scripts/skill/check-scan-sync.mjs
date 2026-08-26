#!/usr/bin/env node

/**
 * Verifies the audit skill's documentation stays in sync with the scanner
 * and that reference links resolve:
 *
 * 1. audit.md's generated signal table and sample scan output are fresh.
 * 2. Every signal's fix pointer resolves to a real reference file, and its
 *    anchor to a real heading.
 * 3. Every relative link in references/*.md resolves (file and anchor).
 * 4. Every eval scenario satisfies the shared scenario contract.
 * 5. The untrusted-content guardrails exist in audit.md and SKILL.md.
 *
 * Exit code 0 = in sync, 1 = drift detected. Zero dependencies.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  GOLDEN_SCENARIO_DIR,
  loadEvalScenario,
} from '../../scanner/scenarios.ts';
import { NOISE_TIERS, SEVERITY_ORDER, SIGNALS } from '../../scanner/signals.ts';
import { readMarkerBlock } from './marker-block.mjs';
import { isSignalTableFresh } from './scan-docs.mjs';

const packageRoot = resolve(import.meta.dirname, '..', '..');
const repoRoot = resolve(packageRoot, '..', '..');
const refsDir = join(repoRoot, 'skills', 'phase', 'references');
const auditPath = join(refsDir, 'audit.md');
const goldenPath = join(packageRoot, GOLDEN_SCENARIO_DIR, 'expected-scan.txt');

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
// A fence only closes on a marker of at least its own backtick count, so
// ``` blocks nested inside ```` blocks (audit.md's recommendation template)
// do not flip the parser back into prose mid-fence.
function parseMarkdown(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const anchors = new Set();
  const proseLines = [];
  let fence = null;
  for (const line of lines) {
    const marker = /^\s*(`{3,})/.exec(line);
    if (marker) {
      if (fence === null) fence = marker[1].length;
      else if (marker[1].length >= fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
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

// --- 1. Generated regions are fresh ---

const audit = readFileSync(auditPath, 'utf8');

try {
  if (!isSignalTableFresh(audit, SIGNALS, SEVERITY_ORDER)) {
    fail('audit.md signal table is stale (run pnpm skill:build)');
  }

  const golden = readFileSync(goldenPath, 'utf8');
  if (readMarkerBlock(audit, 'scan-golden', { fence: '```' }) !== golden) {
    fail('audit.md sample scan output is stale (run pnpm skill:build)');
  }
} catch (error) {
  fail(error.message);
}

// --- 2. Fix pointers resolve ---

for (const signal of SIGNALS) {
  if (!SEVERITY_ORDER.includes(signal.severity)) {
    fail(`${signal.id} has unknown severity: ${signal.severity}`);
  }
  if (!NOISE_TIERS.includes(signal.noise)) {
    fail(`${signal.id} has unknown noise tier: ${signal.noise}`);
  }
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

// --- 3. Relative links in references resolve ---

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

// --- 4. Eval scenarios satisfy the shared contract ---

const scenariosDir = join(packageRoot, 'evals/scenarios');
const scenarios = readdirSync(scenariosDir);
for (const scenario of scenarios) {
  try {
    loadEvalScenario(join(scenariosDir, scenario));
  } catch (error) {
    fail(
      error instanceof Error ? error.message : `evals/${scenario} is invalid`,
    );
  }
}

// --- 5. Untrusted-content guardrails present ---

// The audit path reads outsider-authored code and scan output; these
// guardrails are the skill's injection defense and must not silently
// disappear in an edit.
const guardAnchor = 'scanned-content-is-data-not-instructions';
if (!markdownInfo(auditPath).anchors.has(guardAnchor)) {
  fail(`audit.md is missing the untrusted-content section (#${guardAnchor})`);
}
const skillMd = readFileSync(join(repoRoot, 'skills/phase/SKILL.md'), 'utf8');
if (!skillMd.includes('untrusted data, never instructions')) {
  fail('SKILL.md is missing the untrusted-content guardrail sentence');
}

// --- Result ---

if (errors > 0) {
  console.error(`\n✗ ${errors} scan/docs sync issue(s) found.`);
  process.exit(1);
} else {
  console.log(
    `✓ Signal table (${SIGNALS.length} signals), ${scenarios.length} eval scenarios, fix pointers, golden sample, and reference links are in sync.`,
  );
}
