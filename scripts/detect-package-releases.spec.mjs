import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const SCRIPT = join(import.meta.dirname, 'detect-package-releases.mjs');
const fixtures = [];

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'phase-release-detect-'));
  fixtures.push(root);

  writeJson(join(root, 'scripts/publishable-packages.json'), [
    'packages/phase',
  ]);
  writeJson(join(root, 'packages/phase/package.json'), {
    name: 'phase',
    version: '1.0.0',
  });

  const bin = join(root, 'bin');
  const npm = join(bin, 'npm');
  mkdirSync(bin);
  writeFileSync(
    npm,
    `#!/usr/bin/env node
if (process.env.NPM_VIEW_ERROR) {
  process.stderr.write(process.env.NPM_VIEW_ERROR);
  process.exit(1);
}
process.stdout.write(process.env.NPM_VIEW_OUTPUT);
`,
  );
  chmodSync(npm, 0o755);

  return { root, bin };
}

function runDetect(
  root,
  bin,
  npmOutput,
  npmError = '',
  packageDirectory,
  path = `${bin}:${process.env.PATH}`,
) {
  return spawnSync(
    process.execPath,
    [SCRIPT, ...(packageDirectory ? [packageDirectory] : [])],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        NPM_VIEW_ERROR: npmError,
        NPM_VIEW_OUTPUT: npmOutput,
        PATH: path,
      },
    },
  );
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

describe('package release detection', () => {
  it('emits an empty matrix when every declared version is published', () => {
    const { root, bin } = createWorkspace();

    const run = runDetect(root, bin, '["0.9.0","1.0.0"]\n');

    expect(run.status).toBe(0);
    expect(run.stdout).toBe('packages=[]\nhas_packages=false\n');
    expect(run.stderr).toContain('phase@1.0.0 already exists');
  });

  it('emits a declared package whose version is not published', () => {
    const { root, bin } = createWorkspace();

    const run = runDetect(root, bin, '["0.9.0"]\n');

    expect(run.status).toBe(0);
    expect(run.stdout).toBe('packages=["packages/phase"]\nhas_packages=true\n');
    expect(run.stderr).toContain(
      'Unpublished package version detected: phase@1.0.0',
    );
  });

  it('treats a package missing from npm as unpublished', () => {
    const { root, bin } = createWorkspace();

    const run = runDetect(root, bin, '', 'npm error code E404\n');

    expect(run.status).toBe(0);
    expect(run.stdout).toBe('packages=["packages/phase"]\nhas_packages=true\n');
    expect(run.stderr).toContain(
      'Unpublished package version detected: phase@1.0.0',
    );
  });

  it('rejects a private package in the declared list', () => {
    const { root, bin } = createWorkspace();
    writeJson(join(root, 'packages/phase/package.json'), {
      name: 'phase',
      version: '1.0.0',
      private: true,
    });

    const run = runDetect(root, bin, '["1.0.0"]\n');

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Declared package packages/phase must not be private',
    );
  });

  it('ignores private packages that are not declared', () => {
    const { root, bin } = createWorkspace();
    writeJson(join(root, 'packages/private/package.json'), {
      name: '@usephase/private',
      version: '2.0.0',
      private: true,
    });

    const run = runDetect(root, bin, '["1.0.0"]\n');

    expect(run.status).toBe(0);
    expect(run.stdout).toBe('packages=[]\nhas_packages=false\n');
    expect(run.stderr).not.toContain('@usephase/private');
  });

  it('preserves declared package order in the matrix', () => {
    const { root, bin } = createWorkspace();
    writeJson(join(root, 'packages/react/package.json'), {
      name: '@usephase/react',
      version: '1.0.0',
    });
    writeJson(join(root, 'scripts/publishable-packages.json'), [
      'packages/phase',
      'packages/react',
    ]);

    const run = runDetect(root, bin, '["0.9.0"]\n');

    expect(run.status).toBe(0);
    expect(run.stdout).toBe(
      'packages=["packages/phase","packages/react"]\nhas_packages=true\n',
    );
  });

  it('fails on a non-404 npm error', () => {
    const { root, bin } = createWorkspace();

    const run = runDetect(root, bin, '', 'npm error code E500\n');

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('npm error code E500');
    expect(run.stdout).toBe('');
  });

  it('rejects a declared directory without a package manifest', () => {
    const { root, bin } = createWorkspace();
    writeJson(join(root, 'scripts/publishable-packages.json'), [
      'packages/missing',
    ]);

    const run = runDetect(root, bin, '[]\n');

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Declared package packages/missing does not exist',
    );
  });

  it('rejects a declared directory with shell metacharacters', () => {
    const { root, bin } = createWorkspace();
    writeJson(join(root, 'packages/bad;touch/package.json'), {
      name: 'bad-package',
      version: '1.0.0',
    });
    writeJson(join(root, 'scripts/publishable-packages.json'), [
      'packages/bad;touch',
    ]);

    const run = runDetect(root, bin, '[]\n');

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Declared package directory must match packages/<name>',
    );
  });

  it('rejects duplicate npm package names', () => {
    const { root, bin } = createWorkspace();
    writeJson(join(root, 'packages/other/package.json'), {
      name: 'phase',
      version: '2.0.0',
    });
    writeJson(join(root, 'scripts/publishable-packages.json'), [
      'packages/phase',
      'packages/other',
    ]);

    const run = runDetect(root, bin, '[]\n');

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Declared npm package name is duplicated: phase',
    );
  });

  it('reports a missing npm executable with package context', () => {
    const { root, bin } = createWorkspace();

    const run = runDetect(root, bin, '', '', undefined, '');

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Failed to check published versions for phase',
    );
    expect(run.stderr).toContain('ENOENT');
  });

  it('can recheck one matrix package without considering later packages', () => {
    const { root, bin } = createWorkspace();
    writeJson(join(root, 'packages/react/package.json'), {
      name: '@usephase/react',
      version: '2.0.0',
    });
    writeJson(join(root, 'scripts/publishable-packages.json'), [
      'packages/phase',
      'packages/react',
    ]);

    const run = runDetect(root, bin, '["1.0.0"]\n', '', 'packages/phase');

    expect(run.status).toBe(0);
    expect(run.stdout).toBe(
      'package_name=phase\npackage_version=1.0.0\npackages=[]\nhas_packages=false\n',
    );
    expect(run.stderr).not.toContain('@usephase/react');
  });

  it('rejects semantic versions beyond npm numeric limits', () => {
    const { root, bin } = createWorkspace();
    writeJson(join(root, 'packages/phase/package.json'), {
      name: 'phase',
      version: '9007199254740992.0.0',
    });

    const run = runDetect(root, bin, '[]\n');

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'must have a valid npm name and semantic version',
    );
  });

  it('rejects an npm package name that could inject an output line', () => {
    const { root, bin } = createWorkspace();
    writeJson(join(root, 'packages/phase/package.json'), {
      name: 'phase\nforged=true',
      version: '1.0.0',
    });

    const run = runDetect(root, bin, '[]\n');

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'must have a valid npm name and semantic version',
    );
    expect(run.stdout).toBe('');
  });

  it('rejects a package configured to publish outside npmjs', () => {
    const { root, bin } = createWorkspace();
    writeJson(join(root, 'packages/phase/package.json'), {
      name: 'phase',
      version: '1.0.0',
      publishConfig: { registry: 'https://registry.example.com' },
    });

    const run = runDetect(root, bin, '[]\n');

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('must publish to https://registry.npmjs.org');
  });
});
