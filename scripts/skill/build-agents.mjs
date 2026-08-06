#!/usr/bin/env node

/**
 * Generates the skill's derived files from SKILL.md (the single source of truth):
 *   - AGENTS.md   — SKILL.md + all references/*.md (skipping _*) concatenated
 *   - metadata.json — name/version/author/license/abstract from the frontmatter
 *
 * Editing SKILL.md is the only place a contributor touches these values; both
 * outputs are regenerated here so they can never drift.
 *
 * Outputs are run through oxfmt so they are byte-identical to what the repo's
 * formatter (and CI's `pnpm format` check) expects — no manual formatting step.
 */

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const skillDir = join(root, 'skills', 'phase');
const refsDir = join(skillDir, 'references');

const skillMd = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');

// --- AGENTS.md (compiled full document) ---

const refFiles = readdirSync(refsDir)
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .toSorted();

const separator = '\n\n---\n\n';
let output = `<!-- GENERATED — do not edit. Run: node scripts/skill/build-agents.mjs -->\n\n`;
output += skillMd;

for (const file of refFiles) {
  const content = readFileSync(join(refsDir, file), 'utf8');
  output += separator + content;
}

writeFileSync(join(skillDir, 'AGENTS.md'), output);

// --- metadata.json (catalog file, derived from frontmatter) ---

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

// Normalize both generated files to the repo's formatter so they pass
// `oxfmt --check` everywhere (pre-commit, CI, release).
execSync(`pnpm exec oxfmt ${join(skillDir, 'AGENTS.md')} ${metadataPath}`, {
  cwd: root,
  stdio: 'inherit',
});

console.log(
  `✓ AGENTS.md (${refFiles.length} references) + metadata.json generated from SKILL.md`,
);
