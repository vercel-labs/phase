#!/usr/bin/env node

import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

import migratePhaseRuntime, {
  type RuntimeDependency,
} from './migrate-phase-runtime.js';

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
const SOURCE_CONTAINER_EXTENSIONS = new Set(['.astro', '.svelte', '.vue']);
const IGNORED_DIRECTORIES = new Set([
  '.cache',
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'storybook-static',
]);
const HELP = `Usage: usephase-codemod migrate-phase-runtime [--dry] <path>

Rename legacy phase module specifiers, dependencies, and package metadata.

Options:
  --dry       Report changes without writing files
  -h, --help  Show this help

Exit codes:
  0  Help printed or migration completed, including when no files changed
  1  Migration failed while reading, parsing, or writing files
  2  Invocation or target is invalid
`;

type Change = {
  content: string;
  directoryIdentity: DirectoryIdentity;
  file: string;
  displayPath: string;
  originalContent: string;
};

type DirectoryIdentity = {
  device: number;
  inode: number;
  path: string;
};

class InvocationError extends Error {}
class MigrationError extends Error {}

class CommitError extends Error {
  constructor(
    message: string,
    readonly completed: Change[],
    options: ErrorOptions,
  ) {
    super(message, options);
  }
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function directoryIdentity(file: string): DirectoryIdentity {
  const directory = dirname(file);
  const entry = lstatSync(directory);
  return {
    device: entry.dev,
    inode: entry.ino,
    path: realpathSync(directory),
  };
}

function sameDirectory(
  left: DirectoryIdentity,
  right: DirectoryIdentity,
): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.path === right.path
  );
}

function readTargetEntry(cwd: string, path: string, direct: boolean) {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && direct) {
      throw new InvocationError(
        `Target does not exist: ${displayPath(cwd, path)}`,
        { cause: error },
      );
    }
    throw error;
  }
}

function collectFiles(
  cwd: string,
  path: string,
  files: string[],
  sourceContainers: string[],
  direct = false,
): void {
  const entry = readTargetEntry(cwd, path, direct);
  if (entry.isSymbolicLink()) {
    if (direct) {
      throw new InvocationError(
        `Symlink targets are not supported: ${displayPath(cwd, path)}`,
      );
    }
    return;
  }
  if (entry.isFile()) {
    if (
      path.endsWith(`${sep}package.json`) ||
      SOURCE_EXTENSIONS.has(extname(path))
    ) {
      files.push(path);
    } else if (SOURCE_CONTAINER_EXTENSIONS.has(extname(path)) && !direct) {
      sourceContainers.push(path);
    } else if (direct) {
      throw new InvocationError(
        `Unsupported target file: ${displayPath(cwd, path)}`,
      );
    }
    return;
  }
  if (!entry.isDirectory()) {
    if (direct) {
      throw new InvocationError(
        `Unsupported target type: ${displayPath(cwd, path)}`,
      );
    }
    return;
  }
  if (direct && IGNORED_DIRECTORIES.has(basename(path))) {
    throw new InvocationError(
      `Generated directory targets are not supported: ${displayPath(cwd, path)}`,
    );
  }

  for (const child of readdirSync(path, { withFileTypes: true })) {
    if (child.isDirectory() && IGNORED_DIRECTORIES.has(child.name)) continue;
    if (child.isSymbolicLink()) continue;
    if (!child.isDirectory() && !child.isFile()) continue;
    collectFiles(cwd, resolve(path, child.name), files, sourceContainers);
  }
}

function displayPath(cwd: string, file: string): string {
  const path = relative(cwd, file);
  const outside = path === '..' || path.startsWith(`..${sep}`);
  return (outside ? file : path).split(sep).join('/');
}

