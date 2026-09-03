#!/usr/bin/env node

/**
 * Verifies the installable skill tree contains only consumer files and that
 * the bundled scanner imports only Node built-ins.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { consumerArtifactImportErrors } from './distribution.mjs';

const packageRoot = resolve(import.meta.dirname, '..', '..');
const repoRoot = resolve(packageRoot, '..', '..');
const skillDir = join(repoRoot, 'skills', 'phase');
const scannerPath = join(skillDir, 'scripts', 'scan.mjs');

const allowedDirectories = new Set(['dist', 'references', 'scripts']);
const requiredFiles = new Set([
  'README.md',
  'SKILL.md',
  'dist/phase-skill.zip',
  'metadata.json',
  'scripts/scan.mjs',
]);

const seenFiles = new Set();
const errors = [];

for (const entry of readdirSync(skillDir, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    if (!allowedDirectories.has(entry.name)) {
      errors.push(`unexpected directory: ${entry.name}/`);
      continue;
    }
    checkDirectory(entry.name);
    continue;
  }

  if (!entry.isFile() || !requiredFiles.has(entry.name)) {
    errors.push(`unexpected entry: ${entry.name}`);
    continue;
  }
  seenFiles.add(entry.name);
}

for (const required of requiredFiles) {
  if (!seenFiles.has(required))
    errors.push(`missing required file: ${required}`);
}

const scanner = readFileSync(scannerPath, 'utf8');
errors.push(...consumerArtifactImportErrors(scanner, 'scan.mjs'));

if (errors.length > 0) {
  for (const error of errors) console.error(`UNSAFE: ${error}`);
  process.exit(1);
}

console.log('Skill distribution contains only allowlisted consumer files.');

function checkDirectory(directory) {
  const entries = readdirSync(join(skillDir, directory), {
    withFileTypes: true,
  });
  for (const entry of entries) {
    const relativePath = `${directory}/${entry.name}`;
    const allowed =
      entry.isFile() &&
      (requiredFiles.has(relativePath) ||
        (directory === 'references' && entry.name.endsWith('.md')));
    if (!allowed) {
      errors.push(
        `unexpected ${entry.isDirectory() ? 'directory' : 'entry'}: ${relativePath}${entry.isDirectory() ? '/' : ''}`,
      );
      continue;
    }
    seenFiles.add(relativePath);
  }
}
