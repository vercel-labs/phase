#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';

import jscodeshift, { type API } from 'jscodeshift';

import transform from './rename-imports.js';

const SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
]);
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules']);
const HELP = `Usage: usephase-codemod rename-imports [--dry] <path>

Rename phase runtime imports and package.json dependencies.

Options:
  --dry       Report changes without writing files
  -h, --help  Show this help
`;

type Change = {
  content: string;
  file: string;
  displayPath: string;
};

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function collectFiles(path: string, files: string[]): void {
  const entry = statSync(path);
  if (entry.isFile()) {
    if (
      path.endsWith(`${sep}package.json`) ||
      SOURCE_EXTENSIONS.has(extname(path))
    ) {
      files.push(path);
    }
    return;
  }
  if (!entry.isDirectory()) return;

  for (const child of readdirSync(path, { withFileTypes: true })) {
    if (child.isDirectory() && IGNORED_DIRECTORIES.has(child.name)) continue;
    if (!child.isDirectory() && !child.isFile()) continue;
    collectFiles(resolve(path, child.name), files);
  }
}

function displayPath(cwd: string, file: string): string {
  const path = relative(cwd, file);
  return (path.startsWith('..') ? file : path).split(sep).join('/');
}

function printSummary(changes: Change[], dry: boolean): void {
  if (changes.length === 0) {
    console.log(`${dry ? 'Would change' : 'Changed'} 0 files`);
    return;
  }

  const fileLabel = changes.length === 1 ? 'file' : 'files';
  console.log(
    `${dry ? 'Would change' : 'Changed'} ${changes.length} ${fileLabel}:`,
  );
  for (const change of changes) console.log(change.displayPath);
}

function main(args: string[]): number {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return 0;
  }

  const [command, ...commandArgs] = args;
  if (command !== 'rename-imports') {
    console.error(`Unknown command: ${command ?? ''}\n\n${HELP}`);
    return 2;
  }

  const dry = commandArgs.includes('--dry');
  const unknownOptions = commandArgs.filter(
    (argument) => argument.startsWith('-') && argument !== '--dry',
  );
  const targets = commandArgs.filter((argument) => !argument.startsWith('-'));
  if (unknownOptions.length > 0) {
    const label = unknownOptions.length === 1 ? 'option' : 'options';
    console.error(`Unknown ${label}: ${unknownOptions.join(', ')}\n\n${HELP}`);
    return 2;
  }
  const [target] = targets;
  if (targets.length !== 1 || !target) {
    console.error(
      `${targets.length === 0 ? 'Missing path' : 'Expected exactly one path'}\n\n${HELP}`,
    );
    return 2;
  }

  try {
    const cwd = process.cwd();
    const files: string[] = [];
    collectFiles(resolve(cwd, target), files);
    files.sort(comparePaths);

    const api = {
      j: jscodeshift,
      jscodeshift,
      report: () => undefined,
      stats: () => undefined,
    } satisfies API;
    const changes: Change[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      let content: string | undefined;
      try {
        content = transform({ path: file, source }, api, {});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${displayPath(cwd, file)}: ${message}`, {
          cause: error,
        });
      }
      if (content === undefined || content === source) continue;
      changes.push({ content, file, displayPath: displayPath(cwd, file) });
    }
    changes.sort((left, right) =>
      comparePaths(left.displayPath, right.displayPath),
    );

    if (!dry) {
      for (const change of changes) writeFileSync(change.file, change.content);
    }
    printSummary(changes, dry);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
