import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PACKAGE_ROOT = resolve(import.meta.dirname, '..');
const COMMAND = join(PACKAGE_ROOT, 'dist/usephase-codemod.mjs');
const FIXTURES = new URL('fixtures/', import.meta.url);
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function fixture(name: string): string {
  return readFileSync(new URL(name, FIXTURES), 'utf8');
}

function run(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  return spawnSync(process.execPath, [COMMAND, ...args], {
    cwd,
    encoding: 'utf8',
    env,
  });
}

describe('usephase-codemod command', () => {
  it('previews sorted changes, applies them idempotently, and leaves lockfiles unchanged', () => {
    const consumer = mkdtempSync(join(tmpdir(), 'usephase-codemod-'));
    temporaryDirectories.push(consumer);
    mkdirSync(join(consumer, 'src'));

    const sourceInput = fixture('module-forms.input.txt');
    const packageInput = fixture('package.input.txt');
    const lockfiles = new Map([
      ['package-lock.json', '{"phase":"^0.5.4"}\n'],
      ['pnpm-lock.yaml', 'phase: ^0.5.4\n'],
      ['yarn.lock', 'phase@^0.5.4:\n'],
    ]);
    writeFileSync(join(consumer, 'src/consumer.tsx'), sourceInput);
    chmodSync(join(consumer, 'src/consumer.tsx'), 0o664);
    writeFileSync(join(consumer, 'package.json'), packageInput);
    for (const [path, content] of lockfiles) {
      writeFileSync(join(consumer, path), content);
    }

    const dryRun = run(consumer, ['rename-imports', '--dry', '.']);
    expect(dryRun.status, dryRun.stderr).toBe(0);
    expect(dryRun.stdout).toBe(
      'Would change 2 files:\npackage.json\nsrc/consumer.tsx\n',
    );
    expect(readFileSync(join(consumer, 'src/consumer.tsx'), 'utf8')).toBe(
      sourceInput,
    );
    expect(readFileSync(join(consumer, 'package.json'), 'utf8')).toBe(
      packageInput,
    );

    const previousUmask = process.umask(0o077);
    let writeRun;
    try {
      writeRun = run(consumer, ['rename-imports', '.']);
    } finally {
      process.umask(previousUmask);
    }
    expect(writeRun.status, writeRun.stderr).toBe(0);
    expect(writeRun.stdout).toBe(
      'Changed 2 files:\npackage.json\nsrc/consumer.tsx\n',
    );
    expect(readFileSync(join(consumer, 'src/consumer.tsx'), 'utf8')).toBe(
      fixture('module-forms.output.txt'),
    );
    expect(readFileSync(join(consumer, 'package.json'), 'utf8')).toBe(
      fixture('package.output.txt'),
    );
    expect(statSync(join(consumer, 'src/consumer.tsx')).mode % 0o1000).toBe(
      0o664,
    );

    const secondRun = run(consumer, ['rename-imports', '.']);
    expect(secondRun.status, secondRun.stderr).toBe(0);
    expect(secondRun.stdout).toBe('Changed 0 files\n');
    for (const [path, content] of lockfiles) {
      expect(readFileSync(join(consumer, path), 'utf8')).toBe(content);
    }
  });

  it('parses non-JSX TypeScript and reports one changed file', () => {
    const consumer = mkdtempSync(join(tmpdir(), 'usephase-codemod-ts-'));
    temporaryDirectories.push(consumer);
    writeFileSync(
      join(consumer, 'assertion.ts'),
      fixture('typescript-assertion.input.txt'),
    );

    const migration = run(consumer, ['rename-imports', '.']);
    expect(migration.status, migration.stderr).toBe(0);
    expect(migration.stdout).toBe('Changed 1 file:\nassertion.ts\n');
    expect(readFileSync(join(consumer, 'assertion.ts'), 'utf8')).toBe(
      fixture('typescript-assertion.output.txt'),
    );
  });

  it('adds runtime dependencies from each package scope source usage', () => {
    const consumer = mkdtempSync(join(tmpdir(), 'usephase-codemod-scopes-'));
    temporaryDirectories.push(consumer);
    const legacyManifest =
      '{"private":true,"dependencies":{"phase":"^0.5.4"}}\n';
    const packages = [
      {
        directory: 'packages/core-only',
        input: 'core-only.input.txt',
        output: 'core-only.output.txt',
        dependency: '@usephase/core',
      },
      {
        directory: 'packages/react-only',
        input: 'react-only.input.txt',
        output: 'react-only.output.txt',
        dependency: '@usephase/react',
      },
    ];
    for (const packageFixture of packages) {
      const directory = join(consumer, packageFixture.directory);
      mkdirSync(join(directory, 'src'), { recursive: true });
      writeFileSync(join(directory, 'package.json'), legacyManifest);
      writeFileSync(
        join(directory, 'src/consumer.ts'),
        fixture(packageFixture.input),
      );
    }

    const migration = run(consumer, ['rename-imports', '.']);
    expect(migration.status, migration.stderr).toBe(0);
    expect(migration.stdout).toBe(
      [
        'Changed 4 files:',
        'packages/core-only/package.json',
        'packages/core-only/src/consumer.ts',
        'packages/react-only/package.json',
        'packages/react-only/src/consumer.ts',
        '',
      ].join('\n'),
    );
    for (const packageFixture of packages) {
      const directory = join(consumer, packageFixture.directory);
      expect(readFileSync(join(directory, 'src/consumer.ts'), 'utf8')).toBe(
        fixture(packageFixture.output),
      );
      expect(
        JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')),
      ).toEqual({
        private: true,
        dependencies: { [packageFixture.dependency]: '^0.6.0' },
      });
    }
  });

  it.each(['src', 'src/consumer.ts'])(
    'adds scoped metadata without removing phase from ancestor package when targeting %s',
    (target) => {
      const consumer = mkdtempSync(
        join(tmpdir(), 'usephase-codemod-ancestor-'),
      );
      temporaryDirectories.push(consumer);
      mkdirSync(join(consumer, 'src'));
      writeFileSync(
        join(consumer, 'package.json'),
        '{"private":true,"dependencies":{"phase":"^0.5.4"}}\n',
      );
      writeFileSync(
        join(consumer, 'src/consumer.ts'),
        fixture('core-only.input.txt'),
      );

      const migration = run(consumer, ['rename-imports', target]);
      expect(migration.status, migration.stderr).toBe(0);
      expect(migration.stdout).toBe(
        'Changed 2 files:\npackage.json\nsrc/consumer.ts\n',
      );
      expect(
        JSON.parse(readFileSync(join(consumer, 'package.json'), 'utf8')),
      ).toEqual({
        private: true,
        dependencies: {
          phase: '^0.5.4',
          '@usephase/core': '^0.6.0',
        },
      });
    },
  );

  it('retains phase when a package contains unsupported source containers', () => {
    const consumer = mkdtempSync(join(tmpdir(), 'usephase-codemod-container-'));
    temporaryDirectories.push(consumer);
    mkdirSync(join(consumer, 'src'));
    writeFileSync(
      join(consumer, 'package.json'),
      '{"private":true,"dependencies":{"phase":"^0.5.4"}}\n',
    );
    writeFileSync(
      join(consumer, 'src/consumer.ts'),
      fixture('core-only.input.txt'),
    );
    const containerSource = fixture('react-only.input.txt');
    writeFileSync(join(consumer, 'src/component.vue'), containerSource);

    const migration = run(consumer, ['rename-imports', '.']);
    expect(migration.status, migration.stderr).toBe(0);
    expect(
      JSON.parse(readFileSync(join(consumer, 'package.json'), 'utf8')),
    ).toEqual({
      private: true,
      dependencies: {
        phase: '^0.5.4',
        '@usephase/core': '^0.6.0',
      },
    });
    expect(readFileSync(join(consumer, 'src/component.vue'), 'utf8')).toBe(
      containerSource,
    );
  });

  it('sorts changed paths independently of the host locale', () => {
    const consumer = mkdtempSync(join(tmpdir(), 'usephase-codemod-order-'));
    temporaryDirectories.push(consumer);
    const input = fixture('typescript-assertion.input.txt');
    writeFileSync(join(consumer, 'z.ts'), input);
    writeFileSync(join(consumer, '\u00e4.ts'), input);

    const english = run(consumer, ['rename-imports', '--dry', '.'], {
      ...process.env,
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
    });
    const swedish = run(consumer, ['rename-imports', '--dry', '.'], {
      ...process.env,
      LANG: 'sv_SE.UTF-8',
      LC_ALL: 'sv_SE.UTF-8',
    });

    expect(english.status, english.stderr).toBe(0);
    expect(swedish.status, swedish.stderr).toBe(0);
    expect(english.stdout).toBe('Would change 2 files:\nz.ts\n\u00e4.ts\n');
    expect(swedish.stdout).toBe(english.stdout);
  });

  it('skips generated trees and symlinks while validating direct targets', () => {
    const consumer = mkdtempSync(join(tmpdir(), 'usephase-codemod-targets-'));
    temporaryDirectories.push(consumer);
    const input = fixture('core-only.input.txt');
    const output = fixture('core-only.output.txt');
    for (const directory of ['src', 'dist', '.next', '..cache']) {
      mkdirSync(join(consumer, directory));
      writeFileSync(join(consumer, directory, 'consumer.ts'), input);
    }
    writeFileSync(join(consumer, 'README.md'), input);
    symlinkSync('src/consumer.ts', join(consumer, 'linked.ts'));
    const external = mkdtempSync(join(tmpdir(), 'usephase-codemod-external-'));
    temporaryDirectories.push(external);
    writeFileSync(join(external, 'consumer.ts'), input);
    symlinkSync(external, join(consumer, 'linked-directory'));

    const rootMigration = run(consumer, ['rename-imports', '.']);
    expect(rootMigration.status, rootMigration.stderr).toBe(0);
    expect(rootMigration.stdout).toBe(
      'Changed 2 files:\n..cache/consumer.ts\nsrc/consumer.ts\n',
    );
    expect(readFileSync(join(consumer, 'src/consumer.ts'), 'utf8')).toBe(
      output,
    );
    expect(readFileSync(join(consumer, '..cache/consumer.ts'), 'utf8')).toBe(
      output,
    );
    expect(readFileSync(join(consumer, 'dist/consumer.ts'), 'utf8')).toBe(
      input,
    );
    expect(readFileSync(join(consumer, '.next/consumer.ts'), 'utf8')).toBe(
      input,
    );

    const unsupported = run(consumer, ['rename-imports', 'README.md']);
    expect(unsupported.status).toBe(2);
    expect(unsupported.stderr).toContain('Unsupported target file: README.md');

    const symlink = run(consumer, ['rename-imports', 'linked.ts']);
    expect(symlink.status).toBe(2);
    expect(symlink.stderr).toContain(
      'Symlink targets are not supported: linked.ts',
    );

    const symlinkedParent = run(consumer, [
      'rename-imports',
      'linked-directory/consumer.ts',
    ]);
    expect(symlinkedParent.status).toBe(2);
    expect(symlinkedParent.stderr).toContain(
      'Symlink targets are not supported: linked-directory',
    );
    expect(readFileSync(join(external, 'consumer.ts'), 'utf8')).toBe(input);

    const generatedDirectory = run(consumer, ['rename-imports', 'dist']);
    expect(generatedDirectory.status).toBe(2);
    expect(generatedDirectory.stderr).toContain(
      'Generated directory targets are not supported: dist',
    );

    const explicitGeneratedFile = run(consumer, [
      'rename-imports',
      'dist/consumer.ts',
    ]);
    expect(explicitGeneratedFile.status, explicitGeneratedFile.stderr).toBe(0);
    expect(explicitGeneratedFile.stdout).toBe(
      'Changed 1 file:\ndist/consumer.ts\n',
    );
    expect(readFileSync(join(consumer, 'dist/consumer.ts'), 'utf8')).toBe(
      output,
    );

    const missing = run(consumer, ['rename-imports', 'missing.ts']);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('Target does not exist: missing.ts');

    if (process.platform !== 'win32') {
      const fifo = join(consumer, 'input.ts');
      const created = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
      expect(created.status, created.stderr).toBe(0);
      const specialFile = run(consumer, ['rename-imports', 'input.ts']);
      expect(specialFile.status).toBe(2);
      expect(specialFile.stderr).toContain('Unsupported target type: input.ts');
    }
  });

  it('reports files committed before a later atomic write fails', () => {
    const consumer = mkdtempSync(join(tmpdir(), 'usephase-codemod-writes-'));
    temporaryDirectories.push(consumer);
    const input = fixture('core-only.input.txt');
    const output = fixture('core-only.output.txt');
    for (const directory of ['a', 'b']) {
      mkdirSync(join(consumer, directory));
      writeFileSync(join(consumer, directory, 'consumer.ts'), input);
    }
    chmodSync(join(consumer, 'b'), 0o555);

    let migration;
    try {
      migration = run(consumer, ['rename-imports', '.']);
    } finally {
      chmodSync(join(consumer, 'b'), 0o755);
    }

    expect(migration.status).toBe(1);
    expect(migration.stdout).toBe(
      'Changed 1 file before failure:\na/consumer.ts\n',
    );
    expect(migration.stderr).toContain('Failed to write b/consumer.ts:');
    expect(migration.stderr).toContain(
      'Rerun the command to finish the idempotent migration.',
    );
    expect(readFileSync(join(consumer, 'a/consumer.ts'), 'utf8')).toBe(output);
    expect(readFileSync(join(consumer, 'b/consumer.ts'), 'utf8')).toBe(input);
  });

  it('reports parse failures before writing any planned changes', () => {
    const consumer = mkdtempSync(join(tmpdir(), 'usephase-codemod-parse-'));
    temporaryDirectories.push(consumer);
    const input = fixture('core-only.input.txt');
    writeFileSync(join(consumer, 'a.ts'), input);
    writeFileSync(join(consumer, 'z.ts'), fixture('parse-error.input.txt'));

    const migration = run(consumer, ['rename-imports', '.']);
    expect(migration.status).toBe(1);
    expect(migration.stdout).toBe('');
    expect(migration.stderr).toContain('z.ts:');
    expect(readFileSync(join(consumer, 'a.ts'), 'utf8')).toBe(input);
  });

  it('rejects unresolved legacy subpaths before changing package metadata', () => {
    const consumer = mkdtempSync(join(tmpdir(), 'usephase-codemod-unknown-'));
    temporaryDirectories.push(consumer);
    mkdirSync(join(consumer, 'src'));
    const manifest = '{"private":true,"dependencies":{"phase":"^0.5.4"}}\n';
    const source = fixture('unknown-subpath.input.txt');
    writeFileSync(join(consumer, 'package.json'), manifest);
    writeFileSync(join(consumer, 'src/consumer.ts'), source);

    const migration = run(consumer, ['rename-imports', '.']);
    expect(migration.status).toBe(1);
    expect(migration.stdout).toBe('');
    expect(migration.stderr).toContain(
      'Unsupported legacy specifier "phase/other" in src/consumer.ts',
    );
    expect(readFileSync(join(consumer, 'package.json'), 'utf8')).toBe(manifest);
    expect(readFileSync(join(consumer, 'src/consumer.ts'), 'utf8')).toBe(
      source,
    );
  });

  it('runs through npx from a packed package tarball', () => {
    const packed = mkdtempSync(join(tmpdir(), 'usephase-codemod-pack-'));
    const consumer = mkdtempSync(join(tmpdir(), 'usephase-codemod-consumer-'));
    temporaryDirectories.push(packed, consumer);
    const archive = join(packed, 'usephase-codemod.tgz');

    const pack = spawnSync('pnpm', ['pack', '--out', archive], {
      cwd: PACKAGE_ROOT,
      encoding: 'utf8',
    });
    expect(pack.status, pack.stderr).toBe(0);

    writeFileSync(
      join(consumer, 'package.json'),
      '{"private":true,"dependencies":{"phase":"^0.5.4"}}\n',
    );
    writeFileSync(
      join(consumer, 'consumer.ts'),
      fixture('module-forms.input.txt'),
    );
    const migration = spawnSync(
      'npx',
      ['--yes', `file:${archive}`, 'rename-imports', '.'],
      { cwd: consumer, encoding: 'utf8' },
    );
    expect(migration.status, migration.stderr).toBe(0);
    expect(migration.stdout).toBe(
      'Changed 2 files:\nconsumer.ts\npackage.json\n',
    );
    expect(readFileSync(join(consumer, 'consumer.ts'), 'utf8')).toBe(
      fixture('module-forms.output.txt'),
    );
  }, 30_000);
});
