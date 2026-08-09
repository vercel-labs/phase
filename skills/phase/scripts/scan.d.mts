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
  fix: string;
  supersedes?: string;
  fileTypes?: string | string[];
  perFile?: boolean;
  examples: {
    match: ScanExample[];
    noMatch: ScanExample[];
  };
}

export interface ScanFinding {
  signal: string;
  severity: ScanSeverity;
  noise: ScanNoise;
  file: string;
  line: number;
  text: string;
  fix: string;
}

export interface ScanResult {
  targets: string[];
  filesScanned: number;
  findings: ScanFinding[];
  suppressed: number;
  warnings: string[];
}

export interface ScanDiag {
  suppressed: number;
  warnings: string[];
}

export interface ScanJson {
  schemaVersion: number;
  skillVersion: string;
  targets: string[];
  summary: {
    filesScanned: number;
    total: number;
    actionable: number;
    dedup: number;
    suppressed: number;
    bySeverity: { critical: number; high: number; medium: number };
  };
  warnings: string[];
  findings: ScanFinding[];
}

export declare const SIGNALS: ScanSignal[];
export declare const SEVERITY_ORDER: ScanSeverity[];

export declare function scanTargets(paths: string[]): ScanResult;
export declare function scanFile(
  relPath: string,
  content: string,
  diag?: ScanDiag | null,
): ScanFinding[];
export declare function formatText(result: ScanResult): string;
export declare function formatJson(result: ScanResult): ScanJson;
