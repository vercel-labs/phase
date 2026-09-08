import { execFileSync, spawnSync } from 'node:child_process';
import { posix } from 'node:path';

import { readPublishablePackages } from './publishable-packages.mjs';
import {
  compareSemanticVersions,
  isSemanticVersion,
} from './semantic-version.mjs';

const base = process.argv[2];

if (!base) {
  throw new Error('Usage: node scripts/check-package-version.mjs <base-ref>');
}

execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], {
  stdio: 'ignore',
});

const diffTokens = execFileSync(
  'git',
  ['diff', '--name-status', '-z', '--find-renames', base, '--'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const changedFiles = [];
for (let index = 0; index < diffTokens.length; ) {
  const status = diffTokens[index++];
  const renamed = status?.startsWith('R') || status?.startsWith('C');
  const source = renamed ? diffTokens[index++] : undefined;
  const file = diffTokens[index++];
  changedFiles.push({ status, source, file });
}

const TEST_ONLY = /\.spec\.|\.test\.|__tests__\/|__mocks__\//;
const publishedManifestFields = [
  'description',
  'author',
  'license',
  'repository',
  'publishConfig',
  'bin',
  'type',
  'sideEffects',
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'bundledDependencies',
  'files',
  'exports',
  'engines',
];
const publishedScriptFields = [
  'prebuild',
  'build',
  'postbuild',
  'prepublish',
  'prepublishOnly',
  'prepack',
  'prepare',
  'postpack',
  'preinstall',
  'install',
  'postinstall',
  'publish',
  'postpublish',
];

function readBaseFile(path) {
  const exists =
    spawnSync('git', ['cat-file', '-e', `${base}:${path}`]).status === 0;
  if (!exists) return;
  return execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8' });
}

function isPackageBuildInput(path, directory) {
  return (
    path === 'tsconfig.base.json' ||
    path === `${directory}/tsconfig.json` ||
    path === `${directory}/tsdown.config.ts` ||
    (path?.startsWith(`${directory}/src/`) && !TEST_ONLY.test(path))
  );
}

const errors = [];
const baseDeclaration = readBaseFile('scripts/publishable-packages.json');
const basePackages = baseDeclaration
  ? JSON.parse(baseDeclaration).map((directory) => {
      const manifest = readBaseFile(`${directory}/package.json`);
      if (!manifest) {
        throw new Error(
          `Declared package ${directory} has no manifest at ${base}`,
        );
      }
      return { directory, manifest: JSON.parse(manifest) };
    })
  : [];

for (const {
  directory,
  manifest: currentPackage,
} of readPublishablePackages()) {
  const manifestPath = `${directory}/package.json`;
  const directBaseManifest = readBaseFile(manifestPath);
  let basePackageEntry;
  if (directBaseManifest) {
    const manifest = JSON.parse(directBaseManifest);
    if (manifest.name === currentPackage.name) {
      basePackageEntry = { directory, manifest };
    }
  }
  basePackageEntry ??= basePackages.find(
    ({ manifest }) => manifest.name === currentPackage.name,
  );
  if (!basePackageEntry) {
    const manifestRename = changedFiles.find(
      ({ source, file }) =>
        file === manifestPath && source?.endsWith('/package.json'),
    );
    if (manifestRename?.source) {
      const manifest = JSON.parse(
        readBaseFile(manifestRename.source) ?? 'null',
      );
      if (manifest?.name === currentPackage.name) {
        basePackageEntry = {
          directory: posix.dirname(manifestRename.source),
          manifest,
        };
      }
    }
  }
  if (!basePackageEntry) {
    console.log(
      `Package release requested for ${currentPackage.name}: new package at ${currentPackage.version}.`,
    );
    continue;
  }

  const { directory: baseDirectory, manifest: basePackage } = basePackageEntry;
  const baseManifestPath = `${baseDirectory}/package.json`;
  const packageSourceChanged = changedFiles.some(({ status, source, file }) => {
    const unchangedMove =
      baseDirectory !== directory &&
      status === 'R100' &&
      source?.startsWith(`${baseDirectory}/`) &&
      file?.startsWith(`${directory}/`) &&
      source.slice(baseDirectory.length) === file.slice(directory.length);
    if (unchangedMove) return false;

    return [source, file].some(
      (path) =>
        isPackageBuildInput(path, directory) ||
        isPackageBuildInput(path, baseDirectory),
    );
  });
  const publishedManifestChanged = publishedManifestFields.some(
    (field) =>
      JSON.stringify(currentPackage[field]) !==
      JSON.stringify(basePackage[field]),
  );
  const publishedScriptChanged = publishedScriptFields.some(
    (field) => currentPackage.scripts?.[field] !== basePackage.scripts?.[field],
  );
  const versionChanged = currentPackage.version !== basePackage.version;

  if (
    !packageSourceChanged &&
    !publishedManifestChanged &&
    !publishedScriptChanged &&
    !versionChanged
  ) {
    console.log(`No package release required for ${currentPackage.name}.`);
    continue;
  }
  if (!versionChanged) {
    errors.push(
      `Package contents changed without a version bump for ${currentPackage.name} ` +
        `(still ${currentPackage.version}). Bump ${manifestPath} and update the package changelog specified in AGENTS.md before merging.`,
    );
    continue;
  }
  if (!isSemanticVersion(basePackage.version)) {
    errors.push(
      `Package version for ${currentPackage.name} at ${base}:${baseManifestPath} is not a valid semantic version: ${String(basePackage.version)}.`,
    );
    continue;
  }
  if (
    compareSemanticVersions(currentPackage.version, basePackage.version) <= 0
  ) {
    errors.push(
      `Package version must increase for ${currentPackage.name}: ${basePackage.version} -> ${currentPackage.version}.`,
    );
    continue;
  }

  console.log(
    `Package release requested for ${currentPackage.name}: ${basePackage.version} -> ${currentPackage.version}.`,
  );
}

if (errors.length > 0) {
  throw new Error(errors.join('\n'));
}
