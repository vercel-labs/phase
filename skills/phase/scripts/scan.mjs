#!/usr/bin/env node

/**
 * Deterministic anti-pattern scanner for the phase animation audit.
 * Scans source files for animation, rendering, and architecture
 * anti-pattern candidates and reports them grouped by severity.
 *
 * Usage: node scan.mjs [--json] [--fail-on <severity>] <target> [...targets]
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
  const diag = { suppressed: 0, warnings: [] };
  const context = {
    framework: null,
    appRouter: false,
    ppr: false,
    clientComponents: 0,
  };
  let filesScanned = 0;

  for (const target of paths) {
    const root = resolve(target);
    const stat = lstatSync(root);
    const files = stat.isDirectory() ? walk(root) : [root];
    const base = stat.isDirectory() ? root : dirname(root);

    if (stat.isDirectory()) detectNextConfig(root, context);

    for (const filePath of files) {
      let content;
      try {
        content = readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }
      filesScanned++;
      // File targets keep the path as the caller gave it, so directory-based
      // exclusions (__tests__, node_modules) still apply in diff-scoped scans.
      const rel = stat.isDirectory()
        ? toPosix(relative(base, filePath))
        : toPosix(target).replace(/^\.\//, '');
      // Excluded paths (tests, fixtures, agent config) must not poison
      // environment detection either.
      if (!EXCLUDED_PATHS.test(rel)) updateContext(rel, content, context);
      findings.push(...scanFile(rel, content, diag));
    }
  }

  return {
    targets: paths,
    filesScanned,
    findings,
    suppressed: diag.suppressed,
    warnings: diag.warnings,
    context,
  };
}

/**
 * Scans a single file's content. The relative path determines file-type
 * filtering and path-based exclusions. Returns findings for every signal
 * that fires. Pass a diag object ({ suppressed, warnings }) to collect
 * suppression counts and directive warnings.
 */
export function scanFile(relPath, content, diag = null) {
  if (EXCLUDED_PATHS.test(relPath)) return [];

  const ext = extOf(relPath);
  const type = typeOf(ext);
  if (type === null) return [];

  const findings = [];
  const lines = content.split(/\r?\n/);

  // Minified/bundled content not named .min.* (vendored tooling, committed
  // build artifacts) produces garbage findings. Real code averages well
  // under 100 chars per line; bundles average thousands.
  if (content.length / lines.length > 500) return [];

  const suppressions = collectSuppressions(relPath, lines, diag);

  for (const signal of SIGNALS) {
    if (!signalAppliesTo(signal, type, ext)) continue;

    if (signal.negativePattern && signal.negativePattern.test(content)) {
      continue;
    }

    const signalFindings = scanSignal(
      signal,
      lines,
      relPath,
      suppressions,
      diag,
    );

    // A per-file finding needs a file-level suppression: a directive naming
    // the signal anywhere in the file suppresses its single finding
    // (otherwise the finding would just move to the next matching line).
    // Counted only when there was actually a finding to suppress, so a
    // dangling directive does not inflate the suppressed count.
    if (
      signal.perFile &&
      signalFindings.length > 0 &&
      suppressedAnywhere(suppressions, signal.id)
    ) {
      if (diag) diag.suppressed++;
      continue;
    }

    findings.push(...signalFindings);
  }

  return dedup(findings);
}

/**
 * Renders a scan result as a stable machine-readable object
 * (schemaVersion 1). skillVersion records which signal catalog produced
 * the findings.
 */
