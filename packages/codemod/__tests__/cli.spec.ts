import { spawnSync } from 'node:child_process';
import {
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

    const writeRun = run(consumer, ['rename-imports', '.']);
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

  it('runs from an installed package tarball', () => {
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
    const install = spawnSync(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        '--no-save',
        archive,
      ],
      { cwd: consumer, encoding: 'utf8' },
    );
    expect(install.status, install.stderr).toBe(0);

    const installedCommand = join(
      consumer,
      'node_modules/.bin/usephase-codemod',
    );
    const migration = spawnSync(installedCommand, ['rename-imports', '.'], {
      cwd: consumer,
      encoding: 'utf8',
    });
    expect(migration.status, migration.stderr).toBe(0);
    expect(migration.stdout).toBe(
      'Changed 2 files:\nconsumer.ts\npackage.json\n',
    );
    expect(readFileSync(join(consumer, 'consumer.ts'), 'utf8')).toBe(
      fixture('module-forms.output.txt'),
    );
  }, 30_000);
});
