import { rmSync } from 'node:fs';

const terminationSignals = ['SIGINT', 'SIGTERM'];

/**
 * Coordinate child termination and temporary-root cleanup with process exit.
 *
 * A received termination signal stops the active child, removes the temporary
 * root synchronously, then re-emits the signal so shells and task runners
 * observe it normally. The exit listener is a fallback for exits that bypass
 * the signal handlers.
 *
 * @param {string} temporaryRoot A directory created for the current process.
 * @returns {{
 *   finish: () => void,
 *   trackChild: (child: import('node:child_process').ChildProcess) => () => void
 * }} Lifecycle controls for the process that owns the temporary root.
 */
export function createTemporaryRootLifecycle(temporaryRoot) {
  let activeChild;

  const removeTemporaryRoot = () => {
    try {
      rmSync(temporaryRoot, { recursive: true, force: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `Could not remove temporary root ${temporaryRoot}: ${message}\n`,
      );
    }
  };

  const signalHandlers = new Map();
  const unregister = () => {
    process.removeListener('exit', removeTemporaryRoot);
    for (const [signal, handler] of signalHandlers) {
      process.removeListener(signal, handler);
    }
  };

  process.once('exit', removeTemporaryRoot);
  for (const signal of terminationSignals) {
    const handler = () => {
      activeChild?.kill(signal);
      unregister();
      removeTemporaryRoot();
      process.kill(process.pid, signal);
    };
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }

  return {
    finish() {
      unregister();
    },
    trackChild(child) {
      activeChild = child;

      return () => {
        if (activeChild === child) activeChild = undefined;
      };
    },
  };
}
