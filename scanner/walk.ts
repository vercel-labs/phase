import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import { escapeRegExp } from './lex.ts';
import type { ScanSignal } from './signals.ts';

export type ScanSourceType = 'js' | 'css';

export interface ScanSkipped {
  excluded: number;
  unsupported: number;
  generated: number;
  unreadable: number;
  unreadableDirs: number;
}

export interface ScanDiag {
  suppressed: number;
  warnings: string[];
  analyzed: number;
  linesSkipped: number;
  skipped: ScanSkipped;
}

const FILE_TYPE_EXTENSIONS = {
  js: new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']),
  css: new Set(['.css', '.scss', '.sass', '.less']),
};

const JSX_EXTENSIONS = new Set(['.tsx', '.jsx']);

// Agent-config directories, vendored tooling, and this repository's eval
// fixtures and generated scanner contain code nobody will edit or deliberately
// bad example code; scanning them buries real findings. The skill script path
// is matched as a substring so it is skipped wherever the skill was installed.
export const EXCLUDED_PATHS =
  /node_modules|\.spec\.|\.test\.|\.stories\.|__tests__|__mocks__|\.agents\/|\.claude\/|\.cursor\/|\.yarn\/|^evals\/|skills\/phase\/scripts\//;

export const SKIP_DIRS = new Set([
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

export const SKIP_FILES = /\.min\.|\.d\.ts$|\.d\.mts$/;

export function toPosix(path: string): string {
  return path.split('\\').join('/');
}

/**
 * A --exclude value. Patterns with a wildcard are globs (`*` within a path
 * segment, `**` across); anything else is a plain path prefix or substring,
 * so `--exclude examples/` does what it looks like.
 */
export function toPathMatcher(pattern: string): (path: string) => boolean {
  if (!pattern.includes('*') && !pattern.includes('?')) {
    return (path: string) => path.includes(pattern);
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
      body += escapeRegExp(ch as string);
    }
  }
  const re = new RegExp(`^${body}$`);
  const matchBase = !pattern.includes('/');
  return (path: string) => re.test(matchBase ? basename(path) : path);
}

export function extOf(path: string): string | null {
  const dot = path.lastIndexOf('.');
  if (dot <= path.lastIndexOf('/')) return null;
  // Lowercased so case-insensitive filesystems (macOS, Windows) match.
  return path.slice(dot).toLowerCase();
}

export function typeOf(ext: string | null): ScanSourceType | null {
  if (ext === null) return null;
  if (FILE_TYPE_EXTENSIONS.js.has(ext)) return 'js';
  if (FILE_TYPE_EXTENSIONS.css.has(ext)) return 'css';
  return null;
}

export function signalAppliesTo(
  signal: ScanSignal,
  type: ScanSourceType,
  ext: string,
): boolean {
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

export function walk(
  dir: string,
  diag: ScanDiag,
  results: string[] = [],
): string[] {
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