export function formatJson(result) {
  const counts = countBySeverity(result.findings);
  return {
    schemaVersion: 1,
    skillVersion: skillVersion(),
    targets: result.targets,
    summary: {
      filesScanned: result.filesScanned,
      total: result.findings.length,
      actionable: counts.critical + counts.high + counts.medium,
      dedup: counts.dedup,
      suppressed: result.suppressed ?? 0,
      bySeverity: {
        critical: counts.critical,
        high: counts.high,
        medium: counts.medium,
      },
    },
    context: result.context ?? null,
    warnings: result.warnings ?? [],
    findings: result.findings,
  };
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
      // A finding storm (Tailwind apps can have 200+ transition-all hits)
      // buries the rest of the report; cap the listing, keep the count.
      for (const item of items.slice(0, MAX_LISTED_PER_SIGNAL)) {
        out.push(`  ${item.file}:${item.line}  ${item.text.slice(0, 100)}`);
      }
      if (items.length > MAX_LISTED_PER_SIGNAL) {
        out.push(
          `  … and ${items.length - MAX_LISTED_PER_SIGNAL} more (use --json for the full list)`,
        );
      }
    }
  }

  const counts = countBySeverity(result.findings);
  const actionable = counts.critical + counts.high + counts.medium;
  const suppressed = result.suppressed ?? 0;

  // A clean result must be distinguishable from scanning nothing: an empty
  // or mistyped target reading as "no findings" would be false confidence.
  if (result.filesScanned === 0) {
    out.push('', '⚠ No scannable files found. Check the target path.');
  } else if (result.findings.length === 0 && suppressed === 0) {
    out.push(
      '',
      `✓ No animation anti-pattern candidates found (${result.filesScanned} files scanned).`,
    );
  } else {
    const suppressedNote = suppressed > 0 ? `, ${suppressed} suppressed` : '';
    out.push(
      '',
      '─────────────────────────────────────────',
      `Scanned ${result.filesScanned} files.`,
      `Total: ${actionable} actionable (${counts.critical} critical, ${counts.high} high, ${counts.medium} medium), ${counts.dedup} dedup${suppressedNote}`,
      'Next: classify each candidate against references/audit.md Step 2 (the decision ladder).',
      'Noise tiers: precise = trust it, normal = verify quickly, noisy = verify before recommending.',
    );
  }

  // Environment facts change what a safe recommendation looks like; hand
  // them to the reader instead of relying on it to go looking.
  const context = result.context;
  if (context?.framework === 'next') {
    const bits = ['Next.js'];
    if (context.appRouter) bits.push('App Router');
    if (context.ppr) bits.push('PPR');
    out.push(
      '',
      `Context: ${bits.join(' + ')} detected. Rendering recommendations must pass the blast-radius check (references/audit.md Step 2.5) before changing SSR content or mount timing.`,
    );
  }

  return out.join('\n');
}

// --- Signal catalog ---------------------------------------------------------
//
// Each signal carries detection logic (pattern/context/matcher, file types)
// and triage metadata (severity, noise, why, fix). Executable examples live
// in scan-examples.mjs keyed by signal id; the test suite verifies every
// signal has examples and that each one behaves as declared.
//
// severity: critical | high | medium | dedup (audit.md's weighting).
// noise: precise (trust it) | normal (verify quickly) | noisy (verify first).
// fileTypes: js (default) | css | jsx, or an array to combine.
// supersedes: another signal's id; when both fire on the same line, the
//   superseded signal is dropped (the more specific one is kept).
// perFile: true means one finding per file (the condition is file-level).

