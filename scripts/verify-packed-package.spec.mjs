import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const SCRIPT = join(import.meta.dirname, 'verify-packed-package.mjs');

function verify(manifest, name = 'phase', version = '1.0.0') {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    input: JSON.stringify(manifest),
    env: {
      ...process.env,
      EXPECTED_PACKAGE_NAME: name,
      EXPECTED_PACKAGE_VERSION: version,
    },
  });
}

describe('packed package name and version', () => {
  it('accepts the package name and version that were rechecked', () => {
    const run = verify({ name: 'phase', version: '1.0.0' });

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(
      'Packed package name and version verified: phase@1.0.0',
    );
  });

  it('rejects a package version changed by packing hooks', () => {
    const run = verify({ name: 'phase', version: '9.0.0' });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Packed package name or version changed: expected phase@1.0.0, received phase@9.0.0',
    );
  });
});
