import {
  EVIDENCE_REGISTRY,
  FORCED_REFLOW_READ,
  MATCH_MEDIA_CALL,
  OBSERVED_LAYOUT_READ,
  STATE_UPDATE_CONTEXT,
  WINDOW_LISTENER_LAYOUT_READ,
} from './analysis.ts';
import type { EvidenceName } from './analysis.ts';
import { escapeRegExp, maskStrings } from './lex.ts';
import {
  FRAME_CALLBACK_DEFINITION,
  INTERSECTION_OBSERVER_CONSTRUCTOR,
  MUTATION_OBSERVER_CONSTRUCTOR,
  POINTER_MOVE_LISTENER,
  RESIZE_OBSERVER_CONSTRUCTOR,
  TIMER_REFERENCE,
  WINDOW_LAYOUT_LISTENER,
} from './vocabulary.ts';

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'dedup'] as const;
export const NOISE_TIERS = ['precise', 'normal', 'noisy'] as const;

export type ScanSeverity = (typeof SEVERITY_ORDER)[number];
export type ScanNoise = (typeof NOISE_TIERS)[number];
export type ScanFileType = 'js' | 'css' | 'jsx';
export type ScanMatcher = (
  lines: string[],
  line: number,
  file: string,
) => boolean;

export interface ScanExample {
  file: string;
  content: string;
}

interface ScanSignalBase {
  id: string;
  label: string;
  severity: ScanSeverity;
  noise: ScanNoise;
  detects: string;
  why: string;
  replacement: string;
  fix: string;
  supersedes?: string;
  fileTypes?: ScanFileType | ScanFileType[];
  perFile?: boolean;
  codeOnly?: boolean;
  negativePattern?: RegExp;
  negativeCodeOnly?: boolean;
  contextPattern?: RegExp;
  contextLines?: number;
  contextScope?: 'block';
  evidence?: EvidenceName;
}

export type ScanSignal = ScanSignalBase &
  (
    | { pattern: RegExp; matcher?: never }
    | { matcher: ScanMatcher; pattern?: never }
  );

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

