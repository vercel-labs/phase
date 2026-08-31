import { escapeRegExp } from './lex.ts';
import { INTERVAL_CALL, MOVE_HANDLER_PROP } from './vocabulary.ts';

// Consumers: setstate-in-ontick uses this as callback context; scheduling
// analysis uses it to classify recurring rAF callbacks as state schedules.
// Both consumers exclude legitimate DOM/timer/canvas setters and accept rare
// false negatives when a React setter shares one of those names (for example,
// setSelection or setTransform). Known accepted FP class for both: non-React
// `dispatch(` from editor or store libraries near frame work. The normal noise
// tier covers it; distinguishing those calls line-by-line is not worth the
// complexity.
export const STATE_UPDATE_CONTEXT =
  /\bsetState\s*\(|\bdispatch\s*\(|\bset(?!Timeout\b|Interval\b|Immediate\b|Attribute|Property\b|PointerCapture\b|Item\b|Selection|RangeText\b|CustomValidity\b|Transform\b|LineDash\b|SinkId\b|RequestHeader\b)[A-Z]\w*\s*\(/;

// Consumers: raw-matchmedia detects calls; media-query analysis associates
// each call with a listener on the same result. The call pattern accepts
// optional chaining for both; analysis still drops `.matches` snapshots and
// listeners attached to another receiver.
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
// Consumer branches: move-handler-layout-read checks associated JSX handler
// bodies and the local context around raw pointer listeners with this pattern.
// Both branches require member access or a layout API call, so bare prop names
// remain excluded; the JSX branch also requires intrinsic-prop association.
const POINTER_LAYOUT_READ = layoutReadPattern([
  ...SIZE_READS,
  ...POSITION_READS,
  ...SCROLL_READS,
]);

export interface SourceIndex {
  source: string;
  lineStarts: number[];
  bracePairs: Map<number, number>;
  parenPairs: Map<number, number>;
  bracketPairs: Map<number, number>;
  regexRanges: SourceRange[];
}

export interface SourceRange {
  start: number;
  end: number;
}

export interface SchedulingOwnership {
  recurringScheduleLines: Set<number>;
  stateScheduleLines: Set<number>;
  recurringCallbackLines: Set<number>;
  recurringCallbackRanges: SourceRange[];
}

export interface FileAnalysis {
  raf: SchedulingOwnership;
  timeout: SchedulingOwnership;
  phaseFrameCallbacks: SourceRange[];
  callbackRanges: SourceRange[];
  subscribedMediaQueries: Set<number>;
  moveHandlers: MoveAnalysis;
  sourceIndex: SourceIndex;
  lineStarts: number[];
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

type CallbackRange = SourceRange;

interface SchedulingCall {
  offset: number;
  owner: CallbackRange | null;
  target: CallbackRange | null;
}

interface CallbackCollection {
  callbacks: CallbackRange[];
  callbacksByName: Map<string, CallbackRange>;
  ambiguousCallbackNames: Set<string>;
  callbackRanges: CallbackRange[];
}

const RAF_CALL = /\brequestAnimationFrame\s*(?:\?\.)?\s*\(/g;
const TIMEOUT_CALL = /\bsetTimeout\s*(?:\?\.)?\s*\(/g;
type PhaseFrameApi = 'createTicker' | 'createLoop' | 'useLoop' | 'useCanvas';

interface PhaseFrameCall {
  api: PhaseFrameApi;
  offset: number;
  open: number;
}

const PHASE_IMPORT =
  /\bimport\s+(?!type\b)(?:\*\s+as\s+([A-Za-z_$][\w$]*)|\{([^}]*)\})\s+from\s*(['"])(phase(?:\/react)?)\3/g;

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
  const { callbacks, callbacksByName, ambiguousCallbackNames, callbackRanges } =
    collectCallbacks(sourceIndex);
  const cycleOf = (pattern: RegExp) =>
    analyzeSchedulingCycle(
      sourceIndex,
      callbacks,
      callbacksByName,
      ambiguousCallbackNames,
      pattern,
    );
  return {
    raf: cycleOf(RAF_CALL),
    timeout: cycleOf(TIMEOUT_CALL),
    phaseFrameCallbacks:
      type === 'js'
        ? collectPhaseFrameCallbacks(
            sourceIndex,
            uncommentedLines.join('\n'),
            callbacksByName,
            ambiguousCallbackNames,
          )
        : [],
    callbackRanges,
    subscribedMediaQueries: subscribedMediaQueryLines(sourceIndex),
    moveHandlers: analyzeMoveHandlers(type, sourceIndex),
    sourceIndex,
    lineStarts: sourceIndex.lineStarts,
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
    const close = matchingParen(sourceIndex, open);
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
function matchingParen(sourceIndex: SourceIndex, open: number): number {
  return sourceIndex.parenPairs.get(open) ?? -1;
}

function analyzeSchedulingCycle(
  sourceIndex: SourceIndex,
  callbacks: CallbackRange[],
  callbacksByName: Map<string, CallbackRange>,
  ambiguousCallbackNames: Set<string>,
  callPattern: RegExp,
): SchedulingOwnership {
  const calls = collectSchedulingCalls(
    sourceIndex.source,
    callbacks,
    callbacksByName,
    ambiguousCallbackNames,
    callPattern,
  );
  const graph = buildCallbackGraph(callbacks, calls);
  const recurringCallbacks = cyclicCallbacks(graph);
  return summarizeSchedulingOwnership(sourceIndex, calls, recurringCallbacks);
}

/** Callback bodies passed directly to phase APIs that run them every frame. */
function collectPhaseFrameCallbacks(
  sourceIndex: SourceIndex,
  uncommentedSource: string,
  callbacksByName: Map<string, CallbackRange>,
  ambiguousCallbackNames: Set<string>,
): CallbackRange[] {
  const { source, bracePairs } = sourceIndex;
  const ranges: CallbackRange[] = [];

  for (const call of collectPhaseFrameCalls(sourceIndex, uncommentedSource)) {
    const callClose = matchingParen(sourceIndex, call.open);
    if (callClose === -1) continue;

    const optionsOpen = nextNonWhitespace(source, call.open + 1);
    if (source[optionsOpen] !== '{') continue;
    const optionsClose = bracePairs.get(optionsOpen);
    if (optionsClose === undefined || optionsClose > callClose) continue;

    const property = call.api === 'useCanvas' ? 'draw' : 'onTick';
    const range = phaseCallbackPropertyRange(
      sourceIndex,
      uncommentedSource,
      optionsOpen,
      optionsClose,
      property,
      callbacksByName,
      ambiguousCallbackNames,
    );
    if (range) ranges.push(range);
  }

  return ranges;
}

// oxlint-disable-next-line complexity -- import provenance has distinct direct, aliased, namespace, and shadowed states
function collectPhaseFrameCalls(
  sourceIndex: SourceIndex,
  uncommentedSource: string,
): PhaseFrameCall[] {
  const { source } = sourceIndex;
  const direct = new Map<string, PhaseFrameApi>();
  const namespaces = new Map<string, 'core' | 'react'>();

  for (const match of uncommentedSource.matchAll(PHASE_IMPORT)) {
    if (source.slice(match.index, match.index + 'import'.length) !== 'import') {
      continue;
    }
    if (innermostRange(sourceIndex.regexRanges, match.index)) continue;
    const moduleKind = match[4] === 'phase' ? 'core' : 'react';
    const namespace = match[1];
    if (namespace) {
      namespaces.set(namespace, moduleKind);
      continue;
    }

    for (const specifier of (match[2] ?? '').split(',')) {
      const imported =
        /^(?!\s*type\b)\s*(createTicker|createLoop|useLoop|useCanvas)\b(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(
          specifier,
        );
      if (!imported) continue;
      const api = imported[1] as PhaseFrameApi;
      if (!phaseModuleExports(moduleKind, api)) continue;
      direct.set(imported[2] ?? api, api);
    }
  }

  const calls: PhaseFrameCall[] = [];
  for (const [local, api] of direct) {
    if (hasShadowingBinding(sourceIndex, local)) continue;
    const pattern = identifierPattern(local, 'g');
    for (const match of source.matchAll(pattern)) {
      const previous = previousNonWhitespace(source, match.index - 1, 0);
      if (source[previous] === '.') continue;
      const open = callOpenAfterBinding(
        sourceIndex,
        match.index + match[0].length,
      );
      if (open === -1) continue;
      calls.push({
        api,
        offset: match.index,
        open,
      });
    }
  }

  for (const [namespace, moduleKind] of namespaces) {
    if (hasShadowingBinding(sourceIndex, namespace)) continue;
    const pattern = new RegExp(
      `${identifierSource(namespace)}\\s*\\.\\s*(createTicker|createLoop|useLoop|useCanvas)(?![A-Za-z0-9_$])`,
      'g',
    );
    for (const match of source.matchAll(pattern)) {
      const api = match[1] as PhaseFrameApi;
      if (!phaseModuleExports(moduleKind, api)) continue;
      const open = callOpenAfterBinding(
        sourceIndex,
        match.index + match[0].length,
      );
      if (open === -1) continue;
      calls.push({
        api,
        offset: match.index,
        open,
      });
    }
  }

  return calls.toSorted((a, b) => a.offset - b.offset);
}

function callOpenAfterBinding(
  sourceIndex: SourceIndex,
  afterBinding: number,
): number {
  const { source } = sourceIndex;
  let cursor = nextNonWhitespace(source, afterBinding);
  if (source[cursor] === '(') return cursor;
  if (source[cursor] !== '<') return -1;

  let depth = 0;
  const limit = Math.min(source.length, cursor + 1000);
  for (let i = cursor; i < limit; i++) {
    const ch = source[i];
    if (ch === '<') {
      depth++;
    } else if (ch === '>' && source[i - 1] !== '=') {
      depth--;
      if (depth === 0) {
        cursor = nextNonWhitespace(source, i + 1);
        return source[cursor] === '(' ? cursor : -1;
      }
    } else {
      const close = closingDelimiter(sourceIndex, i);
      if (close !== -1) i = close;
    }
  }
  return -1;
}

function phaseModuleExports(
  moduleKind: 'core' | 'react',
  api: PhaseFrameApi,
): boolean {
  return moduleKind === 'core'
    ? api === 'createTicker' || api === 'createLoop'
    : api === 'useLoop' || api === 'useCanvas';
}

function hasShadowingBinding(sourceIndex: SourceIndex, name: string): boolean {
  const { source, parenPairs } = sourceIndex;
  const escaped = escapeRegExp(name);
  const identifier = identifierSource(name);
  if (
    new RegExp(
      `\\b(?:const|let|var|function|class)\\s+${escaped}(?![A-Za-z0-9_$])|${identifier}\\s*=>`,
    ).test(source)
  ) {
    return true;
  }

  for (const match of source.matchAll(/\b(?:const|let|var)\s*/g)) {
    const open = nextNonWhitespace(source, match.index + match[0].length);
    if (source[open] !== '{' && source[open] !== '[') continue;
    const close = closingDelimiter(sourceIndex, open);
    if (
      close !== -1 &&
      identifierPattern(name).test(source.slice(open, close))
    ) {
      return true;
    }
  }

  const parameter = identifierPattern(name);
  for (const [open, close] of parenPairs) {
    const before = previousNonWhitespace(source, open - 1, 0);
    if (source[before] === ':') continue;
    const statementStart =
      Math.max(
        source.lastIndexOf(';', open - 1),
        source.lastIndexOf('{', open - 1),
        source.lastIndexOf('}', open - 1),
      ) + 1;
    if (/^\s*(?:type|interface)\b/.test(source.slice(statementStart, open))) {
      continue;
    }
    const after = nextNonWhitespace(source, close + 1);
    if (source.slice(after, after + 2) !== '=>' && source[after] !== '{') {
      continue;
    }
    if (parameter.test(source.slice(open + 1, close))) return true;
  }
  return false;
}

function identifierPattern(name: string, flags = ''): RegExp {
  return new RegExp(identifierSource(name), flags);
}

function identifierSource(name: string): string {
  return `(?<![A-Za-z0-9_$])${escapeRegExp(name)}(?![A-Za-z0-9_$])`;
}

/**
 * Resolves one callback property on a direct options object. A later spread can
 * replace an earlier property, so ownership is not proven until a later direct
 * property wins again.
 */
// oxlint-disable-next-line complexity -- object properties have distinct direct, quoted, computed, spread, method, and accessor forms
function phaseCallbackPropertyRange(
  sourceIndex: SourceIndex,
  uncommentedSource: string,
  optionsOpen: number,
  optionsClose: number,
  property: string,
  callbacksByName: Map<string, CallbackRange>,
  ambiguousCallbackNames: Set<string>,
): CallbackRange | null {
  const { source } = sourceIndex;
  let found: CallbackRange | null = null;

  for (let i = optionsOpen + 1; i < optionsClose; i++) {
    if (source[i] === '[' && isDirectPropertyStart(source, optionsOpen, i)) {
      found = null;
    }
    if (source.startsWith('...', i)) {
      found = null;
      i += 2;
      continue;
    }
    const asyncMethod =
      source.startsWith('async', i) &&
      !isIdentifierPart(source[i - 1]) &&
      !isIdentifierPart(source[i + 'async'.length]) &&
      isDirectPropertyStart(source, optionsOpen, i)
        ? nextNonWhitespace(source, i + 'async'.length)
        : -1;
    const accessor =
      /^(?:get|set)\b/.test(source.slice(i)) &&
      isDirectPropertyStart(source, optionsOpen, i)
        ? nextNonWhitespace(source, i + 3)
        : -1;
    const generator =
      source[i] === '*' && isDirectPropertyStart(source, optionsOpen, i)
        ? nextNonWhitespace(source, i + 1)
        : -1;
    if (
      (accessor !== -1 && source.startsWith(property, accessor)) ||
      (generator !== -1 && source.startsWith(property, generator))
    ) {
      found = null;
    } else if (
      asyncMethod !== -1 &&
      source.startsWith(property, asyncMethod) &&
      !isIdentifierPart(source[asyncMethod + property.length])
    ) {
      found = parsePhaseCallbackProperty(
        sourceIndex,
        asyncMethod + property.length,
        optionsClose,
        property,
        callbacksByName,
        ambiguousCallbackNames,
      );
    } else if (
      source.startsWith(property, i) &&
      !isIdentifierPart(source[i - 1]) &&
      !isIdentifierPart(source[i + property.length]) &&
      isDirectPropertyStart(source, optionsOpen, i)
    ) {
      found = parsePhaseCallbackProperty(
        sourceIndex,
        i + property.length,
        optionsClose,
        property,
        callbacksByName,
        ambiguousCallbackNames,
      );
    } else {
      const quotedKey = quotedPropertyEnd(uncommentedSource, i, property);
      if (quotedKey !== -1 && isDirectPropertyStart(source, optionsOpen, i)) {
        found = parsePhaseCallbackProperty(
          sourceIndex,
          quotedKey,
          optionsClose,
          property,
          callbacksByName,
          ambiguousCallbackNames,
        );
      }
    }

    const close = closingDelimiter(sourceIndex, i);
    if (close !== -1 && close < optionsClose) i = close;
  }

  return found;
}

function parsePhaseCallbackProperty(
  sourceIndex: SourceIndex,
  afterName: number,
  optionsClose: number,
  property: string,
  callbacksByName: Map<string, CallbackRange>,
  ambiguousCallbackNames: Set<string>,
): CallbackRange | null {
  const { source } = sourceIndex;
  const next = nextNonWhitespace(source, afterName);

  if (source[next] === ':') {
    const valueStart = nextNonWhitespace(source, next + 1);
    const inline = inlineCallbackRange(sourceIndex, valueStart, optionsClose);
    if (inline) return inline;

    const reference = /^([A-Za-z_$][\w$]*)\b/.exec(
      source.slice(valueStart, optionsClose),
    )?.[1];
    if (!reference) return null;
    if (ambiguousCallbackNames.has(reference)) return null;
    const referenceEnd = nextNonWhitespace(
      source,
      valueStart + reference.length,
    );
    const valueEnd = propertyValueEnd(sourceIndex, referenceEnd, optionsClose);
    const assertion = source.slice(referenceEnd, valueEnd).trim();
    if (assertion && !/^(?:as|satisfies)\b[\s\S]+$/.test(assertion)) {
      return null;
    }
    return callbacksByName.get(reference) ?? null;
  }

  if (source[next] === '(') {
    return methodCallbackRange(sourceIndex, next, optionsClose);
  }

  if (source[next] === ',' || next === optionsClose) {
    if (ambiguousCallbackNames.has(property)) return null;
    return callbacksByName.get(property) ?? null;
  }

  return null;
}

function propertyValueEnd(
  sourceIndex: SourceIndex,
  start: number,
  optionsClose: number,
): number {
  const { source } = sourceIndex;
  for (let i = start; i < optionsClose; i++) {
    const close = closingDelimiter(sourceIndex, i);
    if (close !== -1 && close < optionsClose) {
      i = close;
      continue;
    }
    if (source[i] === ',') return i;
  }
  return optionsClose;
}

function quotedPropertyEnd(
  source: string,
  offset: number,
  property: string,
): number {
  const quote = source[offset];
  if (quote !== "'" && quote !== '"') return -1;
  return source.slice(offset + 1, offset + property.length + 1) === property &&
    source[offset + property.length + 1] === quote
    ? offset + property.length + 2
    : -1;
}

function inlineCallbackRange(
  sourceIndex: SourceIndex,
  valueStart: number,
  limit: number,
): CallbackRange | null {
  const { source } = sourceIndex;
  let cursor = valueStart;
  let callbackLimit = limit;
  if (/^async\b/.test(source.slice(cursor))) {
    cursor = nextNonWhitespace(source, cursor + 'async'.length);
  }

  if (/^function\b/.test(source.slice(cursor))) {
    return functionCallbackRange(sourceIndex, cursor, limit);
  }

  while (source[cursor] === '(') {
    const wrapperClose = matchingParen(sourceIndex, cursor);
    if (wrapperClose === -1 || wrapperClose > callbackLimit) return null;
    const afterWrapper = nextNonWhitespace(source, wrapperClose + 1);
    if (
      source.slice(afterWrapper, afterWrapper + 2) === '=>' ||
      source[afterWrapper] === ':'
    ) {
      break;
    }
    cursor = nextNonWhitespace(source, cursor + 1);
    callbackLimit = wrapperClose;
  }

  let afterParams: number;
  if (source[cursor] === '(') {
    const paramsClose = matchingParen(sourceIndex, cursor);
    if (paramsClose === -1 || paramsClose > callbackLimit) return null;
    afterParams = nextNonWhitespace(source, paramsClose + 1);
  } else {
    const param = /^[A-Za-z_$][\w$]*/.exec(source.slice(cursor))?.[0];
    if (!param) return null;
    afterParams = nextNonWhitespace(source, cursor + param.length);
  }

  const arrowStart =
    source[afterParams] === ':'
      ? source.indexOf('=>', afterParams + 1)
      : afterParams;
  if (
    arrowStart === -1 ||
    arrowStart > callbackLimit ||
    source.slice(arrowStart, arrowStart + 2) !== '=>'
  ) {
    return null;
  }

  const bodyStart = nextNonWhitespace(source, arrowStart + 2);
  if (source[bodyStart] === '{') {
    return callbackBodyRange(sourceIndex, bodyStart, callbackLimit);
  }
  return {
    start: arrowStart,
    end: callbackExpressionEnd(sourceIndex, bodyStart, callbackLimit),
  };
}

function functionCallbackRange(
  sourceIndex: SourceIndex,
  functionStart: number,
  limit: number,
): CallbackRange | null {
  const { source } = sourceIndex;
  const paramsOpen = source.indexOf('(', functionStart + 'function'.length);
  if (paramsOpen === -1 || paramsOpen > limit) return null;
  const paramsClose = matchingParen(sourceIndex, paramsOpen);
  if (paramsClose === -1 || paramsClose > limit) return null;

  let bodyOpen = nextNonWhitespace(source, paramsClose + 1);
  if (source[bodyOpen] === ':') {
    bodyOpen = source.indexOf('{', bodyOpen + 1);
    const semicolon = source.indexOf(';', paramsClose + 1);
    if (semicolon !== -1 && (bodyOpen === -1 || semicolon < bodyOpen)) {
      return null;
    }
  }
  return bodyOpen !== -1 && bodyOpen < limit
    ? callbackBodyRange(sourceIndex, bodyOpen, limit)
    : null;
}

function methodCallbackRange(
  sourceIndex: SourceIndex,
  paramsOpen: number,
  optionsClose: number,
): CallbackRange | null {
  const { source } = sourceIndex;
  const paramsClose = matchingParen(sourceIndex, paramsOpen);
  if (paramsClose === -1 || paramsClose > optionsClose) return null;

  let bodyOpen = nextNonWhitespace(source, paramsClose + 1);
  if (source[bodyOpen] === ':') {
    bodyOpen = source.indexOf('{', bodyOpen + 1);
    while (bodyOpen !== -1 && bodyOpen < optionsClose) {
      const bodyClose = sourceIndex.bracePairs.get(bodyOpen);
      if (bodyClose === undefined) return null;
      const afterBody = nextNonWhitespace(source, bodyClose + 1);
      if (afterBody === optionsClose || source[afterBody] === ',') break;
      bodyOpen = source.indexOf('{', bodyClose + 1);
    }
  }
  if (bodyOpen === -1 || source[bodyOpen] !== '{') return null;
  return callbackBodyRange(sourceIndex, bodyOpen, optionsClose);
}

function callbackBodyRange(
  sourceIndex: SourceIndex,
  open: number,
  limit: number,
): CallbackRange | null {
  const end = sourceIndex.bracePairs.get(open);
  return end !== undefined && end <= limit ? { start: open + 1, end } : null;
}

function callbackExpressionEnd(
  sourceIndex: SourceIndex,
  start: number,
  limit: number,
): number {
  const { source } = sourceIndex;
  for (let i = start; i < limit; i++) {
    const close = closingDelimiter(sourceIndex, i);
    if (close !== -1 && close < limit) {
      i = close;
      continue;
    }
    if (/[,;\n)\]}]/.test(source[i] as string)) return i;
  }
  return limit;
}

function closingDelimiter(sourceIndex: SourceIndex, open: number): number {
  return (
    sourceIndex.bracePairs.get(open) ??
    sourceIndex.parenPairs.get(open) ??
    sourceIndex.bracketPairs.get(open) ??
    -1
  );
}

function isDirectPropertyStart(
  source: string,
  optionsOpen: number,
  offset: number,
): boolean {
  let previous = offset - 1;
  while (previous > optionsOpen && /\s/.test(source[previous] as string)) {
    previous--;
  }
  return previous === optionsOpen || source[previous] === ',';
}

function isIdentifierPart(ch: string | undefined): boolean {
  return ch !== undefined && /[\w$]/.test(ch);
}

function nextNonWhitespace(source: string, offset: number): number {
  let cursor = offset;
  while (cursor < source.length && /\s/.test(source[cursor] as string)) {
    cursor++;
  }
  return cursor;
}

const EMPTY_MOVE_ANALYSIS: MoveAnalysis = {
  propRanges: new Map(),
  handlerLines: new Set(),
};

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
  const { bracePairs, parenPairs, bracketPairs, regexRanges } =
    pairedDelimiters(source);
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  return {
    source,
    lineStarts,
    bracePairs,
    parenPairs,
    bracketPairs,
    regexRanges,
  };
}

function collectCallbacks(sourceIndex: SourceIndex): CallbackCollection {
  const { source, bracePairs } = sourceIndex;
  const callbacks: CallbackRange[] = [];
  const callbacksByRange = new Map<string, CallbackRange>();
  const callbacksByName = new Map<string, CallbackRange>();
  const ambiguousCallbackNames = new Set<string>();
  const callbackRanges: CallbackRange[] = [];
  const callbackRangeKeys = new Set<string>();

  function registerLexicalCallback(start: number, end: number): void {
    const key = `${start}:${end}`;
    if (callbackRangeKeys.has(key)) return;
    callbackRangeKeys.add(key);
    callbackRanges.push({ start, end });
  }

  function registerCallback(name: string, start: number, end: number) {
    const key = `${start}:${end}`;
    let callback = callbacksByRange.get(key);
    if (!callback) {
      callback = { start, end };
      callbacksByRange.set(key, callback);
      callbacks.push(callback);
    }
    registerLexicalCallback(start, end);
    const previous = callbacksByName.get(name);
    if (
      previous &&
      (previous.start !== callback.start || previous.end !== callback.end)
    ) {
      ambiguousCallbackNames.add(name);
    }
    callbacksByName.set(name, callback);
  }

  for (const match of source.matchAll(
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,
  )) {
    const range = functionCallbackRange(
      sourceIndex,
      match.index,
      source.length,
    );
    if (range) registerCallback(match[1] as string, range.start, range.end);
  }

  const binding = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/g;
  for (const match of source.matchAll(binding)) {
    const valueStart = initializerAfterBinding(
      sourceIndex,
      match.index + match[0].length,
    );
    if (valueStart === -1) continue;
    const range = inlineCallbackRange(sourceIndex, valueStart, source.length);
    if (range) registerCallback(match[1] as string, range.start, range.end);
  }

  for (const match of source.matchAll(/\bfunction\b/g)) {
    const range = functionCallbackRange(
      sourceIndex,
      match.index,
      source.length,
    );
    if (range) registerLexicalCallback(range.start, range.end);
  }

  for (const match of source.matchAll(/[=]>/g)) {
    const bodyStart = nextNonWhitespace(source, match.index + 2);
    if (source[bodyStart] === '{') {
      const end = bracePairs.get(bodyStart);
      if (end !== undefined) registerLexicalCallback(bodyStart + 1, end);
    } else {
      registerLexicalCallback(
        match.index,
        callbackExpressionEnd(sourceIndex, bodyStart, source.length),
      );
    }
  }

  return {
    callbacks,
    callbacksByName,
    ambiguousCallbackNames,
    callbackRanges,
  };
}

function initializerAfterBinding(
  sourceIndex: SourceIndex,
  afterName: number,
): number {
  const { source } = sourceIndex;
  const limit = Math.min(source.length, afterName + 2000);
  for (let i = afterName; i < limit; i++) {
    if (source[i] === ';') return -1;
    const close = closingDelimiter(sourceIndex, i);
    if (close !== -1 && close < limit) {
      i = close;
      continue;
    }
    if (
      source[i] === '=' &&
      source[i + 1] !== '>' &&
      source[i + 1] !== '=' &&
      source[i - 1] !== '=' &&
      source[i - 1] !== '!' &&
      source[i - 1] !== '<' &&
      source[i - 1] !== '>'
    ) {
      return nextNonWhitespace(source, i + 1);
    }
  }
  return -1;
}

function collectSchedulingCalls(
  source: string,
  callbacks: CallbackRange[],
  callbacksByName: Map<string, CallbackRange>,
  ambiguousCallbackNames: Set<string>,
  callPattern: RegExp,
): SchedulingCall[] {
  const calls: SchedulingCall[] = [];
  for (const match of source.matchAll(callPattern)) {
    const open = match.index + match[0].lastIndexOf('(');
    const callbackName = firstArgumentIdentifier(source, open + 1);
    const target =
      callbackName && !ambiguousCallbackNames.has(callbackName)
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
    recurringCallbackRanges: [...recurringCallbacks],
  };
}

function pairedDelimiters(source: string): {
  bracePairs: Map<number, number>;
  parenPairs: Map<number, number>;
  bracketPairs: Map<number, number>;
  regexRanges: SourceRange[];
} {
  const bracePairs = new Map<number, number>();
  const parenPairs = new Map<number, number>();
  const bracketPairs = new Map<number, number>();
  const braces: number[] = [];
  const parens: number[] = [];
  const brackets: number[] = [];
  const regexRanges: SourceRange[] = [];
  const controlParenCloses = new Set<number>();

  for (let i = 0; i < source.length; i++) {
    if (
      source[i] === '/' &&
      isRegexLiteralStart(source, i, controlParenCloses)
    ) {
      const end = regexLiteralEnd(source, i);
      if (end > i) {
        regexRanges.push({ start: i, end: end + 1 });
        i = end;
        continue;
      }
    }

    if (source[i] === '{') braces.push(i);
    else if (source[i] === '}' && braces.length > 0) {
      bracePairs.set(braces.pop() as number, i);
    } else if (source[i] === '(') parens.push(i);
    else if (source[i] === ')' && parens.length > 0) {
      const open = parens.pop() as number;
      parenPairs.set(open, i);
      const before = previousNonWhitespace(source, open - 1, 0);
      if (
        /^(?:if|while|for|with|switch|catch)$/.test(
          identifierEndingAt(source, before),
        )
      ) {
        controlParenCloses.add(i);
      }
    } else if (source[i] === '[') brackets.push(i);
    else if (source[i] === ']' && brackets.length > 0) {
      bracketPairs.set(brackets.pop() as number, i);
    }
  }

  return { bracePairs, parenPairs, bracketPairs, regexRanges };
}

function isRegexLiteralStart(
  source: string,
  offset: number,
  controlParenCloses: Set<number>,
): boolean {
  const previous = previousNonWhitespace(source, offset - 1, 0);
  if (previous < 0) return true;
  if (source[previous] === ')' && controlParenCloses.has(previous)) return true;
  if (/[=(:,[!&|?;{>]/.test(source[previous] as string)) return true;
  return /^(?:return|case|throw|yield)$/.test(
    identifierEndingAt(source, previous),
  );
}

function regexLiteralEnd(source: string, start: number): number {
  let inClass = false;
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === '\n') return i - 1;
    if (ch === '\\') {
      i++;
    } else if (ch === '[') {
      inClass = true;
    } else if (ch === ']') {
      inClass = false;
    } else if (ch === '/' && !inClass) {
      while (/[a-z]/i.test(source[i + 1] ?? '')) i++;
      return i;
    }
  }
  return source.length - 1;
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
  'per-frame-allocation': matchesPerFrameAllocation,
  'subscribed-media-query': (analysis, line) =>
    analysis.subscribedMediaQueries.has(line),
  'recurring-raf-branch': matchesRecurringRafBranch,
  'recurring-timer': (analysis, line) =>
    INTERVAL_CALL.test(analysis.uncommentedLines[line] ?? '') ||
    analysis.timeout.recurringScheduleLines.has(line),
  'move-handler-layout-read': matchesMoveHandlerLayoutRead,
} satisfies Record<string, EvidencePredicate>;

export type EvidenceName = keyof typeof EVIDENCE_REGISTRY;

function matchesPerFrameAllocation(
  analysis: FileAnalysis,
  line: number,
  match: RegExpExecArray,
): boolean {
  const offset = (analysis.lineStarts[line] ?? 0) + match.index;
  const rafOwned = innermostRange(analysis.raf.recurringCallbackRanges, offset);
  const phaseOwned = innermostRange(analysis.phaseFrameCallbacks, offset);
  const owned =
    rafOwned && phaseOwned
      ? rafOwned.end - rafOwned.start < phaseOwned.end - phaseOwned.start
        ? rafOwned
        : phaseOwned
      : (rafOwned ?? phaseOwned);
  if (!owned) return false;
  if (innermostRange(analysis.sourceIndex.regexRanges, offset)) return false;

  const lexical = innermostRange(analysis.callbackRanges, offset);
  if (
    lexical &&
    lexical.start >= owned.start &&
    lexical.end <= owned.end &&
    (lexical.start !== owned.start || lexical.end !== owned.end)
  ) {
    return false;
  }

  return (
    match[0][0] === '.' ||
    isRuntimeLiteralStart(analysis.sourceIndex, offset, owned)
  );
}

function innermostRange(
  ranges: SourceRange[],
  offset: number,
): SourceRange | null {
  let found: SourceRange | null = null;
  for (const range of ranges) {
    if (offset < range.start || offset >= range.end) continue;
    if (!found || range.end - range.start < found.end - found.start) {
      found = range;
    }
  }
  return found;
}

function isRuntimeLiteralStart(
  sourceIndex: SourceIndex,
  offset: number,
  owner: SourceRange,
): boolean {
  const { source } = sourceIndex;
  const literal = source[offset];
  const close =
    literal === '{'
      ? sourceIndex.bracePairs.get(offset)
      : sourceIndex.bracketPairs.get(offset);
  if (
    close !== undefined &&
    source[nextNonWhitespace(source, close + 1)] === '='
  ) {
    return false;
  }

  const previous = previousNonWhitespace(source, offset - 1, owner.start);
  if (previous < owner.start) return literal === '[';

  const previousChar = source[previous] as string;
  if (previousChar === '>' && source[previous - 1] === '=') {
    return literal === '[' && previous - 1 === owner.start;
  }

  const previousWord = identifierEndingAt(source, previous);
  if (/^(?:const|let|var|type|interface)$/.test(previousWord)) return false;
  if (/^(?:return|yield|throw)$/.test(previousWord)) return true;

  const statementStart = Math.max(
    owner.start,
    source.lastIndexOf(';', offset - 1) + 1,
  );
  const prefix = source.slice(statementStart, offset);
  if (/(?:^|[;\n])\s*(?:type|interface)\b[^;]*$/s.test(prefix)) {
    return false;
  }
  if (/\b(?:as|satisfies)\s*$/.test(prefix)) return false;
  if (previousChar === ':') {
    const beforeColon = previousNonWhitespace(
      source,
      previous - 1,
      statementStart,
    );
    if (source[beforeColon] === '?' || !prefix.includes('?')) return false;
  }

  if (/[A-Za-z0-9_$.)\]>]/.test(previousChar)) return false;
  if (literal === '{' && /[;}>]/.test(previousChar)) return false;
  return /[=(:,?[{@!&|]/.test(previousChar);
}

function previousNonWhitespace(
  source: string,
  offset: number,
  limit: number,
): number {
  let cursor = offset;
  while (cursor >= limit && /\s/.test(source[cursor] as string)) cursor--;
  return cursor;
}

function identifierEndingAt(source: string, end: number): string {
  if (!/[A-Za-z0-9_$]/.test(source[end] ?? '')) return '';
  let start = end;
  while (start > 0 && /[A-Za-z0-9_$]/.test(source[start - 1] as string)) {
    start--;
  }
  return source.slice(start, end + 1);
}

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
