import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

import {
  type RuntimeDependency,
  transformPhaseToUsephaseFile,
} from './transform.js';

const SUPPORTED_SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
]);
const UNMIGRATED_SOURCE_CONTAINER_EXTENSIONS = new Set([
  '.astro',
  '.svelte',
  '.vue',
]);
const EXCLUDED_DIRECTORY_NAMES = new Set([
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

export type ParentDirectoryIdentity = Readonly<{
  device: number;
  inode: number;
  realPath: string;
}>;

export type PlannedFileChange = Readonly<{
  after: string;
  before: string;
  displayPath: string;
  filePath: string;
  parentDirectoryIdentity: ParentDirectoryIdentity;
}>;

export type PhaseToUsephasePlan = Readonly<{
  changes: readonly PlannedFileChange[];
}>;

type MigrationInputs = {
  files: string[];
  unmigratedSourceContainers: string[];
};

type FileMigrationOptions = {
  preserveLegacyDependency?: boolean;
  requiredDependencies?: readonly RuntimeDependency[];
};

type UnresolvedSpecifier = {
  filePath: string;
  specifier: string;
};

/** Indicates that the explicit CLI target cannot be migrated. */
export class InvalidTargetError extends Error {}

/** Compares strings by code unit so plan and diagnostic order is locale-independent. */
function compareStringsByCodeUnit(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function displayPath(cwd: string, filePath: string): string {
  const path = relative(cwd, filePath);
  if (path === '') return '.';
  const outside = path === '..' || path.startsWith(`..${sep}`);
  return (outside ? filePath : path).split(sep).join('/');
}

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

function readTargetEntry(cwd: string, path: string, isExplicitTarget: boolean) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === 'ENOENT' &&
      isExplicitTarget
    ) {
      throw new InvalidTargetError(
        `Target does not exist: ${displayPath(cwd, path)}`,
        { cause: error },
      );
    }
    throw error;
  }
}

function visitMigrationTarget(
  cwd: string,
  path: string,
  inputs: MigrationInputs,
  isExplicitTarget = false,
): void {
  const entry = readTargetEntry(cwd, path, isExplicitTarget);
  if (entry.isSymbolicLink()) {
    if (isExplicitTarget) {
      throw new InvalidTargetError(
        `Symlink targets are not supported: ${displayPath(cwd, path)}`,
      );
    }
    return;
  }
  if (entry.isFile()) {
    if (
      path.endsWith(`${sep}package.json`) ||
      SUPPORTED_SOURCE_EXTENSIONS.has(extname(path))
    ) {
      inputs.files.push(path);
    } else if (
      UNMIGRATED_SOURCE_CONTAINER_EXTENSIONS.has(extname(path)) &&
      !isExplicitTarget
    ) {
      inputs.unmigratedSourceContainers.push(path);
    } else if (isExplicitTarget) {
      throw new InvalidTargetError(
        `Unsupported target file: ${displayPath(cwd, path)}`,
      );
    }
    return;
  }
  if (!entry.isDirectory()) {
    if (isExplicitTarget) {
      throw new InvalidTargetError(
        `Unsupported target type: ${displayPath(cwd, path)}`,
      );
    }
    return;
  }
  if (isExplicitTarget && EXCLUDED_DIRECTORY_NAMES.has(basename(path))) {
    throw new InvalidTargetError(
      `Excluded directory targets are not supported: ${displayPath(cwd, path)}`,
    );
  }

  for (const child of readdirSync(path, { withFileTypes: true })) {
    if (child.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(child.name)) {
      continue;
    }
    if (child.isSymbolicLink()) continue;
    if (!child.isDirectory() && !child.isFile()) continue;
    visitMigrationTarget(cwd, resolve(path, child.name), inputs);
  }
}

function assertNoSymlinkedTargetParents(cwd: string, target: string): void {
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
      throw new InvalidTargetError(
        `Symlink targets are not supported: ${displayPath(cwd, current)}`,
      );
    }
  }
}

/**
 * Validates the direct target and discovers migration inputs without following
 * symlinks or excluded directories. Unsupported source containers are tracked
 * separately so package planning can retain the legacy dependency.
 */
function discoverMigrationInputs(cwd: string, target: string): MigrationInputs {
  const inputs: MigrationInputs = { files: [], unmigratedSourceContainers: [] };
  const targetPath = resolve(cwd, target);
  assertNoSymlinkedTargetParents(cwd, targetPath);
  visitMigrationTarget(cwd, targetPath, inputs, true);
  inputs.files.sort(compareStringsByCodeUnit);
  inputs.unmigratedSourceContainers.sort(compareStringsByCodeUnit);
  return inputs;
}

