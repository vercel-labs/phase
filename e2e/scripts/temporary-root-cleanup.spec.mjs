import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const cleanupModuleUrl = new URL(
  './temporary-root-cleanup.mjs',
  import.meta.url,
).href;

test(
  'stops the active child, removes the root, and preserves SIGINT',
  async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'phase-exit-cleanup-'));
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { spawn } from 'node:child_process';
import { createTemporaryRootLifecycle } from ${JSON.stringify(cleanupModuleUrl)};
const lifecycle = createTemporaryRootLifecycle(${JSON.stringify(temporaryRoot)});
const activeChild = spawn(process.execPath, [
  '--input-type=module',
  '--eval',
  'setInterval(() => undefined, 1_000)',
], { stdio: 'ignore' });
lifecycle.trackChild(activeChild);
process.stdout.write('ready\\n');
setInterval(() => undefined, 1_000);`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    try {
      await waitForReady(child);
      const closed = once(child, 'close');
      child.kill('SIGINT');

      const [code, signal] = await closed;
      assert.equal(code, null);
      assert.equal(signal, 'SIGINT');
      assert.equal(existsSync(temporaryRoot), false);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await once(child, 'close');
      }
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  },
  { timeout: 5_000 },
);

function waitForReady(child) {
  return new Promise((resolvePromise, rejectPromise) => {
    let stderr = '';

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.setEncoding('utf8');
    child.stdout.once('data', (chunk) => {
      if (chunk === 'ready\n') {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`Unexpected child output: ${chunk}`));
    });
    child.once('error', rejectPromise);
    child.once('close', (code, signal) => {
      rejectPromise(
        new Error(
          `Child exited before it was ready: ${signal ?? `exit code ${code}`}\n${stderr}`,
        ),
      );
    });
  });
}
