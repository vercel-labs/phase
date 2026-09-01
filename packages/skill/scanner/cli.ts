#!/usr/bin/env node

import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ScanFinding } from './detect.ts';
import { formatJson, formatText, scanTargets } from './index.ts';
import { NOISE_TIERS, SEVERITY_ORDER, SIGNALS } from './signals.ts';
import type { ScanNoise, ScanSeverity } from './signals.ts';
import { toPosix } from './walk.ts';

export * from './index.ts';

// --- CLI --------------------------------------------------------------------

const USAGE = `Usage: node scan.mjs [options] <target> [...targets]

Scans directories or files for browser runtime anti-pattern candidates.
Findings are candidates, not verdicts: classify each against
references/audit.md before recommending a change.

Targets   directories or individual files (default: current directory)

Options
  --json               emit machine-readable JSON (schemaVersion 1)
  --stdin0             read additional NUL-delimited targets from stdin;
                       an empty stream scans nothing instead of "."
  --fail-on <severity> exit 1 if any finding is at or above the given
                       severity (critical | high | medium); default is
                       exit 0 regardless of findings (advisory)
  --signal <id>        report only this signal (repeatable)
  --severity <level>   report only this severity (repeatable)
  --noise <tier>       report only this noise tier, e.g. --noise precise
                       --noise normal to drop the noisy ones (repeatable)
  --exclude <path>     skip paths containing this substring, or matching it
                       as a glob when it has a wildcard (repeatable)
  --limit <n>          cap the findings array in --json output
  -h, --help           show this help

Suppression
  A comment \`phase-scan-ignore <signal-id> -- <reason>\` suppresses that
  signal on the same and the next line. The reason is mandatory.

Reading a large report
  Prefer the text output: it caps each signal's listing. Reach for --json
  scoped to one signal (--json --signal <id>) rather than dumping every
  finding, which on a large codebase runs to tens of thousands of tokens.

Exit codes: 0 = scan completed, 1 = --fail-on threshold hit, 2 = usage error.`;

interface CliOptions {
  json: boolean;
  stdin0: boolean;
  help: boolean;
  failOn: Exclude<ScanSeverity, 'dedup'> | null;
  signals: string[];
  severities: ScanSeverity[];
  noiseTiers: ScanNoise[];
  exclude: string[];
  limit: number | null;
  targets: string[];
}

type BooleanOptionKey = 'json' | 'stdin0' | 'help';
type ValueOptionKey =
  | 'failOn'
  | 'signals'
  | 'severities'
  | 'noiseTiers'
  | 'exclude'
  | 'limit';

interface ValueOption {
  key: ValueOptionKey;
  list?: boolean;
  allowed?: readonly string[] | (() => string[]);
  expects?: string;
  map?: (raw: string, name: string) => string | number;
}

/** Boolean switches, by the argument that sets them. */
const FLAGS: Record<string, BooleanOptionKey> = {
  '--json': 'json',
  '--stdin0': 'stdin0',
  '--help': 'help',
  '-h': 'help',
};

/**
 * Options taking a value. `allowed` restricts it to an enum, `list` collects
 * repeats, `map` converts. Table-driven so adding one is a row, not another
 * branch in a parser.
 */
const VALUE_OPTIONS: Record<string, ValueOption> = {
  '--fail-on': {
    key: 'failOn',
    allowed: ['critical', 'high', 'medium'],
    expects: 'critical, high, or medium',
  },
  '--signal': {
    key: 'signals',
    list: true,
    allowed: () => SIGNALS.map((signal) => signal.id),
    expects: 'a known signal id',
  },
  '--severity': { key: 'severities', list: true, allowed: SEVERITY_ORDER },
  '--noise': { key: 'noiseTiers', list: true, allowed: NOISE_TIERS },
  '--exclude': { key: 'exclude', list: true, map: toPosix },
  '--limit': { key: 'limit', map: toPositiveInt },
};

