#!/usr/bin/env node

/**
 * Splices the committed scan golden (expected-scan.txt) into audit.md's
 * scan-golden marker block, the same way update-size-table.mjs maintains
 * the README. The sample output in the docs is machine output; generating
 * it removes the hand-sync step that check-scan-sync.mjs used to flag.
 *
 * Zero dependencies. Exit 0 on success (whether or not a write happened).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const auditPath = join(root, 'skills/phase/references/audit.md');
const goldenPath = join(
  root,
  'skills/phase/evals/scenarios/audit-planted-defects/expected-scan.txt',
);

const golden = readFileSync(goldenPath, 'utf8');
const audit = readFileSync(auditPath, 'utf8');

const blockRe =
  /(<!-- scan-golden:begin -->\s*\n```\n)[\s\S]*?(```\s*\n<!-- scan-golden:end -->)/;
if (!blockRe.test(audit)) {
  console.error('✗ audit.md is missing the scan-golden marker block.');
  process.exit(1);
}

// A function replacement, so `$&`, `$1`, or a backtick-dollar sequence in the
// quoted source lines is spliced literally instead of being interpreted as a
// replacement pattern.
const updated = audit.replace(blockRe, (_match, open, close) => {
  return `${open}${golden}${close}`;
});
if (updated === audit) {
  console.log('✓ audit.md scan sample already in sync.');
} else {
  writeFileSync(auditPath, updated);
  console.log('✓ audit.md scan sample regenerated from expected-scan.txt.');
}
