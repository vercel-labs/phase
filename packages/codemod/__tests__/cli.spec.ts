import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PACKAGE_ROOT = resolve(import.meta.dirname, '..');
const COMMAND = join(PACKAGE_ROOT, 'dist/usephase-codemod.mjs');
const FIXTURES = new URL('fixtures/', import.meta.url);
const MIGRATION_COMMAND = 'migrate-phase-to-usephase';
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function fixture(name: string): string {
  return readFileSync(new URL(name, FIXTURES), 'utf8');
}

function temporaryDirectory(prefix = 'usephase-cli-') {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function run(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [COMMAND, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

describe('usephase-codemod command', () => {
  it.each([
    { args: [], status: 0, output: 'Usage: usephase-codemod' },
    { args: ['--help'], status: 0, output: 'Usage: usephase-codemod' },
    { args: ['unknown'], status: 2, output: 'Unknown command: unknown' },
    {
      args: [MIGRATION_COMMAND, '--unknown', '.'],
      status: 2,
      output: 'Unknown option: --unknown',
    },
    {
      args: [MIGRATION_COMMAND],
      status: 2,
      output: 'Missing path',
    },
    {
      args: [MIGRATION_COMMAND, '.', 'src'],
      status: 2,
      output: 'Expected exactly one path',
    },
    {
      args: [MIGRATION_COMMAND, 'missing.ts'],
      status: 2,
      output: 'Target does not exist: missing.ts',
    },
  ])('maps $args to exit $status', ({ args, status, output }) => {
    const result = run(PACKAGE_ROOT, args);

    expect(result.status).toBe(status);
    expect(`${result.stdout}${result.stderr}`).toContain(output);
  });

  it('previews, applies, and safely reruns a migration', () => {
    const consumer = temporaryDirectory();
    mkdirSync(join(consumer, 'src'));
    const source = fixture('module-forms.input.txt');
    const manifest = fixture('package.input.txt');
    const lockfile = 'phase: ^0.5.4\n';
    writeFileSync(join(consumer, 'src/consumer.tsx'), source);
    writeFileSync(join(consumer, 'package.json'), manifest);
    writeFileSync(join(consumer, 'pnpm-lock.yaml'), lockfile);

    const preview = run(consumer, [MIGRATION_COMMAND, '--dry', '.']);
    expect(preview.status, preview.stderr).toBe(0);
    expect(preview.stdout).toBe(
      'Would change 2 files:\npackage.json\nsrc/consumer.tsx\n',
    );
    expect(readFileSync(join(consumer, 'src/consumer.tsx'), 'utf8')).toBe(
      source,
    );

    const applied = run(consumer, [MIGRATION_COMMAND, '.']);
    expect(applied.status, applied.stderr).toBe(0);
    expect(applied.stdout).toBe(
      'Changed 2 files:\npackage.json\nsrc/consumer.tsx\n',
    );
    expect(readFileSync(join(consumer, 'src/consumer.tsx'), 'utf8')).toBe(
      fixture('module-forms.output.txt'),
    );
    expect(readFileSync(join(consumer, 'pnpm-lock.yaml'), 'utf8')).toBe(
      lockfile,
    );

    const rerun = run(consumer, [MIGRATION_COMMAND, '.']);
    expect(rerun.status, rerun.stderr).toBe(0);
    expect(rerun.stdout).toBe('Changed 0 files\n');
  });

  it('reports files applied before a later failure', () => {
    const consumer = temporaryDirectory();
    const source = fixture('core-only.input.txt');
    for (const directory of ['a', 'b']) {
      mkdirSync(join(consumer, directory));
      writeFileSync(join(consumer, directory, 'consumer.ts'), source);
    }
    chmodSync(join(consumer, 'b'), 0o555);

    let result;
    try {
      result = run(consumer, [MIGRATION_COMMAND, '.']);
    } finally {
      chmodSync(join(consumer, 'b'), 0o755);
    }

    expect(result.status).toBe(1);
    expect(result.stdout).toBe(
      'Changed 1 file before failure:\na/consumer.ts\n',
    );
    expect(result.stderr).toContain('Failed to apply change to b/consumer.ts:');
    expect(result.stderr).toContain('Rerun the command');
  });

  it('maps a planning failure to exit code 1', () => {
    const consumer = temporaryDirectory();
    const source = fixture('parse-error.input.txt');
    writeFileSync(join(consumer, 'invalid.ts'), source);

    const result = run(consumer, [MIGRATION_COMMAND, '.']);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('invalid.ts:');
    expect(readFileSync(join(consumer, 'invalid.ts'), 'utf8')).toBe(source);
  });

  it('runs through npx from a packed package tarball', () => {
    const packed = temporaryDirectory('usephase-pack-');
    const consumer = temporaryDirectory('usephase-consumer-');
    const archive = join(packed, 'usephase-codemod.tgz');
    const pack = spawnSync('pnpm', ['pack', '--out', archive], {
      cwd: PACKAGE_ROOT,
      encoding: 'utf8',
    });
    expect(pack.status, pack.stderr).toBe(0);
    writeFileSync(
      join(consumer, 'consumer.ts'),
      fixture('core-only.input.txt'),
    );

    const result = spawnSync(
      'npx',
      ['--yes', `file:${archive}`, MIGRATION_COMMAND, '.'],
      { cwd: consumer, encoding: 'utf8' },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(consumer, 'consumer.ts'), 'utf8')).toBe(
      fixture('core-only.output.txt'),
    );
  }, 30_000);
});
