/**
 * Hand-written declarations for scan.mjs (contributor tooling only; not
 * shipped in the skill zip). Keep in sync with the exports in scan.mjs.
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
  fileTypes?: string | string[];
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
