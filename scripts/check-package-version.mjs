import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = process.argv[2];

if (!base) {
  throw new Error('Usage: node scripts/check-package-version.mjs <base-ref>');
}

const currentPackage = JSON.parse(readFileSync('package.json', 'utf8'));
const basePackage = JSON.parse(
  execFileSync('git', ['show', `${base}:package.json`], { encoding: 'utf8' }),
);
const changedFiles = execFileSync('git', ['diff', '--name-only', base, '--'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean);

const packageSourceChanged = changedFiles.some(
  (file) =>
    file.startsWith('src/') ||
    file === 'tsconfig.json' ||
    file === 'tsdown.config.ts',
);

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
      'Bump package.json and update CHANGELOG.md before merging this package release.',
  );
} else {
  console.log(
    `Package release requested: ${basePackage.version} -> ${currentPackage.version}.`,
  );
}