// Context pattern for state updates. Excludes DOM/timer/canvas setters that
// are legitimate inside frame callbacks. The exclusions accept rare false
// negatives when a React setter shares a DOM setter name (e.g. setSelection,
// setTransform): missing one candidate beats flagging the recommended pattern.
// Known accepted FP class (calibrated): non-React `dispatch(` from editor or
// store libraries (e.g. a CodeMirror transaction) near a rAF; the noise tier
// covers it, and distinguishing them line-based is not worth the complexity.
const STATE_UPDATE_CONTEXT =
  /\bsetState\s*\(|\bdispatch\s*\(|\bset(?!Timeout\b|Interval\b|Immediate\b|Attribute|Property\b|PointerCapture\b|Item\b|Selection|RangeText\b|CustomValidity\b|Transform\b|LineDash\b|SinkId\b|RequestHeader\b)[A-Z]\w*\s*\(/;

// Bare-duration transition shorthand (no property named, so it animates all).
const BARE_DURATION_TRANSITION =
  /transition:\s*[\d.]+m?s(?:\s*,?\s*(?:[\d.]+m?s|ease[\w-]*|linear|step[\w-]*|steps\([^)]*\)|cubic-bezier\([^)]*\)))*\s*(?:;|!|$)/;

export const SIGNALS = [
  {
    id: 'manual-raf',
    label: 'Manual requestAnimationFrame loop',
    severity: 'high',
    noise: 'noisy',
    why: 'No visibility pausing, no shared clock, no cleanup.',
    fix: 'references/audit.md#common-replacements',
    pattern: /requestAnimationFrame/,
  },
  {
    id: 'setstate-in-raf',
    label: 'setState/dispatch inside rAF callback',
    severity: 'critical',
    noise: 'normal',
    why: '60 re-renders/sec: React reconciles on every frame.',
    fix: 'references/performance.md#never-setstate-inside-ontick--draw',
    supersedes: 'manual-raf',
    pattern: /requestAnimationFrame/,
    contextPattern: STATE_UPDATE_CONTEXT,
  },
  {
    id: 'setstate-in-ontick',
    label: 'setState/dispatch inside a phase onTick/onDraw/draw callback',
    severity: 'critical',
    noise: 'normal',
    why: '60 re-renders/sec; write to refs or the DOM inside frame callbacks.',
    fix: 'references/performance.md#never-setstate-inside-ontick--draw',
    pattern: /\bonTick\s*[:=(]|\bonDraw\s*[:=(]|\bdraw\s*:/,
    contextPattern: STATE_UPDATE_CONTEXT,
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
  },
  {
    id: 'raw-io',
    label: 'Raw IntersectionObserver (not pooled)',
    severity: 'medium',
    noise: 'normal',
    why: 'Unpooled observer instances and manual cleanup leak over time.',
    fix: 'references/performance.md#observer-pooling',
    pattern: /new\s+IntersectionObserver/,
  },
  {
    id: 'raw-ro',
    label: 'Raw ResizeObserver (not pooled)',
    severity: 'medium',
    noise: 'normal',
    why: 'Unpooled observer instances and manual cleanup leak over time.',
    fix: 'references/performance.md#observer-pooling',
    pattern: /new\s+ResizeObserver/,
  },
  {
    id: 'raw-matchmedia',
    label: 'Raw matchMedia (not pooled)',
    severity: 'medium',
    noise: 'normal',
    why: 'Unpooled MediaQueryList subscriptions; phase pools them by query.',
    fix: 'references/use-media-query.md',
    pattern: /\bmatchMedia\s*\(/,
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
    // Only flag when the observer watches inline style mutations or reads
    // layout nearby. Structural (childList) and plain attribute observation
    // (e.g. a class watcher) are legitimate and skipped.
    contextPattern:
      /attributeFilter:\s*\[[^\]]*['"]style['"]|getBoundingClientRect|offsetWidth|offsetHeight|scrollWidth|scrollHeight|scrollTop|scrollLeft|clientWidth|clientHeight|getComputedStyle/,
  },
  {
    id: 'js-opacity-transform',
    label: 'JS-driven opacity/transform (may be CSS-only candidate)',
    severity: 'medium',
    noise: 'noisy',
    why: 'Often replaceable by a CSS transition, or needs phase for lifecycle.',
    fix: 'references/decision-guide.md#tier-1-css-only-no-js',
    pattern: /\.style\.(opacity|transform)\s*=/,
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
    // imports phase (its hooks handle it automatically).
    negativePattern: /prefers-reduced-motion|reducedMotion|from ['"]phase/,
    fileTypes: ['js', 'css'],
    // The gap is a property of the whole file, not of each animating line.
    perFile: true,
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
  },
  {
    id: 'manual-synced-ref',
    label: 'Manual synced ref (dedup: useSyncedRef offers a shorthand)',
    severity: 'dedup',
    noise: 'precise',
    why: 'Correct React idiom; useSyncedRef is a one-line shorthand.',
    fix: 'references/use-synced-ref.md',
    matcher: matchesSyncedRef,
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
  },
  {
    id: 'keyframes-layout-animation',
    label: 'Layout property animated inside @keyframes',
    severity: 'high',
    noise: 'normal',
    why: 'Layout + paint every frame, off the compositor.',
    fix: 'references/audit.md#step-15-css-loading-and-architecture-pass',
    matcher: matchesKeyframesLayoutProp,
    fileTypes: 'css',
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
  },
  {
    id: 'pointer-listener-layout-read',
    label: 'Pointer/mouse/touch move listener with layout read',
    severity: 'critical',
    noise: 'normal',
    why: 'A synchronous reflow per event; move events fire far above 60/sec.',
    fix: 'references/use-pointer.md',
    pattern:
      /addEventListener\s*\(\s*['"](?:pointermove|mousemove|touchmove)['"]/,
    contextPattern:
      /getBoundingClientRect|offsetWidth|offsetHeight|offsetTop|offsetLeft|scrollWidth|scrollHeight|scrollTop|scrollLeft|clientWidth|clientHeight/,
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
  },
  {
    id: 'when-visible-no-fallback',
    label: 'WhenVisible/WhenIdle without a sized fallback (layout shift)',
    severity: 'high',
    noise: 'noisy',
    why: 'Children are absent until triggered; an unsized mount causes CLS.',
    fix: 'references/rendering-recipes.md',
    matcher: matchesUngatedLazyMount,
    fileTypes: 'jsx',
  },
];

/** Severity display and ranking order, most severe first. */
export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'dedup'];

// --- Detection helpers ------------------------------------------------------
//
// Custom matchers: `(lines: string[], i: number) => boolean`.
// Called once per line per signal. Return true if line i should be reported.
// Must be pure (no side effects, no mutation of lines). Declared before
// SIGNALS because the catalog references them; grouped here with other
// detection-support constants for locality.

/**
 * Flags the manual synced-ref idiom that useSyncedRef shortens:
 *   const xRef = useRef(v);   // line i
 *   xRef.current = v;         // next non-blank line, same initializer
 *
 * Matching the same initializer keeps false positives near zero: useRef(null),
 * a different value, or a conditional write all miss.
 */
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

/** Always-on will-change-transform class; a ternary or && guard means toggled. */
function matchesPermanentWillChangeClass(lines, i) {
  if (!/\bwill-change-transform\b/.test(lines[i])) return false;
  return !/\?|&&/.test(lines[i]);
}

/**
 * Layout property inside a @keyframes block. Walks up through brace pairs
 * to distinguish keyframe declarations from ordinary rule declarations.
 * Handles single-line frames (`from { left: 0; }`): the property may follow
 * `{` or `;`, and the enclosing-block walk starts on the previous line, so
 * the frame's own brace never counts against the balance.
 */
function matchesKeyframesLayoutProp(lines, i) {
  if (
    !/(?:^|[{;])\s*(?:width|height|top|left|right|bottom|margin|padding|inset)[a-z-]*\s*:/.test(
      lines[i],
    )
  ) {
    return false;
  }
  let balance = 0;
  for (let j = i - 1; j >= 0; j--) {
    const line = lines[j];
    for (let k = line.length - 1; k >= 0; k--) {
      const ch = line[k];
      if (ch === '}') {
        balance++;
      } else if (ch === '{') {
        if (balance === 0) {
          if (/@keyframes/.test(line)) return true;
        } else {
          balance--;
        }
      }
    }
  }
  return false;
}

/**
 * WhenVisible/WhenIdle opening tag without a fallback prop. Reads up to 30
 * lines forward to capture multi-line JSX tags.
 */
function matchesUngatedLazyMount(lines, i) {
  const open = /<When(?:Visible|Idle)\b/.exec(lines[i]);
  if (!open) return false;
  let tag = '';
  for (let j = i; j < Math.min(lines.length, i + 30); j++) {
    const line = j === i ? lines[j].slice(open.index) : lines[j];
    tag += line + '\n';
    if (/(?<!=)>/.test(line)) break;
  }
  return !/\bfallback\s*=/.test(tag);
}

// --- Internal ---------------------------------------------------------------

const FILE_TYPE_EXTENSIONS = {
  js: new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']),
  css: new Set(['.css', '.scss', '.sass', '.less']),
};

const JSX_EXTENSIONS = new Set(['.tsx', '.jsx']);

// Agent-config directories, vendored tooling, and this skill's own eval
// fixtures contain code nobody will edit or deliberately bad example code;
// scanning them buries real findings.
const EXCLUDED_PATHS =
  /node_modules|\.spec\.|\.test\.|\.stories\.|__tests__|__mocks__|\.agents\/|\.claude\/|\.cursor\/|\.yarn\/|skills\/phase\/evals\//;

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
  '.agents',
  '.claude',
  '.cursor',
  '.github',
  '.yarn',
]);

const SKIP_FILES = /\.min\.|\.d\.ts$|\.d\.mts$/;

const MAX_LISTED_PER_SIGNAL = 20;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Accepts both `phase-scan-ignore id` and `phase-scan-ignore: id`.
const IGNORE_DIRECTIVE = /phase-scan-ignore:?\s+([a-z-]+)(?:\s+--\s*(\S.*))?/;

function collectSuppressions(relPath, lines, diag) {
  const suppressions = new Map();
  for (let i = 0; i < lines.length; i++) {
    const directive = IGNORE_DIRECTIVE.exec(lines[i]);
    if (!directive) continue;
    if (!directive[2]) {
      if (diag) {
        diag.warnings.push(
          `${relPath}:${i + 1}  phase-scan-ignore is missing a reason (use: phase-scan-ignore <signal-id> -- <reason>); directive ignored`,
        );
      }
      continue;
    }
    if (!SIGNALS.some((s) => s.id === directive[1])) {
      if (diag) {
        diag.warnings.push(
          `${relPath}:${i + 1}  phase-scan-ignore names unknown signal '${directive[1]}'; directive ignored`,
        );
      }
      continue;
    }
    for (const target of [i, i + 1]) {
      if (!suppressions.has(target)) suppressions.set(target, new Set());
      suppressions.get(target).add(directive[1]);
    }
  }
  return suppressions;
}

function suppressedAnywhere(suppressions, signalId) {
  for (const ids of suppressions.values()) {
    if (ids.has(signalId)) return true;
  }
  return false;
}

/** Runs one signal over a file's lines, honoring suppressions and perFile. */
function scanSignal(signal, lines, relPath, suppressions, diag) {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (signal.matcher) {
      if (!signal.matcher(lines, i)) continue;
    } else {
      if (!signal.pattern.test(line)) continue;

      if (signal.contextPattern) {
        const context = lines.slice(Math.max(0, i - 5), i + 6).join('\n');
        if (!signal.contextPattern.test(context)) continue;
      }
    }

    // Per-file signals are suppressed at the file level (see scanFile), not
    // per line, so a directive on the first matching line cannot merely
    // shift the finding to the next one.
    if (!signal.perFile && suppressions.get(i)?.has(signal.id)) {
      if (diag) diag.suppressed++;
      continue;
    }

    findings.push(makeFinding(signal, relPath, i + 1, line));

    if (signal.perFile) break;
  }
  return findings;
}

function toPosix(path) {
  return path.split('\\').join('/');
}

// Best-effort environment detection so recommendations can account for
// rendering semantics (see references/audit.md Step 2.5). Walks up from the
// target toward the project root (nearest package.json or .git), so scanning
// a subdirectory of a Next.js app still finds its config. File-content
// markers work at any depth regardless.
function detectNextConfig(root, context) {
  let dir = root;
  for (let depth = 0; depth < 10; depth++) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    const config = entries.find((e) =>
      /^next\.config\.(js|mjs|ts|cjs)$/.test(e),
    );
    if (config) {
      context.framework = 'next';
      try {
        const content = readFileSync(join(dir, config), 'utf8');
        if (/\b(?:ppr|experimental_ppr|cacheComponents)\s*[:=]/.test(content)) {
          context.ppr = true;
        }
      } catch {
        /* unreadable config */
      }
      return;
    }
    // Project root without a Next config: stop rather than escape into an
    // unrelated parent project.
    if (entries.includes('package.json') || entries.includes('.git')) return;
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

function updateContext(rel, content, context) {
  if (/(^|\/)app\/.*(page|layout|template)\.[jt]sx?$/.test(rel)) {
    context.appRouter = true;
    context.framework ??= 'next';
  }
  // The route-segment config shape, not the bare token: prose or tooling
  // that merely mentions experimental_ppr must not count as detection.
  if (/\bexport\s+const\s+experimental_ppr\s*=\s*true\b/.test(content)) {
    context.ppr = true;
    context.framework ??= 'next';
  }
  if (/^\s*['"]use client['"]/m.test(content)) {
    context.clientComponents++;
  }
}

function skillVersion() {
  try {
    const metadataPath = fileURLToPath(
      new URL('../metadata.json', import.meta.url),
    );
    return JSON.parse(readFileSync(metadataPath, 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

function extOf(path) {
  const dot = path.lastIndexOf('.');
  if (dot <= path.lastIndexOf('/')) return null;
  // Lowercased so case-insensitive filesystems (macOS, Windows) match.
  return path.slice(dot).toLowerCase();
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

/** Drops a finding when a more specific signal fired on the same line. */
function dedup(findings) {
  const supersededLines = new Map();
  for (const signal of SIGNALS) {
    if (!signal.supersedes) continue;
    for (const f of findings) {
      if (f.signal === signal.id) {
        if (!supersededLines.has(signal.supersedes)) {
          supersededLines.set(signal.supersedes, new Set());
        }
        supersededLines.get(signal.supersedes).add(f.line);
      }
    }
  }
  if (supersededLines.size === 0) return findings;
  return findings.filter((f) => {
    const lines = supersededLines.get(f.signal);
    return !lines || !lines.has(f.line);
  });
}

function walk(dir) {
  const results = [];
  try {
    // Sorted so output (and committed goldens) are deterministic across
    // filesystems.
    const entries = readdirSync(dir).toSorted();
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
    /* skip inaccessible directories */
  }
  return results;
}

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

const USAGE = `Usage: node scan.mjs [options] <target> [...targets]

Scans directories or files for animation anti-pattern candidates.
Findings are candidates, not verdicts: classify each against
references/audit.md before recommending a change.

Targets   directories or individual files (default: current directory)

Options
  --json               emit machine-readable JSON (schemaVersion 1)
  --fail-on <severity> exit 1 if any finding is at or above the given
                       severity (critical | high | medium); default is
                       exit 0 regardless of findings (advisory)
  -h, --help           show this help

Suppression
  A comment \`phase-scan-ignore <signal-id> -- <reason>\` suppresses that
  signal on the same and the next line. The reason is mandatory.

Exit codes: 0 = scan completed, 1 = --fail-on threshold hit, 2 = usage error.`;

function parseArgs(argv) {
  const opts = { json: false, help: false, failOn: null, targets: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--fail-on') {
      const value = argv[++i];
      if (value !== 'critical' && value !== 'high' && value !== 'medium') {
        throw new Error(
          `--fail-on expects critical, high, or medium (got: ${value ?? 'nothing'})`,
        );
      }
      opts.failOn = value;
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      opts.targets.push(arg);
    }
  }
  return opts;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`);
    process.exit(2);
  }

  if (opts.help) {
    console.log(USAGE);
    return;
  }

  if (opts.targets.length === 0) opts.targets.push('.');
  for (const target of opts.targets) {
    try {
      lstatSync(target);
    } catch {
      console.error(`target does not exist: ${target}\n\n${USAGE}`);
      process.exit(2);
    }
  }

  const result = scanTargets(opts.targets);

  for (const warning of result.warnings) {
    console.error(`warning: ${warning}`);
  }

  if (opts.json) {
    console.log(JSON.stringify(formatJson(result), null, 2));
  } else {
    console.log(formatText(result));
  }

  if (opts.failOn) {
    const threshold = SEVERITY_ORDER.indexOf(opts.failOn);
    const hit = result.findings.some(
      (f) =>
        f.severity !== 'dedup' &&
        SEVERITY_ORDER.indexOf(f.severity) <= threshold,
    );
    if (hit) process.exit(1);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
