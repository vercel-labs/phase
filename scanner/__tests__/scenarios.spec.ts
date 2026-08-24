import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { formatText, scanTargets } from '../index.ts';
import type { EvalScenario } from '../scenarios.ts';
import {
  CONTROL_CHARACTER_TOKENS,
  evalScenarioRuns,
  loadEvalScenario,
} from '../scenarios.ts';

const scenariosDir = join(process.cwd(), 'evals/scenarios');
const scannerScript = join(process.cwd(), 'skills/phase/scripts/scan.mjs');
const metadataPath = join(process.cwd(), 'skills/phase/metadata.json');
const temporaryDirectories: string[] = [];
const scenarios = readdirSync(scenariosDir)
  .toSorted()
  .map((name) => ({ name, directory: join(scenariosDir, name) }));

/**
 * The eval scenarios carry machine-checkable ground truth. Executing it here
 * is what makes them regression guards rather than prose: a scenario that
 * encodes a confirmed field failure has to fail the build when it regresses.
 */
describe('eval scenario ground truth', () => {
  afterAll(() => {
    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true });
    }
  });

  for (const scenario of scenarios) {
    describe(scenario.name, () => {
      const materializedDirectory = materializeScenario(scenario.directory);
      let contract: EvalScenario | undefined;
      let contractError: Error | undefined;
      try {
        contract = loadEvalScenario(scenario.directory);
      } catch (error) {
        contractError =
          error instanceof Error ? error : new Error('Unknown contract error');
      }

      it(`${scenario.name} has a valid scenario contract`, () => {
        if (contractError) throw contractError;
        expect(contract).toBeDefined();
      });

      if (!contract) return;
      const { scan } = contract;

      if ('skip' in scan) {
        it(`skips the scan: ${scan.skip}`, () => {
          expect(scan.skip.length).toBeGreaterThan(0);
        });
        return;
      }

      if ('golden' in scan) {
        it(`text output matches ${scan.golden}.txt`, () => {
          const expected = readFileSync(
            join(scenario.directory, `${scan.golden}.txt`),
            'utf8',
          );
          const run = runCli(materializedDirectory, ['workspace']);
          expect(run.status).toBe(0);
          expect(run.stdout).toBe(expected);
        });

        it(`JSON output matches ${scan.golden}.json`, () => {
          const expected = JSON.parse(
            readFileSync(
              join(scenario.directory, `${scan.golden}.json`),
              'utf8',
            ),
          );
          const run = runCli(materializedDirectory, ['--json', 'workspace']);
          expect(run.status).toBe(0);
          const actual = JSON.parse(run.stdout);
          expect(normalizeSkillVersion(actual)).toEqual(
            normalizeSkillVersion(expected),
          );
          const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
          expect(actual.skillVersion).toBe(metadata.version);
        });
        return;
      }

      for (const scanRun of evalScenarioRuns(scan)) {
        const runName = scanRun.name ?? scanRun.target;
        const target = join(materializedDirectory, scanRun.target);
        let cachedResult: ReturnType<typeof scanTargets> | undefined;
        const scanResult = () => (cachedResult ??= scanTargets([target]));

        for (const expected of scanRun.assertions.required ?? []) {
          it(`${runName} reports ${expected.signal}${expected.file ? ` in ${expected.file}` : ''}`, () => {
            const result = scanResult();
            const hits = result.findings.filter(
              (finding) =>
                finding.signal === expected.signal &&
                (expected.file === undefined || finding.file === expected.file),
            );
            if (expected.count === undefined) {
              expect(hits.length).toBeGreaterThan(0);
            } else {
              expect(hits.length).toBe(expected.count);
            }
          });
        }

        for (const expected of scanRun.assertions.requiredAbsent ?? []) {
          it(`${runName} stays silent on ${expected.signal} (${expected.reason})`, () => {
            const result = scanResult();
            expect(
              result.findings.filter(
                (finding) => finding.signal === expected.signal,
              ),
            ).toEqual([]);
          });
        }

        for (const expected of scanRun.assertions.outputExcludes ?? []) {
          it(`${runName} keeps ${JSON.stringify(expected.text)} out of the report (${expected.reason})`, () => {
            const result = scanResult();
            expect(formatText(result)).not.toContain(expected.text);
            for (const finding of result.findings) {
              expect(finding.text).not.toContain(expected.text);
            }
          });
        }

        const expectedContext = scanRun.assertions.context;
        if (expectedContext) {
          it(`${runName} detects the declared environment context`, () => {
            const result = scanResult();
            expect(result.context).toMatchObject(expectedContext);
          });
        }
      }
    });
  }
});

function runCli(directory: string, args: string[]) {
  const run = spawnSync(process.execPath, [scannerScript, ...args], {
    cwd: directory,
    encoding: 'utf8',
  });
  return { status: run.status ?? -1, stdout: run.stdout };
}

function normalizeSkillVersion(result: Record<string, unknown>) {
  return { ...result, skillVersion: '<normalized>' };
}

function materializeScenario(source: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'phase-eval-'));
  const target = join(directory, 'scenario');
  temporaryDirectories.push(directory);
  cpSync(source, target, { recursive: true });
  decodeControlCharacterTokens(target);
  return target;
}

function decodeControlCharacterTokens(path: string): void {
  for (const entry of readdirSync(path)) {
    const child = join(path, entry);
    if (statSync(child).isDirectory()) {
      decodeControlCharacterTokens(child);
      continue;
    }
    const source = readFileSync(child, 'utf8');
    let materialized = source;
    for (const [token, byte] of Object.entries(CONTROL_CHARACTER_TOKENS)) {
      materialized = materialized.replaceAll(token, byte);
    }
    if (materialized !== source) writeFileSync(child, materialized);
  }
}
