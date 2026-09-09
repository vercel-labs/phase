import { spawnSync } from 'node:child_process';

import { readPublishablePackages } from './publishable-packages.mjs';

const NPM_REGISTRY_ARGUMENTS = [
  '--registry=https://registry.npmjs.org',
  '--@usephase:registry=https://registry.npmjs.org',
];
const pending = [];
const requestedDirectory = process.argv[2];
const declared = readPublishablePackages();
const candidates = requestedDirectory
  ? declared.filter(({ directory }) => directory === requestedDirectory)
  : declared;

if (candidates.length === 0) {
  throw new Error(
    `Package is not declared for publishing: ${requestedDirectory}`,
  );
}

for (const { directory, manifest } of candidates) {
  const result = spawnSync(
    'npm',
    ['view', manifest.name, 'versions', '--json', ...NPM_REGISTRY_ARGUMENTS],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    const stderr = result.stderr ?? '';
    if (stderr.includes('E404')) {
      pending.push(directory);
      console.error(
        `::notice::Unpublished package version detected: ${manifest.name}@${manifest.version}`,
      );
      continue;
    }
    const detail = stderr.trim() || result.error?.message || 'unknown error';
    throw new Error(
      `Failed to check published versions for ${manifest.name}: ${detail}`,
    );
  }

  const published = JSON.parse(result.stdout);
  const versions = Array.isArray(published) ? published : [published];
  if (versions.includes(manifest.version)) {
    console.error(
      `::notice::${manifest.name}@${manifest.version} already exists`,
    );
    continue;
  }

  pending.push(directory);
  console.error(
    `::notice::Unpublished package version detected: ${manifest.name}@${manifest.version}`,
  );
}

if (requestedDirectory) {
  console.log(`package_name=${candidates[0].manifest.name}`);
  console.log(`package_version=${candidates[0].manifest.version}`);
}
console.log(`packages=${JSON.stringify(pending)}`);
console.log(`has_packages=${pending.length > 0}`);