const PER_FRAME_ALLOCATION = /\.(?:map|filter)\s*(?:\?\.)?\s*\(|[[{]/;
const SVG_SMIL_ELEMENT =
  /<(?:animate|animateMotion|animateTransform)(?=[\s/>]|$)/;
const SVG_SMIL_IMPERATIVE_START = /\.beginElement(?:At)?(?:\?\.)?\s*\(/;

const SIGNAL_CATALOG = [
  {
    id: 'manual-raf',
    replacement:
      'CSS/WAAPI if browser-animatable; otherwise useLoop/useCanvas for lifecycle + cleanup',
    label: 'Manual requestAnimationFrame loop',
    severity: 'high',
    noise: 'noisy',
    detects:
      'Proven raw rAF callback cycle: no visibility pause, shared clock, or cleanup',
    why: 'No visibility pausing, no shared clock, no cleanup.',
    fix: 'references/audit.md#common-replacements',
    pattern: /requestAnimationFrame/,
    codeOnly: true,
    evidence: 'recurring-raf-cycle',
  },
  {
    id: 'setstate-in-raf',
    replacement:
      'write values that change every frame to a ref or the DOM; keep one state update only if the callback sets a guard before the update and stops scheduling frames',
    label: 'setState/dispatch inside rAF callback',
    severity: 'critical',
    noise: 'normal',
    detects: 'State update inside a recurring rAF callback',
    why: 'React may re-render on every frame; check whether this update repeats or runs once.',
    fix: 'references/performance.md#never-write-repeated-state-inside-ontick--draw',
    supersedes: 'manual-raf',
    pattern: /requestAnimationFrame/,
    codeOnly: true,
    evidence: 'recurring-raf-state',
  },
  {
    id: 'setstate-in-ontick',
    replacement:
      'write values that change every frame to a ref or the DOM; keep one state update only if the callback sets a guard before the update and then disables the loop',
    label: 'setState/dispatch inside a phase onTick/onDraw/draw callback',
    severity: 'critical',
    noise: 'normal',
    detects: 'State update inside a phase `onTick`/`onDraw`/`draw` callback',
    why: 'React may re-render on every tick; check whether this update repeats or runs once.',
    fix: 'references/performance.md#never-write-repeated-state-inside-ontick--draw',
    pattern: FRAME_CALLBACK_DEFINITION,
    contextPattern: STATE_UPDATE_CONTEXT,
    codeOnly: true,
    contextLines: 30,
    contextScope: 'block',
  },
  {
    id: 'per-frame-allocation',
    replacement:
      'allocate mutable objects and arrays outside the callback and reuse them; replace `.map()` and `.filter()` with in-place iteration',
    label: 'Allocation inside a recurring frame callback',
    severity: 'critical',
    noise: 'noisy',
    detects:
      'An object or array literal (including a spread copy), `.map()`, or `.filter()` inside a proven recurring frame callback',
    why: 'Repeated allocations add garbage-collection pressure to the render path.',
    fix: 'references/performance.md#zero-per-frame-allocations',
    pattern: PER_FRAME_ALLOCATION,
    codeOnly: true,
    evidence: 'per-frame-allocation',
  },
  {
    id: 'forced-reflow',
    replacement:
      'useSize (ResizeObserver, async) or cache the geometry and re-read on resize',
    label: 'Forced reflow (getBoundingClientRect, offsetWidth, etc.)',
    severity: 'critical',
    noise: 'noisy',
    detects:
      'Layout-reading member access or call (`getBoundingClientRect`, `.offset*`, `.scroll*`, `.client*`)',
    why: 'Synchronous layout; in a hot path it thrashes every frame.',
    fix: 'references/performance.md#no-forced-reflows-in-animation-paths',
    pattern: FORCED_REFLOW_READ,
  },
  {
    id: 'js-layout-write',
    replacement: 'animate transform/opacity on an HTML wrapper when possible',
    label: 'Potential layout-inducing JavaScript write',
    severity: 'high',
    noise: 'noisy',
    detects:
      'JavaScript write to SVG geometry/transforms or CSS layout properties',
    why: 'Repeated SVG or CSS layout writes can cause layout and paint.',
    fix: 'references/performance.md#no-layout-inducing-writes-in-animation-paths',
    matcher: matchesLayoutWrite,
  },
  {
    id: 'raw-io',
    replacement:
      'check which elements it watches, what entry data it uses, whether it stops watching removed elements, and who creates and disconnects it; useSight/useLifecycle only if they behave the same',
    label: 'Raw IntersectionObserver (not pooled)',
    severity: 'medium',
    noise: 'normal',
    detects: '`new IntersectionObserver` outside the pool',
    why: "This observer skips phase's shared pool. Check its setup and cleanup before changing it.",
    fix: 'references/performance.md#observer-pooling',
    pattern: INTERSECTION_OBSERVER_CONSTRUCTOR,
  },
  {
    id: 'raw-ro',
    replacement:
      'check which elements it watches, what size data it uses, whether it stops watching removed elements, and who creates and disconnects it; useSize only if it behaves the same',
    label: 'Raw ResizeObserver (not pooled)',
    severity: 'medium',
    noise: 'normal',
    detects: '`new ResizeObserver` outside the pool',
    why: "This observer skips phase's shared pool. Check its setup and cleanup before changing it.",
    fix: 'references/performance.md#observer-pooling',
    pattern: RESIZE_OBSERVER_CONSTRUCTOR,
  },
  {
    id: 'raw-matchmedia',
    replacement:
      'useMediaQuery, or usePrefersReducedMotion for the motion query',
    label: 'Raw matchMedia (not pooled)',
    severity: 'medium',
    noise: 'normal',
    detects: '`matchMedia(` with a listener on the result, outside the pool',
    why: 'Unpooled MediaQueryList subscriptions; phase pools them by query.',
    fix: 'references/use-media-query.md',
    pattern: MATCH_MEDIA_CALL,
    // A `.matches` snapshot subscribes to nothing, so the finding needs a
    // listener on the same receiver. Strings are masked out of the match so an
    // inline pre-hydration script does not read as application code.
    evidence: 'subscribed-media-query',
    codeOnly: true,
  },
  {
    id: 'mutationobserver-layout',
    replacement: 'useMutation (rAF-batched); useSize/useSight for geometry',
    label:
      'MutationObserver driving layout (reflow / style+subtree observation)',
    severity: 'critical',
    noise: 'normal',
    detects:
      'MutationObserver watching inline styles or reading layout in its callback',
    why: 'Layout reads in MO callbacks force a reflow on every mutation.',
    fix: 'references/performance.md#never-drive-layout-from-a-mutationobserver',
    pattern: MUTATION_OBSERVER_CONSTRUCTOR,
    // Only flag when the observer watches inline style mutations or reads
    // layout nearby. Structural (childList) and plain attribute observation
    // (e.g. a class watcher) are legitimate and skipped.
    contextPattern: new RegExp(
      `attributeFilter:\\s*\\[[^\\]]*['"]style['"]|${OBSERVED_LAYOUT_READ.source}`,
    ),
  },
  {
    id: 'js-opacity-transform',
    replacement:
      'CSS/WAAPI if browser-animatable; useLoop only for required live per-frame JS',
    label: 'JS-driven opacity/transform (may be browser-driven)',
    severity: 'medium',
    noise: 'noisy',
    detects:
      '`style.opacity`/`style.transform` writes (browser-driven candidate)',
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
    detects:
      'Animation (recurring rAF, `@keyframes`, `animation:`) with no reduced-motion handling',
    why: 'The animation ignores the reduced-motion preference.',
    fix: 'references/performance.md#reduced-motion-by-default',
    // `animation:(?!\s*none)` keeps `animation: none` (motion disabled) out.
    pattern: /requestAnimationFrame|@keyframes|animation:(?!\s*none\b)/,
    // Suppress only when the file handles reduced motion. Importing phase is
    // not enough: a raw rAF in the same file still bypasses its lifecycle.
    negativePattern: /prefers-reduced-motion|reducedMotion/,
    negativeCodeOnly: true,
    fileTypes: ['js', 'css'],
    codeOnly: true,
    evidence: 'recurring-raf-branch',
    // The gap is a property of the whole file, not of each animating line.
    perFile: true,
  },
  {
    id: 'svg-smil-animation',
    replacement:
      'render a static reduced-motion state and useLifecycle to pause/resume the owning SVG root',
    label: 'SVG SMIL animation needs lifecycle and reduced-motion review',
    severity: 'critical',
    noise: 'normal',
    detects:
      'Intrinsic SVG SMIL animation elements or imperative `beginElement()`/`beginElementAt()` playback',
    why: 'SMIL does not respect the reduced-motion preference or pause with the owning UI lifecycle automatically.',
    fix: 'references/smil.md#svg-smil-lifecycle-and-reduced-motion',
    matcher: matchesSvgSmilAnimation,
    codeOnly: true,
    perFile: true,
  },
  {
    id: 'timer-missing-reduced-motion',
    replacement:
      'a prefers-reduced-motion media query, or a phase hook (handles it automatically)',
    label: 'Timer animation without reduced-motion check',
    severity: 'critical',
    noise: 'noisy',
    detects:
      '`setInterval`, or a `setTimeout` that reschedules itself, driving transform/opacity with no reduced-motion handling',
    why: 'The animation ignores the reduced-motion preference.',
    fix: 'references/performance.md#reduced-motion-by-default',
    pattern: TIMER_REFERENCE,
    negativePattern:
      /prefers-reduced-motion|\b(?:usePrefersReducedMotion|prefersReducedMotion|reducedMotion)\b/,
    negativeCodeOnly: true,
    contextPattern:
      /\.style\.(?:transform|opacity)\s*=|\btranslate\b|\banimate\b/,
    codeOnly: true,
    evidence: 'recurring-timer',
    perFile: true,
  },
  {
    id: 'background-animation',
    replacement:
      'CSS/WAAPI when predetermined and keyframe-friendly; otherwise useLoop with elapsed steps',
    label: 'setInterval/setTimeout for animation (no visibility check)',
    severity: 'high',
    noise: 'noisy',
    detects:
      '`setInterval`, or a `setTimeout` that reschedules itself, driving transform/opacity work',
    why: 'Timers keep firing off-screen and in background tabs.',
    fix: 'references/timed-sequences.md',
    pattern: TIMER_REFERENCE,
    contextPattern: /transform|opacity|translate|\banimate\b/,
    evidence: 'recurring-timer',
  },
  {
    id: 'manual-synced-ref',
    replacement: 'useSyncedRef(value)',
    label: 'Manual synced ref (dedup: useSyncedRef offers a shorthand)',
    severity: 'dedup',
    noise: 'precise',
    detects: '`useRef(v)` + unconditional `ref.current = v` (shorthand exists)',
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
    detects: '`useCallback` with empty deps calling through a ref **(JSX)**',
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
    detects:
      '`body:has`/`html:has`/`:root:has`/`*:has` in a stylesheet **(CSS)**',
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
    detects: '`will-change` never toggled with animation state **(CSS)**',
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
    detects:
      '`transition: all`, layout properties, or bare-duration shorthand **(CSS)**',
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
    detects:
      'Layout property (`width`/`height`/`top`/`left`) inside `@keyframes` **(CSS)**',
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
    detects: 'resize/scroll listener with a layout read in the handler',
    why: 'A synchronous reflow per event, once per listening component.',
    fix: 'references/performance-recipes.md#recipe-collapse-n-bare-window-resize-listeners-into-one-pooled-observer',
    pattern: WINDOW_LAYOUT_LISTENER,
    contextPattern: WINDOW_LISTENER_LAYOUT_READ,
  },
  {
    id: 'pointer-listener-layout-read',
    replacement: 'usePointer (one rAF-batched read per frame, not per event)',
    label: 'Pointer/mouse/touch move listener with layout read',
    severity: 'critical',
    noise: 'normal',
    detects:
      'pointermove/mousemove/touchmove listener, or intrinsic JSX move prop, with a layout read per event',
    why: 'A synchronous reflow per event; move events fire far above 60/sec.',
    fix: 'references/use-pointer.md',
    // Raw listeners and intrinsic JSX move props can both read layout at event
    // frequency. A raw listener requires a nearby layout read through
    // contextPattern. A JSX prop requires a layout read inside the associated
    // handler body. Lexical association lets a distant useCallback binding
    // match without treating a custom-component prop as a DOM event.
    pattern: POINTER_MOVE_LISTENER,
    evidence: 'move-handler-layout-read',
  },
  {
    id: 'redundant-mutation-observers',
    replacement: 'one useMutation with a coalesced callback',
    label:
      'MutationObserver on html/documentElement (coalesce into one useMutation)',
    severity: 'medium',
    noise: 'normal',
    detects: 'MutationObserver on `<html>`/`documentElement`',
    why: 'N observers on one target each fire per mutation; one suffices.',
    fix: 'references/performance-recipes.md#recipe-collapse-an-observer-storm-on-html',
    pattern: MUTATION_OBSERVER_CONSTRUCTOR,
    contextPattern:
      /document\.documentElement|<html|\.observe\s*\(\s*document\s*\./,
  },
  {
    id: 'tailwind-transition-all',
    replacement: 'name the properties: transition-colors, transition-transform',
    label: 'Tailwind transition-all class (animates layout properties)',
    severity: 'high',
    noise: 'noisy',
    detects: '`transition-all` utility class, in JSX or a variant module',
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
    detects: '`will-change-transform` class not toggled with state',
    why: 'A GPU layer is held even while nothing animates.',
    fix: 'references/performance.md#will-change-only-while-animating',
    matcher: matchesPermanentWillChangeClass,
  },
  // --- Phase-usage signals ---
  {
    id: 'reduced-motion-ignored',
    replacement:
      'keep the default unless motion is essential or a parent does not render the animated child while reduced motion is on and shows the same information without motion',
    label: "reducedMotion: 'ignore' (bypasses the user preference)",
    severity: 'medium',
    noise: 'precise',
    detects: "`reducedMotion: 'ignore'` (bypasses the user preference)",
    why: 'Ignoring reduced motion is valid only when motion is essential or a parent removes the animation while reduced motion is on and shows the same information without motion.',
    fix: 'references/performance.md#reduced-motion-by-default',
    pattern: /reducedMotion:\s*['"]ignore['"]/,
  },
  {
    id: 'core-primitive-in-component',
    replacement: 'the matching hook (useLoop, useSight, useLifecycle)',
    label: 'Core phase primitive in a component (hook likely fits better)',
    severity: 'medium',
    noise: 'noisy',
    detects:
      '`createLoop`/`createTicker`/`createLifecycle`/`createSight` in a component **(JSX)**',
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
    detects:
      'Phase loop combining `frame.elapsed` with transform/opacity-style writes',
    why: 'An elapsed-only transform/opacity timeline may not need per-frame JS.',
    fix: 'references/decision-guide.md#browser-driven-timelines-css-or-waapi',
    matcher: matchesPhaseLoopBrowserKeyframes,
    perFile: true,
  },
  {
    id: 'when-visible-no-fallback',
    replacement: 'reserve the final in-flow footprint when it is nonzero',
    label: 'WhenVisible/WhenIdle without a fallback (verify mount geometry)',
    severity: 'high',
    noise: 'noisy',
    detects:
      '`WhenVisible`/`WhenIdle` without a fallback; verify whether mount changes in-flow size **(JSX)**',
    why: 'Children are absent until triggered; unreserved in-flow size can shift layout.',
    fix: 'references/rendering-recipes.md',
    matcher: matchesUngatedLazyMount,
    fileTypes: 'jsx',
  },
] satisfies ScanSignal[];

export type ScanSignalId = (typeof SIGNAL_CATALOG)[number]['id'];

interface SignalEvidenceEntry {
  id: string;
  evidence?: string;
}

export function validateSignalEvidence(
  signals: readonly SignalEvidenceEntry[],
): void {
  for (const signal of signals) {
    if (signal.evidence && !Object.hasOwn(EVIDENCE_REGISTRY, signal.evidence)) {
      throw new Error(
        `Signal '${signal.id}' names unknown evidence '${signal.evidence}'`,
      );
    }
  }
}

validateSignalEvidence(SIGNAL_CATALOG);

export const SIGNALS: ScanSignal[] = SIGNAL_CATALOG;

// How far a matcher looks for the bounds of the enclosing CSS rule.
const BLOCK_SCAN_LINES = 20;
const STYLE_LAYOUT_PROPERTY =
  /^(?:width|height|minWidth|maxWidth|minHeight|maxHeight|inlineSize|minInlineSize|maxInlineSize|blockSize|minBlockSize|maxBlockSize|top|right|bottom|left|inset|insetBlock|insetBlockStart|insetBlockEnd|insetInline|insetInlineStart|insetInlineEnd|margin|marginTop|marginRight|marginBottom|marginLeft|marginBlock|marginBlockStart|marginBlockEnd|marginInline|marginInlineStart|marginInlineEnd|padding|paddingTop|paddingRight|paddingBottom|paddingLeft|paddingBlock|paddingBlockStart|paddingBlockEnd|paddingInline|paddingInlineStart|paddingInlineEnd)$/;
const CSS_LAYOUT_PROPERTY =
  /^(?:width|height|min-width|max-width|min-height|max-height|inline-size|min-inline-size|max-inline-size|block-size|min-block-size|max-block-size|top|right|bottom|left|inset|inset-block|inset-block-start|inset-block-end|inset-inline|inset-inline-start|inset-inline-end|margin|margin-top|margin-right|margin-bottom|margin-left|margin-block|margin-block-start|margin-block-end|margin-inline|margin-inline-start|margin-inline-end|padding|padding-top|padding-right|padding-bottom|padding-left|padding-block|padding-block-start|padding-block-end|padding-inline|padding-inline-start|padding-inline-end)$/;
const SVG_LAYOUT_ATTRIBUTE =
  /^(?:x|y|width|height|cx|cy|r|d|points|x1|y1|x2|y2|transform)$/;
//
// Custom matchers: `(lines: string[], i: number, file: string) => boolean`.
// Called once per line per signal. Return true if line i should be reported.
// Must be pure (no side effects, no mutation of lines). Declared before
// SIGNALS because the catalog references them; grouped here with other
// detection-support constants for locality.

/** JavaScript writes that may invalidate layout or paint when repeated. */
function matchesLayoutWrite(lines: string[], i: number): boolean {
  const line = lines[i] ?? '';
  const code = maskStrings([line])[0] ?? '';
  const callSource = lines.slice(i, i + 3).join('\n');

  if (/\.set(?:Translate|Scale|Rotate|SkewX|SkewY|Matrix)\s*\(/.test(code)) {
    return true;
  }

  const directStyle = /\.style\.([A-Za-z_$][\w$]*)\s*=/.exec(code);
  if (directStyle && STYLE_LAYOUT_PROPERTY.test(directStyle[1] ?? '')) {
    return true;
  }

  return (
    hasLayoutPropertyCall(
      callSource,
      code,
      '.style.setProperty',
      CSS_LAYOUT_PROPERTY,
    ) ||
    hasLayoutPropertyCall(
      callSource,
      code,
      '.setAttribute',
      SVG_LAYOUT_ATTRIBUTE,
    )
  );
}

/** Intrinsic SMIL JSX tags or imperative starts, excluding JS lookalikes. */
function matchesSvgSmilAnimation(
  lines: string[],
  i: number,
  file: string,
): boolean {
  const line = lines[i] ?? '';
  if (SVG_SMIL_IMPERATIVE_START.test(line)) return true;
  if (!/\.[jt]sx$/i.test(file)) return false;

  let from = 0;
  while (from < line.length) {
    const match = SVG_SMIL_ELEMENT.exec(line.slice(from));
    if (!match) return false;

    const index = from + match.index;
    const prefix = line.slice(0, index).trimEnd();
    if (!prefix.endsWith('/')) return true;
    from = index + match[0].length;
  }
  return false;
}

/** Matches a quoted first argument only when the method itself is real code. */
function hasLayoutPropertyCall(
  source: string,
  code: string,
  method: string,
  properties: RegExp,
): boolean {
  let from = 0;
  while (from < code.length) {
    const index = code.indexOf(method, from);
    if (index === -1) return false;

    const args = source.slice(index + method.length);
    const property = /^\s*\(\s*(['"])([^'"]+)\1/.exec(args)?.[2];
    if (property && properties.test(property)) return true;
    from = index + method.length;
  }
  return false;
}

/**
 * Flags the manual synced-ref idiom that useSyncedRef shortens:
 *   const xRef = useRef(v);   // line i
 *   xRef.current = v;         // next non-blank line, same initializer
 *
 * Matching the same initializer keeps false positives near zero: useRef(null),
 * a different value, or a conditional write all miss.
 */
function matchesSyncedRef(lines: string[], i: number): boolean {
  const decl =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*useRef\s*(?:<[^>]*>)?\s*\(([^)]*)\)/.exec(
      lines[i] ?? '',
    );
  if (!decl) return false;

  const name = decl[1] ?? '';
  const initial = (decl[2] ?? '').trim();
  if (initial === '') return false;

  let j = i + 1;
  while (j < lines.length) {
    const t = (lines[j] ?? '').trim();
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
  ).exec((lines[j] ?? '').trim());
  if (!assign) return false;

  return (assign[1] ?? '').trim() === initial;
}

/**
 * `will-change` that no state gates. The gate lives in the enclosing rule,
 * not the file: a `:hover` rule elsewhere in the stylesheet says nothing
 * about this declaration, and a whole-file negative pattern silenced the
 * signal on essentially every production stylesheet.
 */
function matchesPermanentWillChange(lines: string[], i: number): boolean {
  if (!/will-change:(?!\s*auto\b)/.test(lines[i] ?? '')) return false;
  // A play-state toggle anywhere in the same block means it is managed.
  for (let j = i + 1; j < lines.length && j - i < BLOCK_SCAN_LINES; j++) {
    const line = lines[j] ?? '';
    if (/animation-play-state/.test(line)) return false;
    if (line.includes('}')) break;
  }
  for (let j = i; j >= 0 && i - j < BLOCK_SCAN_LINES; j--) {
    const line = lines[j] ?? '';
    if (/animation-play-state/.test(line)) return false;
    // The nearest opening brace carries this declaration's selector.
    if (line.includes('{')) {
      return !/\[data-|\[aria-|:hover|:focus|:active/.test(line);
    }
  }
  return true;
}

/** Matches a complete transition declaration, including multiline values. */
function matchesNonCompositorTransition(lines: string[], i: number): boolean {
  if (!/(?<![\w-])transition(?:-property)?:\s*/.test(lines[i] ?? '')) {
    return false;
  }

  let declaration = lines[i] ?? '';
  for (
    let j = i + 1;
    j < lines.length && j <= i + 10 && !/[;}]/.test(declaration);
    j++
  ) {
    declaration += ` ${(lines[j] ?? '').trim()}`;
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
function matchesStableCallback(lines: string[], i: number): boolean {
  if (!/useCallback\s*(?:<[^>]*>)?\s*\(/.test(lines[i] ?? '')) {
    return false;
  }
  const window = lines.slice(i, i + 8).join('\n');
  return (
    /\.current\s*(?:\?\.|\.call|\.apply)?\s*\(/.test(window) &&
    // A trailing comma and newline are how a formatter writes the deps
    // array on its own line.
    /\[\s*\]\s*,?\s*\)/.test(window)
  );
}

/** Always-on will-change-transform class; a ternary or && guard means toggled. */
function matchesPermanentWillChangeClass(lines: string[], i: number): boolean {
  if (!/\bwill-change-transform\b/.test(lines[i] ?? '')) return false;
  return !/\?|&&/.test(lines[i] ?? '');
}

/**
 * A phase loop whose visible output may be fully describable up front as
 * browser keyframes. This is deliberately noisy: the audit must still verify
 * that the timeline has no live inputs, physics, layout reads, or required JS
 * side effects. The signal exists to force that cheaper-tier question.
 */
const phaseLoopBrowserKeyframesCache = new WeakMap<string[], boolean>();

function matchesPhaseLoopBrowserKeyframes(lines: string[], i: number): boolean {
  if (!/\b(?:useLoop|createLoop)(?:\s*<[^;{]*>)?\s*\(/.test(lines[i] ?? '')) {
    return false;
  }

  const cached = phaseLoopBrowserKeyframesCache.get(lines);
  if (cached !== undefined) return cached;

  const source = lines.join('\n');
  const derivesFromElapsed =
    /[A-Za-z_$][\w$]*\.elapsed\b/.test(source) ||
    /\(\s*\{[^}]*\belapsed\b[^}]*\}\s*(?::[^)]*)?\)\s*(?:=>|\{)/.test(source);
  const writesKeyframeFriendlyOutput =
    /\.style\.(?:opacity|transform)\s*=|\.style\.setProperty\(\s*['"](?:opacity|transform)['"]|\.setAttribute\(\s*['"](?:opacity|transform)['"]|\.set(?:Translate|Scale|Rotate|SkewX|SkewY)\s*\(/.test(
      source,
    );

  const matches = derivesFromElapsed && writesKeyframeFriendlyOutput;
  phaseLoopBrowserKeyframesCache.set(lines, matches);
  return matches;
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
function matchesKeyframesLayoutProp(lines: string[], i: number): boolean {
  if (
    !/(?:^|[{;])\s*(?:width|height|top|left|right|bottom|margin|padding|inset)[a-z-]*\s*:/.test(
      lines[i] ?? '',
    )
  ) {
    return false;
  }
  return keyframeRanges(lines).has(i);
}

// Memoized per lines array: scanSignal calls the matcher once per line, and
// every call would otherwise rebuild the same map.
const keyframeRangeCache = new WeakMap<string[], Set<number>>();

/** Line indices that sit inside (or open) a @keyframes block. */
function keyframeRanges(lines: string[]): Set<number> {
  const cached = keyframeRangeCache.get(lines);
  if (cached) return cached;

  const inside = new Set<number>();
  let depth = 0;
  let keyframesDepth = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
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
function matchesUngatedLazyMount(lines: string[], i: number): boolean {
  const open = /<When(?:Visible|Idle)\b/.exec(lines[i] ?? '');
  if (!open) return false;
  let tag = '';
  let depth = 0;
  for (let j = i; j < Math.min(lines.length, i + 30); j++) {
    const sourceLine = lines[j] ?? '';
    const line = j === i ? sourceLine.slice(open.index) : sourceLine;
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