function toPositiveInt(raw: string, name: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} expects a positive integer (got: ${raw})`);
  }
  return value;
}

function applyOption(
  opts: CliOptions,
  name: string,
  spec: ValueOption,
  raw: string | undefined,
): void {
  if (raw === undefined) throw new Error(`${name} expects a value`);
  const allowed =
    typeof spec.allowed === 'function' ? spec.allowed() : spec.allowed;
  if (allowed && !allowed.includes(raw)) {
    throw new Error(
      `${name} expects ${spec.expects ?? allowed.join(', ')} (got: ${raw})`,
    );
  }
  const value = spec.map ? spec.map(raw, name) : raw;
  if (spec.list) {
    if (spec.key === 'signals' || spec.key === 'exclude') {
      opts[spec.key].push(value as string);
    } else if (spec.key === 'severities') {
      opts.severities.push(value as ScanSeverity);
    } else if (spec.key === 'noiseTiers') {
      opts.noiseTiers.push(value as ScanNoise);
    }
  } else if (spec.key === 'failOn') {
    opts.failOn = value as Exclude<ScanSeverity, 'dedup'>;
  } else if (spec.key === 'limit') {
    opts.limit = value as number;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    json: false,
    stdin0: false,
    help: false,
    failOn: null,
    signals: [],
    severities: [],
    noiseTiers: [],
    exclude: [],
    limit: null,
    targets: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    const flag = FLAGS[arg];
    const valueOption = VALUE_OPTIONS[arg];
    if (flag) {
      opts[flag] = true;
    } else if (valueOption) {
      applyOption(opts, arg, valueOption, argv[++i]);
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      opts.targets.push(arg);
    }
  }
  return opts;
}

function main(): void {
  let opts: CliOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${message}\n\n${USAGE}`);
    process.exit(2);
  }

  if (opts.help) {
    console.log(USAGE);
    return;
  }

  if (opts.stdin0) {
    const input = readFileSync(0, 'utf8');
    for (const target of input.split('\0')) {
      if (target !== '') opts.targets.push(target);
    }
  }
  if (opts.targets.length === 0 && !opts.stdin0) opts.targets.push('.');
  for (const target of opts.targets) {
    try {
      lstatSync(target);
    } catch {
      console.error(`target does not exist: ${target}\n\n${USAGE}`);
      process.exit(2);
    }
  }

  const result = scanTargets(opts.targets, { exclude: opts.exclude });

  const keep: ((finding: ScanFinding) => boolean)[] = [];
  if (opts.signals.length > 0) {
    keep.push((finding) => opts.signals.includes(finding.signal));
  }
  if (opts.severities.length > 0) {
    keep.push((finding) => opts.severities.includes(finding.severity));
  }
  if (opts.noiseTiers.length > 0) {
    keep.push((finding) => opts.noiseTiers.includes(finding.noise));
  }
  if (keep.length > 0) {
    result.findings = result.findings.filter((f) => keep.every((p) => p(f)));
  }

  for (const warning of result.warnings) {
    console.error(`warning: ${warning}`);
  }

  if (opts.json) {
    console.log(JSON.stringify(formatJson(result, opts.limit), null, 2));
  } else {
    console.log(formatText(result));
  }

  if (opts.failOn) {
    const threshold = SEVERITY_ORDER.indexOf(opts.failOn);
    const hit = result.findings.some(
      (f) =>
        f.severity !== 'dedup' &&
        SEVERITY_ORDER.indexOf(f.severity) <= threshold,
    );
    if (hit) process.exit(1);
  }
}

// import.meta.url is already symlink-resolved, but argv[1] is whatever the
// caller typed. Comparing them unresolved means a skill installed under a
// symlinked path never matches, and the CLI exits 0 having printed nothing —
// indistinguishable from a clean scan.
function isEntryPoint(argvPath: string): boolean {
  const self = fileURLToPath(import.meta.url);
  try {
    return realpathSync(argvPath) === self;
  } catch {
    return resolve(argvPath) === self;
  }
}

if (process.argv[1] && isEntryPoint(process.argv[1])) {
  main();
}
