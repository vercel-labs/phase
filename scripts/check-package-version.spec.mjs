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

function createRepository(version = '1.0.0') {
  const root = mkdtempSync(join(tmpdir(), 'phase-version-check-'));
  fixtures.push(root);

  runGit(root, 'init', '--quiet');
  runGit(root, 'config', 'user.email', 'phase@example.com');
  runGit(root, 'config', 'user.name', 'phase test');
  runGit(root, 'config', 'commit.gpgsign', 'false');

  writeJson(join(root, 'package.json'), {
    name: 'phase',
    version,
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
  writeJson(join(root, 'tsconfig.base.json'), {
    compilerOptions: { target: 'ES2022' },
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

function createMovedRepository(version) {
  const { root } = createRepository(version);
  movePackage(root);
  writeJson(join(root, 'scripts/publishable-packages.json'), [
    'packages/phase',
  ]);
  runGit(root, 'add', '.');
  runGit(root, 'commit', '--quiet', '-m', 'move package');
  return { root, base: runGit(root, 'rev-parse', 'HEAD') };
}

function createTwoPackageRepository() {
  const { root } = createMovedRepository();
  const packageRoot = join(root, 'packages/react');
  writeJson(join(packageRoot, 'package.json'), {
    name: '@usephase/react',
    version: '1.0.0',
    type: 'module',
    scripts: { build: 'tsdown' },
    files: ['dist'],
    exports: { '.': './dist/index.js' },
  });
  mkdirSync(join(packageRoot, 'src'));
  writeFileSync(
    join(packageRoot, 'src/index.ts'),
    'export const usePhase = 1;\n',
  );
  writeFileSync(join(packageRoot, 'tsconfig.json'), '{}\n');
  writeFileSync(join(packageRoot, 'tsdown.config.ts'), 'export default {};\n');
  writeJson(join(root, 'scripts/publishable-packages.json'), [
    'packages/phase',
    'packages/react',
  ]);
  runGit(root, 'add', '.');
  runGit(root, 'commit', '--quiet', '-m', 'add react package');
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
  it('accepts repository-only changes after the workspace move', () => {
    const { root, base } = createMovedRepository();
    writeFileSync(join(root, 'CONTRIBUTING.md'), '# Contributing\n');

    const run = runCheck(root, base);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain('No package release required for phase.');
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

  it('rejects package source renames after the workspace move', () => {
    const { root, base } = createMovedRepository();
    const destination = join(root, 'apps/example/index.ts');
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(join(root, 'packages/phase/src/index.ts'), destination);
    runGit(root, 'add', '.');

    const run = runCheck(root, base);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Package contents changed without a version bump',
    );
  });

  it('rejects package source paths that Git would quote', () => {
    const { root, base } = createMovedRepository();
    writeFileSync(
      join(root, 'packages/phase/src/quoted-\u00fc.ts'),
      'export const quoted = true;\n',
    );
    runGit(root, 'add', '.');

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

  it('rejects shared config changes after the workspace move', () => {
    const { root, base } = createMovedRepository();
    writeJson(join(root, 'tsconfig.base.json'), {
      compilerOptions: { target: 'ES2021' },
    });

    const run = runCheck(root, base);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Package contents changed without a version bump',
    );
  });

  it('checks release intent for every declared package', () => {
    const { root, base } = createTwoPackageRepository();
    writeFileSync(
      join(root, 'packages/react/src/index.ts'),
      'export const usePhase = 2;\n',
    );

    const run = runCheck(root, base);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Package contents changed without a version bump for @usephase/react',
    );
  });

  it('accepts an independent version bump for a changed package', () => {
    const { root, base } = createTwoPackageRepository();
    writeFileSync(
      join(root, 'packages/react/src/index.ts'),
      'export const usePhase = 2;\n',
    );
    const manifestPath = join(root, 'packages/react/package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.version = '1.0.1';
    writeJson(manifestPath, manifest);

    const run = runCheck(root, base);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(
      'Package release requested for @usephase/react: 1.0.0 -> 1.0.1.',
    );
    expect(run.stdout).toContain('No package release required for phase.');
  });

  it('does not require a release for package test changes', () => {
    const { root, base } = createTwoPackageRepository();
    writeFileSync(
      join(root, 'packages/react/src/index.spec.ts'),
      'export const testOnly = true;\n',
    );

    const run = runCheck(root, base);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(
      'No package release required for @usephase/react.',
    );
  });

  it('rejects published bin changes without a version bump', () => {
    const { root, base } = createTwoPackageRepository();
    const manifestPath = join(root, 'packages/react/package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.bin = { phase: './dist/index.js' };
    writeJson(manifestPath, manifest);

    const run = runCheck(root, base);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Package contents changed without a version bump for @usephase/react',
    );
  });

  it('rejects a package version that moves backward', () => {
    const { root, base } = createMovedRepository();
    const manifestPath = join(root, 'packages/phase/package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.version = '0.9.0';
    writeJson(manifestPath, manifest);

    const run = runCheck(root, base);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Package version must increase for phase: 1.0.0 -> 0.9.0.',
    );
  });

  it('accepts an increasing prerelease package version', () => {
    const { root, base } = createMovedRepository('1.0.0-beta.2');
    const manifestPath = join(root, 'packages/phase/package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.version = '1.0.0-beta.10';
    writeJson(manifestPath, manifest);

    const run = runCheck(root, base);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(
      'Package release requested for phase: 1.0.0-beta.2 -> 1.0.0-beta.10.',
    );
  });

  it('rejects source changes made while moving a declared package', () => {
    const { root, base } = createMovedRepository();
    renameSync(join(root, 'packages/phase'), join(root, 'packages/core'));
    writeJson(join(root, 'scripts/publishable-packages.json'), [
      'packages/core',
    ]);
    writeFileSync(
      join(root, 'packages/core/src/index.ts'),
      'export const phase = 2;\n',
    );
    runGit(root, 'add', '-A');

    const run = runCheck(root, base);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Package contents changed without a version bump for phase',
    );
  });

  it('accepts moving an unchanged declared package', () => {
    const { root, base } = createMovedRepository();
    renameSync(join(root, 'packages/phase'), join(root, 'packages/core'));
    writeJson(join(root, 'scripts/publishable-packages.json'), [
      'packages/core',
    ]);
    runGit(root, 'add', '-A');

    const run = runCheck(root, base);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain('No package release required for phase.');
  });

  it('matches a moved package by npm name when Git misses the rename', () => {
    const { root, base } = createMovedRepository();
    renameSync(join(root, 'packages/phase'), join(root, 'packages/core'));
    writeJson(join(root, 'packages/core/package.json'), {
      name: 'phase',
      version: '1.0.0',
    });
    writeJson(join(root, 'scripts/publishable-packages.json'), [
      'packages/core',
    ]);
    runGit(root, 'add', '-A');

    const run = runCheck(root, base);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Package contents changed without a version bump for phase',
    );
  });

  it('treats a changed npm name as a new package', () => {
    const { root, base } = createMovedRepository();
    const manifestPath = join(root, 'packages/phase/package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.name = '@usephase/core';
    manifest.version = '0.1.0';
    writeJson(manifestPath, manifest);

    const run = runCheck(root, base);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(
      'Package release requested for @usephase/core: new package at 0.1.0.',
    );
  });

  it('rejects build script changes without a version bump', () => {
    const { root, base } = createTwoPackageRepository();
    const manifestPath = join(root, 'packages/react/package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.scripts.build = 'tsdown --minify';
    writeJson(manifestPath, manifest);

    const run = runCheck(root, base);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Package contents changed without a version bump for @usephase/react',
    );
  });

  it('rejects prebuild changes without a version bump', () => {
    const { root, base } = createTwoPackageRepository();
    const manifestPath = join(root, 'packages/react/package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.scripts.prebuild = 'node prepare-build.mjs';
    writeJson(manifestPath, manifest);

    const run = runCheck(root, base);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Package contents changed without a version bump for @usephase/react',
    );
  });
});
