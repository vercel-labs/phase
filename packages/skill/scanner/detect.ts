import {
  analyzeFile,
  buildSourceIndex,
  enclosingBlock,
  EVIDENCE_REGISTRY,
} from './analysis.ts';
import type { FileAnalysis } from './analysis.ts';
import { FINDING_IDENTITY_FILE, FINDING_SOURCE_LINE } from './baseline.ts';
import {
  commentText,
  maskComments,
  maskStrings,
  parseSuppressionDirective,
} from './lex.ts';
import { SIGNALS } from './signals.ts';
import type { ScanNoise, ScanSeverity, ScanSignal } from './signals.ts';
import { FRAME_DRIVER } from './vocabulary.ts';
import { EXCLUDED_PATHS, extOf, signalAppliesTo, typeOf } from './walk.ts';
import type { ScanDiag, ScanSourceType } from './walk.ts';

export type ScanExecution = 'per-frame' | 'incidental';

export interface ScanFinding {
  signal: string;
  severity: ScanSeverity;
  noise: ScanNoise;
  execution: ScanExecution | null;
  file: string;
  line: number;
  text: string;
  fix: string;
  [FINDING_IDENTITY_FILE]?: string;
  [FINDING_SOURCE_LINE]?: string;
}

type Suppressions = Map<number, Set<string>>;

/** Diagnostics sink shared by scanTargets, walk, and scanFile. */
export function newDiag(): ScanDiag {
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
 * that fires. Pass the full diagnostics object returned by newDiag() to
 * collect analysis, skip, suppression, and warning counts.
 */
export function scanFile(
  relPath: string,
  content: string,
  diag: ScanDiag | null = null,
): ScanFinding[] {
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

  const findings: ScanFinding[] = [];
  const lines = content.split(/\r?\n/);
  const uncommentedLines = maskComments(lines);
  const codeLines = maskStrings(uncommentedLines);
  const uncommentedContent = uncommentedLines.join('\n');
  const codeContent = codeLines.join('\n');
  const sourceIndex = buildSourceIndex(codeLines, codeContent);
  const analysis = analyzeFile(type, sourceIndex, uncommentedLines);

  if (diag) diag.analyzed++;

  // Generated content — minified bundles, inlined data URIs, i18n blobs —
  // lives on lines no human wrote and no report could usefully quote. Drop
  // the line, not the file: an average-length heuristic discarded whole
  // files of real source over a single embedded blob.
  const overlong = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').length > MAX_LINE_LENGTH) overlong.add(i);
  }
  if (diag) diag.linesSkipped += overlong.size;

  const suppressions = collectSuppressions(relPath, commentText(lines), diag);

  for (const signal of SIGNALS) {
    if (!signalAppliesTo(signal, type, ext as string)) continue;

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
      analysis,
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

const FRAME_DRIVER_WINDOW = 6;

// Longest line a human plausibly wrote. Longer lines are generated content;
// see scanFile.
const MAX_LINE_LENGTH = 1000;

// Findings quote a source line; an unbounded quote turns one generated line
// into megabytes of JSON in an agent's context window.
const MAX_FINDING_TEXT = 120;

function collectSuppressions(
  relPath: string,
  comments: string[],
  diag: ScanDiag | null,
): Suppressions {
  const suppressions: Suppressions = new Map();
  for (let i = 0; i < comments.length; i++) {
    const directive = parseSuppressionDirective(comments[i] ?? '');
    if (!directive) continue;
    if (!directive.reason) {
      if (diag) {
        diag.warnings.push(
          `${relPath}:${i + 1}  phase-scan-ignore is missing a reason (use: phase-scan-ignore <signal-id> -- <reason>); directive ignored`,
        );
      }
      continue;
    }
    if (!SIGNALS.some((s) => s.id === directive.signalId)) {
      if (diag) {
        diag.warnings.push(
          `${relPath}:${i + 1}  phase-scan-ignore names unknown signal '${directive.signalId}'; directive ignored`,
        );
      }
      continue;
    }
    for (const target of [i, i + 1]) {
      if (!suppressions.has(target)) suppressions.set(target, new Set());
      (suppressions.get(target) as Set<string>).add(directive.signalId);
    }
  }
  return suppressions;
}

function suppressedAnywhere(
  suppressions: Suppressions,
  signalId: string,
): boolean {
  for (const ids of suppressions.values()) {
    if (ids.has(signalId)) return true;
  }
  return false;
}

/** Runs one signal over a file's lines, honoring suppressions and perFile. */
function scanSignal(
  signal: ScanSignal,
  lines: string[],
  uncommentedLines: string[],
  codeLines: string[],
  relPath: string,
  suppressions: Suppressions,
  overlong: Set<number>,
  type: ScanSourceType,
  diag: ScanDiag | null,
  analysis: FileAnalysis,
): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const matchLines = signal.codeOnly ? codeLines : uncommentedLines;
  const candidatePattern = signal.pattern
    ? new RegExp(
        signal.pattern.source,
        signal.pattern.flags.includes('g')
          ? signal.pattern.flags
          : `${signal.pattern.flags}g`,
      )
    : null;
  for (let i = 0; i < lines.length; i++) {
    if (overlong.has(i)) continue;
    const line = lines[i] ?? '';
    const matchLine = matchLines[i] ?? '';
    let matchIndex = 0;
    let matchOffset: number | null = null;

    if (signal.matcher) {
      if (!signal.matcher(matchLines, i, relPath)) continue;
    } else {
      if (!matchesSignalContext(signal, codeLines, uncommentedLines, i))
        continue;
      if (!candidatePattern) continue;
      const match = firstAcceptedMatch(
        signal,
        candidatePattern,
        matchLine,
        analysis,
        i,
      );
      if (!match) continue;
      matchIndex = match.index;
      matchOffset = match.index;
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
        executionOf(codeLines, i, type, analysis, matchOffset),
      ),
    );

    if (signal.perFile) break;
  }
  return findings;
}

