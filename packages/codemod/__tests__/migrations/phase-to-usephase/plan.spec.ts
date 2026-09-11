import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  InvalidTargetError,
  planPhaseToUsephase,
} from '../../../src/migrations/phase-to-usephase/plan.js';

const FIXTURES = new URL('../../fixtures/', import.meta.url);
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function fixture(name: string): string {
  return readFileSync(new URL(name, FIXTURES), 'utf8');
}

function temporaryDirectory(prefix = 'usephase-plan-') {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function legacyManifest() {
  return '{"private":true,"dependencies":{"phase":"^0.5.4"}}\n';
}

describe('phase-to-usephase migration planning', () => {
  it('returns a complete sorted plan without writing files', () => {
    const consumer = temporaryDirectory();
    mkdirSync(join(consumer, 'src'));
    const source = fixture('core-only.input.txt');
    const manifest = legacyManifest();
    writeFileSync(join(consumer, 'src/consumer.ts'), source);
    writeFileSync(join(consumer, 'package.json'), manifest);

    const plan = planPhaseToUsephase({ cwd: consumer, target: '.' });

    expect(plan.changes.map((change) => change.displayPath)).toEqual([
      'package.json',
      'src/consumer.ts',
    ]);
    expect(readFileSync(join(consumer, 'src/consumer.ts'), 'utf8')).toBe(
      source,
    );
    expect(readFileSync(join(consumer, 'package.json'), 'utf8')).toBe(manifest);
  });

  it('selects dependencies independently for each package', () => {
    const consumer = temporaryDirectory();
    const packages = [
      {
        directory: 'packages/core-only',
        input: 'core-only.input.txt',
        dependency: '@usephase/core',
      },
      {
        directory: 'packages/react-only',
        input: 'react-only.input.txt',
        dependency: '@usephase/react',
      },
    ];
    for (const packageFixture of packages) {
      const directory = join(consumer, packageFixture.directory);
      mkdirSync(join(directory, 'src'), { recursive: true });
      writeFileSync(join(directory, 'package.json'), legacyManifest());
      writeFileSync(
        join(directory, 'src/consumer.ts'),
        fixture(packageFixture.input),
      );
    }

    const plan = planPhaseToUsephase({ cwd: consumer, target: '.' });

    for (const packageFixture of packages) {
      const change = plan.changes.find(
        ({ displayPath }) =>
          displayPath === `${packageFixture.directory}/package.json`,
      );
      expect(JSON.parse(change?.after ?? '')).toEqual({
        private: true,
        dependencies: { [packageFixture.dependency]: '^0.6.0' },
      });
    }
  });

  it.each(['src', 'src/consumer.ts'])(
    'adds scoped metadata without removing phase from an ancestor package for %s',
    (target) => {
      const consumer = temporaryDirectory();
      mkdirSync(join(consumer, 'src'));
      writeFileSync(join(consumer, 'package.json'), legacyManifest());
      writeFileSync(
        join(consumer, 'src/consumer.ts'),
        fixture('core-only.input.txt'),
      );

      const plan = planPhaseToUsephase({ cwd: consumer, target });
      const manifestChange = plan.changes.find(
        ({ displayPath }) => displayPath === 'package.json',
      );

      expect(JSON.parse(manifestChange?.after ?? '')).toEqual({
        private: true,
        dependencies: {
          phase: '^0.5.4',
          '@usephase/core': '^0.6.0',
        },
      });
    },
  );

  it('retains phase when a package contains an unmigrated source container', () => {
    const consumer = temporaryDirectory();
    mkdirSync(join(consumer, 'src'));
    writeFileSync(join(consumer, 'package.json'), legacyManifest());
    writeFileSync(
      join(consumer, 'src/consumer.ts'),
      fixture('core-only.input.txt'),
    );
    writeFileSync(
      join(consumer, 'src/component.vue'),
      fixture('react-only.input.txt'),
    );

    const plan = planPhaseToUsephase({ cwd: consumer, target: '.' });
    const manifestChange = plan.changes.find(
      ({ displayPath }) => displayPath === 'package.json',
    );

    expect(JSON.parse(manifestChange?.after ?? '')).toEqual({
      private: true,
      dependencies: {
        phase: '^0.5.4',
        '@usephase/core': '^0.6.0',
      },
    });
  });

  it('orders planned paths independently of the host locale', () => {
    const consumer = temporaryDirectory();
    const source = fixture('core-only.input.txt');
    writeFileSync(join(consumer, 'z.ts'), source);
    writeFileSync(join(consumer, '\u00e4.ts'), source);

    const plan = planPhaseToUsephase({ cwd: consumer, target: '.' });

    expect(plan.changes.map((change) => change.displayPath)).toEqual([
      'z.ts',
      '\u00e4.ts',
    ]);
  });

  it('skips excluded descendants and validates explicit targets', () => {
    const consumer = temporaryDirectory();
    const source = fixture('core-only.input.txt');
    for (const directory of ['src', 'dist', '.next', '..cache']) {
      mkdirSync(join(consumer, directory));
      writeFileSync(join(consumer, directory, 'consumer.ts'), source);
    }
    writeFileSync(join(consumer, 'README.md'), source);
    symlinkSync('src/consumer.ts', join(consumer, 'linked.ts'));
    const external = temporaryDirectory('usephase-external-');
    writeFileSync(join(external, 'consumer.ts'), source);
    symlinkSync(external, join(consumer, 'linked-directory'));

    expect(
      planPhaseToUsephase({ cwd: consumer, target: '.' }).changes.map(
        (change) => change.displayPath,
      ),
    ).toEqual(['..cache/consumer.ts', 'src/consumer.ts']);
    expect(() =>
      planPhaseToUsephase({ cwd: consumer, target: 'README.md' }),
    ).toThrow(InvalidTargetError);
    expect(() =>
      planPhaseToUsephase({ cwd: consumer, target: 'linked.ts' }),
    ).toThrow('Symlink targets are not supported: linked.ts');
    expect(() =>
      planPhaseToUsephase({
        cwd: consumer,
        target: 'linked-directory/consumer.ts',
      }),
    ).toThrow('Symlink targets are not supported: linked-directory');
    expect(() =>
      planPhaseToUsephase({ cwd: consumer, target: 'dist' }),
    ).toThrow('Excluded directory targets are not supported: dist');
    expect(
      planPhaseToUsephase({ cwd: consumer, target: 'dist/consumer.ts' })
        .changes,
    ).toHaveLength(1);
    expect(() =>
      planPhaseToUsephase({ cwd: consumer, target: 'missing.ts' }),
    ).toThrow('Target does not exist: missing.ts');

    if (process.platform !== 'win32') {
      const fifo = join(consumer, 'input.ts');
      const created = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
      expect(created.status, created.stderr).toBe(0);
      expect(() =>
        planPhaseToUsephase({ cwd: consumer, target: 'input.ts' }),
      ).toThrow('Unsupported target type: input.ts');
    }
  });

  it.each([
    ['invalid TypeScript', 'z.ts', 'parse-error.input.txt'],
    ['Flow syntax', 'z.js', 'flow-unsupported.input.txt'],
  ])('rejects %s before writing planned changes', (_name, path, input) => {
    const consumer = temporaryDirectory();
    const validSource = fixture('core-only.input.txt');
    const invalidSource = fixture(input);
    writeFileSync(join(consumer, 'a.ts'), validSource);
    writeFileSync(join(consumer, path), invalidSource);

    expect(() => planPhaseToUsephase({ cwd: consumer, target: '.' })).toThrow(
      `${path}:`,
    );
    expect(readFileSync(join(consumer, 'a.ts'), 'utf8')).toBe(validSource);
    expect(readFileSync(join(consumer, path), 'utf8')).toBe(invalidSource);
  });

  it('rejects unresolved legacy subpaths before changing package metadata', () => {
    const consumer = temporaryDirectory();
    mkdirSync(join(consumer, 'src'));
    const manifest = legacyManifest();
    const source = fixture('unknown-subpath.input.txt');
    writeFileSync(join(consumer, 'package.json'), manifest);
    writeFileSync(join(consumer, 'src/consumer.ts'), source);

    expect(() => planPhaseToUsephase({ cwd: consumer, target: '.' })).toThrow(
      'Unsupported legacy specifier "phase/other" in src/consumer.ts',
    );
    expect(readFileSync(join(consumer, 'package.json'), 'utf8')).toBe(manifest);
    expect(readFileSync(join(consumer, 'src/consumer.ts'), 'utf8')).toBe(
      source,
    );
  });
});
