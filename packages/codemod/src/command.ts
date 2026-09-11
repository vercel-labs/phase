/**
 * Result rendered by the generic CLI. File paths retain report order;
 * successful paths were changed, or would change during a dry run.
 */
export type CodemodResult =
  | { kind: 'succeeded'; changedFiles: readonly string[] }
  | { kind: 'invalid-target'; message: string }
  | {
      kind: 'failed';
      message: string;
      appliedFiles: readonly string[];
      /** Requests retry guidance after the caller resolves the reported cause. */
      canRetry: boolean;
    };

/**
 * Owns one migration's planning and application behind the CLI seam. A dry run
 * does not write, and non-dry execution finishes planning before writing.
 */
export type CodemodCommand = {
  execute(input: {
    cwd: string;
    target: string;
    isDryRun: boolean;
  }): CodemodResult;
};
