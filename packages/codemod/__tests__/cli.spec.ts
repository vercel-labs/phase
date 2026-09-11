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
const MIGRATION_COMMAND = 'migrate-phase-to-usephase';
// Keep legacy test data from being classified as an unmigrated source import.
const LEGACY_PACKAGE = ['ph', 'ase'].join('');
const SOURCE_INPUT = `import { easeOutCubic } from '${LEGACY_PACKAGE}/ease';\n`;
const SOURCE_OUTPUT = "import { easeOutCubic } from '@usephase/core/ease';\n";
const MANIFEST_INPUT = `${JSON.stringify({
  private: true,
  dependencies: { [LEGACY_PACKAGE]: '^0.5.4' },
})}\n`;
const PARSE_ERROR_INPUT = `import { from '${LEGACY_PACKAGE}';\n`;
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

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
    { args: ['--help'], status: 0, output: MIGRATION_COMMAND },
    {
      args: [MIGRATION_COMMAND, '--help'],
      status: 0,
      output: `Usage: usephase-codemod ${MIGRATION_COMMAND} [options] <path>`,
    },
    { args: ['help'], status: 0, output: 'Usage: usephase-codemod' },
    {
      args: ['help', MIGRATION_COMMAND],
      status: 0,
      output: `Usage: usephase-codemod ${MIGRATION_COMMAND} [options] <path>`,
    },
    {
      args: ['unknown'],
      status: 2,
      output: "error: unknown command 'unknown'",
    },
    {
      args: [MIGRATION_COMMAND, '--unknown', '.'],
      status: 2,
      output: "error: unknown option '--unknown'",
    },
    {
      args: [MIGRATION_COMMAND],
      status: 2,
      output: "error: missing required argument 'path'",
    },
    {
      args: [MIGRATION_COMMAND, '.', 'src'],
      status: 2,
      output: `error: too many arguments for '${MIGRATION_COMMAND}'`,
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
    const lockfile = `${LEGACY_PACKAGE}: ^0.5.4\n`;
    writeFileSync(join(consumer, 'src/consumer.ts'), SOURCE_INPUT);
    writeFileSync(join(consumer, 'package.json'), MANIFEST_INPUT);
    writeFileSync(join(consumer, 'pnpm-lock.yaml'), lockfile);

    const preview = run(consumer, [MIGRATION_COMMAND, '--dry', '.']);
    expect(preview.status, preview.stderr).toBe(0);
    expect(preview.stdout).toBe(
      'Would change 2 files:\npackage.json\nsrc/consumer.ts\n',
    );
    expect(readFileSync(join(consumer, 'src/consumer.ts'), 'utf8')).toBe(
      SOURCE_INPUT,
    );

    const applied = run(consumer, [MIGRATION_COMMAND, '.']);
    expect(applied.status, applied.stderr).toBe(0);
    expect(applied.stdout).toBe(
      'Changed 2 files:\npackage.json\nsrc/consumer.ts\n',
    );
    expect(readFileSync(join(consumer, 'src/consumer.ts'), 'utf8')).toBe(
      SOURCE_OUTPUT,
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
    for (const directory of ['a', 'b']) {
      mkdirSync(join(consumer, directory));
      writeFileSync(join(consumer, directory, 'consumer.ts'), SOURCE_INPUT);
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
    expect(result.stderr).toContain(
      'Resolve the reported error, then rerun the migration; files already changed will be skipped.',
    );
  });

  it('maps a planning failure to exit code 1', () => {
    const consumer = temporaryDirectory();
    writeFileSync(join(consumer, 'invalid.ts'), PARSE_ERROR_INPUT);

    const result = run(consumer, [MIGRATION_COMMAND, '.']);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('invalid.ts:');
    expect(readFileSync(join(consumer, 'invalid.ts'), 'utf8')).toBe(
      PARSE_ERROR_INPUT,
    );
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
    writeFileSync(join(consumer, 'consumer.ts'), SOURCE_INPUT);

    const result = spawnSync(
      'npx',
      ['--yes', `file:${archive}`, MIGRATION_COMMAND, '.'],
      { cwd: consumer, encoding: 'utf8' },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(consumer, 'consumer.ts'), 'utf8')).toBe(
      SOURCE_OUTPUT,
    );
  }, 30_000);
});
