#!/usr/bin/env node

/**
 * Deterministic anti-pattern scanner for the phase animation audit.
 * Scans source files for animation, rendering, and architecture
 * anti-pattern candidates and reports them grouped by severity.
 *
 * Usage: node scan.mjs <target-dir-or-file> [...more targets]
 *
 * Findings are candidates, not verdicts: classify each against
 * references/audit.md before recommending a change. Zero dependencies.
 */

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Public API -------------------------------------------------------------

/**
 * Scans one or more directories or files. Returns all findings plus scan
 * metadata. Paths inside a target are reported relative to that target.
 */
export function scanTargets(paths) {
  const findings = [];
  let filesScanned = 0;

  for (const target of paths) {
    const root = resolve(target);
    const stat = lstatSync(root);
    const files = stat.isDirectory() ? walk(root) : [root];
    const base = stat.isDirectory() ? root : dirname(root);

    for (const filePath of files) {
      let content;
      try {
        content = readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }
      filesScanned++;
      findings.push(...scanFile(relative(base, filePath), content));
    }
  }

  return { targets: paths, filesScanned, findings };
}

/**
 * Scans a single file's content. The relative path determines file-type
 * filtering and path-based exclusions. Returns findings for every signal
 * that fires.
 */
export function scanFile(relPath, content) {
  if (EXCLUDED_PATHS.test(relPath)) return [];

  const ext = extOf(relPath);
  const type = typeOf(ext);
  if (type === null) return [];

  const findings = [];
  const lines = content.split(/\r?\n/);

  for (const signal of SIGNALS) {
    if (!signalAppliesTo(signal, type, ext)) continue;

    // File-level negative pattern: skip if the file contains the mitigation.
    if (signal.negativePattern && signal.negativePattern.test(content)) {
      continue;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Custom matchers get the full line array and index (multi-line shapes).
      if (signal.matcher) {
        if (!signal.matcher(lines, i)) continue;
        findings.push(makeFinding(signal, relPath, i + 1, line));
        continue;
      }

      if (!signal.pattern.test(line)) continue;

      // Context pattern: only match if nearby lines contain the context.
      if (signal.contextPattern) {
        const context = lines.slice(Math.max(0, i - 5), i + 6).join('\n');
        if (!signal.contextPattern.test(context)) continue;
      }

      findings.push(makeFinding(signal, relPath, i + 1, line));
    }
  }

  // A rAF line that already matched setstate-in-raf (more specific, higher
  // severity) is not additionally reported as a manual rAF loop.
  const setstateLines = new Set(
    findings.filter((f) => f.signal === 'setstate-in-raf').map((f) => f.line),
  );
  return findings.filter(
    (f) => !(f.signal === 'manual-raf' && setstateLines.has(f.line)),
  );
}

/** Renders a scan result as human-readable text grouped by severity. */
export function formatText(result) {
  const out = [];
  const bySeverity = groupBySeverity(result.findings);

  for (const severity of SEVERITY_ORDER) {
    const group = bySeverity.get(severity);
    if (!group || group.size === 0) continue;

    const heading =
      severity === 'dedup'
        ? '## dedup (correct code, optional cleanup)'
        : `## ${severity}`;
    out.push('', heading);

    for (const [id, items] of group) {
      const signal = SIGNALS.find((s) => s.id === id);
      out.push(
        '',
        `${id} — ${signal.label} (${items.length}) · noise: ${signal.noise}`,
        `  fix: ${signal.fix}`,
      );
      for (const item of items) {
        out.push(`  ${item.file}:${item.line}  ${item.text.slice(0, 100)}`);
      }
    }
  }

  const counts = countBySeverity(result.findings);
  const actionable = counts.critical + counts.high + counts.medium;

  if (result.findings.length === 0) {
    out.push('', '✓ No animation anti-pattern candidates found.');
  } else {
    out.push(
      '',
      '─────────────────────────────────────────',
      `Total: ${actionable} actionable (${counts.critical} critical, ${counts.high} high, ${counts.medium} medium), ${counts.dedup} dedup`,
      'Next: classify each candidate against references/audit.md Step 2 (the decision ladder).',
      'Noise tiers: precise = trust it, normal = verify quickly, noisy = verify before recommending.',
    );
  }

  return out.join('\n');
}

