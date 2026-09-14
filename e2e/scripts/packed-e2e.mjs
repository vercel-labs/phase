import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const e2eRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(e2eRoot, '..');
const runtimePackages = [
  {
    name: '@usephase/core',
    workspacePath: 'packages/core',
    tarballName: 'core.tgz',
  },
  {
    name: '@usephase/react',
    workspacePath: 'packages/react',
    tarballName: 'react.tgz',
  },
];

/**
 * Run the production browser suite against locally packed runtime packages.
 *
 * Each invocation creates a temporary pnpm workspace, installs
 * `@usephase/core` and `@usephase/react` from tarballs, verifies that the
 * consumer cannot resolve repository source or a second core instance, builds
 * the Next.js harness, and runs Playwright against that build.
 *
 * @param {object} [options]
 * @param {boolean} [options.keepTemporaryRoot=false] Keep the temporary
 * workspace after the run and print its location to stderr.
 * @param {string[]} [options.playwrightArguments=[]] Arguments forwarded to
 * `playwright test` after the test command.
 * @returns {Promise<void>} Resolves after every selected Playwright project
 * passes and the temporary workspace is removed or retained as requested.
 * @throws {Error} If packing, installation, package isolation, the production
 * build, or Playwright fails.
 */
export async function runPackedE2E({
  keepTemporaryRoot = false,
  playwrightArguments = [],
} = {}) {
  const temporaryRoot = await realpath(
    await mkdtemp(join(tmpdir(), 'phase-packed-harness-')),
  );
  const consumer = createPackedConsumer(temporaryRoot);

  try {
    await preparePackedConsumer(consumer);
    await runCommand(
      'pnpm',
      ['install', '--prefer-offline', '--frozen-lockfile=false'],
      { cwd: temporaryRoot },
    );
    await verifyPackedConsumer(consumer);
    await runCommand('pnpm', ['--dir', consumer.harnessRoot, 'build'], {
      cwd: temporaryRoot,
    });
    await runCommand(
      'pnpm',
      ['--dir', e2eRoot, 'exec', 'playwright', 'test', ...playwrightArguments],
      {
        cwd: repositoryRoot,
        environment: { PHASE_HARNESS_ROOT: consumer.harnessRoot },
      },
    );
  } finally {
    if (keepTemporaryRoot) {
      process.stderr.write(`Kept packed harness at ${temporaryRoot}\n`);
    } else {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
}

function createPackedConsumer(temporaryRoot) {
  return {
    temporaryRoot,
    artifactsRoot: join(temporaryRoot, 'artifacts'),
    harnessRoot: join(temporaryRoot, 'apps/harness'),
    examplesRoot: join(temporaryRoot, 'packages/examples'),
  };
}

async function preparePackedConsumer(consumer) {
  await mkdir(consumer.artifactsRoot, { recursive: true });
  await packRuntimePackages(consumer);
  await copyGitVisibleWorkspace('apps/harness', consumer.temporaryRoot);
  await copyGitVisibleWorkspace('packages/examples', consumer.temporaryRoot);
  await cp(
    join(repositoryRoot, 'tsconfig.base.json'),
    join(consumer.temporaryRoot, 'tsconfig.base.json'),
  );
  await writeTemporaryWorkspace(consumer);
  await pointExamplesAtTarballs(consumer);
}

async function packRuntimePackages(consumer) {
  for (const runtimePackage of runtimePackages) {
    // Finish each child before starting another so cleanup cannot race a pack.
    // eslint-disable-next-line no-await-in-loop
    await runCommand('pnpm', [
      '--dir',
      join(repositoryRoot, runtimePackage.workspacePath),
      'pack',
      '--out',
      join(consumer.artifactsRoot, runtimePackage.tarballName),
    ]);
  }
}

async function copyGitVisibleWorkspace(workspacePath, temporaryRoot) {
  const files = execFileSync(
    'git',
    [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      workspacePath,
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )
    .split('\0')
    .filter((file) => file !== '' && existsSync(join(repositoryRoot, file)));
  if (files.length === 0) {
    throw new Error(`${workspacePath} has no Git-visible files to copy`);
  }

  await Promise.all(
    files.map(async (file) => {
      const destination = join(temporaryRoot, file);
      await mkdir(dirname(destination), { recursive: true });
      await cp(join(repositoryRoot, file), destination);
    }),
  );
}

async function writeTemporaryWorkspace(consumer) {
  const repositoryManifest = JSON.parse(
    await readFile(join(repositoryRoot, 'package.json'), 'utf8'),
  );
  const overrides = runtimePackages
    .map(
      ({ name, tarballName }) =>
        `  '${name}': 'file:./artifacts/${tarballName}'`,
    )
    .join('\n');

  await writeFile(
    join(consumer.temporaryRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: '@usephase/packed-harness',
        private: true,
        packageManager: repositoryManifest.packageManager,
        engines: repositoryManifest.engines,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(consumer.temporaryRoot, 'pnpm-workspace.yaml'),
    `packages:
  - 'apps/*'
  - 'packages/*'
overrides:
${overrides}
`,
  );
}

async function pointExamplesAtTarballs(consumer) {
  const manifestPath = join(consumer.examplesRoot, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  for (const { name, tarballName } of runtimePackages) {
    manifest.dependencies[name] = `file:../../artifacts/${tarballName}`;
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function verifyPackedConsumer(consumer) {
  const corePackageRoot = await verifyPackedRuntime('@usephase/core', consumer);
  const reactPackageRoot = await verifyPackedRuntime(
    '@usephase/react',
    consumer,
  );
  const reactCorePackageRoot = await resolvePackedRuntime(
    '@usephase/core',
    reactPackageRoot,
    consumer.temporaryRoot,
  );
  if (reactCorePackageRoot !== corePackageRoot) {
    throw new Error(
      '@usephase/react resolved a different @usephase/core package instance',
    );
  }

  process.stdout.write(
    `@usephase/react resolved @usephase/core to ${reactCorePackageRoot}\n`,
  );
}

async function verifyPackedRuntime(packageName, consumer) {
  const packageRoot = await resolvePackedRuntime(
    packageName,
    consumer.examplesRoot,
    consumer.temporaryRoot,
  );

  try {
    await access(join(packageRoot, 'src'));
    throw new Error(`${packageName} packed install unexpectedly contains src`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  process.stdout.write(`${packageName} resolved to ${packageRoot}\n`);
  return packageRoot;
}

async function resolvePackedRuntime(packageName, consumerRoot, temporaryRoot) {
  const requireFromConsumer = createRequire(join(consumerRoot, 'package.json'));
  let resolvedEntry;
  try {
    resolvedEntry = requireFromConsumer.resolve(packageName);
  } catch (cause) {
    throw new Error(
      `${packageName} is not resolvable from ${relative(temporaryRoot, consumerRoot)}`,
      { cause },
    );
  }
  const entryPath = await realpath(resolvedEntry);
  const packageRoot = findPackageRoot(entryPath, packageName);

  assertInsideTemporaryRoot(`${packageName} entry`, entryPath, temporaryRoot);
  assertInsideTemporaryRoot(
    `${packageName} package`,
    packageRoot,
    temporaryRoot,
  );
  return packageRoot;
}

function findPackageRoot(entryPath, packageName) {
  let current = dirname(entryPath);
  while (current !== dirname(current)) {
    try {
      const manifest = JSON.parse(
        readFileSync(join(current, 'package.json'), 'utf8'),
      );
      if (manifest.name === packageName) return current;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    current = dirname(current);
  }
  throw new Error(`Could not find the installed ${packageName} package root`);
}

function assertInsideTemporaryRoot(label, path, temporaryRoot) {
  const pathFromRoot = relative(temporaryRoot, path);
  if (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error(`${label} resolved outside the packed consumer: ${path}`);
  }
}

async function runCommand(
  command,
  arguments_,
  { cwd = repositoryRoot, environment } = {},
) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      cwd,
      env: { ...process.env, ...environment },
      stdio: 'inherit',
    });
    child.on('error', rejectPromise);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(
          `${command} ${arguments_.join(' ')} failed with ${signal ?? `exit code ${code}`}`,
        ),
      );
    });
  });
}
