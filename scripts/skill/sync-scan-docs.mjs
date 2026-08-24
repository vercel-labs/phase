#!/usr/bin/env node

/**
 * Regenerates audit.md's scanner-derived regions from their source data.
 *
 * Zero dependencies. Exit 0 on success (whether or not a write happened).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { SEVERITY_ORDER, SIGNALS } from '../../scanner/signals.ts';
import { replaceMarkerBlock } from './marker-block.mjs';
import { renderSignalTable } from './scan-docs.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const auditPath = join(root, 'skills/phase/references/audit.md');
const goldenPath = join(
  root,
  'evals/scenarios/audit-planted-defects/expected-scan.txt',
);

const golden = readFileSync(goldenPath, 'utf8');
const audit = readFileSync(auditPath, 'utf8');

let updated;
try {
  updated = replaceMarkerBlock(audit, 'scan-golden', golden, {
    fence: '```',
  });
  updated = replaceMarkerBlock(
    updated,
    'signal-table',
    renderSignalTable(SIGNALS, SEVERITY_ORDER),
  );
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
if (updated === audit) {
  console.log('✓ audit.md generated regions already in sync.');
} else {
  writeFileSync(auditPath, updated);
  console.log('✓ audit.md generated regions rebuilt.');
}
