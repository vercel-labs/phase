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

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Flags the manual synced-ref idiom that useSyncedRef shortens:
//   const xRef = useRef(v);
//   xRef.current = v;   // next non-blank line, same initializer
// Matching the same initializer keeps false positives near zero: useRef(null),
// a different value, or a conditional write (`if (c) xRef.current = v`) all miss.
// Dedup only, not a defect: the raw pattern is correct React.
function matchesSyncedRef(lines, i) {
  const decl =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*useRef\s*(?:<[^>]*>)?\s*\(([^)]*)\)/.exec(
      lines[i],
    );
  if (!decl) return false;

  const name = decl[1];
  const initial = decl[2].trim();
  if (initial === '') return false;

  let j = i + 1;
  while (j < lines.length) {
    const t = lines[j].trim();
    if (
      t === '' ||
      t.startsWith('//') ||
      t.startsWith('*') ||
      t.startsWith('/*')
    )
      j++;
    else break;
  }
  if (j >= lines.length) return false;

  const assign = new RegExp(
    '^' + escapeRegExp(name) + '\\.current\\s*=\\s*(.+?);?$',
  ).exec(lines[j].trim());
  if (!assign) return false;

  return assign[1].trim() === initial;
}

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
    id: 'mutationobserver-layout',
    label:
      'MutationObserver driving layout (reflow / style+subtree observation)',
    pattern: /new\s+MutationObserver/,
    // Only flag when the observer watches attributes/style or reads layout
    // nearby. Structural (childList) observation is legitimate and skipped.
    contextPattern:
      /attributeFilter|attributes\s*:\s*true|getBoundingClientRect|offsetWidth|offsetHeight|scrollWidth|scrollHeight|scrollTop|scrollLeft|clientWidth|clientHeight|getComputedStyle/,
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
  {
    id: 'manual-synced-ref',
    label: 'Manual synced ref (dedup: useSyncedRef offers a shorthand)',
    severity: 'dedup',
    matcher: matchesSyncedRef,
    exclude: /node_modules|phase|\.spec\.|\.test\./,
  },
  // --- CSS/DOM-scale signals ---
  {
    id: 'global-has-selector',
    label: 'Global :has() selector (document-wide has-invalidation)',
    pattern: /body:has\(|html:has\(/,
    exclude: /node_modules|\.spec\.|\.test\./,
    fileTypes: 'css',
  },
  {
    id: 'permanent-will-change',
    label: 'Permanent will-change (wastes GPU memory when idle)',
    pattern: /will-change:\s*transform/,
    negativePattern:
      /animation-play-state|data-active|isActive|\?.*will-change/,
    exclude: /node_modules|\.spec\.|\.test\./,
    fileTypes: 'css',
  },
  // --- Loading/architecture signals ---
  {
    id: 'bare-window-listener',
    label: 'Bare window resize/scroll listener with layout read',
    pattern: /addEventListener\s*\(\s*['"](?:resize|scroll)['"]/,
    contextPattern:
      /getBoundingClientRect|offsetWidth|offsetHeight|scrollWidth|scrollHeight|scrollTop|scrollLeft|clientWidth|clientHeight/,
    exclude: /node_modules|phase|\.spec\.|\.test\./,
  },
  {
    id: 'redundant-mutation-observers',
    label: 'Multiple MutationObservers on html/documentElement',
    pattern: /new\s+MutationObserver/,
    contextPattern:
      /document\.documentElement|<html|\.observe\s*\(\s*document\s*\./,
    exclude: /node_modules|phase|\.spec\.|\.test\./,
  },
];

const JS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const CSS_EXTENSIONS = new Set(['.css', '.scss', '.module.css']);
const EXTENSIONS = new Set([...JS_EXTENSIONS, ...CSS_EXTENSIONS]);

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

  const ext = filePath.slice(filePath.lastIndexOf('.'));
  const isCSS = CSS_EXTENSIONS.has(ext);
  const isJS = JS_EXTENSIONS.has(ext);

  for (const signal of SIGNALS) {
    if (signal.exclude && signal.exclude.test(rel)) continue;

    // File-type filtering: 'css' signals only match CSS files, all others match JS
    if (signal.fileTypes === 'css' && !isCSS) continue;
    if (!signal.fileTypes && !isJS) continue;

    // File-level negative pattern: skip if the file also contains the mitigation
    if (signal.negativePattern && signal.negativePattern.test(content))
      continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Custom matchers get the full line array and index (multi-line shapes)
      if (signal.matcher) {
        if (!signal.matcher(lines, i)) continue;
        findings
          .get(signal.id)
          .push({ file: rel, line: i + 1, text: line.trim() });
        continue;
      }

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
let dedupFindings = 0;

// Actionable anti-patterns first.
for (const signal of SIGNALS) {
  if (signal.severity === 'dedup') continue;
  const items = findings.get(signal.id);
  if (items.length === 0) continue;

  console.log(`\n## ${signal.label} (${items.length})`);
  for (const item of items) {
    console.log(`  ${item.file}:${item.line}  ${item.text.slice(0, 100)}`);
    totalFindings++;
  }
}

// Dedup signals last: correct code with a phase shorthand.
for (const signal of SIGNALS) {
  if (signal.severity !== 'dedup') continue;
  const items = findings.get(signal.id);
  if (items.length === 0) continue;

  console.log(`\n## ${signal.label} (${items.length})  [dedup, not a defect]`);
  for (const item of items) {
    console.log(`  ${item.file}:${item.line}  ${item.text.slice(0, 100)}`);
    dedupFindings++;
  }
}

if (totalFindings === 0 && dedupFindings === 0) {
  console.log('\n✓ No animation anti-pattern candidates found.');
} else {
  console.log(`\n─────────────────────────────────────────`);
  console.log(`Total candidates: ${totalFindings}`);
  if (dedupFindings > 0) {
    console.log(
      `Dedup opportunities: ${dedupFindings} (correct code, optional cleanup)`,
    );
  }
  console.log(
    `Classify each against the decision ladder (CSS → useTween → phase → library → no change).`,
  );
}
