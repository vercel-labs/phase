#!/usr/bin/env node

import codemods from '../codemods.json';
import {
  type ApplyPhaseToUsephaseResult,
  applyPhaseToUsephase,
} from './migrations/phase-to-usephase/apply.js';
import {
  InvalidTargetError,
  type PlannedFileChange,
  planPhaseToUsephase,
} from './migrations/phase-to-usephase/plan.js';

const COMMAND_NAME = codemods[0]?.name;
if (codemods.length !== 1 || !COMMAND_NAME) {
  throw new Error('codemods.json must declare the one implemented command');
}

const HELP = `Usage: usephase-codemod ${COMMAND_NAME} [--dry] <path>

Rename legacy phase module specifiers, dependencies, and package metadata.

Options:
  --dry       Report changes without writing files
  -h, --help  Show this help

Exit codes:
  0  Help printed or migration completed, including when no files changed
  1  Migration failed while reading, parsing, validating, or writing files
  2  Invocation or target is invalid
`;

type ExitCode = 0 | 1 | 2;

type ParsedInvocation =
  | { kind: 'help' }
  | { kind: 'migration'; isDryRun: boolean; target: string };

class InvalidInvocationError extends Error {}

function parseInvocation(args: readonly string[]): ParsedInvocation {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return { kind: 'help' };
  }

  const [command, ...commandArgs] = args;
  if (command !== COMMAND_NAME) {
    throw new InvalidInvocationError(`Unknown command: ${command ?? ''}`);
  }

  const isDryRun = commandArgs.includes('--dry');
  const unknownOptions = commandArgs.filter(
    (argument) => argument.startsWith('-') && argument !== '--dry',
  );
  if (unknownOptions.length > 0) {
    const label = unknownOptions.length === 1 ? 'option' : 'options';
    throw new InvalidInvocationError(
      `Unknown ${label}: ${unknownOptions.join(', ')}`,
    );
  }

  const targets = commandArgs.filter((argument) => !argument.startsWith('-'));
  const [target] = targets;
  if (targets.length !== 1 || !target) {
    throw new InvalidInvocationError(
      targets.length === 0 ? 'Missing path' : 'Expected exactly one path',
    );
  }
  return { kind: 'migration', isDryRun, target };
}

function printMigrationSummary(
  changes: readonly PlannedFileChange[],
  isDryRun: boolean,
): void {
  if (changes.length === 0) {
    console.log(`${isDryRun ? 'Would change' : 'Changed'} 0 files`);
    return;
  }
  const fileLabel = changes.length === 1 ? 'file' : 'files';
  console.log(
    `${isDryRun ? 'Would change' : 'Changed'} ${changes.length} ${fileLabel}:`,
  );
  for (const change of changes) console.log(change.displayPath);
}

function reportApplyFailure(
  result: Extract<ApplyPhaseToUsephaseResult, { kind: 'failed' }>,
): void {
  if (result.appliedChanges.length > 0) {
    const fileLabel = result.appliedChanges.length === 1 ? 'file' : 'files';
    console.log(
      `Changed ${result.appliedChanges.length} ${fileLabel} before failure:`,
    );
    for (const change of result.appliedChanges) console.log(change.displayPath);
  }

  const message =
    result.cause instanceof Error ? result.cause.message : String(result.cause);
  console.error(
    result.stage === 'cleanup'
      ? `Changed ${result.failedChange.displayPath}, but failed to remove its temporary directory: ${message}`
      : `Failed to apply change to ${result.failedChange.displayPath}: ${message}`,
  );
  console.error('Rerun the command to finish the idempotent migration.');
}

function main(args: readonly string[]): ExitCode {
  try {
    const invocation = parseInvocation(args);
    if (invocation.kind === 'help') {
      console.log(HELP);
      return 0;
    }

    const plan = planPhaseToUsephase({
      cwd: process.cwd(),
      target: invocation.target,
    });
    if (!invocation.isDryRun) {
      const result = applyPhaseToUsephase(plan);
      if (result.kind === 'failed') {
        reportApplyFailure(result);
        return 1;
      }
    }
    printMigrationSummary(plan.changes, invocation.isDryRun);
    return 0;
  } catch (error) {
    if (
      error instanceof InvalidInvocationError ||
      error instanceof InvalidTargetError
    ) {
      console.error(`${error.message}\n\n${HELP}`);
      return 2;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
