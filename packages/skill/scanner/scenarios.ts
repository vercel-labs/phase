import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { ScanContext } from './context.ts';
import type { ScanSeverity, ScanSignalId } from './signals.ts';
import { FAIL_ON_SEVERITIES, SIGNALS } from './signals.ts';

const SIGNAL_IDS = new Set<string>(SIGNALS.map((signal) => signal.id));

/**
 * Placeholder tokens for control characters in committed eval fixtures,
 * mapped to the bytes they stand for. Fixtures never contain the raw bytes;
 * the scenario harness decodes these tokens into a temporary copy before
 * scanning.
 */
export const CONTROL_CHARACTER_TOKENS = {
  '{{ESC}}': '\u001b',
  '{{BEL}}': '\u0007',
  '{{RLO}}': '\u202e',
  '{{PDF}}': '\u202c',
} as const;

/**
 * The scenario whose full-scan output is committed as the golden sample and
 * spliced into audit.md. Relative to the @usephase/skill package root.
 */
export const GOLDEN_SCENARIO_DIR = 'evals/scenarios/audit-planted-defects';

/**
 * Loads and validates an eval scenario directory. Requires non-empty
 * `prompt.md` and valid `expected-findings.json` files.
 */
export function loadEvalScenario(directory: string): EvalScenario {
  const promptPath = join(directory, 'prompt.md');
  if (!existsSync(promptPath))
    throw new Error(`${directory} is missing prompt.md`);
  if (readFileSync(promptPath, 'utf8').trim().length === 0) {
    throw new Error(`${promptPath} must not be empty`);
  }

  const findingsPath = join(directory, 'expected-findings.json');
  if (!existsSync(findingsPath)) {
    throw new Error(`${directory} is missing expected-findings.json`);
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(findingsPath, 'utf8'));
  } catch {
    throw new Error(`${findingsPath} is not valid JSON`);
  }
  return parseEvalScenario(basename(directory), value);
}

/**
 * Validates an unknown value against the eval scenario contract. Rejects
 * unknown fields, invalid signal IDs, and scan gates that perform no checks.
 */
export function parseEvalScenario(name: string, value: unknown): EvalScenario {
  const scenario = expectObject(name, value);
  rejectUnknownFields(name, scenario, [
    'description',
    'scan',
    'expectedBehavior',
  ]);

  return {
    description: expectString(`${name}.description`, scenario.description),
    scan: parseScan(name, scenario.scan),
    expectedBehavior: expectStringArray(
      `${name}.expectedBehavior`,
      scenario.expectedBehavior,
    ),
  };
}

/**
 * Normalizes assertion and multi-run scan gates into executable runs. Targets
 * inherit from the scan and default to `workspace`. Golden and skip gates
 * return no runs.
 */
export function evalScenarioRuns(scan: EvalScenarioScan): EvalScenarioRun[] {
  if ('skip' in scan || 'golden' in scan || 'baseline' in scan) return [];
  const runs: EvalScenarioRunSpec[] =
    'runs' in scan ? scan.runs : [{ assertions: scan.assertions }];
  return runs.map((run) => ({
    name: run.name,
    target: run.target ?? scan.target ?? 'workspace',
    assertions: run.assertions,
  }));
}

export interface EvalScenario {
  description: string;
  scan: EvalScenarioScan;
  expectedBehavior: string[];
}

export type EvalScenarioScan =
  | EvalScenarioAssertionScan
  | EvalScenarioRunsScan
  | EvalScenarioGoldenScan
  | EvalScenarioBaselineScan
  | EvalScenarioSkippedScan;

export interface EvalScenarioRun {
  name?: string;
  target: string;
  assertions: EvalScanAssertions;
}

export interface EvalScanAssertions {
  required?: EvalRequiredFinding[];
  requiredAbsent?: EvalAbsentFinding[];
  outputExcludes?: EvalOutputExclusion[];
  context?: Partial<ScanContext>;
}

export interface EvalRequiredFinding {
  signal: ScanSignalId;
  file?: string;
  count?: number;
}

export interface EvalAbsentFinding {
  signal: ScanSignalId;
  reason: string;
}

export interface EvalOutputExclusion {
  text: string;
  reason: string;
}

export interface EvalBaselineWorkflow {
  target: string;
  failOn: Exclude<ScanSeverity, 'dedup'>;
  plant: {
    source: string;
    destination: string;
  };
  newFinding: {
    signal: ScanSignalId;
    file: string;
  };
}

interface EvalScenarioAssertionScan {
  target?: string;
  assertions: EvalScanAssertions;
}

interface EvalScenarioRunsScan {
  target?: string;
  runs: EvalScenarioRunSpec[];
}

interface EvalScenarioGoldenScan {
  golden: string;
}

interface EvalScenarioBaselineScan {
  baseline: EvalBaselineWorkflow;
}

interface EvalScenarioSkippedScan {
  skip: string;
}