function firstAcceptedMatch(
  signal: ScanSignal,
  pattern: RegExp,
  line: string,
  analysis: FileAnalysis,
  lineIndex: number,
): RegExpExecArray | null {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line))) {
    if (
      !signal.evidence ||
      EVIDENCE_REGISTRY[signal.evidence](analysis, lineIndex, match)
    ) {
      return match;
    }
  }
  return null;
}

function matchesSignalContext(
  signal: ScanSignal,
  codeLines: string[],
  uncommentedLines: string[],
  line: number,
): boolean {
  if (!signal.contextPattern) return true;
  const contextLines = signal.codeOnly ? codeLines : uncommentedLines;
  const radius = signal.contextLines ?? 5;
  const block =
    signal.contextScope === 'block' ? enclosingBlock(contextLines, line) : null;
  const from = block?.start ?? Math.max(0, line - radius);
  const to = block ? block.end + 1 : line + radius + 1;
  const context = contextLines.slice(from, to).join('\n');
  return signal.contextPattern.test(context);
}

function makeFinding(
  signal: ScanSignal,
  file: string,
  line: number,
  text: string,
  matchIndex: number,
  execution: ScanExecution | null,
): ScanFinding {
  return {
    signal: signal.id,
    severity: signal.severity,
    noise: signal.noise,
    execution,
    file,
    line,
    text: excerpt(text, matchIndex),
    fix: signal.fix,
    [FINDING_SOURCE_LINE]: text,
  };
}

/**
 * Whether a frame driver runs this line. Meaningless for stylesheets, which
 * report null.
 */
function executionOf(
  lines: string[],
  i: number,
  type: ScanSourceType,
  analysis: FileAnalysis,
  matchOffset: number | null,
): ScanExecution | null {
  if (type !== 'js') return null;
  if (
    analysis.raf.recurringCallbackLines.has(i) ||
    analysis.raf.recurringScheduleLines.has(i)
  ) {
    return 'per-frame';
  }
  const lineStart = analysis.lineStarts[i] ?? 0;
  const lineEnd = analysis.lineStarts[i + 1] ?? Number.POSITIVE_INFINITY;
  if (
    matchOffset === null
      ? analysis.phaseFrameCallbacks.some(
          (range) => range.start < lineEnd && range.end >= lineStart,
        )
      : analysis.phaseFrameCallbacks.some((range) => {
          const offset = lineStart + matchOffset;
          return offset >= range.start && offset < range.end;
        })
  ) {
    return 'per-frame';
  }
  // A move event runs code inside an intrinsic JSX move handler. Rank the
  // handler body and its prop line directly because the window below cannot
  // see a handler defined far from its JSX.
  if (
    analysis.moveHandlers.handlerLines.has(i) ||
    analysis.moveHandlers.propRanges.has(i)
  ) {
    return 'per-frame';
  }
  const from = Math.max(0, i - FRAME_DRIVER_WINDOW);
  const window = lines.slice(from, i + FRAME_DRIVER_WINDOW + 1).join('\n');
  return FRAME_DRIVER.test(window) ? 'per-frame' : 'incidental';
}

// ANSI escape sequences (CSI, OSC, and single-character escapes), then a
// sweep of the remaining C0/C1 controls and Unicode bidi overrides. Scanned
// code is untrusted input: an escape sequence in an excerpt can restyle or
// hide report text in a terminal, and a bidi override can make the quoted
// line read differently than it parses (trojan source). Tabs survive.
/* oxlint-disable no-control-regex -- matching control characters is the point: these strip them */
const ANSI_SEQUENCE =
  /\u001b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|[@-Z\\-_])/g;
const INVISIBLE_CONTROL =
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
/* oxlint-enable no-control-regex */

export function sanitizeTerminalText(text: string): string {
  return text.replace(ANSI_SEQUENCE, '').replace(INVISIBLE_CONTROL, '');
}

/**
 * The quoted source line, windowed around the match and stripped of
 * control characters. Truncating from column zero hid the matched token in
 * 8 of 12 Tailwind findings on a real app: the reader got a wall of class
 * names with no indication of why.
 */
function excerpt(line: string, matchIndex: number): string {
  const text = line.trim();
  if (text.length <= MAX_FINDING_TEXT) return sanitizeTerminalText(text);

  const offset = matchIndex - (line.length - line.trimStart().length);
  if (offset < 0 || offset >= text.length) {
    return sanitizeTerminalText(`${text.slice(0, MAX_FINDING_TEXT)}…`);
  }

  const lead = Math.floor(MAX_FINDING_TEXT / 4);
  const start = Math.max(
    0,
    Math.min(offset - lead, text.length - MAX_FINDING_TEXT),
  );
  const end = start + MAX_FINDING_TEXT;
  return sanitizeTerminalText(
    `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`,
  );
}

/** Drops a finding when a more specific signal fired on the same line. */
function dedup(findings: ScanFinding[]): ScanFinding[] {
  const supersededLines = new Map<string, Set<number>>();
  for (const signal of SIGNALS) {
    if (!signal.supersedes) continue;
    for (const f of findings) {
      if (f.signal === signal.id) {
        if (!supersededLines.has(signal.supersedes)) {
          supersededLines.set(signal.supersedes, new Set<number>());
        }
        (supersededLines.get(signal.supersedes) as Set<number>).add(f.line);
      }
    }
  }
  if (supersededLines.size === 0) return findings;
  return findings.filter((f) => {
    const lines = supersededLines.get(f.signal);
    return !lines || !lines.has(f.line);
  });
}
