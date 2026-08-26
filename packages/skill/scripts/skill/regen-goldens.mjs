#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  CONTROL_CHARACTER_TOKENS,
  GOLDEN_SCENARIO_DIR,
} from '../../scanner/scenarios.ts';

const packageRoot = resolve(import.meta.dirname, '..', '..');
const repoRoot = resolve(packageRoot, '..', '..');
const scenario = join(packageRoot, GOLDEN_SCENARIO_DIR);
const scanner = join(repoRoot, 'skills/phase/scripts/scan.mjs');

// This script scans the committed fixture directly, without the token
// materialization the scenario test harness performs, so the golden scenario
// must stay token-free or the goldens would diverge from what the tests scan.
for (const file of readdirSync(join(scenario, 'workspace'), {
  recursive: true,
  withFileTypes: true,
})) {
  if (!file.isFile()) continue;
  const path = join(file.parentPath, file.name);
  const content = readFileSync(path, 'utf8');
  for (const token of Object.keys(CONTROL_CHARACTER_TOKENS)) {
    if (content.includes(token)) {
      console.error(
        `${path} contains ${token}: the golden scenario is scanned without token materialization, so move tokenized fixtures to a different scenario`,
      );
      process.exit(1);
    }
  }
}

// Goldens must reflect shipped output, so they come from the built bundle.
// Rebuild it first, or a scanner/ edit would regenerate them from a stale one.
const bundle = spawnSync(
  'pnpm',
  ['exec', 'tsdown', '-c', 'tsdown.scanner.config.ts'],
  { cwd: packageRoot, stdio: 'inherit' },
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
  [join(packageRoot, 'scripts/skill/sync-scan-docs.mjs')],
  { stdio: 'inherit' },
);
process.exit(sync.status ?? 1);
