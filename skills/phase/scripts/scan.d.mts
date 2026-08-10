/**
 * Type declarations for scan.mjs. Contributor tooling only (not shipped
 * in the skill zip). The spec imports through this shim, so a drift
 * between this file and scan.mjs causes type errors at authoring time.
 *
 * Update this file whenever you change the shape of SIGNALS, ScanResult,
 * or any public function signature in scan.mjs.
 */

export type ScanSeverity = 'critical' | 'high' | 'medium' | 'dedup';
export type ScanNoise = 'precise' | 'normal' | 'noisy';
/** Whether a frame driver runs the line. null for stylesheets. */
export type ScanExecution = 'per-frame' | 'incidental';

export interface ScanExample {
  file: string;
  content: string;
}

export interface ScanSignal {
  id: string;
  label: string;
  severity: ScanSeverity;
  noise: ScanNoise;
  why: string;
  replacement: string;
  fix: string;
  supersedes?: string;
  fileTypes?: string | string[];
  perFile?: boolean;
  /** Match executable code with comments and strings blanked. */
  codeOnly?: boolean;
  /** Apply negativePattern to code rather than strings or comments. */
  negativeCodeOnly?: boolean;
  /** Override the default ±5-line contextPattern radius. */
  contextLines?: number;
  /** Restrict contextPattern to the smallest enclosing brace block. */
  contextScope?: 'block';
}

export interface ScanFinding {
  signal: string;
  severity: ScanSeverity;
  noise: ScanNoise;
  execution: ScanExecution | null;
  file: string;
  line: number;
  text: string;
  fix: string;
}

export interface ScanContext {
  framework: 'next' | null;
  appRouter: boolean;
  ppr: boolean;
  clientComponents: number;
  /** Paths that produced the detection, so the stamp can be judged. */
  evidence: string[];
}

export interface ScanSkipped {
  excluded: number;
  unsupported: number;
  generated: number;
  unreadable: number;
  unreadableDirs: number;
}

export interface ScanResult {
  targets: string[];
  /** Files actually analyzed, never files merely opened. */
  filesScanned: number;
  filesSkipped: ScanSkipped;
  linesSkipped: number;
  findings: ScanFinding[];
  suppressed: number;
  warnings: string[];
  context: ScanContext;
}

export interface ScanDiag {
  suppressed: number;
  warnings: string[];
  analyzed: number;
  linesSkipped: number;
  skipped: ScanSkipped;
}

export interface ScanJson {
  schemaVersion: number;
  skillVersion: string;
  targets: string[];
  summary: {
    filesScanned: number;
    filesSkipped: ScanSkipped | null;
    linesSkipped: number;
    total: number;
    sites: number;
    returned: number;
    actionable: number;
    dedup: number;
    perFrame: number;
    suppressed: number;
    bySeverity: { critical: number; high: number; medium: number };
  };
  hotspots: { file: string; count: number }[];
  context: ScanContext | null;
  warnings: string[];
  findings: ScanFinding[];
}

export declare const SIGNALS: ScanSignal[];
export declare const SEVERITY_ORDER: ScanSeverity[];

export interface ScanOptions {
  /** Paths to skip: substring, or glob when it contains a wildcard. */
  exclude?: string[];
}

export declare function scanTargets(
  paths: string[],
  options?: ScanOptions,
): ScanResult;
export declare function scanFile(
  relPath: string,
  content: string,
  diag?: ScanDiag | null,
): ScanFinding[];
export declare function newDiag(): ScanDiag;
export declare function formatText(result: ScanResult): string;
export declare function formatJson(
  result: ScanResult,
  limit?: number | null,
): ScanJson;