interface EvalScenarioRunSpec {
  name?: string;
  target?: string;
  assertions: EvalScanAssertions;
}

/** Selects and validates exactly one supported scan gate variant. */
function parseScan(name: string, value: unknown): EvalScenarioScan {
  const path = `${name}.scan`;
  const scan = expectObject(path, value);
  const gates = ['assertions', 'runs', 'golden', 'baseline', 'skip'].filter(
    (field) => Object.hasOwn(scan, field),
  );
  if (gates.length === 0) throw new Error(`${name} has no scan gate`);
  if (gates.length > 1) {
    throw new Error(`${path} must declare exactly one scan gate`);
  }

  const gate = gates[0];
  if (gate === 'assertions') {
    rejectUnknownFields(path, scan, ['target', 'assertions']);
    return {
      ...optionalTarget(path, scan.target),
      assertions: parseAssertions(`${path}.assertions`, scan.assertions),
    };
  }
  if (gate === 'runs') {
    rejectUnknownFields(path, scan, ['target', 'runs']);
    const runs = expectArray(`${path}.runs`, scan.runs);
    if (runs.length === 0) throw new Error(`${path}.runs must not be empty`);
    return {
      ...optionalTarget(path, scan.target),
      runs: runs.map((run, index) => parseRun(`${path}.runs[${index}]`, run)),
    };
  }
  if (gate === 'golden') {
    rejectUnknownFields(path, scan, ['golden']);
    return { golden: expectString(`${path}.golden`, scan.golden) };
  }
  if (gate === 'baseline') {
    rejectUnknownFields(path, scan, ['baseline']);
    return {
      baseline: parseBaselineWorkflow(`${path}.baseline`, scan.baseline),
    };
  }

  rejectUnknownFields(path, scan, ['skip']);
  return { skip: expectString(`${path}.skip`, scan.skip) };
}

function parseBaselineWorkflow(
  path: string,
  value: unknown,
): EvalBaselineWorkflow {
  const baseline = expectObject(path, value);
  rejectUnknownFields(path, baseline, [
    'target',
    'failOn',
    'plant',
    'newFinding',
  ]);
  const failOn = expectString(`${path}.failOn`, baseline.failOn);
  if (!(FAIL_ON_SEVERITIES as readonly string[]).includes(failOn)) {
    throw new Error(`${path}.failOn must be critical, high, or medium`);
  }

  const plantPath = `${path}.plant`;
  const plant = expectObject(plantPath, baseline.plant);
  rejectUnknownFields(plantPath, plant, ['source', 'destination']);

  const newFindingPath = `${path}.newFinding`;
  const newFinding = expectObject(newFindingPath, baseline.newFinding);
  rejectUnknownFields(newFindingPath, newFinding, ['signal', 'file']);

  return {
    target: expectScenarioPath(`${path}.target`, baseline.target),
    failOn: failOn as Exclude<ScanSeverity, 'dedup'>,
    plant: {
      source: expectScenarioPath(`${plantPath}.source`, plant.source),
      destination: expectScenarioPath(
        `${plantPath}.destination`,
        plant.destination,
      ),
    },
    newFinding: {
      signal: expectSignal(`${newFindingPath}.signal`, newFinding.signal),
      file: expectString(`${newFindingPath}.file`, newFinding.file),
    },
  };
}

function expectScenarioPath(path: string, value: unknown): string {
  const result = expectString(path, value);
  const portable = result.replaceAll('\\', '/');
  const escapes =
    portable.startsWith('/') ||
    /^[A-Za-z]:\//.test(portable) ||
    portable.split('/').includes('..');
  if (escapes) {
    throw new Error(`${path} must be a relative path inside the scenario`);
  }
  return result;
}

function parseRun(path: string, value: unknown): EvalScenarioRunSpec {
  const run = expectObject(path, value);
  rejectUnknownFields(path, run, ['name', 'target', 'assertions']);
  return {
    ...optionalString(path, 'name', run.name),
    ...optionalString(path, 'target', run.target),
    assertions: parseAssertions(`${path}.assertions`, run.assertions),
  };
}

/**
 * Validates assertion fields and rejects structurally valid gates that would
 * execute no checks, such as empty arrays or an empty context object.
 */
function parseAssertions(path: string, value: unknown): EvalScanAssertions {
  const assertions = expectObject(path, value);
  rejectUnknownFields(path, assertions, [
    'required',
    'requiredAbsent',
    'outputExcludes',
    'context',
  ]);
  if (Object.keys(assertions).length === 0) {
    throw new Error(`${path} must declare at least one assertion`);
  }

  const parsed: EvalScanAssertions = {
    ...optionalArray(path, 'required', assertions.required, parseRequired),
    ...optionalArray(
      path,
      'requiredAbsent',
      assertions.requiredAbsent,
      parseAbsent,
    ),
    ...optionalArray(
      path,
      'outputExcludes',
      assertions.outputExcludes,
      parseOutputExclusion,
    ),
    ...(assertions.context === undefined
      ? {}
      : { context: parseContext(`${path}.context`, assertions.context) }),
  };
  if (
    (parsed.required?.length ?? 0) === 0 &&
    (parsed.requiredAbsent?.length ?? 0) === 0 &&
    (parsed.outputExcludes?.length ?? 0) === 0 &&
    Object.keys(parsed.context ?? {}).length === 0
  ) {
    throw new Error(`${path} must declare at least one assertion`);
  }
  return parsed;
}

