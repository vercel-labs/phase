#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const scenario = join(root, 'evals/scenarios/audit-planted-defects');
const scanner = join(root, 'skills/phase/scripts/scan.mjs');

// Goldens must reflect shipped output, so they come from the built bundle.
// Rebuild it first, or a scanner/ edit would regenerate them from a stale one.
const bundle = spawnSync(
  'pnpm',
  ['exec', 'tsdown', '-c', 'tsdown.scanner.config.ts'],
  { cwd: root, stdio: 'inherit' },
);
if (bundle.status !== 0) process.exit(bundle.status ?? 1);

function scan(args) {
  const run = spawnSync(process.execPath, [scanner, ...args, 'workspace'], {
    cwd: scenario,
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    process.stderr.write(run.stderr);
    process.exit(run.status ?? 1);
  }
  return run.stdout;
}

const text = scan([]);
const json = scan(['--json']);

writeFileSync(join(scenario, 'expected-scan.txt'), text);
writeFileSync(join(scenario, 'expected-scan.json'), json);

const sync = spawnSync(
  process.execPath,
  [join(root, 'scripts/skill/sync-scan-docs.mjs')],
  { stdio: 'inherit' },
);
process.exit(sync.status ?? 1);
