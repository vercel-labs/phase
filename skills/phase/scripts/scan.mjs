#!/usr/bin/env node

/**
 * Deterministic anti-pattern scanner for the phase animation audit.
 * Greps source files for common animation anti-patterns and prints
 * candidate sites (file:line) grouped by signal type.
 *
 * Usage: node skills/phase/scripts/scan.mjs <target-dir>
 *
 * Zero dependencies — uses only Node built-ins.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const targetDir = resolve(process.argv[2] || '.');

const SIGNALS = [
  {
    id: 'manual-raf',
    label: 'Manual requestAnimationFrame loop',
    pattern: /requestAnimationFrame/,
    exclude: /node_modules|phase|\.spec\.|\.test\./,
  },
  {
    id: 'setstate-in-raf',
    label: 'setState/dispatch inside rAF callback',
    pattern:
      /requestAnimationFrame[\s\S]{0,200}(setState|dispatch|set[A-Z]\w*\()/,
    exclude: /node_modules|phase|\.spec\.|\.test\./,
  },
  {
    id: 'forced-reflow',
    label: 'Forced reflow (getBoundingClientRect, offsetWidth, etc.)',
    pattern:
      /getBoundingClientRect|offsetWidth|offsetHeight|offsetTop|offsetLeft|getComputedStyle|scrollWidth|scrollHeight|clientWidth|clientHeight/,
    exclude: /node_modules|\.spec\.|\.test\./,
  },
  {
    id: 'raw-io',
    label: 'Raw IntersectionObserver (not pooled)',
    pattern: /new\s+IntersectionObserver/,
    exclude: /node_modules|phase|\.spec\.|\.test\./,
  },
  {
    id: 'raw-ro',
    label: 'Raw ResizeObserver (not pooled)',
    pattern: /new\s+ResizeObserver/,
    exclude: /node_modules|phase|\.spec\.|\.test\./,
  },
  {
    id: 'js-opacity-transform',
    label: 'JS-driven opacity/transform (may be CSS-only candidate)',
    pattern: /\.style\.(opacity|transform)\s*=/,
    exclude: /node_modules|\.spec\.|\.test\./,
  },
  {
    id: 'missing-reduced-motion',
    label: 'Animation without reduced-motion check',
    pattern: /requestAnimationFrame|@keyframes|animation:/,
    negativePattern: /prefers-reduced-motion|reducedMotion|phase/,
    exclude: /node_modules|\.spec\.|\.test\./,
  },
  {
    id: 'background-animation',
    label: 'setInterval/setTimeout for animation (no visibility check)',
    pattern: /setInterval|setTimeout/,
    contextPattern: /transform|opacity|animate|position|translate/,
    exclude: /node_modules|phase|\.spec\.|\.test\./,
  },
];

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

function walk(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist')
        continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        results.push(...walk(full));
      } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
        results.push(full);
      }
    }
  } catch {
    // skip inaccessible directories
  }
  return results;
}

const files = walk(targetDir);
const findings = new Map();

for (const signal of SIGNALS) {
  findings.set(signal.id, []);
}

for (const filePath of files) {
  const rel = relative(targetDir, filePath);
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    continue;
  }

  const lines = content.split('\n');

  for (const signal of SIGNALS) {
    if (signal.exclude && signal.exclude.test(rel)) continue;

    // File-level negative pattern: skip if the file also contains the mitigation
    if (signal.negativePattern && signal.negativePattern.test(content))
      continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!signal.pattern.test(line)) continue;

      // Context pattern: only match if nearby lines contain the context
      if (signal.contextPattern) {
        const context = lines.slice(Math.max(0, i - 5), i + 6).join('\n');
        if (!signal.contextPattern.test(context)) continue;
      }

      findings
        .get(signal.id)
        .push({ file: rel, line: i + 1, text: line.trim() });
    }
  }
}

// --- Output ---

let totalFindings = 0;

for (const signal of SIGNALS) {
  const items = findings.get(signal.id);
  if (items.length === 0) continue;

  console.log(`\n## ${signal.label} (${items.length})`);
  for (const item of items) {
    console.log(`  ${item.file}:${item.line}  ${item.text.slice(0, 100)}`);
    totalFindings++;
  }
}

if (totalFindings === 0) {
  console.log('\n✓ No animation anti-pattern candidates found.');
} else {
  console.log(`\n─────────────────────────────────────────`);
  console.log(`Total candidates: ${totalFindings}`);
  console.log(
    `Classify each against the decision ladder (CSS → useTween → phase → library → no change).`,
  );
}
