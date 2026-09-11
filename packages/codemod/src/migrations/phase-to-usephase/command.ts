import type { CodemodCommand } from '../../command.js';
import { applyPhaseToUsephase } from './apply.js';
import { InvalidTargetError, planPhaseToUsephase } from './plan.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const phaseToUsephaseCommand: CodemodCommand = {
  execute({ cwd, target, isDryRun }) {
    let plan;
    try {
      plan = planPhaseToUsephase({ cwd, target });
    } catch (error) {
      if (error instanceof InvalidTargetError) {
        return { kind: 'invalid-target', message: error.message };
      }
      return {
        kind: 'failed',
        message: errorMessage(error),
        appliedFiles: [],
        canRetry: false,
      };
    }

    const changedFiles = plan.changes.map((change) => change.displayPath);
    if (isDryRun) return { kind: 'succeeded', changedFiles };

    const result = applyPhaseToUsephase(plan);
    if (result.kind === 'applied') return { kind: 'succeeded', changedFiles };

    const message =
      result.stage === 'cleanup'
        ? `Changed ${result.failedChange.displayPath}, but failed to remove its temporary directory: ${errorMessage(result.cause)}`
        : `Failed to apply change to ${result.failedChange.displayPath}: ${errorMessage(result.cause)}`;
    return {
      kind: 'failed',
      message,
      appliedFiles: result.appliedChanges.map((change) => change.displayPath),
      canRetry: true,
    };
  },
};
