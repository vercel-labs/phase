#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { SIGNALS } from '../../scanner/signals.ts';
import {
  collectFixSections,
  renderFixSectionsModule,
} from './fix-sections.mjs';

const packageRoot = resolve(import.meta.dirname, '..', '..');
const repoRoot = resolve(packageRoot, '..', '..');
const refsDir = join(repoRoot, 'skills', 'phase', 'references');
const outputPath = join(packageRoot, 'scanner', 'fix-sections.gen.ts');

const sections = collectFixSections(SIGNALS, refsDir);
writeFileSync(outputPath, renderFixSectionsModule(sections));
execFileSync('pnpm', ['exec', 'oxfmt', outputPath], {
  cwd: repoRoot,
  stdio: 'inherit',
});
console.log(`Generated ${sections.size} fix sections.`);