/**
 * Finds the nearest non-symlink package manifest. The result may be an ancestor
 * outside the explicitly targeted subtree.
 */
function findNearestPackageJson(
  filePath: string,
  knownPackageFiles: ReadonlySet<string>,
) {
  let directory = dirname(filePath);
  while (true) {
    const candidate = join(directory, 'package.json');
    if (knownPackageFiles.has(candidate)) return candidate;
    try {
      const entry = lstatSync(candidate);
      if (entry.isFile() && !entry.isSymbolicLink()) return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function readAndTransformFile(
  cwd: string,
  filePath: string,
  options: FileMigrationOptions = {},
) {
  try {
    const source = readFileSync(filePath, 'utf8');
    return {
      source,
      ...transformPhaseToUsephaseFile({ path: filePath, source, ...options }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${displayPath(cwd, filePath)}: ${message}`, {
      cause: error,
    });
  }
}

function createPlannedChange(
  cwd: string,
  filePath: string,
  migration: { content: string; source: string },
): PlannedFileChange | undefined {
  if (migration.content === migration.source) return undefined;
  return {
    after: migration.content,
    before: migration.source,
    displayPath: displayPath(cwd, filePath),
    filePath,
    parentDirectoryIdentity: readParentDirectoryIdentity(filePath),
  };
}

function assertNoUnresolvedSpecifiers(
  cwd: string,
  unresolved: readonly UnresolvedSpecifier[],
): void {
  if (unresolved.length === 0) return;
  const details = unresolved
    .toSorted((left, right) =>
      compareStringsByCodeUnit(
        `${displayPath(cwd, left.filePath)}:${left.specifier}`,
        `${displayPath(cwd, right.filePath)}:${right.specifier}`,
      ),
    )
    .map(
      ({ filePath, specifier }) =>
        `Unsupported legacy specifier "${specifier}" in ${displayPath(cwd, filePath)}`,
    );
  throw new Error(details.join('\n'));
}

/**
 * Discovers and transforms every selected input without writing files.
 *
 * Resolves target against cwd. A returned plan means target validation, source
 * parsing, package association, unresolved-specifier checks, and manifest
 * migration all completed.
 *
 * @throws {InvalidTargetError} When the explicit target is invalid.
 * @throws {Error} When discovery, reading, parsing, or migration fails.
 */
export function planPhaseToUsephase({
  cwd,
  target,
}: {
  cwd: string;
  target: string;
}): PhaseToUsephasePlan {
  const inputs = discoverMigrationInputs(cwd, target);
  const targetedPackageFiles = new Set(
    inputs.files.filter((filePath) => basename(filePath) === 'package.json'),
  );
  const packageFiles = new Set(targetedPackageFiles);
  const dependenciesByPackage = new Map<string, Set<RuntimeDependency>>();
  const packagesWithUnmigratedContainers = new Set<string>();
  const unresolved: UnresolvedSpecifier[] = [];
  const changes: PlannedFileChange[] = [];

  for (const filePath of inputs.unmigratedSourceContainers) {
    const packageFile = findNearestPackageJson(filePath, packageFiles);
    if (packageFile) {
      packageFiles.add(packageFile);
      packagesWithUnmigratedContainers.add(packageFile);
    }
  }

  for (const filePath of inputs.files) {
    if (packageFiles.has(filePath)) continue;
    const migration = readAndTransformFile(cwd, filePath);
    const packageFile = findNearestPackageJson(filePath, packageFiles);
    if (packageFile) {
      packageFiles.add(packageFile);
      const dependencies = dependenciesByPackage.get(packageFile) ?? new Set();
      for (const dependency of migration.requiredDependencies) {
        dependencies.add(dependency);
      }
      dependenciesByPackage.set(packageFile, dependencies);
    }
    for (const specifier of migration.unresolvedSpecifiers) {
      unresolved.push({ filePath, specifier });
    }
    const change = createPlannedChange(cwd, filePath, migration);
    if (change) changes.push(change);
  }

  assertNoUnresolvedSpecifiers(cwd, unresolved);

  for (const filePath of packageFiles) {
    const migration = readAndTransformFile(cwd, filePath, {
      preserveLegacyDependency:
        !targetedPackageFiles.has(filePath) ||
        packagesWithUnmigratedContainers.has(filePath),
      requiredDependencies: [...(dependenciesByPackage.get(filePath) ?? [])],
    });
    const change = createPlannedChange(cwd, filePath, migration);
    if (change) changes.push(change);
  }

  return {
    changes: changes.toSorted((left, right) =>
      compareStringsByCodeUnit(left.displayPath, right.displayPath),
    ),
  };
}
