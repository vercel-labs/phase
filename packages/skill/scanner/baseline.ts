import { createHash } from 'node:crypto';

import type { ScanFinding } from './detect.ts';

export const BASELINE_SCHEMA_VERSION = 1;
export const FINDING_SOURCE_LINE: unique symbol = Symbol('findingSourceLine');

export interface PhaseBaseline {
  schemaVersion: typeof BASELINE_SCHEMA_VERSION;
  cliVersion: string;
  fingerprints: string[];
}

export type FingerprintedFinding<Finding extends ScanFinding = ScanFinding> =
  Finding & { fingerprint: string };

export interface ClassifiedFinding extends FingerprintedFinding {
  baselineState: 'new' | 'pre-existing';
}

export interface FindingClassification {
  findings: ClassifiedFinding[];
  stale: number;
}

/** Normalizes a finding's source line for location-independent identity. */
export function normalizeLine(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** Returns the twelve-character SHA-256 prefix used in a fingerprint. */
export function hashFindingLine(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

/** Assigns stable fingerprints without changing finding order. */
export function assignFingerprints<Finding extends ScanFinding>(
  findings: Finding[],
): FingerprintedFinding<Finding>[] {
  const assigned = new Map<number, string>();
  const occurrences = new Map<string, number>();
  const fileOrdered = findings
    .map((finding, index) => ({ finding, index }))
    .toSorted(
      (a, b) =>
        a.finding.file.localeCompare(b.finding.file) ||
        a.finding.line - b.finding.line ||
        a.index - b.index,
    );

  for (const { finding, index } of fileOrdered) {
    const hash = hashFindingLine(
      normalizeLine(finding[FINDING_SOURCE_LINE] ?? finding.text),
    );
    const identity = `${finding.signal}:${finding.file}:${hash}`;
    const occurrence = (occurrences.get(identity) ?? 0) + 1;
    occurrences.set(identity, occurrence);
    assigned.set(index, `${identity}:${occurrence}`);
  }

  return findings.map((finding, index) => ({
    ...finding,
    fingerprint: assigned.get(index) as string,
  }));
}

/**
 * Parses and validates a baseline document. Throws an actionable error for
 * malformed JSON, unknown fields, unsupported schemas, or invalid values.
 */
export function parseBaseline(json: string): PhaseBaseline {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('baseline must contain valid JSON');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('baseline must be an object');
  }

  const baseline = value as Record<string, unknown>;
  for (const field of Object.keys(baseline)) {
    if (!['schemaVersion', 'cliVersion', 'fingerprints'].includes(field)) {
      throw new Error('baseline has unknown fields');
    }
  }
  if (baseline.schemaVersion !== BASELINE_SCHEMA_VERSION) {
    throw new Error(
      `baseline schemaVersion must be ${BASELINE_SCHEMA_VERSION}`,
    );
  }
  if (typeof baseline.cliVersion !== 'string' || !baseline.cliVersion.trim()) {
    throw new Error('baseline cliVersion must be a non-empty string');
  }
  if (!isCliVersion(baseline.cliVersion)) {
    throw new Error('baseline cliVersion must be a safe version token');
  }
  if (!Array.isArray(baseline.fingerprints)) {
    throw new Error('baseline fingerprints must be an array');
  }

  const fingerprints = baseline.fingerprints.map((fingerprint, index) => {
    if (typeof fingerprint !== 'string' || !isFingerprint(fingerprint)) {
      throw new Error(
        `baseline fingerprints[${index}] is not a valid finding fingerprint`,
      );
    }
    return fingerprint;
  });
  if (new Set(fingerprints).size !== fingerprints.length) {
    throw new Error('baseline fingerprints must not contain duplicates');
  }

  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    cliVersion: baseline.cliVersion,
    fingerprints,
  };
}

/**
 * Returns canonical baseline JSON with fingerprints sorted without mutating
 * the input. Throws when the CLI version or a fingerprint is invalid.
 */
export function serializeBaseline(
  fingerprints: string[],
  cliVersion: string,
): string {
  if (!cliVersion.trim()) {
    throw new Error('baseline cliVersion must be a non-empty string');
  }
  if (!isCliVersion(cliVersion)) {
    throw new Error('baseline cliVersion must be a safe version token');
  }
  for (const [index, fingerprint] of fingerprints.entries()) {
    if (!isFingerprint(fingerprint)) {
      throw new Error(
        `baseline fingerprints[${index}] is not a valid finding fingerprint`,
      );
    }
  }

  return `${JSON.stringify(
    {
      schemaVersion: BASELINE_SCHEMA_VERSION,
      cliVersion,
      fingerprints: fingerprints.toSorted(),
    },
    null,
    2,
  )}\n`;
}

/**
 * Classifies current findings against a baseline and counts baseline entries
 * absent from the current finding set. The inputs are not mutated.
 */
export function classifyFindings(
  findings: ScanFinding[],
  baseline: PhaseBaseline,
): FindingClassification {
  const baselineFingerprints = new Set(baseline.fingerprints);
  const assigned = assignFingerprints(findings);
  const currentFingerprints = new Set(
    assigned.map((finding) => finding.fingerprint),
  );
  const classified: ClassifiedFinding[] = [];
  for (const finding of assigned) {
    classified.push({
      ...finding,
      baselineState: baselineFingerprints.has(finding.fingerprint)
        ? 'pre-existing'
        : 'new',
    });
  }

  return {
    findings: classified,
    stale: baseline.fingerprints.filter(
      (fingerprint) => !currentFingerprints.has(fingerprint),
    ).length,
  };
}

/** Whether a classified finding matched the applied baseline. */
export function isPreExistingFinding(finding: ScanFinding): boolean {
  return 'baselineState' in finding && finding.baselineState === 'pre-existing';
}

function isFingerprint(value: string): boolean {
  return /^[^:]+:.+:[0-9a-f]{12}:[1-9]\d*$/.test(value);
}

function isCliVersion(value: string): boolean {
  return /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/.test(value);
}
