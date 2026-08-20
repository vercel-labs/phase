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
