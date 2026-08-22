import { escapeRegExp } from './lex.ts';

// Context pattern for state updates. Excludes DOM/timer/canvas setters that
// are legitimate inside frame callbacks. The exclusions accept rare false
// negatives when a React setter shares a DOM setter name (e.g. setSelection,
// setTransform): missing one candidate beats flagging the recommended pattern.
// Known accepted FP class (calibrated): non-React `dispatch(` from editor or
// store libraries (e.g. a CodeMirror transaction) near a rAF; the noise tier
// covers it, and distinguishing them line-based is not worth the complexity.
export const STATE_UPDATE_CONTEXT =
  /\bsetState\s*\(|\bdispatch\s*\(|\bset(?!Timeout\b|Interval\b|Immediate\b|Attribute|Property\b|PointerCapture\b|Item\b|Selection|RangeText\b|CustomValidity\b|Transform\b|LineDash\b|SinkId\b|RequestHeader\b)[A-Z]\w*\s*\(/;

export const MATCH_MEDIA_CALL = /\bmatchMedia\s*(?:\?\.)?\s*\(/;
const MATCH_MEDIA_CALLS = new RegExp(MATCH_MEDIA_CALL.source, 'g');

const SIZE_READS = [
  'offsetWidth',
  'offsetHeight',
  'scrollWidth',
  'scrollHeight',
  'clientWidth',
  'clientHeight',
];
const POSITION_READS = ['offsetTop', 'offsetLeft'];
const SCROLL_READS = ['scrollTop', 'scrollLeft'];

export const FORCED_REFLOW_READ = layoutReadPattern(
  [...SIZE_READS, ...POSITION_READS],
  { computedStyle: true },
);
export const OBSERVED_LAYOUT_READ = layoutReadPattern(
  [...SIZE_READS, ...SCROLL_READS],
  { computedStyle: true },
);
export const WINDOW_LISTENER_LAYOUT_READ = layoutReadPattern([
  ...SIZE_READS,
  ...SCROLL_READS,
]);
const POINTER_LAYOUT_READ = layoutReadPattern([
  ...SIZE_READS,
  ...POSITION_READS,
  ...SCROLL_READS,
]);

export interface SourceIndex {
  source: string;
  lineStarts: number[];
  bracePairs: Map<number, number>;
}

export interface SchedulingOwnership {
  recurringScheduleLines: Set<number>;
  stateScheduleLines: Set<number>;
  recurringCallbackLines: Set<number>;
}

export interface FileAnalysis {
  raf: SchedulingOwnership;
  timeout: SchedulingOwnership;
  subscribedMediaQueries: Set<number>;
  moveHandlers: MoveAnalysis;
  uncommentedLines: string[];
}

export interface LineRange {
  start: number;
  end: number;
}

export interface MoveAnalysis {
  propRanges: Map<number, LineRange>;
  handlerLines: Set<number>;
}

type CallbackRange = LineRange;

interface SchedulingCall {
  offset: number;
  owner: CallbackRange | null;
  target: CallbackRange | null;
}

interface CallbackCollection {
  callbacks: CallbackRange[];
  callbacksByName: Map<string, CallbackRange>;
}

const RAF_CALL = /\brequestAnimationFrame\s*(?:\?\.)?\s*\(/g;
const TIMEOUT_CALL = /\bsetTimeout\s*(?:\?\.)?\s*\(/g;
const INTERVAL_CALL = /\bsetInterval\s*(?:\?\.)?\s*\(/;

/**
 * What a signal can require beyond its own line, analyzed once per scanned file:
 * which scheduling calls own recurring work, and which MediaQueryLists
 * something subscribes to.
 *
 * A scheduler owns recurring work only when a callback it schedules can
 * schedule another turn. That is one question asked of two APIs, so rAF and
 * setTimeout share the callback set and the cycle analysis, differing only in
 * the call pattern.
 */
export function analyzeFile(
  type: 'js' | 'css',
  sourceIndex: SourceIndex,
  uncommentedLines: string[],
): FileAnalysis {
  const { callbacks, callbacksByName } = collectCallbacks(sourceIndex);
  const cycleOf = (pattern: RegExp) =>
    analyzeSchedulingCycle(sourceIndex, callbacks, callbacksByName, pattern);
  return {
    raf: cycleOf(RAF_CALL),
    timeout: cycleOf(TIMEOUT_CALL),
    subscribedMediaQueries: subscribedMediaQueryLines(sourceIndex),
    moveHandlers: analyzeMoveHandlers(type, sourceIndex),
    uncommentedLines,
  };
}

// `.addEventListener(` or `?.addEventListener(` directly on the result, matched
// sticky from the closing paren so a wrapped chain still counts. The event name
// is not checked: a MediaQueryList has only `change`, so the receiver is what
// separates a subscription from an unrelated listener.
const CHAINED_SUBSCRIBE =
  /\s*(?:\?\.|\.)\s*(?:addEventListener|addListener)\s*\(/y;
// `const mql =`, `let mql: MediaQueryList =`, `mql =`, `this.mql =`. The
// lookbehind keeps comparisons (`===`, `!==`, `>=`) from reading as bindings.
const MQL_DECLARATION =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:await\s+)?$/;
const MQL_ASSIGNMENT =
  /([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*(?<![=!<>])=\s*(?:await\s+)?$/;
// The global the call hangs off (`window.`, `globalThis.`, `self.`), dropped so
// the binding patterns can anchor on the initializer.
const MQL_QUALIFIER = /(?:[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*)+$/;
// How far back to look for a binding. A declaration sits next to its
// initializer, and an unbounded reverse scan would walk a minified statement.
const MQL_BINDING_LOOKBEHIND = 400;

/**
 * Line indices constructing a MediaQueryList that something subscribes to.
 *
 * A `.matches` snapshot registers no listener: nothing accumulates, nothing
 * needs cleanup, and there is no subscription for the pool to key by query.
 * Only a listener on that same receiver counts, so a `change` listener
 * elsewhere in the file does not implicate an unrelated snapshot.
 */
function subscribedMediaQueryLines(sourceIndex: SourceIndex): Set<number> {
  const { source, lineStarts } = sourceIndex;
  const subscribed = new Set<number>();

  for (const match of source.matchAll(MATCH_MEDIA_CALLS)) {
    const open = match.index + match[0].lastIndexOf('(');
    const close = matchingParen(source, open);
    if (close === -1) continue;
    CHAINED_SUBSCRIBE.lastIndex = close + 1;
    if (
      CHAINED_SUBSCRIBE.test(source) ||
      subscribesViaBinding(source, match.index)
    ) {
      subscribed.add(lineAtOffset(lineStarts, match.index));
    }
  }

  return subscribed;
}

/**
 * Whether the MediaQueryList is stored in a binding that is later subscribed
 * to. This reads only the statement holding the call, so it stays a local
 * binding question rather than general data flow.
 */
function subscribesViaBinding(source: string, callStart: number): boolean {
  const from = Math.max(0, callStart - MQL_BINDING_LOOKBEHIND);
  let statementStart = from;
  for (let i = callStart - 1; i >= from; i--) {
    if (source[i] === ';' || source[i] === '{' || source[i] === '}') {
      statementStart = i + 1;
      break;
    }
  }
  const prefix = source
    .slice(statementStart, callStart)
    .replace(MQL_QUALIFIER, '');
  const name = (MQL_DECLARATION.exec(prefix) ??
    MQL_ASSIGNMENT.exec(prefix))?.[1];
  if (!name) return false;

  const receiver = name
    .split('.')
    .map((part) => escapeRegExp(part.trim()))
    .join('\\s*\\.\\s*');
  return new RegExp(
    `\\b${receiver}\\s*(?:\\?\\.|\\.)\\s*(?:addEventListener|addListener)\\s*\\(`,
  ).test(source);
}

/** Offset of the `)` closing the `(` at `open`, or -1 when unbalanced. */
function matchingParen(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

function analyzeSchedulingCycle(
  sourceIndex: SourceIndex,
  callbacks: CallbackRange[],
  callbacksByName: Map<string, CallbackRange>,
  callPattern: RegExp,
): SchedulingOwnership {
  const calls = collectSchedulingCalls(
    sourceIndex.source,
    callbacks,
    callbacksByName,
    callPattern,
  );
  const graph = buildCallbackGraph(callbacks, calls);
  const recurringCallbacks = cyclicCallbacks(graph);
  return summarizeSchedulingOwnership(sourceIndex, calls, recurringCallbacks);
}

const EMPTY_MOVE_ANALYSIS: MoveAnalysis = {
  propRanges: new Map(),
  handlerLines: new Set(),
};

const MOVE_HANDLER_PROP = /\bon(?:PointerMove|MouseMove|TouchMove)\s*=\s*\{/;
const MOVE_HANDLER_PROPS = new RegExp(MOVE_HANDLER_PROP.source, 'g');

// A prop value counts as an inline handler only when it starts with a function
// expression, parenthesized arrow parameters, or a single arrow parameter.
// A nested arrow such as `handlers.find(h => h.active)` runs during render,
// not during the move event.
const INLINE_HANDLER_VALUE =
  /^(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::\s*[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/;

// A useCallback wrapper hides the arrow from collectCallbacks' declaration
// patterns. React code commonly uses this wrapper for named move handlers.
const USE_CALLBACK_BINDING =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*useCallback\s*\(\s*(?:async\s+)?(?:function(?:\s+[A-Za-z_$][\w$]*)?\s*\([^)]*\)|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)\s*\{/g;

// Limits how far the scanner looks for the JSX tag that owns a move prop. This
// covers tags with several multi-line props. A longer tag loses the
// specialized finding instead of producing an unrelated one.
const MOVE_HANDLER_TAG_WINDOW = 800;

/**
 * Associates intrinsic JSX move props (onPointerMove/onMouseMove/onTouchMove)
 * with their handler bodies, lexically. An inline handler's body is the
 * prop's brace-balanced value; a named handler resolves one hop to a local
 * function declaration, arrow binding, or useCallback binding. Props on
 * capitalized components and handlers the file does not define are dropped:
 * neither proves a DOM event will run the code.
 *
 * Maps each prop line to its handler line range and records the lines inside
 * associated handler bodies for per-frame ranking.
 *
 * A regex gate skips the second callback-collection pass when the source has
 * no JSX move prop.
 */
export function analyzeMoveHandlers(
  type: 'js' | 'css',
  sourceIndex: SourceIndex,
): MoveAnalysis {
  const { source, lineStarts, bracePairs } = sourceIndex;
  if (type !== 'js' || !MOVE_HANDLER_PROP.test(source)) {
    return EMPTY_MOVE_ANALYSIS;
  }

  const { callbacksByName } = collectCallbacks(sourceIndex);
  for (const match of source.matchAll(USE_CALLBACK_BINDING)) {
    const open = match.index + match[0].lastIndexOf('{');
    const end = bracePairs.get(open);
    if (end !== undefined) {
      callbacksByName.set(match[1] as string, { start: open, end });
    }
  }

  const propRanges = new Map<number, LineRange>();
  const handlerLines = new Set<number>();

  for (const match of source.matchAll(MOVE_HANDLER_PROPS)) {
    if (!intrinsicTagOwns(source, match.index)) continue;
    const open = match.index + match[0].lastIndexOf('{');
    const close = bracePairs.get(open);
    if (close === undefined) continue;

    const value = source.slice(open + 1, close).trim();
    let start;
    let end;
    if (/^[A-Za-z_$][\w$]*$/.test(value)) {
      const callback = callbacksByName.get(value);
      // Resolve one local hop only. Imported names and class methods reached
      // through `this` remain out of scope.
      if (!callback) continue;
      start = callback.start;
      end = callback.end;
    } else if (INLINE_HANDLER_VALUE.test(value)) {
      // The prop's brace-balanced value contains the inline handler body.
      start = open;
      end = close;
    } else {
      // Member expressions, ternaries, and call results do not prove a local
      // handler, so the scanner does not associate them.
      continue;
    }

    const range = {
      start: lineAtOffset(lineStarts, start),
      end: lineAtOffset(lineStarts, end),
    };
    propRanges.set(lineAtOffset(lineStarts, match.index), range);
    for (let line = range.start; line <= range.end; line++) {
      handlerLines.add(line);
    }
  }

  return { propRanges, handlerLines };
}

// A lowercase JSX tag proves the prop belongs to a DOM element, so the handler
// runs at DOM event frequency. A capitalized component may debounce,
// transform, or omit the prop. The scanner walks backward to the nearest tag
// opening at attribute level, then walks forward through JSX expression
// braces. A `>` at brace depth zero closes the tag. During the backward walk,
// brace depth prevents a comparison such as `className={x <y ? ...}` from
// being mistaken for a tag opening.
function intrinsicTagOwns(source: string, propIndex: number): boolean {
  const from = Math.max(0, propIndex - MOVE_HANDLER_TAG_WINDOW);
  let tagStart = -1;
  let backDepth = 0;
  for (let i = propIndex - 1; i >= from; i--) {
    const ch = source[i];
    if (ch === '}') backDepth++;
    else if (ch === '{') backDepth--;
    else if (
      ch === '<' &&
      backDepth <= 0 &&
      /[A-Za-z]/.test(source[i + 1] ?? '')
    ) {
      tagStart = i;
      break;
    }
  }
  if (tagStart === -1) return false;

  let depth = 0;
  for (let i = tagStart + 1; i < propIndex; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0 && source[i - 1] !== '=') return false;
  }
  return /[a-z]/.test(source[tagStart + 1] as string);
}

export function buildSourceIndex(
  lines: string[],
  joined: string | null = null,
): SourceIndex {
  const source = joined ?? lines.join('\n');
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  return { source, lineStarts, bracePairs: pairedBraces(source) };
}

function collectCallbacks(sourceIndex: SourceIndex): CallbackCollection {
  const { source, bracePairs } = sourceIndex;
  const callbacks: CallbackRange[] = [];
  const callbacksByRange = new Map<string, CallbackRange>();
  const callbacksByName = new Map<string, CallbackRange>();

  function registerCallback(name: string, start: number, end: number) {
    const key = `${start}:${end}`;
    let callback = callbacksByRange.get(key);
    if (!callback) {
      callback = { start, end };
      callbacksByRange.set(key, callback);
      callbacks.push(callback);
    }
    callbacksByName.set(name, callback);
  }

  const declarations = [
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^={]+)?\s*\{/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function(?:\s+[A-Za-z_$][\w$]*)?\s*\([^)]*\)|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=>)\s*\{/g,
  ];

  for (const pattern of declarations) {
    for (const match of source.matchAll(pattern)) {
      const open = match.index + match[0].lastIndexOf('{');
      const end = bracePairs.get(open);
      if (end === undefined) continue;
      registerCallback(match[1] as string, open, end);
    }
  }

  const conciseArrow =
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>(?!\s*\{)\s*/g;
  for (const match of source.matchAll(conciseArrow)) {
    const start = match.index + match[0].length;
    const semicolon = source.indexOf(';', start);
    const newline = source.indexOf('\n', start);
    const candidates = [semicolon, newline].filter((offset) => offset >= 0);
    const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
    registerCallback(match[1] as string, start, end);
  }

  return { callbacks, callbacksByName };
}

function collectSchedulingCalls(
  source: string,
  callbacks: CallbackRange[],
  callbacksByName: Map<string, CallbackRange>,
  callPattern: RegExp,
): SchedulingCall[] {
  const calls: SchedulingCall[] = [];
  for (const match of source.matchAll(callPattern)) {
    const open = match.index + match[0].lastIndexOf('(');
    const callbackName = firstArgumentIdentifier(source, open + 1);
    const target = callbackName
      ? (callbacksByName.get(callbackName) ?? null)
      : null;
    calls.push({ offset: match.index, owner: null, target });
  }
  assignCallbackOwners(callbacks, calls);
  return calls;
}

function buildCallbackGraph(
  callbacks: CallbackRange[],
  calls: SchedulingCall[],
): Map<CallbackRange, Set<CallbackRange>> {
  const edges = new Map(
    callbacks.map((callback) => [callback, new Set<CallbackRange>()]),
  );
  for (const call of calls) {
    if (call.owner && call.target) {
      (edges.get(call.owner) as Set<CallbackRange>).add(call.target);
    }
  }
  return edges;
}

function summarizeSchedulingOwnership(
  sourceIndex: SourceIndex,
  calls: SchedulingCall[],
  recurringCallbacks: Set<CallbackRange>,
): SchedulingOwnership {
  const { source, lineStarts } = sourceIndex;
  const recurringScheduleLines = new Set<number>();
  const stateScheduleLines = new Set<number>();
  const recurringCallbackLines = new Set<number>();

  for (const callback of recurringCallbacks) {
    const start = lineAtOffset(lineStarts, callback.start);
    const end = lineAtOffset(lineStarts, callback.end);
    for (let line = start; line <= end; line++) {
      recurringCallbackLines.add(line);
    }
  }

  for (const call of calls) {
    if (!call.target || !recurringCallbacks.has(call.target)) continue;
    const line = lineAtOffset(lineStarts, call.offset);
    recurringScheduleLines.add(line);
    if (
      STATE_UPDATE_CONTEXT.test(
        source.slice(call.target.start, call.target.end),
      )
    ) {
      stateScheduleLines.add(line);
    }
  }

  return {
    recurringScheduleLines,
    stateScheduleLines,
    recurringCallbackLines,
  };
}

function pairedBraces(source: string): Map<number, number> {
  const pairs = new Map<number, number>();
  const stack: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '{') stack.push(i);
    if (source[i] === '}' && stack.length > 0) {
      pairs.set(stack.pop() as number, i);
    }
  }
  return pairs;
}

function firstArgumentIdentifier(
  source: string,
  offset: number,
): string | null {
  const rest = source.slice(offset);
  const match = /^\s*([A-Za-z_$][\w$]*)/.exec(rest);
  return match?.[1] ?? null;
}

function assignCallbackOwners(
  callbacks: CallbackRange[],
  calls: SchedulingCall[],
): void {
  const sorted = [...callbacks].toSorted(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const stack: CallbackRange[] = [];
  let next = 0;

  for (const call of calls) {
    while (
      next < sorted.length &&
      (sorted[next] as CallbackRange).start <= call.offset
    ) {
      const callback = sorted[next++] as CallbackRange;
      while (
        stack.length > 0 &&
        (stack.at(-1) as CallbackRange).end <= callback.start
      ) {
        stack.pop();
      }
      stack.push(callback);
    }
    while (
      stack.length > 0 &&
      (stack.at(-1) as CallbackRange).end <= call.offset
    ) {
      stack.pop();
    }
    call.owner = stack.at(-1) ?? null;
  }
}

function cyclicCallbacks(
  edges: Map<CallbackRange, Set<CallbackRange>>,
): Set<CallbackRange> {
  const seen = new Set<CallbackRange>();
  const order: CallbackRange[] = [];

  for (const start of edges.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const stack = [
      {
        callback: start,
        next: 0,
        targets: [...(edges.get(start) as Set<CallbackRange>)],
      },
    ];
    while (stack.length > 0) {
      const frame = stack.at(-1) as (typeof stack)[number];
      if (frame.next < frame.targets.length) {
        const target = frame.targets[frame.next++] as CallbackRange;
        if (seen.has(target)) continue;
        seen.add(target);
        stack.push({
          callback: target,
          next: 0,
          targets: [...(edges.get(target) as Set<CallbackRange>)],
        });
      } else {
        order.push(frame.callback);
        stack.pop();
      }
    }
  }

  const reverse = new Map(
    [...edges.keys()].map((callback) => [callback, [] as CallbackRange[]]),
  );
  for (const [callback, targets] of edges) {
    for (const target of targets) {
      (reverse.get(target) as CallbackRange[]).push(callback);
    }
  }

  const assigned = new Set<CallbackRange>();
  const recurring = new Set<CallbackRange>();
  for (let i = order.length - 1; i >= 0; i--) {
    const start = order[i] as CallbackRange;
    if (assigned.has(start)) continue;
    const component: CallbackRange[] = [];
    const pending = [start];
    assigned.add(start);
    while (pending.length > 0) {
      const callback = pending.pop() as CallbackRange;
      component.push(callback);
      for (const source of reverse.get(callback) as CallbackRange[]) {
        if (assigned.has(source)) continue;
        assigned.add(source);
        pending.push(source);
      }
    }
    if (
      component.length > 1 ||
      (edges.get(start) as Set<CallbackRange>).has(start)
    ) {
      for (const callback of component) recurring.add(callback);
    }
  }

  return recurring;
}

function lineAtOffset(lineStarts: number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((lineStarts[middle] as number) <= offset) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

const braceRangeCache = new WeakMap<string[], LineRange[]>();

/** Smallest lexical brace block containing a line, with strings/comments gone. */
export function enclosingBlock(
  lines: string[],
  lineIndex: number,
): LineRange | null {
  let ranges = braceRangeCache.get(lines);
  if (!ranges) {
    ranges = [];
    const stack: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      for (const ch of lines[i] as string) {
        if (ch === '{') {
          stack.push(i);
        } else if (ch === '}' && stack.length > 0) {
          ranges.push({ start: stack.pop() as number, end: i });
        }
      }
    }
    braceRangeCache.set(lines, ranges);
  }

  let best: LineRange | null = null;
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

type EvidencePredicate = (
  analysis: FileAnalysis,
  line: number,
  match: RegExpExecArray,
) => boolean;

export const EVIDENCE_REGISTRY = {
  'recurring-raf-cycle': (analysis, line) =>
    analysis.raf.recurringScheduleLines.has(line),
  'recurring-raf-state': (analysis, line) =>
    analysis.raf.stateScheduleLines.has(line),
  'subscribed-media-query': (analysis, line) =>
    analysis.subscribedMediaQueries.has(line),
  'recurring-raf-branch': matchesRecurringRafBranch,
  'recurring-timer': (analysis, line) =>
    INTERVAL_CALL.test(analysis.uncommentedLines[line] ?? '') ||
    analysis.timeout.recurringScheduleLines.has(line),
  'move-handler-layout-read': matchesMoveHandlerLayoutRead,
} satisfies Record<string, EvidencePredicate>;

export type EvidenceName = keyof typeof EVIDENCE_REGISTRY;

function matchesRecurringRafBranch(
  analysis: FileAnalysis,
  line: number,
  match: RegExpExecArray,
): boolean {
  // Coupled to missing-reduced-motion's pattern alternatives: only its rAF
  // branch requires cycle evidence; CSS animation branches pass directly.
  return (
    !/requestAnimationFrame/.test(match[0]) ||
    analysis.raf.recurringScheduleLines.has(line)
  );
}

function matchesMoveHandlerLayoutRead(
  analysis: FileAnalysis,
  line: number,
  match: RegExpExecArray,
): boolean {
  // Coupled to pointer-listener-layout-read's pattern alternatives: JSX move
  // props use their associated handler, while raw listeners use local context.
  if (/^on[A-Z]/.test(match[0])) {
    const range = analysis.moveHandlers.propRanges.get(line);
    if (!range) return false;
    return POINTER_LAYOUT_READ.test(
      analysis.uncommentedLines.slice(range.start, range.end + 1).join('\n'),
    );
  }

  const radius = 5;
  return POINTER_LAYOUT_READ.test(
    analysis.uncommentedLines
      .slice(Math.max(0, line - radius), line + radius + 1)
      .join('\n'),
  );
}

function layoutReadPattern(
  properties: string[],
  { computedStyle = false }: { computedStyle?: boolean } = {},
): RegExp {
  // Member access or a layout API call proves a read. Bare names would treat
  // JSX props such as `<Overlay offsetLeft={12} />` as forced reflows.
  const names = properties.join('|');
  const forms = [
    `(?:\\?\\.|\\.)\\s*(?:${names})\\b`,
    `\\[\\s*['"](?:${names})['"]\\s*\\]`,
    String.raw`(?:\?\.|\.)\s*getBoundingClientRect\s*(?:\?\.)?\s*\(`,
    String.raw`\[\s*['"]getBoundingClientRect['"]\s*\]\s*(?:\?\.)?\s*\(`,
  ];
  if (computedStyle) forms.push(String.raw`\bgetComputedStyle\s*\(`);
  return new RegExp(forms.join('|'));
}
