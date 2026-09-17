/**
 * Lexical masks preserve every input line's length. Consumers may therefore
 * use match offsets from a masked line to excerpt the same position in the
 * raw source line.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Produces either source with comments blanked or only the comment text.
 * Character positions are preserved so finding excerpts still center on the
 * original match. Strings are tracked so URLs and directive examples cannot
 * become comments or suppressions.
 */
// oxlint-disable-next-line complexity -- the lexer has explicit quote/comment states
function lexComments(lines: string[], commentsOnly: boolean): string[] {
  const result: string[] = [];
  let block = false;
  let quote: string | null = null;

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

export function maskComments(lines: string[]): string[] {
  return lexComments(lines, false);
}

export function commentText(lines: string[]): string[] {
  return lexComments(lines, true);
}

/** Blanks quoted text while preserving line lengths for code-only signals. */
export function maskStrings(lines: string[]): string[] {
  const result: string[] = [];
  let quote: string | null = null;
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

export interface StaticClassToken {
  value: string;
  index: number;
}

interface TokenBuffer extends StaticClassToken {
  line: number;
}

type ClassTokenMode =
  | { kind: 'code'; templateDepth: number | null }
  | { kind: 'block-comment' }
  | {
      kind: 'quote';
      quote: "'" | '"';
      token: TokenBuffer | null;
    }
  | { kind: 'template'; dynamic: boolean; token: TokenBuffer | null };
type TokenCollectingMode = Extract<
  ClassTokenMode,
  { token: TokenBuffer | null }
>;

const staticClassTokenCache = new WeakMap<string[], StaticClassToken[][]>();

function appendStaticClassToken(
  mode: TokenCollectingMode,
  value: string,
  line: number,
  index: number,
): void {
  mode.token ??= { value: '', index, line };
  mode.token.value += value;
}

/**
 * Finds the first complete static class token accepted by `matches` on one
 * line. The file is lexed once per position-preserving lines array.
 */
export function findStaticClassToken(
  lines: string[],
  line: number,
  matches: (token: string) => boolean,
): StaticClassToken | null {
  let tokens = staticClassTokenCache.get(lines);
  if (!tokens) {
    tokens = collectStaticClassTokens(lines);
    staticClassTokenCache.set(lines, tokens);
  }

  for (const token of tokens[line] ?? []) {
    if (matches(token.value)) return token;
  }
  return null;
}

// oxlint-disable-next-line complexity -- explicit source modes keep interpolation local
function collectStaticClassTokens(lines: string[]): StaticClassToken[][] {
  const tokens = lines.map(() => [] as StaticClassToken[]);
  const modes: ClassTokenMode[] = [{ kind: 'code', templateDepth: null }];

  const flush = (mode: TokenCollectingMode) => {
    if (mode.token?.value) {
      tokens[mode.token.line]?.push({
        value: mode.token.value,
        index: mode.token.index,
      });
    }
    mode.token = null;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const source = lines[lineIndex] ?? '';

    for (let index = 0; index < source.length; index++) {
      const ch = source[index] as string;
      const next = source[index + 1];
      const mode = modes.at(-1) as ClassTokenMode;

      if (mode.kind === 'block-comment') {
        if (ch === '*' && next === '/') {
          modes.pop();
          index++;
        }
        continue;
      }

      if (mode.kind === 'code') {
        if (ch === '/' && next === '/') {
          break;
        } else if (ch === '/' && next === '*') {
          modes.push({ kind: 'block-comment' });
          index++;
        } else if (ch === "'" || ch === '"') {
          modes.push({ kind: 'quote', quote: ch, token: null });
        } else if (ch === '`') {
          modes.push({ kind: 'template', dynamic: false, token: null });
        } else if (mode.templateDepth !== null && ch === '{') {
          mode.templateDepth++;
        } else if (mode.templateDepth !== null && ch === '}') {
          mode.templateDepth--;
          if (mode.templateDepth === 0) modes.pop();
        }
        continue;
      }

      if (mode.kind === 'quote') {
        if (ch === '\\') {
          appendStaticClassToken(mode, ch, lineIndex, index);
          if (next !== undefined) {
            appendStaticClassToken(mode, next, lineIndex, index + 1);
            index++;
          }
        } else if (ch === mode.quote) {
          flush(mode);
          modes.pop();
        } else if (/\s/.test(ch)) {
          flush(mode);
        } else {
          appendStaticClassToken(mode, ch, lineIndex, index);
        }
        continue;
      }

      if (ch === '\\') {
        if (!mode.dynamic) {
          appendStaticClassToken(mode, ch, lineIndex, index);
        }
        if (next !== undefined) {
          if (!mode.dynamic) {
            appendStaticClassToken(mode, next, lineIndex, index + 1);
          }
          index++;
        }
      } else if (ch === '`') {
        if (mode.dynamic) mode.token = null;
        else flush(mode);
        modes.pop();
      } else if (ch === '$' && next === '{') {
        mode.token = null;
        mode.dynamic = true;
        modes.push({ kind: 'code', templateDepth: 1 });
        index++;
      } else if (/\s/.test(ch)) {
        if (mode.dynamic) mode.token = null;
        else flush(mode);
        mode.dynamic = false;
      } else if (!mode.dynamic) {
        appendStaticClassToken(mode, ch, lineIndex, index);
      }
    }

    const mode = modes.at(-1) as ClassTokenMode;
    if (mode.kind === 'block-comment') {
      continue;
    } else if (mode.kind === 'quote') {
      mode.token = null;
      modes.pop();
    } else if (mode.kind === 'template') {
      if (mode.dynamic) mode.token = null;
      else flush(mode);
      mode.dynamic = false;
    }
  }

  return tokens;
}

const IGNORE_DIRECTIVE = /phase-scan-ignore:?\s+([a-z-]+)(?:\s+--\s*(\S.*))?/;

export interface SuppressionDirective {
  signalId: string;
  reason: string | null;
}

/** Parses a suppression directive from comment text. */
export function parseSuppressionDirective(
  comment: string,
): SuppressionDirective | null {
  const match = IGNORE_DIRECTIVE.exec(comment);
  if (!match) return null;
  return {
    signalId: match[1] ?? '',
    reason: match[2] ?? null,
  };
}
