import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { formatText, scanTargets } from '../index.ts';

/**
 * The eval scenarios carry machine-checkable ground truth. Executing it here
 * is what makes them regression guards rather than prose: a scenario that
 * encodes a confirmed field failure has to fail the build when it regresses.
 */
describe('eval scenario ground truth', () => {
  interface ScanAssertions {
    required?: { signal: string; file?: string; count?: number }[];
    requiredAbsent?: { signal: string; reason: string }[];
    outputExcludes?: { text: string; reason: string }[];
    context?: Partial<Record<string, unknown>>;
  }

  interface ScanRun {
    name?: string;
    target?: string;
    assertions: ScanAssertions;
  }

  const scenariosDir = join(process.cwd(), 'skills/phase/evals/scenarios');

  for (const scenario of readdirSync(scenariosDir).toSorted()) {
    const specPath = join(scenariosDir, scenario, 'expected-findings.json');
    if (!existsSync(specPath)) continue;
    const spec = JSON.parse(readFileSync(specPath, 'utf8'));
    const scan = spec.scan;
    const runs: ScanRun[] =
      scan?.runs ?? (scan?.assertions ? [{ assertions: scan.assertions }] : []);
    if (runs.length === 0) continue;

    describe(scenario, () => {
      for (const run of runs) {
        const target = run.target ?? scan.target ?? 'workspace';

        describe(run.name ?? target, () => {
          const result = scanTargets([join(scenariosDir, scenario, target)]);
          const assertions = run.assertions;

          for (const expected of assertions.required ?? []) {
            it(`reports ${expected.signal}${expected.file ? ` in ${expected.file}` : ''}`, () => {
              const hits = result.findings.filter(
                (f) =>
                  f.signal === expected.signal &&
                  (expected.file === undefined || f.file === expected.file),
              );
              if (expected.count === undefined) {
                expect(hits.length).toBeGreaterThan(0);
              } else {
                expect(hits.length).toBe(expected.count);
              }
            });
          }

          for (const expected of assertions.requiredAbsent ?? []) {
            it(`stays silent on ${expected.signal} (${expected.reason})`, () => {
              expect(
                result.findings.filter((f) => f.signal === expected.signal),
              ).toEqual([]);
            });
          }

          for (const expected of assertions.outputExcludes ?? []) {
            it(`keeps ${JSON.stringify(expected.text)} out of the report (${expected.reason})`, () => {
              expect(formatText(result)).not.toContain(expected.text);
              for (const finding of result.findings) {
                expect(finding.text).not.toContain(expected.text);
              }
            });
          }

          const expectedContext = assertions.context;
          if (expectedContext) {
            it('detects the declared environment context', () => {
              expect(result.context).toMatchObject(expectedContext);
            });
          }
        });
      }
    });
  }
});
