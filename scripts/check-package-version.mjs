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

const changedFiles = execFileSync(
  'git',
  ['diff', '--name-status', '--find-renames', base, '--'],
  { encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, ...paths] = line.split('\t');
    return { status, file: paths.at(-1) };
  });

// Tests and mocks never ship: the build bundles only the three barrel entry
// points, and the published files are dist/LICENSE/README.md. A spec-only
// change must not demand a version bump for an identical package.
const TEST_ONLY = /\.spec\.|\.test\.|__tests__\/|__mocks__\//;

const packageSourceChanged = changedFiles.some(({ status, file }) => {
  if (!file || status === 'R100') return false;
  if (
    workspaceMigration &&
    status === 'A' &&
    file === 'packages/phase/tsconfig.json'
  ) {
    return false;
  }
  return (
    (file.startsWith('packages/phase/src/') && !TEST_ONLY.test(file)) ||
    file === 'packages/phase/tsconfig.json' ||
    file === 'packages/phase/tsdown.config.ts'
  );
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
