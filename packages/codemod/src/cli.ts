#!/usr/bin/env node

import { Command, CommanderError } from 'commander';

import type { CodemodResult } from './command.js';
import { commands } from './commands.js';

type ExitCode = 0 | 1 | 2;

function printFileSummary(
  label: 'Changed' | 'Would change',
  files: readonly string[],
  suffix = '',
): void {
  if (files.length === 0) {
    console.log(`${label} 0 files`);
    return;
  }
  console.log(
    `${label} ${files.length} ${files.length === 1 ? 'file' : 'files'}${suffix}:`,
  );
  for (const file of files) console.log(file);
}

function reportResult(
  result: CodemodResult,
  isDryRun: boolean,
  command: Command,
): ExitCode {
  if (result.kind === 'succeeded') {
    printFileSummary(
      isDryRun ? 'Would change' : 'Changed',
      result.changedFiles,
    );
    return 0;
  }
  if (result.kind === 'invalid-target') {
    console.error(`${result.message}\n\n${command.helpInformation()}`);
    return 2;
  }
  if (result.appliedFiles.length > 0) {
    printFileSummary('Changed', result.appliedFiles, ' before failure');
  }
  console.error(result.message);
  if (result.canRetry) {
    console.error(
      'Resolve the reported error, then rerun the migration; files already changed will be skipped.',
    );
  }
  return 1;
}

function createProgram(setExitCode: (code: ExitCode) => void): Command {
  const program = new Command()
    .name('usephase-codemod')
    .description('Versioned migrations for phase packages.')
    .exitOverride()
    .showHelpAfterError();

  for (const command of commands) {
    program
      .command(command.name)
      .description(command.summary)
      .argument('<path>', 'File or directory to migrate')
      .option('--dry', 'Report changes without writing files')
      .action(
        (
          target: string,
          options: { dry?: boolean },
          commanderCommand: Command,
        ) => {
          const isDryRun = options.dry === true;
          setExitCode(
            reportResult(
              command.execute({ cwd: process.cwd(), target, isDryRun }),
              isDryRun,
              commanderCommand,
            ),
          );
        },
      );
  }
  return program;
}

function main(args: readonly string[]): ExitCode {
  let exitCode: ExitCode = 0;
  const program = createProgram((code) => {
    exitCode = code;
  });
  try {
    program.parse(args.length === 0 ? ['--help'] : args, { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode === 0 ? 0 : 2;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  return exitCode;
}

process.exitCode = main(process.argv.slice(2));
