#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const scenario = join(
  root,
  'skills/phase/evals/scenarios/audit-planted-defects',
);
const scanner = join(root, 'skills/phase/scripts/scan.mjs');

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
