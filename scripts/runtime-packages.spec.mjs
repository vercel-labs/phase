import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

function run(command, args, cwd = ROOT) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`,
    );
  }
  return result;
}

describe('packed runtime packages', () => {
  it('installs every public entry and preserves the shared error identity', () => {
    const consumer = mkdtempSync(join(tmpdir(), 'phase-runtime-consumer-'));
    try {
      const coreTarball = join(consumer, 'core.tgz');
      const reactTarball = join(consumer, 'react.tgz');

      run('pnpm', ['--dir', 'packages/core', 'pack', '--out', coreTarball]);
      run('pnpm', ['--dir', 'packages/react', 'pack', '--out', reactTarball]);
      run(
        'npm',
        [
          'install',
          '--ignore-scripts',
          '--legacy-peer-deps',
          '--no-audit',
          '--no-fund',
          coreTarball,
          reactTarball,
        ],
        consumer,
      );
      for (const dependency of ['react', 'react-dom', '@types']) {
        symlinkSync(
          realpathSync(join(ROOT, 'packages/react/node_modules', dependency)),
          join(consumer, 'node_modules', dependency),
          'dir',
        );
      }

      const smoke = run(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `const core = await import('@usephase/core');
await import('@usephase/core/ease');
await import('@usephase/core/internal');
const binding = await import('@usephase/react');
const React = await import('react');
const { renderToString } = await import('react-dom/server');
let thrown = false;
try {
  renderToString(React.createElement(binding.Swap.State, { id: 'missing' }));
} catch (error) {
  thrown = true;
  if (!(error instanceof core.PhaseError)) throw error;
}
if (!thrown) throw new Error('Expected the React binding to throw PhaseError');`,
        ],
        consumer,
      );
      expect(smoke.status).toBe(0);

      writeFileSync(
        join(consumer, 'consumer.mts'),
        `import { createLoop, type Loop } from '@usephase/core';
import { REDUCED_MOTION_QUERY } from '@usephase/core/internal';
import { useLoop, type UseLoopOptions } from '@usephase/react';
void createLoop;
void useLoop;
const loop = null as unknown as Loop;
const options = null as unknown as UseLoopOptions;
void loop;
void options;
void REDUCED_MOTION_QUERY;
`,
      );
      run(
        join(ROOT, 'packages/react/node_modules/.bin/tsc'),
        [
          '--noEmit',
          '--strict',
          '--skipLibCheck',
          '--module',
          'NodeNext',
          '--moduleResolution',
          'NodeNext',
          'consumer.mts',
        ],
        consumer,
      );

      const manifest = JSON.parse(
        readFileSync(
          join(consumer, 'node_modules/@usephase/react/package.json'),
          'utf8',
        ),
      );
      expect(manifest.dependencies['@usephase/core']).toBe('^0.6.0');
    } finally {
      rmSync(consumer, { recursive: true, force: true });
    }
  }, 30_000);
});
