#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
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
  statSync,
  writeFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assignFingerprints,
  classifyFindings,
  isPreExistingFinding,
  isSafeScannerVersion,
  parseBaseline,
  serializeBaseline,
} from './baseline.ts';
import type { PhaseBaseline } from './baseline.ts';
import { sanitizeTerminalLine, sanitizeTerminalText } from './detect.ts';
import type { ScanFinding } from './detect.ts';
import { formatSignalExplanation, formatSignalList } from './explain.ts';
import {
  formatGithubAnnotations,
  formatGithubSummary,
  formatJson,
  formatText,
  scanTargets,
} from './index.ts';
import type { ScanResult } from './index.ts';
import { findingFailsGate, GITHUB_STEP_SUMMARY_LIMIT } from './render.ts';
import type { ScanFailOn } from './render.ts';
import {
  FAIL_ON_SEVERITIES,
  NOISE_TIERS,
  SEVERITY_ORDER,
  SIGNALS,
} from './signals.ts';
import type { ScanNoise, ScanSeverity } from './signals.ts';
import { toPosix } from './walk.ts';

declare const __PHASE_COMMAND__: string;
declare const __PHASE_PACKAGE_VERSION__: string | null;
declare const __PHASE_SCANNER_VERSION__: string | null;

// --- CLI --------------------------------------------------------------------

const USAGE = `Usage: ${__PHASE_COMMAND__} [scan] [options] <target> [...targets]
       ${__PHASE_COMMAND__} explain [signal-id]
       ${__PHASE_COMMAND__} --version

Scans directories or files for animation anti-pattern candidates.
Findings are candidates, not verdicts. Run
${__PHASE_COMMAND__} explain <signal-id> before recommending a change.

Targets   directories or individual files (default: current directory)
          use "-- scan" or "-- explain" to scan a target with that name

${
  __PHASE_PACKAGE_VERSION__ === null
    ? ''
    : `Start with
  ${__PHASE_COMMAND__} scan --diff origin/main
  ${__PHASE_COMMAND__} scan <path>

`
}Options
  --json               emit machine-readable JSON (alias for --format json)
  --format <format>    output format (text | json | github); default is text
  --no-annotations     omit annotations from --format github output
  --stdin0             read additional NUL-delimited targets from stdin;
                       an empty stream scans nothing instead of "."
  --diff <ref>         scan committed files changed since the merge base with
                       this Git ref (added, copied, modified, or renamed)
  --fail-on <severity> exit 1 if any new finding is at or above the given
                        severity (critical | high | medium | none); without a
                        baseline, all findings are new; none is report-only
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
  --                   treat every remaining argument as a target
  -h, --help           show this help

Suppression
  A comment \`phase-scan-ignore <signal-id> -- <reason>\` suppresses that
  signal on the same and the next line. The reason is mandatory.

Reading a large report
  Use text output for large scans; it caps each signal's listing. For JSON,
  use --json --signal <id> to select one signal. Unfiltered JSON can contain
  tens of thousands of tokens.

Exit codes: 0 = scan completed, 1 = --fail-on threshold hit, 2 = usage error.`;

const EXPLAIN_USAGE = `Usage: ${__PHASE_COMMAND__} explain [signal-id]

Print one signal's triage metadata and bundled fix section.
Without a signal id, list every signal one per line.`;

interface CliOptions {
  json: boolean;
  format: OutputFormat | null;
  stdin0: boolean;
  help: boolean;
  noAnnotations: boolean;
  noBaseline: boolean;
  failOn: ScanFailOn;
  baselinePath: string | null;
  writeBaselinePath: string | null;
  diffRef: string | null;
  signals: string[];
  severities: ScanSeverity[];
  noiseTiers: ScanNoise[];
  exclude: string[];
  limit: number | null;
  targets: string[];
}

type OutputFormat = 'text' | 'json' | 'github';

type BooleanOptionKey =
  | 'json'
  | 'stdin0'
  | 'help'
  | 'noAnnotations'
  | 'noBaseline';