// --- Signals ----------------------------------------------------------------

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
    `^${escapeRegExp(name)}\\.current\\s*=\\s*(.+?);?$`,
  ).exec(lines[j].trim());
  if (!assign) return false;

  return assign[1].trim() === initial;
}

// Flags an always-on will-change-transform utility class. A class toggled by
// a ternary or logical guard on the same line is treated as lifecycle-aware.
function matchesPermanentWillChangeClass(lines, i) {
  const line = lines[i];
  if (!/\bwill-change-transform\b/.test(line)) return false;
  return !/\?|&&/.test(line);
}

// A state-update call inside the rAF context window. Excludes DOM/timer/
// canvas setters that are legitimate (and often recommended) inside a frame
// callback: setTimeout, setAttribute, setProperty, setTransform, etc.
const STATE_UPDATE_CONTEXT =
  /\bsetState\s*\(|\bdispatch\s*\(|\bset(?!Timeout\b|Interval\b|Immediate\b|Attribute|Property\b|PointerCapture\b|Item\b|Selection|RangeText\b|CustomValidity\b|Transform\b|LineDash\b|SinkId\b|RequestHeader\b)[A-Z]\w*\s*\(/;

// A transition shorthand whose value is only durations/timing functions names
// no property, so it animates `all` by default.
const BARE_DURATION_TRANSITION =
  /transition:\s*[\d.]+m?s(?:\s*,?\s*(?:[\d.]+m?s|ease[\w-]*|linear|step[\w-]*|steps\([^)]*\)|cubic-bezier\([^)]*\)))*\s*(?:;|!|$)/;

/**
 * The signal catalog. Each signal carries detection (pattern/context/matcher,
 * file types), triage metadata (severity, noise, why, fix), and executable
 * examples that the test suite verifies: every `match` example must produce a
 * finding for this signal, every `noMatch` example must not.
 *
 * severity: critical | high | medium | dedup (audit.md's weighting).
 * noise: precise (trust it) | normal (verify quickly) | noisy (verify first).
 * fileTypes: js (default) | css | jsx, or an array to combine.
 */
export const SIGNALS = [
  {
    id: 'manual-raf',
    label: 'Manual requestAnimationFrame loop',
    severity: 'high',
    noise: 'noisy',
    why: 'No visibility pausing, no shared clock, no cleanup.',
    fix: 'references/audit.md#common-replacements',
    pattern: /requestAnimationFrame/,
    examples: {
      match: [
        {
          file: 'src/anim.ts',
          content:
            'function tick() {\n  requestAnimationFrame(tick);\n  draw();\n}\nrequestAnimationFrame(tick);\n',
        },
        {
          // Regression: a consumer path containing the substring "phase" must
          // still be scanned (the old exclude silently skipped it).
          file: 'src/phases/timeline.ts',
          content: 'requestAnimationFrame(step);\n',
        },
      ],
      noMatch: [
        {
          file: 'src/anim.spec.ts',
          content: 'requestAnimationFrame(tick);\n',
        },
        {
          file: 'src/use-anim.ts',
          content:
            "import { useLoop } from 'phase/react';\nuseLoop({ onTick: draw });\n",
        },
        {
          // A rAF line already reported as setstate-in-raf is not
          // double-counted as a manual loop.
          file: 'src/counter.tsx',
          content: 'requestAnimationFrame(() => setCount((c) => c + 1));\n',
        },
      ],
    },
  },
  {
    id: 'setstate-in-raf',
    label: 'setState/dispatch inside rAF callback',
    severity: 'critical',
    noise: 'normal',
    why: '60 re-renders/sec: React reconciles on every frame.',
    fix: 'references/performance.md#never-setstate-inside-ontick--draw',
    // The setState call is usually on a different line than the rAF, so match
    // rAF per line and require the state update within the surrounding window.
    pattern: /requestAnimationFrame/,
    contextPattern: STATE_UPDATE_CONTEXT,
    examples: {
      match: [
        {
          file: 'src/progress.tsx',
          content:
            'function loop() {\n  setProgress((p) => p + 1);\n  requestAnimationFrame(loop);\n}\n',
        },
        {
          file: 'src/store.ts',
          content: "requestAnimationFrame(() => dispatch({ type: 'tick' }));\n",
        },
      ],
      noMatch: [
        {
          // Regression: setAttribute is a recommended pattern inside rAF,
          // not a state update.
          file: 'src/meter.ts',
          content:
            "function loop() {\n  el.setAttribute('aria-valuenow', String(v));\n  requestAnimationFrame(loop);\n}\n",
        },
        {
          // Regression: style.setProperty is the recommended CSS-variable
          // write inside rAF.
          file: 'src/cursor.ts',
          content:
            "function loop() {\n  el.style.setProperty('--x', String(x));\n  requestAnimationFrame(loop);\n}\n",
        },
        {
          // Regression: setTimeout near a rAF is not a state update.
          file: 'src/fallback.ts',
          content:
            'requestAnimationFrame(start);\nsetTimeout(fallbackStart, 100);\n',
        },
      ],
    },
  },
  {
    id: 'forced-reflow',
    label: 'Forced reflow (getBoundingClientRect, offsetWidth, etc.)',
    severity: 'critical',
    noise: 'noisy',
    why: 'Synchronous layout; in a hot path it thrashes every frame.',
    fix: 'references/performance.md#no-forced-reflows-in-animation-paths',
    pattern:
      /getBoundingClientRect|offsetWidth|offsetHeight|offsetTop|offsetLeft|getComputedStyle|scrollWidth|scrollHeight|clientWidth|clientHeight/,
    examples: {
      match: [
        {
          file: 'src/reveal.ts',
          content: 'const rect = el.getBoundingClientRect();\n',
        },
        {
          file: 'src/sizer.ts',
          content: 'const w = el.offsetWidth;\n',
        },
      ],
      noMatch: [
        {
          file: 'src/reveal.ts',
          content: "import { useSize } from 'phase/react';\n",
        },
      ],
    },
  },
  {
    id: 'raw-io',
    label: 'Raw IntersectionObserver (not pooled)',
    severity: 'medium',
    noise: 'normal',
    why: 'Unpooled observer instances and manual cleanup leak over time.',
    fix: 'references/performance.md#observer-pooling',
    pattern: /new\s+IntersectionObserver/,
    examples: {
      match: [
        {
          file: 'src/lazy.ts',
          content: 'const io = new IntersectionObserver(onEnter);\n',
        },
        {
          // Regression: "phase" substring in a consumer path must be scanned.
          file: 'src/game-phase.ts',
          content: 'const io = new IntersectionObserver(onEnter);\n',
        },
      ],
      noMatch: [
        {
          file: 'src/lazy.ts',
          content: "import { useSight } from 'phase/react';\n",
        },
      ],
    },
  },
  {
    id: 'raw-ro',
    label: 'Raw ResizeObserver (not pooled)',
    severity: 'medium',
    noise: 'normal',
    why: 'Unpooled observer instances and manual cleanup leak over time.',
    fix: 'references/performance.md#observer-pooling',
    pattern: /new\s+ResizeObserver/,
    examples: {
      match: [
        {
          file: 'src/panel.ts',
          content: 'const ro = new ResizeObserver(onResize);\n',
        },
      ],
      noMatch: [
        {
          file: 'src/panel.ts',
          content: "import { useSize } from 'phase/react';\n",
        },
      ],
    },
  },
  {
    id: 'mutationobserver-layout',
    label:
      'MutationObserver driving layout (reflow / style+subtree observation)',
    severity: 'critical',
    noise: 'normal',
    why: 'Layout reads in MO callbacks force a reflow on every mutation.',
    fix: 'references/performance.md#never-drive-layout-from-a-mutationobserver',
    pattern: /new\s+MutationObserver/,
    // Only flag when the observer watches attributes/style or reads layout
    // nearby. Structural (childList) observation is legitimate and skipped.
    contextPattern:
      /attributeFilter|attributes\s*:\s*true|getBoundingClientRect|offsetWidth|offsetHeight|scrollWidth|scrollHeight|scrollTop|scrollLeft|clientWidth|clientHeight|getComputedStyle/,
    examples: {
      match: [
        {
          file: 'src/scrollbar.ts',
          content:
            'const mo = new MutationObserver(() => {\n  const h = el.scrollHeight;\n  sync(h);\n});\nmo.observe(el, { subtree: true, attributes: true });\n',
        },
      ],
      noMatch: [
        {
          file: 'src/list.ts',
          content:
            'const mo = new MutationObserver(onChildren);\nmo.observe(list, { childList: true });\n',
        },
      ],
    },
  },
  {
    id: 'js-opacity-transform',
    label: 'JS-driven opacity/transform (may be CSS-only candidate)',
    severity: 'medium',
    noise: 'noisy',
    why: 'Often replaceable by a CSS transition, or needs phase for lifecycle.',
    fix: 'references/decision-guide.md#tier-1-css-only-no-js',
    pattern: /\.style\.(opacity|transform)\s*=/,
    examples: {
      match: [
        {
          file: 'src/fade.ts',
          content: "el.style.opacity = '0.5';\n",
        },
        {
          file: 'src/slide.ts',
          content: "el.style.transform = 'translateX(10px)';\n",
        },
      ],
      noMatch: [
        {
          file: 'src/fade.ts',
          content: "el.classList.add('faded');\n",
        },
      ],
    },
  },
  {
    id: 'missing-reduced-motion',
    label: 'Animation without reduced-motion check',
    severity: 'critical',
    noise: 'noisy',
    why: 'Accessibility gap: motion plays for users who asked for none.',
    fix: 'references/performance.md#reduced-motion-by-default',
    // `animation:(?!\s*none)` keeps `animation: none` (motion disabled) out.
    pattern: /requestAnimationFrame|@keyframes|animation:(?!\s*none\b)/,
    // Suppress when the file already handles reduced motion, or genuinely
    // imports phase (its hooks handle it automatically). Match a real phase
    // import, not the bare substring "phase" (which caused false negatives).
    negativePattern: /prefers-reduced-motion|reducedMotion|from ['"]phase/,
    fileTypes: ['js', 'css'],
    examples: {
      match: [
        {
          file: 'src/spin.ts',
          content: 'requestAnimationFrame(spin);\n',
        },
        {
          // Regression: CSS animations without reduced-motion handling were
          // never scanned (the signal only ran on JS files).
          file: 'src/styles.css',
          content:
            '@keyframes spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n.spinner {\n  animation: spin 1s linear infinite;\n}\n',
        },
      ],
      noMatch: [
        {
          file: 'src/spin.ts',
          content:
            "import { useLoop } from 'phase/react';\nrequestAnimationFrame(spin);\n",
        },
        {
          file: 'src/styles.css',
          content:
            '.spinner {\n  animation: spin 1s linear infinite;\n}\n@media (prefers-reduced-motion: reduce) {\n  .spinner {\n    animation: none;\n  }\n}\n',
        },
        {
          // animation: none disables motion; it is not an animation.
          file: 'src/reset.css',
          content: '.static {\n  animation: none;\n}\n',
        },
      ],
    },
  },
  {
    id: 'background-animation',
    label: 'setInterval/setTimeout for animation (no visibility check)',
    severity: 'high',
    noise: 'noisy',
    why: 'Timers keep firing off-screen and in background tabs.',
    fix: 'references/timed-sequences.md',
    pattern: /setInterval|setTimeout/,
    contextPattern: /transform|opacity|translate|\banimate\b/,
    examples: {
      match: [
        {
          file: 'src/carousel.ts',
          content:
            "setInterval(() => {\n  track.style.transform = 'translateX(' + offset + 'px)';\n}, 3000);\n",
        },
      ],
      noMatch: [
        {
          // Regression: "position" as a plain variable near a timer is not
          // animation work (the old context pattern matched the bare word).
          file: 'src/queue.ts',
          content:
            'setTimeout(() => {\n  const position = queue.indexOf(job);\n  report(position);\n}, 1000);\n',
        },
      ],
    },
  },
  {
    id: 'manual-synced-ref',
    label: 'Manual synced ref (dedup: useSyncedRef offers a shorthand)',
    severity: 'dedup',
    noise: 'precise',
    why: 'Correct React idiom; useSyncedRef is a one-line shorthand.',
    fix: 'references/use-synced-ref.md',
    matcher: matchesSyncedRef,
    examples: {
      match: [
        {
          file: 'src/use-latest.ts',
          content: 'const cbRef = useRef(cb);\ncbRef.current = cb;\n',
        },
      ],
      noMatch: [
        {
          file: 'src/use-latest.ts',
          content: 'const cbRef = useRef(null);\ncbRef.current = cb;\n',
        },
      ],
    },
  },
  // --- CSS/DOM-scale signals ---
  {
    id: 'global-has-selector',
    label: 'Global :has() selector (broad style invalidation)',
    severity: 'high',
    noise: 'precise',
    why: 'Re-checked on any mutation that could affect the argument.',
    fix: 'references/performance-recipes.md#recipe-delete-a-global-has-rule',
    pattern: /body:has\(|html:has\(|:root:has\(|\*:has\(/,
    fileTypes: 'css',
    examples: {
      match: [
        {
          file: 'src/globals.css',
          content: 'body:has(.modal-open) {\n  overflow: hidden;\n}\n',
        },
      ],
      noMatch: [
        {
          file: 'src/card.css',
          content: '.card:has(img) {\n  padding: 0;\n}\n',
        },
        {
          // CSS signals must not fire on JS files.
          file: 'src/globals.ts',
          content:
            "const css = 'body:has(.modal-open) { overflow: hidden; }';\n",
        },
      ],
    },
  },
  {
    id: 'permanent-will-change',
    label: 'Permanent will-change (wastes GPU memory when idle)',
    severity: 'medium',
    noise: 'normal',
    why: 'A GPU layer is held even while nothing animates.',
    fix: 'references/performance.md#will-change-only-while-animating',
    pattern: /will-change:(?!\s*auto\b)/,
    negativePattern: /animation-play-state|\[data-|:hover|:focus/,
    fileTypes: 'css',
    examples: {
      match: [
        {
          file: 'src/card.css',
          content: '.card {\n  will-change: transform;\n}\n',
        },
        {
          // will-change on layout properties is worse than transform, and the
          // old pattern missed it entirely.
          file: 'src/panel.css',
          content: '.panel {\n  will-change: left, top;\n}\n',
        },
      ],
      noMatch: [
        {
          file: 'src/card.css',
          content:
            ".card[data-active='true'] {\n  will-change: transform;\n}\n",
        },
        {
          file: 'src/reset.css',
          content: '.static {\n  will-change: auto;\n}\n',
        },
      ],
    },
  },
  {
    id: 'non-compositor-animation',
    label:
      'Animating a non-compositor property (layout/paint, not transform/opacity)',
    severity: 'high',
    noise: 'normal',
    why: 'Layout + paint every frame, off the compositor.',
    fix: 'references/audit.md#step-15-css-loading-and-architecture-pass',
    // `transition: all`, a transition naming a layout property, or a
    // bare-duration shorthand (names no property, so it animates `all`).
    // transform/opacity-only transitions do not match.
    pattern: new RegExp(
      /transition(?:-property)?:\s*(?:all\b|[^;{}]*\b(?:width|height|top|left|right|bottom|margin|padding|inset)\b)/
        .source +
        '|' +
        BARE_DURATION_TRANSITION.source,
    ),
    fileTypes: 'css',
    examples: {
      match: [
        {
          file: 'src/menu.css',
          content: '.menu {\n  transition: all 0.3s ease;\n}\n',
        },
        {
          file: 'src/drawer.css',
          content: '.drawer {\n  transition: width 0.2s;\n}\n',
        },
        {
          // A bare-duration shorthand names no property, so it animates
          // `all` by default. The old pattern missed it.
          file: 'src/tab.css',
          content: '.tab {\n  transition: 0.3s;\n}\n',
        },
      ],
      noMatch: [
        {
          file: 'src/menu.css',
          content: '.menu {\n  transition: opacity 0.3s, transform 0.3s;\n}\n',
        },
        {
          file: 'src/menu.css',
          content: '.menu {\n  transition-property: opacity;\n}\n',
        },
        {
          file: 'src/menu.css',
          content: '.menu {\n  transition: 0.3s opacity;\n}\n',
        },
      ],
    },
  },
  // --- Loading/architecture signals ---
  {
    id: 'bare-window-listener',
    label: 'Bare resize/scroll listener with layout read',
    severity: 'critical',
    noise: 'normal',
    why: 'A synchronous reflow per event, once per listening component.',
    fix: 'references/performance-recipes.md#recipe-collapse-n-bare-window-resize-listeners-into-one-pooled-observer',
    pattern: /addEventListener\s*\(\s*['"](?:resize|scroll)['"]/,
    contextPattern:
      /getBoundingClientRect|offsetWidth|offsetHeight|scrollWidth|scrollHeight|scrollTop|scrollLeft|clientWidth|clientHeight/,
    examples: {
      match: [
        {
          file: 'src/sidebar.ts',
          content:
            "window.addEventListener('resize', () => {\n  const w = el.getBoundingClientRect().width;\n  setCollapsed(w < 240);\n});\n",
        },
      ],
      noMatch: [
        {
          file: 'src/sidebar.ts',
          content:
            "window.addEventListener('resize', () => {\n  schedule();\n});\n",
        },
        {
          file: 'src/button.ts',
          content:
            "el.addEventListener('click', () => {\n  const w = el.offsetWidth;\n  log(w);\n});\n",
        },
      ],
    },
  },
  {
    id: 'redundant-mutation-observers',
    label:
      'MutationObserver on html/documentElement (coalesce into one useMutation)',
    severity: 'medium',
    noise: 'normal',
    why: 'N observers on one target each fire per mutation; one suffices.',
    fix: 'references/performance-recipes.md#recipe-collapse-an-observer-storm-on-html',
    pattern: /new\s+MutationObserver/,
    contextPattern:
      /document\.documentElement|<html|\.observe\s*\(\s*document\s*\./,
    examples: {
      match: [
        {
          file: 'src/theme.ts',
          content:
            'const mo = new MutationObserver(onTheme);\nmo.observe(document.documentElement, { attributes: true });\n',
        },
      ],
      noMatch: [
        {
          file: 'src/widget.ts',
          content:
            'const mo = new MutationObserver(onChange);\nmo.observe(ref.current, { childList: true });\n',
        },
      ],
    },
  },
  {
    id: 'tailwind-transition-all',
    label: 'Tailwind transition-all class (animates layout properties)',
    severity: 'high',
    noise: 'noisy',
    why: 'Transitions whatever changes, including layout, off the compositor.',
    fix: 'references/audit.md#step-15-css-loading-and-architecture-pass',
    pattern: /\btransition-all\b/,
    fileTypes: 'jsx',
    examples: {
      match: [
        {
          file: 'src/card.tsx',
          content:
            '<div className="transition-all duration-300 hover:scale-105" />;\n',
        },
      ],
      noMatch: [
        {
          file: 'src/card.tsx',
          content: '<div className="transition-colors duration-300" />;\n',
        },
        {
          // JSX signals only run on .tsx/.jsx files.
          file: 'src/card.ts',
          content: "const cls = 'transition-all duration-300';\n",
        },
      ],
    },
  },
  {
    id: 'tailwind-permanent-will-change',
    label: 'Tailwind will-change-transform class not toggled with state',
    severity: 'medium',
    noise: 'noisy',
    why: 'A GPU layer is held even while nothing animates.',
    fix: 'references/performance.md#will-change-only-while-animating',
    matcher: matchesPermanentWillChangeClass,
    fileTypes: 'jsx',
    examples: {
      match: [
        {
          file: 'src/logo.tsx',
          content: '<div className="will-change-transform animate-spin" />;\n',
        },
      ],
      noMatch: [
        {
          file: 'src/logo.tsx',
          content:
            "<div className={active ? 'will-change-transform' : ''} />;\n",
        },
      ],
    },
  },
  // --- Phase-usage signals ---
  {
    id: 'reduced-motion-ignored',
    label: "reducedMotion: 'ignore' (bypasses the user preference)",
    severity: 'medium',
    noise: 'precise',
    why: 'Only justified for non-decorative motion (data viz, games).',
    fix: 'references/performance.md#reduced-motion-by-default',
    pattern: /reducedMotion:\s*['"]ignore['"]/,
    examples: {
      match: [
        {
          file: 'src/hero.ts',
          content:
            "createLoop({ element: el, onTick: draw, reducedMotion: 'ignore' });\n",
        },
      ],
      noMatch: [
        {
          file: 'src/hero.ts',
          content:
            "createLoop({ element: el, onTick: draw, reducedMotion: 'respect' });\n",
        },
      ],
    },
  },
  {
    id: 'core-primitive-in-component',
    label: 'Core phase primitive in a component (hook likely fits better)',
    severity: 'medium',
    noise: 'noisy',
    why: 'Hooks manage refs, teardown, and enabled automatically.',
    fix: 'references/decision-guide.md#common-mistakes',
    pattern: /\bcreate(?:Loop|Ticker|Lifecycle|Sight)\s*\(/,
    fileTypes: 'jsx',
    examples: {
      match: [
        {
          file: 'src/spinner.tsx',
          content:
            'useEffect(() => {\n  const loop = createLoop({ element: ref.current, onTick });\n  return () => loop.stop();\n}, []);\n',
        },
      ],
      noMatch: [
        {
          // Custom hook modules (.ts) composing core primitives are the
          // documented escape hatch.
          file: 'src/use-spinner.ts',
          content:
            'const loop = createLoop({ element, onTick });\nreturn () => loop.stop();\n',
        },
      ],
    },
  },
];

/** Severity display and ranking order, most severe first. */
export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'dedup'];

// --- Internal ---------------------------------------------------------------

const FILE_TYPE_EXTENSIONS = {
  js: new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']),
  css: new Set(['.css', '.scss', '.sass', '.less']),
};

const JSX_EXTENSIONS = new Set(['.tsx', '.jsx']);

// Tests, stories, and mocks describe anti-patterns as often as they commit
// them; scanning them buries real findings.
const EXCLUDED_PATHS =
  /node_modules|\.spec\.|\.test\.|\.stories\.|__tests__|__mocks__/;

// Build output, caches, and vendored artifacts. Scanning them storms the
// report with code nobody will edit.
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  'build',
  'out',
  'coverage',
  '.turbo',
  '.vercel',
  'storybook-static',
]);

const SKIP_FILES = /\.min\.|\.d\.ts$|\.d\.mts$/;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extOf(path) {
  const dot = path.lastIndexOf('.');
  if (dot <= path.lastIndexOf('/')) return null;
  return path.slice(dot);
}

function typeOf(ext) {
  if (ext === null) return null;
  if (FILE_TYPE_EXTENSIONS.js.has(ext)) return 'js';
  if (FILE_TYPE_EXTENSIONS.css.has(ext)) return 'css';
  return null;
}

function signalAppliesTo(signal, type, ext) {
  const declared = signal.fileTypes ?? 'js';
  const types = Array.isArray(declared) ? declared : [declared];
  for (const t of types) {
    if (t === 'jsx') {
      if (JSX_EXTENSIONS.has(ext)) return true;
    } else if (t === type) {
      return true;
    }
  }
  return false;
}

function makeFinding(signal, file, line, text) {
  return {
    signal: signal.id,
    severity: signal.severity,
    noise: signal.noise,
    file,
    line,
    text: text.trim(),
    fix: signal.fix,
  };
}

function walk(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      const stat = lstatSync(full);
      // Skipping symlinks entirely guards against cycles and vendored trees.
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        results.push(...walk(full));
      } else if (
        stat.isFile() &&
        !SKIP_FILES.test(entry) &&
        typeOf(extOf(entry)) !== null
      ) {
        results.push(full);
      }
    }
  } catch {
    // skip inaccessible directories
  }
  return results;
}

/** Groups findings as severity -> signal id -> findings, in catalog order. */
function groupBySeverity(findings) {
  const bySeverity = new Map();
  for (const severity of SEVERITY_ORDER) {
    bySeverity.set(severity, new Map());
  }
  for (const signal of SIGNALS) {
    const items = findings.filter((f) => f.signal === signal.id);
    if (items.length > 0) {
      bySeverity.get(signal.severity).set(signal.id, items);
    }
  }
  return bySeverity;
}

function countBySeverity(findings) {
  const counts = { critical: 0, high: 0, medium: 0, dedup: 0 };
  for (const finding of findings) {
    counts[finding.severity]++;
  }
  return counts;
}

// --- CLI --------------------------------------------------------------------

function main() {
  const targets = process.argv.slice(2);
  if (targets.length === 0) targets.push('.');
  const result = scanTargets(targets);
  console.log(formatText(result));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
