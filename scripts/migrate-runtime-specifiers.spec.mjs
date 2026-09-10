import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const SCRIPT = join(import.meta.dirname, 'migrate-runtime-specifiers.mjs');

function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function run(root, mode) {
  return spawnSync(process.execPath, [SCRIPT, mode], {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('runtime specifier migration', () => {
  it('rewrites exact runtime specifiers without changing tool identities', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-runtime-migration-'));
    const source = [
      "import 'phase';",
      "import { createLoop } from 'phase';",
      'export { easeOutCubic } from "phase/ease";',
      "const binding = import('phase/react');",
      "const protocol = 'phase.clock@2';",
      'const command = "npx phase scan";',
      'const image = \'<img alt="phase">\';',
      "const unknown = import('phase/unknown');",
      '',
    ].join('\n');
    write(root, 'packages/examples/sample.ts', source);

    const check = run(root, '--check');

    expect(check.status).toBe(1);
    expect(
      readFileSync(join(root, 'packages/examples/sample.ts'), 'utf8'),
    ).toBe(source);
    expect(check.stdout).toContain('4 runtime specifiers need migration');
    expect(check.stderr).toContain(
      'Unclassified runtime specifier: phase/unknown',
    );

    const writeRun = run(root, '--write');

    expect(writeRun.status).toBe(2);

    write(
      root,
      'packages/examples/sample.ts',
      source.replace("const unknown = import('phase/unknown');\n", ''),
    );

    const successfulWrite = run(root, '--write');
    expect(successfulWrite.status).toBe(0);
    expect(
      readFileSync(join(root, 'packages/examples/sample.ts'), 'utf8'),
    ).toBe(
      [
        "import '@usephase/core';",
        "import { createLoop } from '@usephase/core';",
        'export { easeOutCubic } from "@usephase/core/ease";',
        "const binding = import('@usephase/react');",
        "const protocol = 'phase.clock@2';",
        'const command = "npx phase scan";',
        'const image = \'<img alt="phase">\';',
        '',
      ].join('\n'),
    );
    expect(successfulWrite.stdout).toContain('Migrated 4 runtime specifiers');

    const secondWrite = run(root, '--write');
    expect(secondWrite.status).toBe(0);
    expect(secondWrite.stdout).toContain('Migrated 0 runtime specifiers');

    write(
      root,
      'packages/react/unmigrated.ts',
      "import { useLoop } from 'phase/react';\n",
    );
    const legacyCheck = run(root, '--check');
    expect(legacyCheck.status).toBe(1);
    expect(legacyCheck.stderr).toContain(
      'Unexpected legacy runtime import in packages/react/unmigrated.ts',
    );
    unlinkSync(join(root, 'packages/react/unmigrated.ts'));

    write(root, '.github/workflows/ci.yml', 'run: pnpm --filter phase test\n');
    const configurationCheck = run(root, '--check');
    expect(configurationCheck.status).toBe(1);
    expect(configurationCheck.stderr).toContain(
      'Legacy package configuration in .github/workflows/ci.yml',
    );
    unlinkSync(join(root, '.github/workflows/ci.yml'));

    const cleanCheck = run(root, '--check');
    expect(cleanCheck.status).toBe(0);
    expect(cleanCheck.stdout).toContain('Runtime specifiers are current');
  });
});
