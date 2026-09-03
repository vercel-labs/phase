#!/usr/bin/env node

/**
 * Verifies the audit skill's documentation stays in sync with the scanner
 * and that reference links resolve:
 *
 * 1. audit.md's generated signal table and sample scan output are fresh.
 * 2. Every signal's fix pointer extracts a non-empty, bundled fix section.
 * 3. Every relative link in references/*.md resolves (file and anchor).
 * 4. Every eval scenario satisfies the shared scenario contract.
 * 5. The untrusted-content guardrails exist in audit.md and SKILL.md.
 *
 * Exit code 0 = in sync, 1 = drift detected. Zero dependencies.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { FIX_SECTIONS } from '../../scanner/fix-sections.gen.ts';
import {
  GOLDEN_SCENARIO_DIR,
  loadEvalScenario,
} from '../../scanner/scenarios.ts';
import { NOISE_TIERS, SEVERITY_ORDER, SIGNALS } from '../../scanner/signals.ts';
import { collectFixSections } from './fix-sections.mjs';
import { parseMarkdown } from './markdown.mjs';
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

const markdownCache = new Map();
function markdownInfo(path) {
  if (!markdownCache.has(path)) {
    markdownCache.set(path, parseMarkdown(readFileSync(path, 'utf8')));
  }
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

// --- 2. Fix sections extract and match the bundled map ---

for (const signal of SIGNALS) {
  if (!SEVERITY_ORDER.includes(signal.severity)) {
    fail(`${signal.id} has unknown severity: ${signal.severity}`);
  }
  if (!NOISE_TIERS.includes(signal.noise)) {
    fail(`${signal.id} has unknown noise tier: ${signal.noise}`);
  }
}

try {
  const sections = collectFixSections(SIGNALS, refsDir);
  const bundledEntries = Object.entries(FIX_SECTIONS);
  const stale =
    bundledEntries.length !== sections.size ||
    bundledEntries.some(
      ([pointer, section]) => sections.get(pointer) !== section,
    );
  if (stale) {
    fail('bundled fix sections are stale (run pnpm skill:build)');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
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
    `✓ Signal table (${SIGNALS.length} signals), ${scenarios.length} eval scenarios, fix sections, golden sample, and reference links are in sync.`,
  );
}
