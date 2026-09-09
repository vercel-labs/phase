import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(0, 'utf8'));
const expectedName = process.env.EXPECTED_PACKAGE_NAME;
const expectedVersion = process.env.EXPECTED_PACKAGE_VERSION;

if (manifest.name !== expectedName || manifest.version !== expectedVersion) {
  throw new Error(
    `Packed package name or version changed: expected ${expectedName}@${expectedVersion}, received ${manifest.name}@${manifest.version}`,
  );
}

console.log(
  `Packed package name and version verified: ${manifest.name}@${manifest.version}`,
);
