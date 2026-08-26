#!/usr/bin/env node

/**
 * Generates metadata.json from SKILL.md frontmatter, the single source of truth
 * for the skill's name, version, author, license, and abstract.
 *
 * The output is run through oxfmt so it is byte-identical to what the repo's
 * formatter (and CI's `pnpm format` check) expects — no manual formatting step.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..', '..');
const repoRoot = resolve(packageRoot, '..', '..');
const skillDir = join(repoRoot, 'skills', 'phase');

const skillMd = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');

const frontmatter = skillMd.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';

function frontmatterField(re, label) {
  const value = frontmatter
    .match(re)?.[1]
    ?.trim()
    .replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error(`SKILL.md frontmatter is missing ${label}`);
  return value;
}

// `name`/`license` are top-level; `version`/`author`/`abstract` are nested
// under the indented `metadata:` block.
const metadata = {
  name: frontmatterField(/^name:\s*(.+)$/m, 'name'),
  version: frontmatterField(/^\s+version:\s*(.+)$/m, 'metadata.version'),
  author: frontmatterField(/^\s+author:\s*(.+)$/m, 'metadata.author'),
  license: frontmatterField(/^license:\s*(.+)$/m, 'license'),
  abstract: frontmatterField(/^\s+abstract:\s*(.+)$/m, 'metadata.abstract'),
};

const metadataPath = join(skillDir, 'metadata.json');
writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

// Normalize the generated file so it passes `oxfmt --check` everywhere.
execSync(`pnpm exec oxfmt ${metadataPath}`, {
  cwd: repoRoot,
  stdio: 'inherit',
});

console.log('✓ metadata.json generated from SKILL.md');
