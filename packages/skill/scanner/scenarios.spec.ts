import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  evalScenarioRuns,
  loadEvalScenario,
  parseEvalScenario,
} from './scenarios.ts';

describe('eval scenario contract', () => {
  it('rejects unknown fields', () => {
    expect(() =>
      parseEvalScenario('example', {
        description: 'A scenario.',
        scan: { skip: 'No workspace to scan.' },
        expectedBehavior: ['Answers the question.'],
        extra: true,
      }),
    ).toThrow('example has unknown field `extra`');
  });

  it('rejects a scenario with no scan gate', () => {
    expect(() =>
      parseEvalScenario('ungated', {
        description: 'A scenario.',
        scan: {},
        expectedBehavior: ['Answers the question.'],
      }),
    ).toThrow('ungated has no scan gate');
  });

  it('rejects an assertions gate that performs no checks', () => {
    expect(() =>
      parseEvalScenario('no-op', {
        description: 'A scenario.',
        scan: { assertions: { required: [], context: {} } },
        expectedBehavior: ['Answers the question.'],
      }),
    ).toThrow('no-op.scan.assertions must declare at least one assertion');
  });

  it('normalizes run targets through the documented inheritance order', () => {
    const scenario = parseEvalScenario('multi-run', {
      description: 'A scenario.',
      scan: {
        target: 'shared',
        runs: [
          {
            name: 'inherited',
            assertions: { required: [{ signal: 'manual-raf' }] },
          },
          {
            name: 'overridden',
            target: 'focused',
            assertions: {
              requiredAbsent: [{ signal: 'raw-io', reason: 'safe' }],
            },
          },
        ],
      },
      expectedBehavior: ['Answers the question.'],
    });

    expect(
      evalScenarioRuns(scenario.scan).map(({ name, target }) => ({
        name,
        target,
      })),
    ).toEqual([
      { name: 'inherited', target: 'shared' },
      { name: 'overridden', target: 'focused' },
    ]);
  });

  it.each(['target', 'source', 'destination'])(
    'keeps baseline workflow %s paths inside the scenario',
    (field) => {
      const baseline = {
        target: 'workspace',
        failOn: 'critical',
        plant: {
          source: 'plant/new.ts',
          destination: 'workspace/src/new.ts',
        },
        newFinding: { signal: 'forced-reflow', file: 'src/new.ts' },
      };
      if (field === 'target') baseline.target = '../outside';
      if (field === 'source') baseline.plant.source = '../outside';
      if (field === 'destination') baseline.plant.destination = '../outside';

      expect(() =>
        parseEvalScenario('baseline', {
          description: 'A scenario.',
          scan: { baseline },
          expectedBehavior: ['Answers the question.'],
        }),
      ).toThrow('must be a relative path inside the scenario');
    },
  );

  it('rejects unsupported baseline new-finding fields', () => {
    expect(() =>
      parseEvalScenario('baseline', {
        description: 'A scenario.',
        scan: {
          baseline: {
            target: 'workspace',
            failOn: 'critical',
            plant: {
              source: 'plant/new.ts',
              destination: 'workspace/src/new.ts',
            },
            newFinding: {
              signal: 'forced-reflow',
              file: 'src/new.ts',
              count: 2,
            },
          },
        },
        expectedBehavior: ['Answers the question.'],
      }),
    ).toThrow('baseline.scan.baseline.newFinding has unknown field `count`');
  });

  it('requires the prompt claimed by the eval format', () => {
    const directory = mkdtempSync(join(tmpdir(), 'phase-eval-scenario-'));
    writeFileSync(
      join(directory, 'expected-findings.json'),
      JSON.stringify({
        description: 'A scenario.',
        scan: { skip: 'No workspace to scan.' },
        expectedBehavior: ['Answers the question.'],
      }),
    );

    try {
      expect(() => loadEvalScenario(directory)).toThrow(
        `${directory} is missing prompt.md`,
      );
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});