function parseRequired(path: string, value: unknown): EvalRequiredFinding {
  const finding = expectObject(path, value);
  rejectUnknownFields(path, finding, ['signal', 'file', 'count']);
  const signal = expectSignal(`${path}.signal`, finding.signal);
  const file = optionalString(path, 'file', finding.file);
  const count = finding.count;
  if (
    count !== undefined &&
    (!Number.isInteger(count) || (count as number) < 0)
  ) {
    throw new Error(`${path}.count must be a non-negative integer`);
  }
  return {
    signal,
    ...file,
    ...(count === undefined ? {} : { count: count as number }),
  };
}

function parseAbsent(path: string, value: unknown): EvalAbsentFinding {
  const finding = expectObject(path, value);
  rejectUnknownFields(path, finding, ['signal', 'reason']);
  return {
    signal: expectSignal(`${path}.signal`, finding.signal),
    reason: expectString(`${path}.reason`, finding.reason),
  };
}

function parseOutputExclusion(
  path: string,
  value: unknown,
): EvalOutputExclusion {
  const exclusion = expectObject(path, value);
  rejectUnknownFields(path, exclusion, ['text', 'reason']);
  return {
    text: expectString(`${path}.text`, exclusion.text),
    reason: expectString(`${path}.reason`, exclusion.reason),
  };
}

/** Validates the subset of scanner context that a scenario may assert. */
function parseContext(path: string, value: unknown): Partial<ScanContext> {
  const context = expectObject(path, value);
  rejectUnknownFields(path, context, [
    'framework',
    'appRouter',
    'ppr',
    'clientComponents',
    'evidence',
  ]);
  const result: Partial<ScanContext> = {};
  if (context.framework !== undefined) {
    if (context.framework !== 'next' && context.framework !== null) {
      throw new Error(`${path}.framework must be "next" or null`);
    }
    result.framework = context.framework;
  }
  for (const field of ['appRouter', 'ppr'] as const) {
    if (context[field] !== undefined) {
      if (typeof context[field] !== 'boolean') {
        throw new Error(`${path}.${field} must be a boolean`);
      }
      result[field] = context[field];
    }
  }
  if (context.clientComponents !== undefined) {
    if (
      !Number.isInteger(context.clientComponents) ||
      (context.clientComponents as number) < 0
    ) {
      throw new Error(
        `${path}.clientComponents must be a non-negative integer`,
      );
    }
    result.clientComponents = context.clientComponents as number;
  }
  if (context.evidence !== undefined) {
    result.evidence = expectStringArray(`${path}.evidence`, context.evidence);
  }
  return result;
}

/** Narrows a validated string to an ID from the runtime signal catalog. */
function expectSignal(path: string, value: unknown): ScanSignalId {
  const signal = expectString(path, value);
  if (!SIGNAL_IDS.has(signal)) {
    throw new Error(`${path} references unknown signal \`${signal}\``);
  }
  return signal as ScanSignalId;
}

function expectObject(path: string, value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function expectArray(path: string, value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function expectString(path: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function expectStringArray(path: string, value: unknown): string[] {
  const entries = expectArray(path, value);
  if (entries.length === 0) throw new Error(`${path} must not be empty`);
  return entries.map((entry, index) =>
    expectString(`${path}[${index}]`, entry),
  );
}

function optionalTarget(path: string, value: unknown): { target?: string } {
  return optionalString(path, 'target', value);
}

function optionalString<Key extends string>(
  path: string,
  key: Key,
  value: unknown,
): { [K in Key]?: string } {
  if (value === undefined) return {};
  return { [key]: expectString(`${path}.${key}`, value) } as {
    [K in Key]?: string;
  };
}

function optionalArray<Key extends string, Value>(
  path: string,
  key: Key,
  value: unknown,
  parse: (path: string, value: unknown) => Value,
): { [K in Key]?: Value[] } {
  if (value === undefined) return {};
  const entries = expectArray(`${path}.${key}`, value);
  return {
    [key]: entries.map((entry, index) =>
      parse(`${path}.${key}[${index}]`, entry),
    ),
  } as { [K in Key]?: Value[] };
}

function rejectUnknownFields(
  path: string,
  value: Record<string, unknown>,
  fields: string[],
): void {
  const known = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!known.has(field)) {
      throw new Error(`${path} has unknown field \`${field}\``);
    }
  }
}