type ValueOptionKey =
  | 'failOn'
  | 'format'
  | 'baselinePath'
  | 'writeBaselinePath'
  | 'diffRef'
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
  '--no-annotations': 'noAnnotations',
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
  '--format': { key: 'format', allowed: ['text', 'json', 'github'] },
  '--baseline': { key: 'baselinePath', map: toNonEmptyPath },
  '--write-baseline': { key: 'writeBaselinePath', map: toNonEmptyPath },
  '--diff': { key: 'diffRef', map: toNonEmptyPath },
  '--fail-on': {
    key: 'failOn',
    allowed: [...FAIL_ON_SEVERITIES, 'none'],
    expects: 'critical, high, medium, or none',
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
    opts.failOn = value as ScanFailOn;
  } else if (spec.key === 'format') {
    opts.format = value as OutputFormat;
  } else if (spec.key === 'limit') {
    opts.limit = value as number;
  } else if (
    spec.key === 'baselinePath' ||
    spec.key === 'writeBaselinePath' ||
    spec.key === 'diffRef'
  ) {
    opts[spec.key] = value as string;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    json: false,
    format: null,
    stdin0: false,
    help: false,
    noAnnotations: false,
    noBaseline: false,
    failOn: null,
    baselinePath: null,
    writeBaselinePath: null,
    diffRef: null,
    signals: [],
    severities: [],
    noiseTiers: [],
    exclude: [],
    limit: null,
    targets: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--') {
      opts.targets.push(...argv.slice(i + 1));
      break;
    }
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
  const argv = process.argv.slice(2);
  if (__PHASE_PACKAGE_VERSION__ !== null && argv.length === 0) {
    console.log(USAGE);
    return;
  }
  if (argv[0] === '--version') {
    console.log(formatVersion(resolveScannerVersion()));
    return;
  }
  if (argv[0] === 'explain') {
    explain(argv.slice(1));
    return;
  }

  const opts = readOptions(argv[0] === 'scan' ? argv.slice(1) : argv);

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
  const version = resolveScannerVersion();
  const complete = isCompleteScan(opts, scanned);
  const result = applyBaseline(scanned, baseline, version, complete);
  writeBaseline(result, opts.writeBaselinePath, version, root, complete);
  const filtered = filterFindings(result, opts);
  printResult(filtered, opts, version);

  if (hitsFailThreshold(filtered.findings, opts)) process.exit(1);
}

function explain(argv: string[]): void {
  if (argv.length === 0) {
    console.log(formatSignalList(SIGNALS));
    return;
  }
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    console.log(EXPLAIN_USAGE);
    return;
  }

  const id = argv[0] as string;
  if (argv.length > 1 || id.startsWith('-')) {
    const message = id.startsWith('-')
      ? `unknown option: ${id}`
      : 'explain expects one signal id';
    console.error(`${sanitizeTerminalLine(message)}\n\n${EXPLAIN_USAGE}`);
    process.exit(2);
  }

  const signal = SIGNALS.find((candidate) => candidate.id === id);
  if (!signal) {
    console.error(
      `explain expects a known signal id (got: ${sanitizeTerminalLine(id)})\n\n${formatSignalList(SIGNALS)}\n\n${EXPLAIN_USAGE}`,
    );
    process.exit(2);
  }
  console.log(formatSignalExplanation(signal));
}

function readOptions(argv: string[]): CliOptions {
  try {
    return parseArgs(argv);
  } catch (error) {
    failUsage(error instanceof Error ? error.message : String(error));
  }
}

