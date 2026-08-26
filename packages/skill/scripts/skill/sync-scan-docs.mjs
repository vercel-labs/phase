#!/usr/bin/env node

/**
 * Regenerates audit.md's scanner-derived regions from their source data.
 *
 * Zero dependencies. Exit 0 on success (whether or not a write happened).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { GOLDEN_SCENARIO_DIR } from '../../scanner/scenarios.ts';
import { SEVERITY_ORDER, SIGNALS } from '../../scanner/signals.ts';
import { replaceMarkerBlock } from './marker-block.mjs';
import { renderSignalTable } from './scan-docs.mjs';

const packageRoot = resolve(import.meta.dirname, '..', '..');
const repoRoot = resolve(packageRoot, '..', '..');
const auditPath = join(repoRoot, 'skills/phase/references/audit.md');
const goldenPath = join(packageRoot, GOLDEN_SCENARIO_DIR, 'expected-scan.txt');

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
