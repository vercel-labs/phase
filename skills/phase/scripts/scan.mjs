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
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Public API -------------------------------------------------------------

/**
 * Scans one or more directories or files. Returns all findings plus scan
 * metadata. Paths inside a target are reported relative to that target.
 */
export function scanTargets(paths, options = {}) {
  const findings = [];
  const diag = newDiag();
  const context = {
    framework: null,
    appRouter: false,
    ppr: false,
    clientComponents: 0,
    evidence: [],
  };
  const excluded = (options.exclude ?? []).map(toPathMatcher);
  // Overlapping targets (`scan.mjs src src/components`) would otherwise
  // report the same file twice and double every count.
  const seen = new Set();
  const probedRoots = new Set();

  for (const target of paths) {
    const root = resolve(target);
    const stat = lstatSync(root);
    const base = stat.isDirectory() ? root : dirname(root);
    const files = stat.isDirectory() ? walk(root, diag) : [root];

    // Also for file targets: `git diff --name-only | xargs scan.mjs` is the
    // workflow most likely to run against a Next.js app, and it is exactly
    // where a missing context stamp would hide the blast-radius warning.
    const configRoot = stat.isDirectory() ? root : base;
    if (!probedRoots.has(configRoot)) {
      probedRoots.add(configRoot);
      detectNextConfig(configRoot, context);
    }

    for (const filePath of files) {
      if (seen.has(filePath)) continue;
      seen.add(filePath);

      // File targets keep the path as the caller gave it, so directory-based
      // exclusions (__tests__, node_modules) still apply in diff-scoped scans.
      const rel = stat.isDirectory()
        ? toPosix(relative(base, filePath))
        : toPosix(target).replace(/^\.\//, '');

      // The walker already applies these; a file target bypasses it, and a
      // generated .d.ts or .min.js in a diff should be skipped either way.
      if (SKIP_FILES.test(rel)) {
        diag.skipped.generated++;
        continue;
      }

      if (excluded.some((matches) => matches(rel))) {
        diag.skipped.excluded++;
        continue;
      }

      let content;
      try {
        content = readFileSync(filePath, 'utf8');
      } catch {
        diag.skipped.unreadable++;
        continue;
      }

      // Excluded paths (tests, fixtures, agent config) must not poison
      // environment detection either.
      if (!EXCLUDED_PATHS.test(rel)) updateContext(rel, content, context);
      findings.push(...scanFile(rel, content, diag));
    }
  }

  return {
    targets: paths,
    // Files actually analyzed. Anything opened but not analyzed is counted
    // in `filesSkipped`: a clean verdict over unexamined code is the one
    // failure this report must never produce.
    filesScanned: diag.analyzed,
    filesSkipped: diag.skipped,
    linesSkipped: diag.linesSkipped,
    findings,
    suppressed: diag.suppressed,
    warnings: diag.warnings,
    context,
  };
}

/** Diagnostics sink shared by scanTargets, walk, and scanFile. */
export function newDiag() {
  return {
    suppressed: 0,
    warnings: [],
    analyzed: 0,
    linesSkipped: 0,
    skipped: {
      excluded: 0,
      unsupported: 0,
      generated: 0,
      unreadable: 0,
      unreadableDirs: 0,
    },
  };
}

/**
 * Scans a single file's content. The relative path determines file-type
 * filtering and path-based exclusions. Returns findings for every signal
 * that fires. Pass a diag object ({ suppressed, warnings }) to collect
 * suppression counts and directive warnings.
 */
export function scanFile(relPath, content, diag = null) {
  if (EXCLUDED_PATHS.test(relPath)) {
    if (diag) diag.skipped.excluded++;
    return [];
  }

  const ext = extOf(relPath);
  const type = typeOf(ext);
  if (type === null) {
    if (diag) diag.skipped.unsupported++;
    return [];
  }

  const findings = [];
  const lines = content.split(/\r?\n/);
  const uncommentedLines = maskComments(lines);
  const codeLines = maskStrings(uncommentedLines);
  const uncommentedContent = uncommentedLines.join('\n');
  const codeContent = codeLines.join('\n');

  if (diag) diag.analyzed++;

  // Generated content — minified bundles, inlined data URIs, i18n blobs —
  // lives on lines no human wrote and no report could usefully quote. Drop
  // the line, not the file: an average-length heuristic discarded whole
  // files of real source over a single embedded blob.
  const overlong = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > MAX_LINE_LENGTH) overlong.add(i);
  }
  if (diag) diag.linesSkipped += overlong.size;

  const suppressions = collectSuppressions(relPath, commentText(lines), diag);

  for (const signal of SIGNALS) {
    if (!signalAppliesTo(signal, type, ext)) continue;

    if (
      signal.negativePattern &&
      signal.negativePattern.test(
        signal.negativeCodeOnly ? codeContent : uncommentedContent,
      )
    ) {
      continue;
    }

    const signalFindings = scanSignal(
      signal,
      lines,
      uncommentedLines,
      codeLines,
      relPath,
      suppressions,
      overlong,
      type,
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
export function formatJson(result, limit = null) {
  const counts = countBySeverity(result.findings);
  const findings =
    limit === null ? result.findings : result.findings.slice(0, limit);
  return {
    schemaVersion: 1,
    skillVersion: skillVersion(),
    targets: result.targets,
    summary: {
      filesScanned: result.filesScanned,
      filesSkipped: result.filesSkipped ?? null,
      linesSkipped: result.linesSkipped ?? 0,
      total: result.findings.length,
      sites: countSites(result.findings),
      returned: findings.length,
      actionable: counts.critical + counts.high + counts.medium,
      dedup: counts.dedup,
      perFrame: result.findings.filter((f) => f.execution === 'per-frame')
        .length,
      suppressed: result.suppressed ?? 0,
      bySeverity: {
        critical: counts.critical,
        high: counts.high,
        medium: counts.medium,
      },
    },
    hotspots: rankHotspots(result.findings, fileWeights(result.findings)).map(
      ({ file, items }) => ({ file, count: items.length }),
    ),
    context: result.context ?? null,
    warnings: result.warnings ?? [],
    findings,
  };
}

/** Renders a scan result as human-readable text grouped by severity. */
export function formatText(result) {
  const weight = fileWeights(result.findings);
  const out = [...renderHotspots(result.findings, weight)];

  const bySeverity = groupBySeverity(result.findings);
  for (const severity of SEVERITY_ORDER) {
    const group = bySeverity.get(severity);
    if (!group || group.size === 0) continue;

    out.push(
      '',
      severity === 'dedup'
        ? '## dedup (correct code, optional cleanup)'
        : `## ${severity}`,
    );
    for (const [id, items] of group) {
      out.push(...renderSignal(id, items, weight));
    }
  }

  out.push(...renderSummary(result));

  // The scan is the floor of an audit. Saying so only when there are
  // findings gets it backwards: a green check with no next step is exactly
  // where an audit stops early.
  if (result.filesScanned > 0) out.push(...BEYOND_THE_SCAN);

  // Coverage the scan did not have. Stating it is the difference between
  // "clean" and "clean over the part I could read".
  const gaps = coverageGaps(result);
  if (gaps) out.push('', `⚠ Incomplete coverage: ${gaps}`);

  out.push(...renderContext(result.context));

  return out.join('\n');
}

/**
 * Findings are per line, but the work is per file: on a real app the top
 * three files held 38% of everything, and one of them was a single hook
 * whose seven candidates across four signals were one rewrite. Nothing in
 * a severity-grouped list says so.
 */
function renderHotspots(findings, weight) {
  const hotspots = rankHotspots(findings, weight);
  if (hotspots.length === 0 || findings.length < MIN_FINDINGS_FOR_ROLLUP) {
    return [];
  }
  const out = ['', '## hotspots (most candidates per file)'];
  for (const { file, items } of hotspots) {
    out.push(
      `  ${String(items.length).padStart(3)}  ${file}`,
      `       ${summarizeSignals(items)}`,
    );
  }
  return out;
}

function renderSignal(id, items, weight) {
  const signal = SIGNALS.find((s) => s.id === id);
  const allPerFrame = items.every((f) => f.execution === 'per-frame');
  const out = [
    '',
    `${id} — ${signal.label} (${items.length}${allPerFrame ? ', all per-frame' : ''}) · noise: ${signal.noise}`,
    `  why: ${signal.why}`,
    `  use: ${signal.replacement}`,
    `  read: ${signal.fix}`,
  ];

  const ordered = rankFindings(items, weight);
  const shown = selectListed(ordered);

  // Sub-headings only earn their line when the listing actually mixes
  // groups; a lone heading over one bucket is noise.
  const mixed = new Set(shown.map((f) => f.execution)).size > 1;
  let lastExecution;
  for (const item of shown) {
    if (mixed && item.execution !== lastExecution) {
      out.push(`  ${EXECUTION_HEADINGS[item.execution ?? 'none']}`);
      lastExecution = item.execution;
    }
    out.push(`  ${item.file}:${item.line}  ${item.text}`);
  }
  if (ordered.length > shown.length) {
    // Point at the scoped drill-down, not at bare --json: a storm's full
    // JSON is tens of thousands of tokens, which is the problem this cap
    // exists to avoid.
    out.push(
      `  … and ${ordered.length - shown.length} more (--json --signal ${id} for the full list)`,
    );
  }
  return out;
}

/**
 * The lines to list for one signal. Capped overall, and capped again per
 * file: the rollup already says one file carries 51 of these, so spending
 * every slot on it would hide everywhere else they occur.
 */
function selectListed(ordered) {
  const shown = [];
  const perFile = new Map();
  for (const item of ordered) {
    if (shown.length >= MAX_LISTED_PER_SIGNAL) break;
    const seenHere = perFile.get(item.file) ?? 0;
    if (seenHere >= MAX_LISTED_PER_FILE) continue;
    perFile.set(item.file, seenHere + 1);
    shown.push(item);
  }
  return shown;
}

function renderSummary(result) {
  const counts = countBySeverity(result.findings);
  const actionable = counts.critical + counts.high + counts.medium;
  const suppressed = result.suppressed ?? 0;

  // A clean result must be distinguishable from scanning nothing: an empty
  // or mistyped target reading as "no findings" would be false confidence.
  // filesScanned counts files actually analyzed, never files merely opened.
  if (result.filesScanned === 0) {
    return ['', '⚠ No scannable files found. Check the target path.'];
  }
  if (result.findings.length === 0 && suppressed === 0) {
    return [
      '',
      `✓ No animation anti-pattern candidates found (${result.filesScanned} files scanned).`,
    ];
  }

  const suppressedNote = suppressed > 0 ? `, ${suppressed} suppressed` : '';
  // Findings are not problems: one rAF loop reports twice (the call and the
  // recursive call), and a line can carry two signals.
  const sites = countSites(result.findings);
  const perFrame = result.findings.filter(
    (f) => f.execution === 'per-frame',
  ).length;
  return [
    '',
    '─────────────────────────────────────────',
    `Scanned ${result.filesScanned} files.`,
    `Total: ${actionable} actionable (${counts.critical} critical, ${counts.high} high, ${counts.medium} medium), ${counts.dedup} dedup${suppressedNote}.`,
    `${result.findings.length} findings on ${sites} distinct lines; ${perFrame} sit in a per-frame path (a frame loop, observer, or move handler runs them) and cost the most.`,
    'Next: start with the hotspots above, then classify each candidate against the decision ladder (references/audit.md Step 2). Findings are candidates, not verdicts.',
    'Noise tiers: precise = trust it, normal = verify quickly, noisy = verify before recommending.',
  ];
}

/**
 * Environment facts change what a safe recommendation looks like; hand them
 * to the reader instead of relying on it to go looking.
 */
function renderContext(context) {
  if (context?.framework !== 'next') return [];
  const bits = ['Next.js'];
  if (context.appRouter) bits.push('App Router');
  if (context.ppr) bits.push('PPR');
  // Name the evidence: in a monorepo the marker can come from an example
  // app, and a bare assertion gives the reader no way to notice.
  const evidence = context.evidence?.length
    ? ` (from ${context.evidence.join(', ')})`
    : '';
  return [
    '',
    `Context: ${bits.join(' + ')} detected${evidence}. Rendering recommendations must pass the blast-radius check (references/audit.md Step 2.5) before changing SSR content or mount timing.`,
  ];
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
// replacement: the concrete answer, so a block is actionable without
//   opening the reference first.
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
// The lookbehind skips vendor-prefixed forms (-webkit-transition:): prefixed
// declarations always ship alongside the unprefixed one, which would count
// each logical declaration up to five times.
// The separator must not be able to match empty (`\s*,?\s*` could split one
// space several ways): inside a quantifier that ambiguity makes a failing
// match exponential in the token count. A 124-char line took 27 seconds.
const BARE_DURATION_TRANSITION =
  /(?<![\w-])transition:\s*[\d.]+m?s(?:(?:\s*,\s*|\s+)(?:[\d.]+m?s|ease[\w-]*|linear|step[\w-]*|steps\([^)]*\)|cubic-bezier\([^)]*\)))*\s*(?:;|!|$)/;

const NON_COMPOSITOR_TRANSITION = new RegExp(
  `${/(?<![\w-])transition(?:-property)?:\s*(?:all\b|[^;{}]*\b(?:width|height|top|left|right|bottom|margin|padding|inset)\b)/.source}|${BARE_DURATION_TRANSITION.source}`,
);

export const SIGNALS = [
  {
    id: 'manual-raf',
    replacement:
      'CSS/WAAPI if browser-animatable; otherwise useLoop/useCanvas for lifecycle + cleanup',
    label: 'Manual requestAnimationFrame loop',
    severity: 'high',
    noise: 'noisy',
    why: 'No visibility pausing, no shared clock, no cleanup.',
    fix: 'references/audit.md#common-replacements',
    pattern: /requestAnimationFrame/,
    codeOnly: true,
  },
  {
    id: 'setstate-in-raf',
    replacement:
      'useLoop writing to a ref or the DOM; useTween for one value into render',
    label: 'setState/dispatch inside rAF callback',
    severity: 'critical',
    noise: 'normal',
    why: '60 re-renders/sec: React reconciles on every frame.',
    fix: 'references/performance.md#never-setstate-inside-ontick--draw',
    supersedes: 'manual-raf',
    pattern: /requestAnimationFrame/,
    contextPattern: STATE_UPDATE_CONTEXT,
    codeOnly: true,
    contextLines: 30,
    contextScope: 'block',
  },
  {
    id: 'setstate-in-ontick',
    replacement:
      'write to a ref or the DOM in the callback; lift state changes out of the frame',
    label: 'setState/dispatch inside a phase onTick/onDraw/draw callback',
    severity: 'critical',
    noise: 'normal',
    why: '60 re-renders/sec; write to refs or the DOM inside frame callbacks.',
    fix: 'references/performance.md#never-setstate-inside-ontick--draw',
    pattern: /\bonTick\s*[:=(]|\bonDraw\s*[:=(]|\bdraw\s*:/,
    contextPattern: STATE_UPDATE_CONTEXT,
    codeOnly: true,
    contextLines: 30,
    contextScope: 'block',
  },
  {
    id: 'forced-reflow',
    replacement:
      'useSize (ResizeObserver, async) or cache the geometry and re-read on resize',
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
    replacement: 'useSight or useLifecycle (pooled IntersectionObserver)',
    label: 'Raw IntersectionObserver (not pooled)',
    severity: 'medium',
    noise: 'normal',
    why: 'Unpooled observer instances and manual cleanup leak over time.',
    fix: 'references/performance.md#observer-pooling',
    pattern: /new\s+IntersectionObserver/,
  },
  {
    id: 'raw-ro',
    replacement: 'useSize (pooled ResizeObserver)',
    label: 'Raw ResizeObserver (not pooled)',
    severity: 'medium',
    noise: 'normal',
    why: 'Unpooled observer instances and manual cleanup leak over time.',
    fix: 'references/performance.md#observer-pooling',
    pattern: /new\s+ResizeObserver/,
  },
  {
    id: 'raw-matchmedia',
    replacement:
      'useMediaQuery, or usePrefersReducedMotion for the motion query',
    label: 'Raw matchMedia (not pooled)',
    severity: 'medium',
    noise: 'normal',
    why: 'Unpooled MediaQueryList subscriptions; phase pools them by query.',
    fix: 'references/use-media-query.md',
    pattern: /\bmatchMedia\s*\(/,
  },
  {
    id: 'mutationobserver-layout',
    replacement: 'useMutation (rAF-batched); useSize/useSight for geometry',
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
    replacement:
      'CSS/WAAPI if browser-animatable; useLoop only for required live per-frame JS',
    label: 'JS-driven opacity/transform (may be browser-driven)',
    severity: 'medium',
    noise: 'noisy',
    why: 'May be browser-driven; inspect whether JavaScript must compute live frames.',
    fix: 'references/decision-guide.md#tier-1-browser-driven-css-or-waapi',
    pattern: /\.style\.(opacity|transform)\s*=/,
  },
  {
    id: 'missing-reduced-motion',
    replacement:
      'a prefers-reduced-motion media query, or a phase hook (handles it automatically)',
    label: 'Animation without reduced-motion check',
    severity: 'critical',
    noise: 'noisy',
    why: 'Accessibility gap: motion plays for users who asked for none.',
    fix: 'references/performance.md#reduced-motion-by-default',
    // `animation:(?!\s*none)` keeps `animation: none` (motion disabled) out.
    pattern: /requestAnimationFrame|@keyframes|animation:(?!\s*none\b)/,
    // Suppress only when the file handles reduced motion. Importing phase is
    // not enough: a raw rAF in the same file still bypasses its lifecycle.
    negativePattern: /prefers-reduced-motion|reducedMotion/,
    negativeCodeOnly: true,
    fileTypes: ['js', 'css'],
    codeOnly: true,
    // The gap is a property of the whole file, not of each animating line.
    perFile: true,
  },
  {
    id: 'background-animation',
    replacement:
      'CSS/WAAPI when predetermined and keyframe-friendly; otherwise useLoop with elapsed steps',
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
    replacement: 'useSyncedRef(value)',
    label: 'Manual synced ref (dedup: useSyncedRef offers a shorthand)',
    severity: 'dedup',
    noise: 'precise',
    why: 'Correct React idiom; useSyncedRef is a one-line shorthand.',
    fix: 'references/use-synced-ref.md',
    matcher: matchesSyncedRef,
  },
  {
    id: 'manual-stable-callback',
    replacement: 'useStableCallback(fn)',
    label:
      'Manual stable callback (dedup: useStableCallback offers a shorthand)',
    severity: 'dedup',
    noise: 'precise',
    why: 'Correct React idiom; useStableCallback is a one-line shorthand.',
    fix: 'references/use-stable-callback.md',
    matcher: matchesStableCallback,
    fileTypes: 'jsx',
  },
  // --- CSS/DOM-scale signals ---
  {
    id: 'global-has-selector',
    replacement:
      'scope the rule to a subtree, or drive it from a data attribute',
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
    replacement: 'toggle will-change with animation state, or drop it',
    label: 'Permanent will-change (wastes GPU memory when idle)',
    severity: 'medium',
    noise: 'normal',
    why: 'A GPU layer is held even while nothing animates.',
    fix: 'references/performance.md#will-change-only-while-animating',
    matcher: matchesPermanentWillChange,
    fileTypes: 'css',
  },
  {
    id: 'non-compositor-animation',
    replacement: 'name the properties and transition transform/opacity',
    label:
      'Animating a non-compositor property (layout/paint, not transform/opacity)',
    severity: 'high',
    noise: 'normal',
    why: 'Layout + paint every frame, off the compositor.',
    fix: 'references/audit.md#step-15-css-loading-and-architecture-pass',
    // `transition: all`, a transition naming a layout property, or a
    // bare-duration shorthand (names no property, so it animates `all`).
    // transform/opacity-only transitions do not match. Vendor-prefixed
    // forms are skipped so a prefixed block counts once, not five times.
    matcher: matchesNonCompositorTransition,
    fileTypes: 'css',
  },
  {
    id: 'keyframes-layout-animation',
    replacement:
      'keyframe transform/opacity; grid-template-rows for expand/collapse',
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
    replacement:
      'useSize or useMediaQuery for size, useScroll for scroll position',
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
    replacement: 'usePointer (one rAF-batched read per frame, not per event)',
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
    replacement: 'one useMutation with a coalesced callback',
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
    replacement: 'name the properties: transition-colors, transition-transform',
    label: 'Tailwind transition-all class (animates layout properties)',
    severity: 'high',
    noise: 'noisy',
    why: 'Transitions whatever changes, including layout, off the compositor.',
    fix: 'references/audit.md#step-15-css-loading-and-architecture-pass',
    pattern: /\btransition-all\b/,
    // Not jsx-only: in a Tailwind codebase most class strings live in
    // cva/tailwind-variants modules and clsx helpers, which are plain .ts.
  },
  {
    id: 'tailwind-permanent-will-change',
    replacement: 'toggle the class with animation state, or drop it',
    label: 'Tailwind will-change-transform class not toggled with state',
    severity: 'medium',
    noise: 'noisy',
    why: 'A GPU layer is held even while nothing animates.',
    fix: 'references/performance.md#will-change-only-while-animating',
    matcher: matchesPermanentWillChangeClass,
  },
  // --- Phase-usage signals ---
  {
    id: 'reduced-motion-ignored',
    replacement: "reducedMotion: 'respect' unless the motion is non-decorative",
    label: "reducedMotion: 'ignore' (bypasses the user preference)",
    severity: 'medium',
    noise: 'precise',
    why: 'Only justified for non-decorative motion (data viz, games).',
    fix: 'references/performance.md#reduced-motion-by-default',
    pattern: /reducedMotion:\s*['"]ignore['"]/,
  },
  {
    id: 'core-primitive-in-component',
    replacement: 'the matching hook (useLoop, useSight, useLifecycle)',
    label: 'Core phase primitive in a component (hook likely fits better)',
    severity: 'medium',
    noise: 'noisy',
    why: 'Hooks manage refs, teardown, and enabled automatically.',
    fix: 'references/decision-guide.md#common-mistakes',
    pattern: /\bcreate(?:Loop|Ticker|Lifecycle|Sight)\s*\(/,
    fileTypes: 'jsx',
  },
  {
    id: 'phase-loop-browser-keyframes',
    replacement:
      'CSS or WAAPI keyframes for playback; useLifecycle only to play/pause',
    label: 'Phase loop may be a browser-keyframe candidate',
    severity: 'medium',
    noise: 'noisy',
    why: 'An elapsed-only transform/opacity timeline may not need per-frame JS.',
    fix: 'references/decision-guide.md#browser-driven-timelines-css-or-waapi',
    matcher: matchesPhaseLoopBrowserKeyframes,
    perFile: true,
  },
  {
    id: 'when-visible-no-fallback',
    replacement: 'a fallback sized to the final content height',
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
// How far a matcher looks for the bounds of the enclosing CSS rule.
const BLOCK_SCAN_LINES = 20;

// What makes a candidate expensive is how often it runs. The same layout
// read is a per-frame stall inside a move handler and a non-event in a
// click handler, and severity alone cannot tell them apart: on a canvas
// app, 181 of 182 `forced-reflow` candidates had no frame driver anywhere
// near them, yet all of them ranked critical.
//
// This only ranks. A read called indirectly from a frame loop looks
// incidental here and is still reported, just below the ones that are
// visibly per-frame — a heuristic may reorder findings, never hide them.
const FRAME_DRIVER =
  /requestAnimationFrame|\bonTick\b|\bonDraw\b|\bdraw\s*:|use(?:Loop|Canvas|Tween|Pointer|Scroll)\s*\(|create(?:Loop|Ticker|Pointer|Scroll)\s*\(|addEventListener\s*\(\s*['"](?:pointermove|mousemove|touchmove|scroll|resize|wheel|drag)|new\s+(?:Intersection|Resize|Mutation)Observer|setInterval\s*\(/;

const FRAME_DRIVER_WINDOW = 6;
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

/**
 * `will-change` that no state gates. The gate lives in the enclosing rule,
 * not the file: a `:hover` rule elsewhere in the stylesheet says nothing
 * about this declaration, and a whole-file negative pattern silenced the
 * signal on essentially every production stylesheet.
 */
function matchesPermanentWillChange(lines, i) {
  if (!/will-change:(?!\s*auto\b)/.test(lines[i])) return false;
  // A play-state toggle anywhere in the same block means it is managed.
  for (let j = i + 1; j < lines.length && j - i < BLOCK_SCAN_LINES; j++) {
    if (/animation-play-state/.test(lines[j])) return false;
    if (lines[j].includes('}')) break;
  }
  for (let j = i; j >= 0 && i - j < BLOCK_SCAN_LINES; j--) {
    if (/animation-play-state/.test(lines[j])) return false;
    // The nearest opening brace carries this declaration's selector.
    if (lines[j].includes('{')) {
      return !/\[data-|\[aria-|:hover|:focus|:active/.test(lines[j]);
    }
  }
  return true;
}

/** Matches a complete transition declaration, including multiline values. */
function matchesNonCompositorTransition(lines, i) {
  if (!/(?<![\w-])transition(?:-property)?:\s*/.test(lines[i])) return false;

  let declaration = lines[i];
  for (
    let j = i + 1;
    j < lines.length && j <= i + 10 && !/[;}]/.test(declaration);
    j++
  ) {
    declaration += ` ${lines[j].trim()}`;
  }
  return NON_COMPOSITOR_TRANSITION.test(declaration);
}

/**
 * The stable-callback idiom that useStableCallback shortens: a useCallback
 * with empty deps whose body calls through a ref, so the identity never
 * changes while the behavior stays current.
 *
 * Requiring all three parts (useCallback, the ref call, empty deps) keeps
 * this off ordinary memoized callbacks.
 */
function matchesStableCallback(lines, i) {
  if (!/useCallback\s*(?:<[^>]*>)?\s*\(/.test(lines[i])) return false;
  const window = lines.slice(i, i + 8).join('\n');
  return (
    /\.current\s*(?:\?\.|\.call|\.apply)?\s*\(/.test(window) &&
    // A trailing comma and newline are how a formatter writes the deps
    // array on its own line.
    /\[\s*\]\s*,?\s*\)/.test(window)
  );
}

/** Always-on will-change-transform class; a ternary or && guard means toggled. */
function matchesPermanentWillChangeClass(lines, i) {
  if (!/\bwill-change-transform\b/.test(lines[i])) return false;
  return !/\?|&&/.test(lines[i]);
}

/**
 * A phase loop whose visible output may be fully describable up front as
 * browser keyframes. This is deliberately noisy: the audit must still verify
 * that the timeline has no live inputs, physics, layout reads, or required JS
 * side effects. The signal exists to force that cheaper-tier question.
 */
function matchesPhaseLoopBrowserKeyframes(lines, i) {
  if (!/\b(?:useLoop|createLoop)(?:\s*<[^;{]*>)?\s*\(/.test(lines[i])) {
    return false;
  }

  const source = lines.join('\n');
  const derivesFromElapsed = /\bframe\.elapsed\b/.test(source);
  const writesKeyframeFriendlyOutput =
    /\.style\.(?:opacity|transform)\s*=|\.style\.setProperty\(\s*['"](?:opacity|transform)['"]|\.setAttribute\(\s*['"](?:opacity|transform)['"]|\.set(?:Translate|Scale|Rotate|SkewX|SkewY)\s*\(/.test(
      source,
    );

  return derivesFromElapsed && writesKeyframeFriendlyOutput;
}

/**
 * Layout property inside a @keyframes block. Handles single-line frames
 * (`from { left: 0; }`) and fully inlined blocks
 * (`@keyframes k { from { left: 0; } }`), where the at-rule sits on the
 * property's own line.
 *
 * The enclosing @keyframes ranges are computed once per file in a single
 * forward pass (see keyframeRanges); walking braces backwards from every
 * candidate line made this quadratic in file size — 1.4s on 4k lines.
 */
function matchesKeyframesLayoutProp(lines, i) {
  if (
    !/(?:^|[{;])\s*(?:width|height|top|left|right|bottom|margin|padding|inset)[a-z-]*\s*:/.test(
      lines[i],
    )
  ) {
    return false;
  }
  return keyframeRanges(lines).has(i);
}

// Memoized per lines array: scanSignal calls the matcher once per line, and
// every call would otherwise rebuild the same map.
const keyframeRangeCache = new WeakMap();

/** Line indices that sit inside (or open) a @keyframes block. */
function keyframeRanges(lines) {
  const cached = keyframeRangeCache.get(lines);
  if (cached) return cached;

  const inside = new Set();
  let depth = 0;
  let keyframesDepth = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opensKeyframes =
      keyframesDepth === -1 && /@(?:-\w+-)?keyframes/.test(line);
    if (opensKeyframes) keyframesDepth = depth;
    if (keyframesDepth !== -1) inside.add(i);

    for (let k = 0; k < line.length; k++) {
      if (line[k] === '{') {
        depth++;
      } else if (line[k] === '}') {
        depth--;
        if (keyframesDepth !== -1 && depth <= keyframesDepth) {
          keyframesDepth = -1;
        }
      }
    }
  }

  keyframeRangeCache.set(lines, inside);
  return inside;
}

/**
 * WhenVisible/WhenIdle opening tag without a fallback prop. Reads up to 30
 * lines forward to capture multi-line JSX tags.
 *
 * The tag ends at the first `>` outside a prop expression: a comparison in
 * a prop (`rootMargin={a > b ? x : y}`) used to end it early and hide a
 * `fallback` declared further down.
 */
function matchesUngatedLazyMount(lines, i) {
  const open = /<When(?:Visible|Idle)\b/.exec(lines[i]);
  if (!open) return false;
  let tag = '';
  let depth = 0;
  for (let j = i; j < Math.min(lines.length, i + 30); j++) {
    const line = j === i ? lines[j].slice(open.index) : lines[j];
    tag += `${line}\n`;
    let closed = false;
    for (let k = 0; k < line.length; k++) {
      const ch = line[k];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0 && line[k - 1] !== '=') {
        closed = true;
        break;
      }
    }
    if (closed) break;
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
// fixtures and signal catalog contain code nobody will edit or deliberately
// bad example code; scanning them buries real findings. The skill directory
// is matched as a substring so it is skipped wherever it was installed.
const EXCLUDED_PATHS =
  /node_modules|\.spec\.|\.test\.|\.stories\.|__tests__|__mocks__|\.agents\/|\.claude\/|\.cursor\/|\.yarn\/|skills\/phase\/(?:evals|scripts)\//;

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

// Longest line a human plausibly wrote. Longer lines are generated content;
// see scanFile.
const MAX_LINE_LENGTH = 1000;

// Findings quote a source line; an unbounded quote turns one generated line
// into megabytes of JSON in an agent's context window.
const MAX_FINDING_TEXT = 120;

// Files listed in the hotspot rollup.
const MAX_HOTSPOTS = 5;

// Lines one file may contribute to one signal's listing.
const MAX_LISTED_PER_FILE = 4;

// Below this a reader can see the whole report at once; a rollup of it
// would be restating the list.
const MIN_FINDINGS_FOR_ROLLUP = 5;

// Printed on every scan of a non-empty target, clean or not. The scanner
// reports anti-patterns; the audit also asks what phase would make better,
// and no regex sees that half.
const BEYOND_THE_SCAN = [
  '',
  'Beyond the scan: no pattern here matches an infinite CSS animation nobody gated, a transitionend',
  'listener driving unmount, eagerly mounted below-fold UI, a timer chain sequencing states, a canvas',
  'sized from devicePixelRatio once, or JS still running inside a skipped content-visibility subtree.',
  'Run the manual and opportunity passes (references/audit.md Step 1.5) before concluding an audit.',
];

const EXECUTION_HEADINGS = {
  'per-frame': '↑ in a per-frame path:',
  incidental: '· elsewhere:',
  none: '· in a stylesheet:',
};

// Per-frame first, then incidental, then stylesheets (where the question
// does not apply).
const EXECUTION_RANK = { 'per-frame': 0, incidental: 1 };

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Produces either source with comments blanked or only the comment text.
 * Character positions are preserved so finding excerpts still center on the
 * original match. Strings are tracked so URLs and directive examples cannot
 * become comments or suppressions.
 */
// oxlint-disable-next-line complexity -- the lexer has explicit quote/comment states
function lexComments(lines, commentsOnly) {
  const result = [];
  let block = false;
  let quote = null;

  for (const line of lines) {
    let output = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];

      if (block) {
        output += commentsOnly ? ch : ' ';
        if (ch === '*' && next === '/') {
          output += commentsOnly ? next : ' ';
          i++;
          block = false;
        }
        continue;
      }

      if (quote !== null) {
        output += commentsOnly ? ' ' : ch;
        if (ch === '\\') {
          if (i + 1 < line.length) {
            output += commentsOnly ? ' ' : line[++i];
          }
        } else if (ch === quote) {
          quote = null;
        }
        continue;
      }

      if (ch === '/' && next === '/') {
        output += commentsOnly ? line.slice(i) : ' '.repeat(line.length - i);
        break;
      }
      if (ch === '/' && next === '*') {
        output += commentsOnly ? '/*' : '  ';
        i++;
        block = true;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
      }
      output += commentsOnly ? ' ' : ch;
    }
    result.push(output);
    if (quote === "'" || quote === '"') quote = null;
  }
  return result;
}

function maskComments(lines) {
  return lexComments(lines, false);
}

function commentText(lines) {
  return lexComments(lines, true);
}

/** Blanks quoted text while preserving line lengths for code-only signals. */
function maskStrings(lines) {
  const result = [];
  let quote = null;
  for (const line of lines) {
    let output = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote !== null) {
        output += ' ';
        if (ch === '\\') {
          if (i + 1 < line.length) {
            output += ' ';
            i++;
          }
        } else if (ch === quote) {
          quote = null;
        }
      } else {
        if (ch === "'" || ch === '"' || ch === '`') {
          quote = ch;
          output += ' ';
        } else {
          output += ch;
        }
      }
    }
    result.push(output);
    if (quote === "'" || quote === '"') quote = null;
  }
  return result;
}

// Accepts both `phase-scan-ignore id` and `phase-scan-ignore: id`.
const IGNORE_DIRECTIVE = /phase-scan-ignore:?\s+([a-z-]+)(?:\s+--\s*(\S.*))?/;

function collectSuppressions(relPath, comments, diag) {
  const suppressions = new Map();
  for (let i = 0; i < comments.length; i++) {
    const directive = IGNORE_DIRECTIVE.exec(comments[i]);
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

const braceRangeCache = new WeakMap();

/** Smallest lexical brace block containing a line, with strings/comments gone. */
function enclosingBlock(lines, lineIndex) {
  let ranges = braceRangeCache.get(lines);
  if (!ranges) {
    ranges = [];
    const stack = [];
    for (let i = 0; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') {
          stack.push(i);
        } else if (ch === '}' && stack.length > 0) {
          ranges.push({ start: stack.pop(), end: i });
        }
      }
    }
    braceRangeCache.set(lines, ranges);
  }

  let best = null;
  for (const range of ranges) {
    if (range.start > lineIndex || range.end < lineIndex) continue;
    // Same-line destructuring (`draw: ({ ctx }) => {`) is not the callback
    // body. A one-line callback still falls back to the local context window.
    if (range.end === lineIndex) continue;
    if (best === null || range.end - range.start < best.end - best.start) {
      best = range;
    }
  }
  return best;
}

/** Runs one signal over a file's lines, honoring suppressions and perFile. */
function scanSignal(
  signal,
  lines,
  uncommentedLines,
  codeLines,
  relPath,
  suppressions,
  overlong,
  type,
  diag,
) {
  const findings = [];
  const matchLines = signal.codeOnly ? codeLines : uncommentedLines;
  for (let i = 0; i < lines.length; i++) {
    if (overlong.has(i)) continue;
    const line = lines[i];
    const matchLine = matchLines[i];
    let matchIndex = 0;

    if (signal.matcher) {
      if (!signal.matcher(matchLines, i)) continue;
    } else {
      const match = signal.pattern.exec(matchLine);
      if (!match) continue;
      matchIndex = match.index;

      if (signal.contextPattern) {
        const contextLines = signal.codeOnly ? codeLines : uncommentedLines;
        const radius = signal.contextLines ?? 5;
        const block =
          signal.contextScope === 'block'
            ? enclosingBlock(contextLines, i)
            : null;
        const from = block?.start ?? Math.max(0, i - radius);
        const to = block ? block.end + 1 : i + radius + 1;
        const context = contextLines.slice(from, to).join('\n');
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

    findings.push(
      makeFinding(
        signal,
        relPath,
        i + 1,
        line,
        matchIndex,
        executionOf(uncommentedLines, i, type),
      ),
    );

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
      noteEvidence(
        context,
        toPosix(relative(process.cwd(), join(dir, config))),
      );
      try {
        const content = readFileSync(join(dir, config), 'utf8');
        if (
          /\b(?:ppr|experimental_ppr|cacheComponents)\s*[:=]\s*(?:true|['"]incremental['"])/.test(
            content,
          )
        ) {
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
    noteEvidence(context, rel);
  }
  // The route-segment config shape, not the bare token: prose or tooling
  // that merely mentions experimental_ppr must not count as detection.
  if (/\bexport\s+const\s+experimental_ppr\s*=\s*true\b/.test(content)) {
    context.ppr = true;
    context.framework ??= 'next';
    noteEvidence(context, rel);
  }
  if (/^\s*['"]use client['"]/m.test(content)) {
    context.clientComponents++;
  }
}

// Enough to judge the stamp, not a second report.
const MAX_EVIDENCE = 3;

function noteEvidence(context, path) {
  if (context.evidence.length >= MAX_EVIDENCE) return;
  if (!context.evidence.includes(path)) context.evidence.push(path);
}

/**
 * A --exclude value. Patterns with a wildcard are globs (`*` within a path
 * segment, `**` across); anything else is a plain path prefix or substring,
 * so `--exclude examples/` does what it looks like.
 */
function toPathMatcher(pattern) {
  if (!pattern.includes('*') && !pattern.includes('?')) {
    return (path) => path.includes(pattern);
  }
  let body = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        body += '(?:.*/)?';
        i += 2;
      } else {
        body += '.*';
        i++;
      }
    } else if (ch === '*') {
      body += '[^/]*';
    } else if (ch === '?') {
      body += '[^/]';
    } else {
      body += escapeRegExp(ch);
    }
  }
  const re = new RegExp(`^${body}$`);
  const matchBase = !pattern.includes('/');
  return (path) => re.test(matchBase ? basename(path) : path);
}

function skillVersion() {
  try {
    const metadataPath = fileURLToPath(
      new URL('../metadata.json', import.meta.url),
    );
    return JSON.parse(readFileSync(metadataPath, 'utf8')).version;
  } catch {
    // Some skill installers omit generated metadata; SKILL.md is canonical.
  }

  try {
    const skillPath = fileURLToPath(new URL('../SKILL.md', import.meta.url));
    const skill = readFileSync(skillPath, 'utf8');
    const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    return (
      frontmatter.match(/^\s+version:\s*['"]?([^'"\s]+)['"]?\s*$/m)?.[1] ??
      'unknown'
    );
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

function makeFinding(signal, file, line, text, matchIndex, execution) {
  return {
    signal: signal.id,
    severity: signal.severity,
    noise: signal.noise,
    execution,
    file,
    line,
    text: excerpt(text, matchIndex),
    fix: signal.fix,
  };
}

/**
 * Whether a frame driver runs this line. Meaningless for stylesheets, which
 * report null.
 */
function executionOf(lines, i, type) {
  if (type !== 'js') return null;
  const from = Math.max(0, i - FRAME_DRIVER_WINDOW);
  const window = lines.slice(from, i + FRAME_DRIVER_WINDOW + 1).join('\n');
  return FRAME_DRIVER.test(window) ? 'per-frame' : 'incidental';
}

/**
 * The quoted source line, windowed around the match. Truncating from column
 * zero hid the matched token in 8 of 12 Tailwind findings on a real app:
 * the reader got a wall of class names with no indication of why.
 */
function excerpt(line, matchIndex) {
  const text = line.trim();
  if (text.length <= MAX_FINDING_TEXT) return text;

  const offset = matchIndex - (line.length - line.trimStart().length);
  if (offset < 0 || offset >= text.length) {
    return `${text.slice(0, MAX_FINDING_TEXT)}…`;
  }

  const lead = Math.floor(MAX_FINDING_TEXT / 4);
  const start = Math.max(
    0,
    Math.min(offset - lead, text.length - MAX_FINDING_TEXT),
  );
  const end = start + MAX_FINDING_TEXT;
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
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

function walk(dir, diag, results = []) {
  let entries;
  try {
    // Sorted so output (and committed goldens) are deterministic across
    // filesystems. withFileTypes avoids an lstat syscall per entry.
    entries = readdirSync(dir, { withFileTypes: true }).toSorted((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  } catch {
    // A directory that cannot be listed is a hole in the scan's coverage,
    // not a non-event: say so rather than reporting a clean result over it.
    diag.skipped.unreadableDirs++;
    diag.warnings.push(`${toPosix(dir)}  directory could not be read; skipped`);
    return results;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    // Skipping symlinks entirely guards against cycles and vendored trees.
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      // Recursion accumulates into one array: `push(...walk(f))` throws
      // RangeError once a subtree exceeds ~100k files.
      walk(full, diag, results);
    } else if (
      entry.isFile() &&
      !SKIP_FILES.test(entry.name) &&
      typeOf(extOf(entry.name)) !== null
    ) {
      results.push(full);
    }
  }
  return results;
}

/** Findings per file, the proxy for "this file is the problem". */
function fileWeights(findings) {
  const weight = new Map();
  for (const finding of findings) {
    weight.set(finding.file, (weight.get(finding.file) ?? 0) + 1);
  }
  return weight;
}

/** Files carrying the most candidates, worst first. */
function rankHotspots(findings, weight) {
  const byFile = new Map();
  for (const finding of findings) {
    if (!byFile.has(finding.file)) byFile.set(finding.file, []);
    byFile.get(finding.file).push(finding);
  }
  return [...byFile.entries()]
    .map(([file, items]) => ({ file, items }))
    .filter(({ items }) => items.length > 1)
    .toSorted(
      (a, b) =>
        b.items.length - a.items.length ||
        (weight.get(a.file) === weight.get(b.file) && a.file < b.file ? -1 : 1),
    )
    .slice(0, MAX_HOTSPOTS);
}

function summarizeSignals(items) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item.signal, (counts.get(item.signal) ?? 0) + 1);
  }
  return [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([id, n]) => (n > 1 ? `${id} ×${n}` : id))
    .join(', ');
}

/** Per-frame first, then the most concentrated files, then source order. */
function rankFindings(items, weight) {
  return [...items].toSorted((a, b) => {
    const aHot = EXECUTION_RANK[a.execution] ?? 2;
    const bHot = EXECUTION_RANK[b.execution] ?? 2;
    if (aHot !== bHot) return aHot - bHot;
    const byWeight = (weight.get(b.file) ?? 0) - (weight.get(a.file) ?? 0);
    if (byWeight !== 0) return byWeight;
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.line - b.line;
  });
}

function countSites(findings) {
  const sites = new Set();
  for (const finding of findings) sites.add(`${finding.file}:${finding.line}`);
  return sites.size;
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

/**
 * One line naming what the scan could not read, or null when coverage was
 * complete. Deliberately excludes the by-design exclusions (tests, mocks,
 * agent config): those are policy, not gaps.
 */
function coverageGaps(result) {
  const parts = [];
  const unreadable = result.filesSkipped?.unreadable ?? 0;
  const unreadableDirs = result.filesSkipped?.unreadableDirs ?? 0;
  const linesSkipped = result.linesSkipped ?? 0;
  if (unreadable > 0) parts.push(`${unreadable} file(s) unreadable`);
  if (unreadableDirs > 0) {
    parts.push(`${unreadableDirs} directory/directories unreadable`);
  }
  if (linesSkipped > 0) {
    parts.push(`${linesSkipped} generated/overlong line(s) not scanned`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
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
  --stdin0             read additional NUL-delimited targets from stdin;
                       an empty stream scans nothing instead of "."
  --fail-on <severity> exit 1 if any finding is at or above the given
                       severity (critical | high | medium); default is
                       exit 0 regardless of findings (advisory)
  --signal <id>        report only this signal (repeatable)
  --severity <level>   report only this severity (repeatable)
  --noise <tier>       report only this noise tier, e.g. --noise precise
                       --noise normal to drop the noisy ones (repeatable)
  --exclude <path>     skip paths containing this substring, or matching it
                       as a glob when it has a wildcard (repeatable)
  --limit <n>          cap the findings array in --json output
  -h, --help           show this help

Suppression
  A comment \`phase-scan-ignore <signal-id> -- <reason>\` suppresses that
  signal on the same and the next line. The reason is mandatory.

Reading a large report
  Prefer the text output: it caps each signal's listing. Reach for --json
  scoped to one signal (--json --signal <id>) rather than dumping every
  finding, which on a large codebase runs to tens of thousands of tokens.

Exit codes: 0 = scan completed, 1 = --fail-on threshold hit, 2 = usage error.`;

const NOISE_TIERS = ['precise', 'normal', 'noisy'];

/** Boolean switches, by the argument that sets them. */
const FLAGS = {
  '--json': 'json',
  '--stdin0': 'stdin0',
  '--help': 'help',
  '-h': 'help',
};

/**
 * Options taking a value. `allowed` restricts it to an enum, `list` collects
 * repeats, `map` converts. Table-driven so adding one is a row, not another
 * branch in a parser.
 */
const VALUE_OPTIONS = {
  '--fail-on': {
    key: 'failOn',
    allowed: ['critical', 'high', 'medium'],
    expects: 'critical, high, or medium',
  },
  '--signal': {
    key: 'signals',
    list: true,
    allowed: () => SIGNALS.map((signal) => signal.id),
    expects: 'a known signal id',
  },
  '--severity': { key: 'severities', list: true, allowed: SEVERITY_ORDER },
  '--noise': { key: 'noiseTiers', list: true, allowed: NOISE_TIERS },
  '--exclude': { key: 'exclude', list: true, map: toPosix },
  '--limit': { key: 'limit', map: toPositiveInt },
};

function toPositiveInt(raw, name) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} expects a positive integer (got: ${raw})`);
  }
  return value;
}

function applyOption(opts, name, spec, raw) {
  if (raw === undefined) throw new Error(`${name} expects a value`);
  const allowed =
    typeof spec.allowed === 'function' ? spec.allowed() : spec.allowed;
  if (allowed && !allowed.includes(raw)) {
    throw new Error(
      `${name} expects ${spec.expects ?? allowed.join(', ')} (got: ${raw})`,
    );
  }
  const value = spec.map ? spec.map(raw, name) : raw;
  if (spec.list) opts[spec.key].push(value);
  else opts[spec.key] = value;
}

function parseArgs(argv) {
  const opts = {
    json: false,
    stdin0: false,
    help: false,
    failOn: null,
    signals: [],
    severities: [],
    noiseTiers: [],
    exclude: [],
    limit: null,
    targets: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (FLAGS[arg]) {
      opts[FLAGS[arg]] = true;
    } else if (VALUE_OPTIONS[arg]) {
      applyOption(opts, arg, VALUE_OPTIONS[arg], argv[++i]);
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

  if (opts.stdin0) {
    const input = readFileSync(0, 'utf8');
    for (const target of input.split('\0')) {
      if (target !== '') opts.targets.push(target);
    }
  }
  if (opts.targets.length === 0 && !opts.stdin0) opts.targets.push('.');
  for (const target of opts.targets) {
    try {
      lstatSync(target);
    } catch {
      console.error(`target does not exist: ${target}\n\n${USAGE}`);
      process.exit(2);
    }
  }

  const result = scanTargets(opts.targets, { exclude: opts.exclude });

  const keep = [
    opts.signals.length > 0 && ((f) => opts.signals.includes(f.signal)),
    opts.severities.length > 0 && ((f) => opts.severities.includes(f.severity)),
    opts.noiseTiers.length > 0 && ((f) => opts.noiseTiers.includes(f.noise)),
  ].filter(Boolean);
  if (keep.length > 0) {
    result.findings = result.findings.filter((f) => keep.every((p) => p(f)));
  }

  for (const warning of result.warnings) {
    console.error(`warning: ${warning}`);
  }

  if (opts.json) {
    console.log(JSON.stringify(formatJson(result, opts.limit), null, 2));
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