function assertNoSymlinkComponents(cwd: string, target: string): void {
  const components = relative(cwd, target).split(sep).filter(Boolean);
  let current = cwd;
  for (const component of components.slice(0, -1)) {
    current = resolve(current, component);
    let entry;
    try {
      entry = lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (entry.isSymbolicLink()) {
      throw new InvocationError(
        `Symlink targets are not supported: ${displayPath(cwd, current)}`,
      );
    }
  }
}

function nearestPackageJson(file: string, packageFiles: Set<string>) {
  let directory = dirname(file);
  while (true) {
    const candidate = join(directory, 'package.json');
    if (packageFiles.has(candidate)) return candidate;
    try {
      const entry = lstatSync(candidate);
      if (entry.isFile() && !entry.isSymbolicLink()) {
        packageFiles.add(candidate);
        return candidate;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function migrateFile(
  cwd: string,
  file: string,
  requiredDependencies?: readonly RuntimeDependency[],
  preserveLegacyDependency = false,
) {
  try {
    const source = readFileSync(file, 'utf8');
    return {
      source,
      ...migratePhaseRuntime({
        path: file,
        source,
        preserveLegacyDependency,
        requiredDependencies,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${displayPath(cwd, file)}: ${message}`, { cause: error });
  }
}

function planChanges(
  cwd: string,
  files: string[],
  sourceContainers: string[],
): Change[] {
  const targetedPackageFiles = new Set(
    files.filter((file) => basename(file) === 'package.json'),
  );
  const packageFiles = new Set(targetedPackageFiles);
  const dependenciesByPackage = new Map<string, Set<RuntimeDependency>>();
  const packagesWithUnmigratedContainers = new Set<string>();
  const unresolved: Array<{ file: string; specifier: string }> = [];
  const changes: Change[] = [];

  for (const file of sourceContainers) {
    const packageFile = nearestPackageJson(file, packageFiles);
    if (packageFile) packagesWithUnmigratedContainers.add(packageFile);
  }

  for (const file of files) {
    if (packageFiles.has(file)) continue;
    const migration = migrateFile(cwd, file);
    const packageFile = nearestPackageJson(file, packageFiles);
    if (packageFile) {
      const dependencies = dependenciesByPackage.get(packageFile) ?? new Set();
      for (const dependency of migration.requiredDependencies) {
        dependencies.add(dependency);
      }
      dependenciesByPackage.set(packageFile, dependencies);
    }
    for (const specifier of migration.unresolvedSpecifiers) {
      unresolved.push({ file, specifier });
    }
    if (migration.content === migration.source) continue;
    changes.push({
      content: migration.content,
      directoryIdentity: directoryIdentity(file),
      file,
      displayPath: displayPath(cwd, file),
      originalContent: migration.source,
    });
  }

  if (unresolved.length > 0) {
    const details = unresolved
      .toSorted((left, right) =>
        comparePaths(
          `${displayPath(cwd, left.file)}:${left.specifier}`,
          `${displayPath(cwd, right.file)}:${right.specifier}`,
        ),
      )
      .map(
        ({ file, specifier }) =>
          `Unsupported legacy specifier "${specifier}" in ${displayPath(cwd, file)}`,
      );
    throw new MigrationError(details.join('\n'));
  }

  for (const file of packageFiles) {
    const migration = migrateFile(
      cwd,
      file,
      [...(dependenciesByPackage.get(file) ?? [])],
      !targetedPackageFiles.has(file) ||
        packagesWithUnmigratedContainers.has(file),
    );
    if (migration.content === migration.source) continue;
    changes.push({
      content: migration.content,
      directoryIdentity: directoryIdentity(file),
      file,
      displayPath: displayPath(cwd, file),
      originalContent: migration.source,
    });
  }
  return changes.toSorted((left, right) =>
    comparePaths(left.displayPath, right.displayPath),
  );
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

function commitChanges(changes: Change[]): void {
  const completed: Change[] = [];
  for (const change of changes) {
    let temporaryDirectory: string | undefined;
    let failure: unknown;
    let cleanupFailure: unknown;
    try {
      if (
        !sameDirectory(directoryIdentity(change.file), change.directoryIdentity)
      ) {
        throw new Error('parent directory changed after migration planning');
      }
      if (readFileSync(change.file, 'utf8') !== change.originalContent) {
        throw new Error('file changed after migration planning');
      }
      const mode = lstatSync(change.file).mode % 0o10000;
      temporaryDirectory = mkdtempSync(
        join(dirname(change.file), '.usephase-codemod-'),
      );
      const temporaryFile = join(temporaryDirectory, 'replacement');
      writeFileSync(temporaryFile, change.content, { flag: 'wx', mode });
      chmodSync(temporaryFile, mode);
      renameSync(temporaryFile, change.file);
      completed.push(change);
    } catch (error) {
      failure = error;
    } finally {
      if (temporaryDirectory) {
        try {
          rmdirSync(temporaryDirectory);
        } catch (error) {
          cleanupFailure = error;
        }
      }
    }
    if (failure) {
      const message =
        failure instanceof Error ? failure.message : String(failure);
      throw new CommitError(
        `Failed to write ${change.displayPath}: ${message}`,
        completed,
        {
          cause: failure,
        },
      );
    }
    if (cleanupFailure) {
      const message =
        cleanupFailure instanceof Error
          ? cleanupFailure.message
          : String(cleanupFailure);
      throw new CommitError(
        `Changed ${change.displayPath}, but failed to remove its temporary directory: ${message}`,
        completed,
        { cause: cleanupFailure },
      );
    }
  }
}

function printPartialCommit(error: CommitError): void {
  if (error.completed.length > 0) {
    const fileLabel = error.completed.length === 1 ? 'file' : 'files';
    console.log(
      `Changed ${error.completed.length} ${fileLabel} before failure:`,
    );
    for (const change of error.completed) console.log(change.displayPath);
  }
  console.error(error.message);
  console.error('Rerun the command to finish the idempotent migration.');
}

function main(args: string[]): number {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return 0;
  }

  const [command, ...commandArgs] = args;
  if (command !== 'migrate-phase-runtime') {
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
    const sourceContainers: string[] = [];
    const targetPath = resolve(cwd, target);
    assertNoSymlinkComponents(cwd, targetPath);
    collectFiles(cwd, targetPath, files, sourceContainers, true);
    files.sort(comparePaths);

    const changes = planChanges(cwd, files, sourceContainers);

    if (!dry) commitChanges(changes);
    printSummary(changes, dry);
    return 0;
  } catch (error) {
    if (error instanceof InvocationError) {
      console.error(`${error.message}\n\n${HELP}`);
      return 2;
    }
    if (error instanceof CommitError) {
      printPartialCommit(error);
      return 1;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
