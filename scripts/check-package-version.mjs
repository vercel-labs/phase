import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = process.argv[2];

if (!base) {
  throw new Error('Usage: node scripts/check-package-version.mjs <base-ref>');
}

const currentPackage = JSON.parse(
  readFileSync('packages/phase/package.json', 'utf8'),
);

let basePackagePath = 'packages/phase/package.json';
try {
  execFileSync('git', ['cat-file', '-e', `${base}:${basePackagePath}`], {
    stdio: 'ignore',
  });
} catch {
  basePackagePath = 'package.json';
}
const workspaceMigration = basePackagePath === 'package.json';
const basePackage = JSON.parse(
  execFileSync('git', ['show', `${base}:${basePackagePath}`], {
    encoding: 'utf8',
  }),
);

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

// Tests and mocks never ship: the build bundles only the three barrel entry
// points, and the published files are dist/LICENSE/README.md. A spec-only
// change must not demand a version bump for an identical package.
const TEST_ONLY = /\.spec\.|\.test\.|__tests__\/|__mocks__\//;
const isPackageBuildInput = (path) =>
  path &&
  (((path.startsWith('packages/phase/src/') ||
    (workspaceMigration && path.startsWith('src/'))) &&
    !TEST_ONLY.test(path)) ||
    path === 'packages/phase/tsconfig.json' ||
    path === 'packages/phase/tsdown.config.ts' ||
    path === 'tsconfig.base.json' ||
    (workspaceMigration && path === 'tsdown.config.ts'));

const packageSourceChanged = changedFiles.some(({ status, source, file }) => {
  if (!file) return false;
  if (
    workspaceMigration &&
    status === 'R100' &&
    ((source?.startsWith('src/') && file === `packages/phase/${source}`) ||
      (source === 'tsdown.config.ts' &&
        file === 'packages/phase/tsdown.config.ts'))
  ) {
    return false;
  }
  if (
    workspaceMigration &&
    status === 'A' &&
    (file === 'packages/phase/tsconfig.json' || file === 'tsconfig.base.json')
  ) {
    return false;
  }
  return [source, file].some(isPackageBuildInput);
});

const publishedManifestFields = [
  'name',
  'description',
  'author',
  'license',
  'repository',
  'publishConfig',
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

const publishedManifestChanged = publishedManifestFields.some(
  (field) =>
    JSON.stringify(currentPackage[field]) !==
    JSON.stringify(basePackage[field]),
);

if (!packageSourceChanged && !publishedManifestChanged) {
  console.log('No package release required.');
} else if (currentPackage.version === basePackage.version) {
  throw new Error(
    `Package contents changed without a version bump (still ${currentPackage.version}). ` +
      'Bump packages/phase/package.json and update CHANGELOG.md before merging this package release.',
  );
} else {
  console.log(
    `Package release requested: ${basePackage.version} -> ${currentPackage.version}.`,
  );
}
