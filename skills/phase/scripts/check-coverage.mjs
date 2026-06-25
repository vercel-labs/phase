#!/usr/bin/env node

/**
 * Verifies that every public export from phase's three barrel files has a
 * corresponding reference in skills/phase/references/, and that no orphan
 * reference files exist.
 *
 * Skill metadata (name/version/author/license/abstract) is NOT checked here —
 * metadata.json is generated from SKILL.md frontmatter by build-agents.mjs, so
 * it can't drift; freshness is enforced by CI's rebuild-and-diff step.
 *
 * Exit code 0 = all covered, 1 = drift detected.
 * Zero dependencies — uses only Node built-ins.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..', '..');
const refsDir = resolve(import.meta.dirname, '..', 'references');

// --- Parse exports from barrel files ---

function extractExportNames(filePath) {
  const content = readFileSync(join(root, filePath), 'utf8');
  const names = new Set();

  // Match: export { name1, name2 } from '...'
  const blockRe = /export\s*\{([^}]+)\}/g;
  let match;
  while ((match = blockRe.exec(content)) !== null) {
    const block = match[1];
    for (const item of block.split(',')) {
      const cleaned = item.replace(/\s+as\s+\w+/, '').trim();
      if (cleaned && !cleaned.startsWith('type ')) {
        names.add(cleaned);
      }
    }
  }

  // Match: export type { ... }  — skip these
  // Match: export { ... } — already handled above

  return names;
}

const coreExports = extractExportNames('src/index.ts');
const reactExports = extractExportNames('src/react/index.ts');

// Ease exports are covered by a single ease.md (one tree-shaken entry point).
// Identify them by reading the ease barrel source for `export function` declarations.
const easeExports = new Set(['ease']);
const easeSource = readFileSync(join(root, 'src/ease/index.ts'), 'utf8');
const easeFnRe = /export\s+function\s+(\w+)/g;
let easeFnMatch;
while ((easeFnMatch = easeFnRe.exec(easeSource)) !== null) {
  coreExports.delete(easeFnMatch[1]);
}
// Also catch `export interface` from ease
const easeInterfaceRe = /export\s+interface\s+(\w+)/g;
let easeIfMatch;
while ((easeIfMatch = easeInterfaceRe.exec(easeSource)) !== null) {
  coreExports.delete(easeIfMatch[1]);
}

// --- Map export names to expected reference filenames ---

function exportToFilename(name) {
  // Special cases
  if (name === 'PhaseError' || name === 'isPhaseError') return 'errors.md';
  if (name === 'Presence') return 'presence.md';
  if (name === 'WhenVisible') return 'when-visible.md';
  if (name === 'Swap') return 'swap.md';

  // camelCase/PascalCase → kebab-case
  const kebab = name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

  return kebab + '.md';
}

// Build expected set (deduplicated)
const expectedFiles = new Set();

for (const name of coreExports) {
  expectedFiles.add(exportToFilename(name));
}
for (const name of reactExports) {
  expectedFiles.add(exportToFilename(name));
}
for (const name of easeExports) {
  expectedFiles.add(exportToFilename(name));
}

// Cross-cutting files that are expected but don't map to exports
const crossCutting = new Set([
  'decision-guide.md',
  'performance.md',
  'audit.md',
  'rendering-recipes.md',
]);

// --- Check actual reference files ---

const actualFiles = new Set(
  readdirSync(refsDir).filter((f) => f.endsWith('.md') && !f.startsWith('_')),
);

let errors = 0;

// Check for uncovered exports
for (const expected of expectedFiles) {
  if (!actualFiles.has(expected)) {
    console.error(`MISSING: references/${expected} (export has no reference)`);
    errors++;
  }
}

// Check for orphan reference files
for (const actual of actualFiles) {
  if (!expectedFiles.has(actual) && !crossCutting.has(actual)) {
    console.error(`ORPHAN:  references/${actual} (no matching export)`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\n✗ ${errors} coverage issue(s) found.`);
  process.exit(1);
} else {
  console.log(
    `✓ All ${expectedFiles.size} exports covered. ${crossCutting.size} cross-cutting references OK.`,
  );
}
