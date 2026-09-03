#!/usr/bin/env node

import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assignFingerprints,
  classifyFindings,
  isPreExistingFinding,
  parseBaseline,
  serializeBaseline,
} from './baseline.ts';
import type { PhaseBaseline } from './baseline.ts';
import { sanitizeTerminalLine, sanitizeTerminalText } from './detect.ts';
import type { ScanFinding } from './detect.ts';
import { formatJson, formatText, scanTargets } from './index.ts';
import type { ScanResult } from './index.ts';
import { cliVersion } from './render.ts';
import {
  FAIL_ON_SEVERITIES,
  NOISE_TIERS,
  SEVERITY_ORDER,
  SIGNALS,
} from './signals.ts';
import type { ScanNoise, ScanSeverity } from './signals.ts';
import { toPosix } from './walk.ts';

export * from './index.ts';

// --- CLI --------------------------------------------------------------------

const USAGE = `Usage: node scan.mjs [options] <target> [...targets]

Scans directories or files for animation anti-pattern candidates.
Findings are candidates, not verdicts: classify each against
references/audit.md before recommending a change.

Targets   directories or individual files (default: current directory)

Options
  --json               emit machine-readable JSON (schemaVersion 1)
  --stdin0             read additional NUL-delimited targets from stdin;
                       an empty stream scans nothing instead of "."
  --fail-on <severity> exit 1 if any new finding is at or above the given
                       severity (critical | high | medium); without a baseline,
                       all findings are new; default is advisory
  --baseline <path>    compare findings with this baseline
  --no-baseline        ignore an explicit or auto-detected baseline
  --write-baseline <path>
                       write one complete directory scan as a baseline; exit 0
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
  noBaseline: boolean;
  failOn: Exclude<ScanSeverity, 'dedup'> | null;
  baselinePath: string | null;
  writeBaselinePath: string | null;
  signals: string[];
  severities: ScanSeverity[];
  noiseTiers: ScanNoise[];
  exclude: string[];
  limit: number | null;
  targets: string[];
}

type BooleanOptionKey = 'json' | 'stdin0' | 'help' | 'noBaseline';
type ValueOptionKey =
  | 'failOn'
  | 'baselinePath'
  | 'writeBaselinePath'
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
  '--no-baseline': 'noBaseline',
  '--help': 'help',
  '-h': 'help',
};

/**
 * Options taking a value. `allowed` restricts it to an enum, `list` collects
 * repeats, `map` converts. Table-driven so adding one is a row, not another
 * branch in a parser.
 */
const VALUE_OPTIONS: Record<string, ValueOption> = {
  '--baseline': { key: 'baselinePath', map: toNonEmptyPath },
  '--write-baseline': { key: 'writeBaselinePath', map: toNonEmptyPath },
  '--fail-on': {
    key: 'failOn',
    allowed: FAIL_ON_SEVERITIES,
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

function toNonEmptyPath(raw: string, name: string): string {
  if (raw.length === 0) throw new Error(`${name} expects a non-empty path`);
  return raw;
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
  } else if (spec.key === 'baselinePath' || spec.key === 'writeBaselinePath') {
    opts[spec.key] = value as string;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    json: false,
    stdin0: false,
    help: false,
    noBaseline: false,
    failOn: null,
    baselinePath: null,
    writeBaselinePath: null,
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
  const opts = readOptions(process.argv.slice(2));

  if (opts.help) {
    console.log(USAGE);
    return;
  }

  validateOptions(opts);
  resolveTargets(opts);
  validateBaselineWriteTarget(opts);
  const root = scanRoot(opts);
  const baseline =
    opts.writeBaselinePath !== null ? null : readBaseline(opts, root);
  const scanned = scanTargets(opts.targets, { exclude: opts.exclude, root });
  const version = cliVersion();
  const complete = isCompleteScan(opts, scanned);
  const result = applyBaseline(scanned, baseline, version, complete);
  writeBaseline(result, opts.writeBaselinePath, version, root, complete);
  const filtered = filterFindings(result, opts);
  printResult(filtered, opts);

  if (hitsFailThreshold(filtered.findings, opts)) process.exit(1);
}

function readOptions(argv: string[]): CliOptions {
  try {
    return parseArgs(argv);
  } catch (error) {
    failUsage(error instanceof Error ? error.message : String(error));
  }
}

function validateOptions(opts: CliOptions): void {
  if (opts.writeBaselinePath !== null && opts.baselinePath !== null) {
    failUsage('--baseline cannot be combined with --write-baseline');
  }
  if (
    opts.writeBaselinePath !== null &&
    (opts.signals.length > 0 ||
      opts.severities.length > 0 ||
      opts.noiseTiers.length > 0 ||
      opts.exclude.length > 0 ||
      opts.stdin0)
  ) {
    failUsage(
      '--write-baseline requires a full unfiltered scan; remove --signal, --severity, --noise, --exclude, and --stdin0',
    );
  }
}

function resolveTargets(opts: CliOptions): void {
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
      failUsage(`target does not exist: ${target}`);
    }
  }
}

function validateBaselineWriteTarget(opts: CliOptions): void {
  if (opts.writeBaselinePath === null) return;
  if (
    opts.targets.length !== 1 ||
    !lstatSync(opts.targets[0] as string).isDirectory()
  ) {
    failUsage('--write-baseline requires exactly one directory target');
  }
}

function readBaseline(opts: CliOptions, root: string): PhaseBaseline | null {
  try {
    return loadBaseline(opts, root);
  } catch (error) {
    failUsage(error instanceof Error ? error.message : String(error));
  }
}

function applyBaseline(
  result: ScanResult,
  baseline: PhaseBaseline | null,
  version: string,
  complete: boolean,
): ScanResult {
  if (!baseline) return result;

  const classified = classifyFindings(result.findings, baseline);
  const versionWarning =
    baseline.cliVersion === version
      ? []
      : [
          `baseline version ${baseline.cliVersion} differs from CLI version ${version}; continuing`,
        ];
  return {
    ...result,
    findings: classified.findings,
    warnings: [...result.warnings, ...versionWarning],
    baseline: { stale: complete ? classified.stale : null },
  };
}

function writeBaseline(
  result: ScanResult,
  path: string | null,
  version: string,
  root: string,
  complete: boolean,
): void {
  if (path !== null) {
    if (!complete) {
      failUsage(
        '--write-baseline cannot run because scan coverage is incomplete',
      );
    }
    if (result.filesScanned === 0) {
      failUsage('--write-baseline cannot run because no files were scanned');
    }
    const fingerprints = assignFingerprints(result.findings).map(
      (finding) => finding.fingerprint,
    );
    const requestedPath = resolve(path);
    try {
      const baselinePath = join(
        realpathSync(dirname(requestedPath)),
        basename(requestedPath),
      );
      const destination = lstatSync(baselinePath, { throwIfNoEntry: false });
      if (destination && !destination.isFile()) {
        failUsage(
          `baseline write destination must be a regular file: ${baselinePath}`,
        );
      }
      const baselineRoot =
        toPosix(relative(dirname(baselinePath), root)) || '.';
      const content = serializeBaseline(fingerprints, version, baselineRoot);
      if (Buffer.byteLength(content) > MAX_BASELINE_BYTES) {
        failUsage('generated baseline exceeds 16 MiB');
      }
      writeBaselineFile(baselinePath, content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failUsage(`cannot write baseline: ${path} (${message})`);
    }
  }
}

let baselineWriteSequence = 0;

function writeBaselineFile(path: string, content: string): void {
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${baselineWriteSequence++}.tmp`,
  );
  try {
    writeFileSync(temporary, content, { flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function filterFindings(result: ScanResult, opts: CliOptions): ScanResult {
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
  if (keep.length === 0) return result;
  if (result.baseline) {
    return {
      ...result,
      findings: result.findings.filter((finding) =>
        keep.every((predicate) => predicate(finding)),
      ),
    };
  }
  return {
    ...result,
    findings: result.findings.filter((finding) =>
      keep.every((predicate) => predicate(finding)),
    ),
  };
}

function printResult(result: ScanResult, opts: CliOptions): void {
  for (const warning of result.warnings) {
    console.error(`warning: ${sanitizeTerminalLine(warning)}`);
  }

  if (opts.json) {
    console.log(terminalSafeJson(formatJson(result, opts.limit)));
  } else {
    console.log(sanitizeTerminalText(formatText(result)));
  }
}

function terminalSafeJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  /* oxlint-disable no-control-regex -- escaping terminal-sensitive JSON code points */
  return json.replace(
    /[\u007f-\u009f\u2028-\u202e\u2066-\u2069]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  /* oxlint-enable no-control-regex */
}

function hitsFailThreshold(findings: ScanFinding[], opts: CliOptions): boolean {
  if (!opts.failOn || opts.writeBaselinePath !== null) return false;
  const threshold = SEVERITY_ORDER.indexOf(opts.failOn);
  return findings.some(
    (finding) =>
      !isPreExistingFinding(finding) &&
      finding.severity !== 'dedup' &&
      SEVERITY_ORDER.indexOf(finding.severity) <= threshold,
  );
}

function loadBaseline(opts: CliOptions, root: string): PhaseBaseline | null {
  if (opts.noBaseline) return null;

  const explicit = opts.baselinePath !== null;
  const requestedPath = explicit
    ? resolve(opts.baselinePath as string)
    : join(root, 'phase-baseline.json');
  const source = readBaselineFile(requestedPath, explicit);
  if (!source) return null;
  const { path, json } = source;

  try {
    const baseline = parseBaseline(json);
    if (realpathSync(resolve(dirname(path), baseline.root)) !== root) {
      throw new Error('baseline root does not match the current scan root');
    }
    return baseline;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid baseline ${path}: ${message}`, { cause: error });
  }
}

const MAX_BASELINE_BYTES = 16 * 1024 * 1024;

function readBaselineFile(
  requestedPath: string,
  explicit: boolean,
): { path: string; json: string } | null {
  let path = requestedPath;
  if (explicit) {
    try {
      path = realpathSync(requestedPath);
    } catch (error) {
      throw new Error(`cannot read baseline: ${requestedPath}`, {
        cause: error,
      });
    }
  } else {
    const entry = lstatSync(requestedPath, { throwIfNoEntry: false });
    if (!entry) return null;
    if (!entry.isFile()) {
      throw new Error(
        `auto-detected baseline must be a regular file: ${requestedPath}; use --baseline to read it explicitly`,
      );
    }
  }

  let descriptor: number;
  try {
    /* oxlint-disable no-bitwise -- fs open flags compose as a bitmask */
    descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
    );
    /* oxlint-enable no-bitwise */
  } catch (error) {
    throw new Error(`cannot read baseline: ${requestedPath}`, { cause: error });
  }

  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile()) {
      throw new Error(`baseline must be a regular file: ${requestedPath}`);
    }
    if (stat.size > MAX_BASELINE_BYTES) {
      throw new Error(`baseline exceeds 16 MiB: ${requestedPath}`);
    }
    const json = readBoundedBaseline(descriptor, requestedPath);
    return { path, json };
  } finally {
    closeSync(descriptor);
  }
}

function readBoundedBaseline(descriptor: number, path: string): string {
  const buffer = Buffer.allocUnsafe(MAX_BASELINE_BYTES + 1);
  let bytesRead = 0;
  while (bytesRead < buffer.length) {
    const read = readSync(
      descriptor,
      buffer,
      bytesRead,
      buffer.length - bytesRead,
      null,
    );
    if (read === 0) break;
    bytesRead += read;
  }
  if (bytesRead > MAX_BASELINE_BYTES) {
    throw new Error(`baseline exceeds 16 MiB: ${path}`);
  }
  return buffer.toString('utf8', 0, bytesRead);
}

function scanRoot(opts: CliOptions): string {
  if (opts.stdin0 || opts.targets.length !== 1) {
    return realpathSync(process.cwd());
  }
  const target = resolve(opts.targets[0] as string);
  return lstatSync(target).isDirectory()
    ? realpathSync(target)
    : realpathSync(process.cwd());
}

function isCompleteScan(opts: CliOptions, result: ScanResult): boolean {
  return (
    !opts.stdin0 &&
    opts.exclude.length === 0 &&
    opts.targets.length === 1 &&
    lstatSync(opts.targets[0] as string).isDirectory() &&
    result.filesSkipped.unreadable === 0 &&
    result.filesSkipped.unreadableDirs === 0 &&
    result.linesSkipped === 0
  );
}

function failUsage(message: string): never {
  console.error(`${sanitizeTerminalLine(message)}\n\n${USAGE}`);
  process.exit(2);
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
