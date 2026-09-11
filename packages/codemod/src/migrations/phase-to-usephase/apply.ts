import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import type {
  ParentDirectoryIdentity,
  PhaseToUsephasePlan,
  PlannedFileChange,
} from './plan.js';

export type ApplyPhaseToUsephaseResult =
  | { kind: 'applied' }
  | {
      kind: 'failed';
      stage: 'apply' | 'cleanup';
      failedChange: PlannedFileChange;
      appliedChanges: readonly PlannedFileChange[];
      cause: unknown;
    };

function readParentDirectoryIdentity(
  filePath: string,
): ParentDirectoryIdentity {
  const directory = dirname(filePath);
  const entry = lstatSync(directory);
  return {
    device: entry.dev,
    inode: entry.ino,
    realPath: realpathSync(directory),
  };
}

function sameDirectoryIdentity(
  left: ParentDirectoryIdentity,
  right: ParentDirectoryIdentity,
): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.realPath === right.realPath
  );
}

/**
 * Applies a completed plan with guarded same-filesystem replacements.
 *
 * Files are applied sequentially. A failure does not roll back earlier files;
 * appliedChanges identifies the completed prefix.
 */
export function applyPhaseToUsephase(
  plan: PhaseToUsephasePlan,
): ApplyPhaseToUsephaseResult {
  const appliedChanges: PlannedFileChange[] = [];
  for (const change of plan.changes) {
    let temporaryDirectory: string | undefined;
    let applyFailure: unknown;
    let cleanupFailure: unknown;
    try {
      if (
        !sameDirectoryIdentity(
          readParentDirectoryIdentity(change.filePath),
          change.parentDirectoryIdentity,
        )
      ) {
        throw new Error('parent directory changed after migration planning');
      }
      if (readFileSync(change.filePath, 'utf8') !== change.before) {
        throw new Error('file changed after migration planning');
      }
      const mode = lstatSync(change.filePath).mode % 0o10000;
      temporaryDirectory = mkdtempSync(
        join(dirname(change.filePath), '.usephase-codemod-'),
      );
      const temporaryFile = join(temporaryDirectory, 'replacement');
      writeFileSync(temporaryFile, change.after, { flag: 'wx', mode });
      chmodSync(temporaryFile, mode);
      // A temporary file below the target's parent keeps the rename on one filesystem.
      renameSync(temporaryFile, change.filePath);
      appliedChanges.push(change);
    } catch (error) {
      applyFailure = error;
    } finally {
      if (temporaryDirectory) {
        try {
          rmdirSync(temporaryDirectory);
        } catch (error) {
          cleanupFailure = error;
        }
      }
    }
    if (applyFailure) {
      return {
        kind: 'failed',
        stage: 'apply',
        failedChange: change,
        appliedChanges,
        cause: applyFailure,
      };
    }
    if (cleanupFailure) {
      return {
        kind: 'failed',
        stage: 'cleanup',
        failedChange: change,
        appliedChanges,
        cause: cleanupFailure,
      };
    }
  }
  return { kind: 'applied' };
}
