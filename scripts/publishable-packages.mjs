import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { isSemanticVersion } from './semantic-version.mjs';

const NPM_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

/**
 * Reads package manifests in the order listed in scripts/publishable-packages.json.
 * Throws when the file is not a non-empty JSON array, an entry is not a valid
 * package directory, a directory or npm name is repeated, or a manifest is
 * missing, private, or has an invalid npm name or semantic version.
 */
export function readPublishablePackages(root = process.cwd()) {
  const declared = JSON.parse(
    readFileSync(resolve(root, 'scripts/publishable-packages.json'), 'utf8'),
  );
  if (!Array.isArray(declared) || declared.length === 0) {
    throw new Error('Publishable packages must be a non-empty array');
  }

  const seen = new Set();
  const packageNames = new Set();

  return declared.map((directory) => {
    if (
      typeof directory !== 'string' ||
      !/^packages\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(directory)
    ) {
      throw new Error(
        `Declared package directory must match packages/<name>: ${String(directory)}`,
      );
    }
    if (seen.has(directory)) {
      throw new Error(
        `Declared package directory is listed more than once: ${directory}`,
      );
    }
    seen.add(directory);

    let manifest;
    try {
      manifest = JSON.parse(
        readFileSync(resolve(root, directory, 'package.json'), 'utf8'),
      );
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(`Declared package ${directory} does not exist`, {
          cause: error,
        });
      }
      throw error;
    }
    if (manifest.private === true) {
      throw new Error(`Declared package ${directory} must not be private`);
    }
    const publishRegistry = manifest.publishConfig?.registry;
    if (
      publishRegistry !== undefined &&
      publishRegistry !== 'https://registry.npmjs.org' &&
      publishRegistry !== 'https://registry.npmjs.org/'
    ) {
      throw new Error(
        `Declared package ${directory} must publish to https://registry.npmjs.org`,
      );
    }
    if (
      typeof manifest.name !== 'string' ||
      manifest.name.length > 214 ||
      !NPM_PACKAGE_NAME.test(manifest.name) ||
      !isSemanticVersion(manifest.version)
    ) {
      throw new Error(
        `Declared package ${directory} must have a valid npm name and semantic version`,
      );
    }
    if (packageNames.has(manifest.name)) {
      throw new Error(
        `Declared npm package name is duplicated: ${manifest.name}`,
      );
    }
    packageNames.add(manifest.name);
    return { directory, manifest };
  });
}
