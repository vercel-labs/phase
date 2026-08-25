import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const SCRIPT = join(import.meta.dirname, 'check-package-version.mjs');
const fixtures = [];

function runGit(cwd, ...args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr);
  return run.stdout.trim();
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), 'phase-version-check-'));
  fixtures.push(root);

  runGit(root, 'init', '--quiet');
  runGit(root, 'config', 'user.email', 'phase@example.com');
  runGit(root, 'config', 'user.name', 'phase test');

  writeJson(join(root, 'package.json'), {
    name: 'phase',
    version: '1.0.0',
    type: 'module',
    scripts: { build: 'tsdown', prepare: 'lefthook install || true' },
    files: ['dist', 'LICENSE', 'README.md'],
    exports: { '.': './dist/index.js' },
  });
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/index.ts'), 'export const phase = 1;\n');
  writeFileSync(join(root, 'tsconfig.json'), '{}\n');
  writeFileSync(join(root, 'tsdown.config.ts'), 'export default {};\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '--quiet', '-m', 'base');

  return { root, base: runGit(root, 'rev-parse', 'HEAD') };
}

function movePackage(root) {
  const packageRoot = join(root, 'packages/phase');
  mkdirSync(packageRoot, { recursive: true });
  for (const path of ['package.json', 'src', 'tsdown.config.ts']) {
    renameSync(join(root, path), join(packageRoot, path));
  }

  writeJson(join(root, 'tsconfig.json'), {
    extends: './tsconfig.base.json',
    include: ['scanner'],
  });
  writeJson(join(packageRoot, 'tsconfig.json'), {
    extends: '../../tsconfig.base.json',
    include: ['src'],
  });

  const manifestPath = join(packageRoot, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.scripts = { build: 'tsdown' };
  writeJson(manifestPath, manifest);
  runGit(root, 'add', '.');
}

function createMovedRepository() {
  const { root } = createRepository();
  movePackage(root);
  runGit(root, 'commit', '--quiet', '-m', 'move package');
  return { root, base: runGit(root, 'rev-parse', 'HEAD') };
}

function runCheck(root, base) {
  return spawnSync(process.execPath, [SCRIPT, base], {
    cwd: root,
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

describe('package release intent', () => {
  it('accepts an unchanged package moved into the workspace', () => {
    const { root, base } = createRepository();
    movePackage(root);

    const run = runCheck(root, base);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain('No package release required.');
    expect(run.stderr).toBe('');
  });

  it('accepts repository-only changes after the workspace move', () => {
    const { root, base } = createMovedRepository();
    writeFileSync(join(root, 'CONTRIBUTING.md'), '# Contributing\n');

    const run = runCheck(root, base);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain('No package release required.');
  });

  it('rejects package source changes without a version bump', () => {
    const { root, base } = createMovedRepository();
    writeFileSync(
      join(root, 'packages/phase/src/index.ts'),
      'export const phase = 2;\n',
    );

    const run = runCheck(root, base);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Package contents changed without a version bump',
    );
  });

  it('rejects package config changes after the workspace move', () => {
    const { root, base } = createMovedRepository();
    writeJson(join(root, 'packages/phase/tsconfig.json'), {
      extends: '../../tsconfig.base.json',
      include: ['src', 'extra'],
    });

    const run = runCheck(root, base);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Package contents changed without a version bump',
    );
  });
});
