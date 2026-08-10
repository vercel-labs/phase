/**
 * Type declarations for scan-examples.mjs. Contributor tooling only.
 * Update alongside scan-examples.mjs; the spec imports through this shim,
 * so a drift causes type errors at authoring time.
 */

import type { ScanExample } from './scan.d.mts';

export interface SignalExamples {
  match: ScanExample[];
  noMatch: ScanExample[];
}

export declare const SIGNAL_EXAMPLES: Record<string, SignalExamples>;
