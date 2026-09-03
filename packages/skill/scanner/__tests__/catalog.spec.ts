import { formatSignalExplanation } from '../explain.ts';
import { FIX_SECTIONS } from '../fix-sections.gen.ts';
import {
  NOISE_TIERS,
  SEVERITY_ORDER,
  SIGNALS,
  validateSignalEvidence,
} from '../signals.ts';
import type { ScanSignal } from '../signals.ts';

describe('scan signal catalog', () => {
  it('has unique ids', () => {
    const ids = SIGNALS.map((signal) => signal.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects an unknown evidence name with the signal id', () => {
    // @ts-expect-error Evidence names are closed over the analysis registry.
    const unknownEvidence: NonNullable<ScanSignal['evidence']> =
      'unknown-evidence';
    expect(() =>
      validateSignalEvidence([
        { id: 'broken-signal', evidence: unknownEvidence },
      ]),
    ).toThrow(
      "Signal 'broken-signal' names unknown evidence 'unknown-evidence'",
    );
  });

  for (const signal of SIGNALS) {
    describe(signal.id, () => {
      it('declares complete triage metadata', () => {
        expect(SEVERITY_ORDER).toContain(signal.severity);
        expect(NOISE_TIERS).toContain(signal.noise);
        expect(signal.detects.length).toBeGreaterThan(0);
        expect(signal.why.length).toBeGreaterThan(0);
        expect(signal.replacement.length).toBeGreaterThan(0);
        expect(signal.fix).toMatch(/^references\/.+\.md#[\w-]+$/);
        expect(FIX_SECTIONS[signal.fix]?.length).toBeGreaterThan(0);
        expect(formatSignalExplanation(signal).length).toBeGreaterThan(0);
        if (signal.supersedes) {
          expect(
            SIGNALS.some((candidate) => candidate.id === signal.supersedes),
          ).toBe(true);
        }
      });
    });
  }
});
