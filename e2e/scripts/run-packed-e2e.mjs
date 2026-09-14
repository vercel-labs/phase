import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
const temporaryRoot = await realpath(
  await mkdtemp(join(tmpdir(), 'phase-packed-harness-')),
);
const artifactsRoot = join(temporaryRoot, 'artifacts');
const harnessRoot = join(temporaryRoot, 'apps/harness');
const examplesRoot = join(temporaryRoot, 'packages/examples');
const coreTarball = join(artifactsRoot, 'core.tgz');
const reactTarball = join(artifactsRoot, 'react.tgz');
const keepTemporaryRoot = process.env.PHASE_E2E_KEEP_TEMP === '1';
const playwrightArguments = process.argv.slice(2);
if (playwrightArguments[0] === '--') playwrightArguments.shift();

try {
  await mkdir(artifactsRoot, { recursive: true });
  await run('pnpm', [
    '--dir',
    join(repositoryRoot, 'packages/core'),
    'pack',
    '--out',
    coreTarball,
  ]);
  await run('pnpm', [
    '--dir',
    join(repositoryRoot, 'packages/react'),
    'pack',
    '--out',
    reactTarball,
  ]);

  await copyGitVisiblePackage('apps/harness');
  await copyGitVisiblePackage('packages/examples');
  await cp(
    join(repositoryRoot, 'tsconfig.base.json'),
    join(temporaryRoot, 'tsconfig.base.json'),
  );
  await writeTemporaryWorkspace();
  await pointExamplesAtTarballs();

  await run(
    'pnpm',
    ['install', '--prefer-offline', '--frozen-lockfile=false'],
    temporaryRoot,
  );

  const corePackageRoot = await verifyPackedRuntime('@usephase/core');
  const reactPackageRoot = await verifyPackedRuntime('@usephase/react');
  const reactCorePackageRoot = await resolvePackedRuntime(
    '@usephase/core',
    reactPackageRoot,
  );
  if (reactCorePackageRoot !== corePackageRoot) {
    throw new Error(
      '@usephase/react resolved a different @usephase/core package instance',
    );
  }
  process.stdout.write(
    `@usephase/react resolved @usephase/core to ${reactCorePackageRoot}\n`,
  );

  await run('pnpm', ['--dir', harnessRoot, 'build'], temporaryRoot);
  await run(
    'pnpm',
    ['--dir', e2eRoot, 'exec', 'playwright', 'test', ...playwrightArguments],
    repositoryRoot,
    { PHASE_HARNESS_ROOT: harnessRoot },
  );
} finally {
  if (keepTemporaryRoot) {
    process.stderr.write(`Kept packed harness at ${temporaryRoot}\n`);
  } else {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function copyGitVisiblePackage(packagePath) {
  const files = execFileSync(
    'git',
    [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      packagePath,
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  if (files.length === 0) {
    throw new Error(`${packagePath} has no Git-visible files to copy`);
  }

  await Promise.all(
    files.map(async (file) => {
      const destination = join(temporaryRoot, file);
      await mkdir(dirname(destination), { recursive: true });
      await cp(join(repositoryRoot, file), destination);
    }),
  );
}

async function writeTemporaryWorkspace() {
  await writeFile(
    join(temporaryRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: '@usephase/packed-harness',
        private: true,
        packageManager: 'pnpm@10.32.1',
        engines: { node: '24.x' },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(temporaryRoot, 'pnpm-workspace.yaml'),
    `packages:
  - 'apps/*'
  - 'packages/*'
overrides:
  '@usephase/core': 'file:./artifacts/core.tgz'
  '@usephase/react': 'file:./artifacts/react.tgz'
`,
  );
}

async function pointExamplesAtTarballs() {
  const manifestPath = join(examplesRoot, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.dependencies['@usephase/core'] = 'file:../../artifacts/core.tgz';
  manifest.dependencies['@usephase/react'] = 'file:../../artifacts/react.tgz';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function verifyPackedRuntime(packageName) {
  const packageRoot = await resolvePackedRuntime(packageName, examplesRoot);

  try {
    await access(join(packageRoot, 'src'));
    throw new Error(`${packageName} packed install unexpectedly contains src`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  process.stdout.write(`${packageName} resolved to ${packageRoot}\n`);
  return packageRoot;
}

async function resolvePackedRuntime(packageName, consumerRoot) {
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

  assertInsideTemporaryRoot(`${packageName} entry`, entryPath);
  assertInsideTemporaryRoot(`${packageName} package`, packageRoot);
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

function assertInsideTemporaryRoot(label, path) {
  const pathFromRoot = relative(temporaryRoot, path);
  if (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error(`${label} resolved outside the packed consumer: ${path}`);
  }
}

async function run(
  command,
  arguments_,
  cwd = repositoryRoot,
  extraEnvironment,
) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      cwd,
      env: { ...process.env, ...extraEnvironment },
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