function validateOptions(opts: CliOptions): void {
  if (opts.json && opts.format !== null && opts.format !== 'json') {
    failUsage('--json cannot be combined with a non-JSON --format');
  }
  if (opts.writeBaselinePath !== null && opts.baselinePath !== null) {
    failUsage('--baseline cannot be combined with --write-baseline');
  }
  if (opts.writeBaselinePath !== null && opts.diffRef !== null) {
    failUsage('--write-baseline cannot be combined with --diff');
  }
  if (opts.diffRef !== null && opts.stdin0) {
    failUsage('--diff cannot be combined with --stdin0');
  }
  if (opts.diffRef !== null && opts.targets.length > 0) {
    failUsage('--diff cannot be combined with explicit targets');
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
  if (opts.diffRef !== null) {
    try {
      if (opts.baselinePath !== null) {
        opts.baselinePath = resolve(opts.baselinePath);
      }
      const diff = resolveDiffTargets(opts.diffRef);
      process.chdir(diff.root);
      opts.targets.push(...diff.targets);
    } catch (error) {
      failUsage(error instanceof Error ? error.message : String(error));
    }
  }
  if (opts.targets.length === 0 && !opts.stdin0 && opts.diffRef === null) {
    opts.targets.push('.');
  }
  const targets: string[] = [];
  for (const target of opts.targets) {
    try {
      const targetType = lstatSync(target);
      if (opts.diffRef !== null) {
        if (targetType.isSymbolicLink()) {
          failUsage(`diff target must be a regular file: ${target}`);
        }
        if (!targetType.isFile()) continue;
      }
      targets.push(target);
    } catch {
      failUsage(`target does not exist: ${target}`);
    }
  }
  opts.targets = targets;
}

interface DiffTargets {
  root: string;
  targets: string[];
}

function resolveDiffTargets(ref: string): DiffTargets {
  const rootRun = spawnGit(['rev-parse', '--show-toplevel']);
  if (rootRun.status !== 0) {
    throw new Error('cannot resolve --diff outside a Git worktree');
  }
  const root = rootRun.stdout.replace(/\r?\n$/, '');
  const refRun = spawnGit(
    ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`],
    root,
  );
  if (refRun.status !== 0) {
    throw new Error(`cannot resolve --diff ref ${JSON.stringify(ref)}`);
  }
  const oid = refRun.stdout.trim();
  const run = spawnGit(
    [
      'diff',
      '--raw',
      '--diff-filter=ACMR',
      '--find-renames',
      '-z',
      `${oid}...HEAD`,
      '--',
    ],
    root,
  );
  if (run.status !== 0) {
    throw new Error(`cannot resolve --diff ref ${JSON.stringify(ref)}`);
  }
  const targets: string[] = [];
  const fields = run.stdout.split('\0');
  for (let index = 0; fields[index]; ) {
    const metadata = fields[index++] as string;
    const parsed = /^:\d{6} (\d{6}) [0-9a-f]+ [0-9a-f]+ ([A-Z])\d*$/.exec(
      metadata,
    );
    if (!parsed) throw new Error('git returned an invalid diff record');
    const newMode = parsed[1];
    const status = parsed[2] as string;
    const first = fields[index++] as string;
    if (status === 'R' || status === 'C') {
      const destination = fields[index++] as string;
      if (newMode !== '160000') targets.push(destination);
    } else {
      if (newMode !== '160000') targets.push(first);
    }
  }
  for (const target of targets) {
    const fromRoot = relative(root, resolve(root, target));
    if (
      fromRoot === '..' ||
      fromRoot.startsWith(`..${sep}`) ||
      isAbsolute(fromRoot)
    ) {
      throw new Error('git returned a path outside the worktree');
    }
  }
  return { root, targets };
}

function spawnGit(args: string[], cwd?: string) {
  const run = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (run.error) throw new Error('cannot run Git to resolve --diff');
  return run;
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
          `baseline scanner version ${baseline.cliVersion} differs from current scanner version ${version}; continuing`,
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

function printResult(
  result: ScanResult,
  opts: CliOptions,
  scannerVersion: string,
): void {
  for (const warning of result.warnings) {
    console.error(`warning: ${sanitizeTerminalLine(warning)}`);
  }

  const format = opts.format ?? (opts.json ? 'json' : 'text');
  if (format === 'json') {
    console.log(
      terminalSafeJson(formatJson(result, scannerVersion, opts.limit)),
    );
  } else if (format === 'github') {
    const scan = formatJson(result, scannerVersion);
    if (!opts.noAnnotations) {
      const annotations = formatGithubAnnotations(scan, opts.failOn);
      if (annotations) process.stdout.write(annotations);
    }

    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryPath) {
      process.stdout.write(formatGithubSummary(scan, opts.failOn));
      return;
    }
    try {
      const existing =
        statSync(summaryPath, { throwIfNoEntry: false })?.size ?? 0;
      const available = Math.max(0, GITHUB_STEP_SUMMARY_LIMIT - existing);
      const summary = formatGithubSummary(scan, opts.failOn, available);
      if (summary) appendFileSync(summaryPath, summary, 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failUsage(`cannot write GitHub job summary: ${message}`);
    }
  } else {
    console.log(sanitizeTerminalText(formatText(result)));
  }
}

function resolveScannerVersion(): string {
  if (isSafeScannerVersion(__PHASE_SCANNER_VERSION__)) {
    return __PHASE_SCANNER_VERSION__;
  }

  try {
    const metadataPath = fileURLToPath(
      new URL('../metadata.json', import.meta.url),
    );
    const version = (
      JSON.parse(readFileSync(metadataPath, 'utf8')) as { version?: unknown }
    ).version;
    if (isSafeScannerVersion(version)) return version;
  } catch {
    // Some skill installers omit generated metadata; SKILL.md is canonical.
  }

  try {
    const skillPath = fileURLToPath(new URL('../SKILL.md', import.meta.url));
    const skill = readFileSync(skillPath, 'utf8');
    const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    const version = frontmatter.match(
      /^\s+version:\s*['"]?([^'"\s]+)['"]?\s*$/m,
    )?.[1];
    return isSafeScannerVersion(version) ? version : 'unknown';
  } catch {
    return 'unknown';
  }
}

function formatVersion(scannerVersion: string): string {
  return __PHASE_PACKAGE_VERSION__ === null
    ? `scan.mjs (scanner ${scannerVersion})`
    : `${__PHASE_COMMAND__} ${__PHASE_PACKAGE_VERSION__} (scanner ${scannerVersion})`;
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
  if (
    !opts.failOn ||
    opts.failOn === 'none' ||
    opts.writeBaselinePath !== null
  ) {
    return false;
  }
  return findings.some(
    (finding) =>
      !isPreExistingFinding(finding) && findingFailsGate(finding, opts.failOn),
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
  if (opts.stdin0 || opts.diffRef !== null || opts.targets.length !== 1) {
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
