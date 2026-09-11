import { readFileSync } from 'node:fs';

import migratePhaseToUsephase from '../src/migrate-phase-to-usephase.js';

const FIXTURES = new URL('fixtures/', import.meta.url);

function fixture(name: string): string {
  return readFileSync(new URL(name, FIXTURES), 'utf8');
}

describe('migrate-phase-to-usephase transform', () => {
  it('rewrites every supported module form', () => {
    const input = fixture('module-forms.input.txt');
    const output = fixture('module-forms.output.txt');

    expect(
      migratePhaseToUsephase({ path: 'consumer.tsx', source: input }),
    ).toEqual({
      content: output,
      requiredDependencies: ['@usephase/core', '@usephase/react'],
      unresolvedSpecifiers: [],
    });
  });

  it('rewrites only global and recognized module-loading bindings', () => {
    expect(
      migratePhaseToUsephase({
        path: 'consumer.ts',
        source: fixture('bindings.input.txt'),
      }),
    ).toEqual({
      content: fixture('bindings.output.txt'),
      requiredDependencies: ['@usephase/core', '@usephase/react'],
      unresolvedSpecifiers: [],
    });
  });

  it('replaces phase package metadata while preserving existing scoped values', () => {
    const input = fixture('package.input.txt');
    const output = fixture('package.output.txt');

    expect(
      migratePhaseToUsephase({
        path: 'package.json',
        source: input,
        requiredDependencies: ['@usephase/core', '@usephase/react'],
      }),
    ).toEqual({
      content: output,
      requiredDependencies: [],
      unresolvedSpecifiers: [],
    });
  });

  it('accepts and preserves a package.json byte-order mark', () => {
    const input = `\uFEFF${fixture('package.input.txt')}`;
    const output = `\uFEFF${fixture('package.output.txt')}`;

    expect(
      migratePhaseToUsephase({
        path: 'package.json',
        source: input,
        requiredDependencies: ['@usephase/core', '@usephase/react'],
      }),
    ).toEqual({
      content: output,
      requiredDependencies: [],
      unresolvedSpecifiers: [],
    });
  });

  it('reports unsupported legacy subpaths without changing them', () => {
    const source = fixture('unknown-subpath.input.txt');

    expect(migratePhaseToUsephase({ path: 'consumer.ts', source })).toEqual({
      content: source,
      requiredDependencies: [],
      unresolvedSpecifiers: ['phase/other'],
    });
  });

  it('retains phase when package.json has no observed source usage', () => {
    const source = '{"dependencies":{"phase":"^0.5.4"}}\n';
    const result = migratePhaseToUsephase({ path: 'package.json', source });

    expect(JSON.parse(result.content)).toEqual({
      dependencies: {
        phase: '^0.5.4',
        '@usephase/core': '^0.6.0',
        '@usephase/react': '^0.6.0',
      },
    });
    expect(result.requiredDependencies).toEqual([]);
    expect(result.unresolvedSpecifiers).toEqual([]);
  });

  it('preserves CRLF in source and package.json files', () => {
    const sourceInput = fixture('core-only.input.txt').replaceAll('\n', '\r\n');
    const sourceOutput = fixture('core-only.output.txt').replaceAll(
      '\n',
      '\r\n',
    );
    const packageInput = fixture('package.input.txt').replaceAll('\n', '\r\n');
    const packageOutput = fixture('package.output.txt').replaceAll(
      '\n',
      '\r\n',
    );

    expect(
      migratePhaseToUsephase({ path: 'consumer.ts', source: sourceInput }),
    ).toEqual({
      content: sourceOutput,
      requiredDependencies: ['@usephase/core'],
      unresolvedSpecifiers: [],
    });
    expect(
      migratePhaseToUsephase({
        path: 'package.json',
        source: packageInput,
        requiredDependencies: ['@usephase/core', '@usephase/react'],
      }),
    ).toEqual({
      content: packageOutput,
      requiredDependencies: [],
      unresolvedSpecifiers: [],
    });
  });
});
