import {
  scanFile,
  SEVERITY_ORDER,
  SIGNALS,
} from '../../skills/phase/scripts/scan.mjs';

/**
 * Executable-example suite for the audit scanner. Every signal in the
 * catalog carries inline examples; this suite verifies each `match`
 * example produces a finding for that signal and each `noMatch` example
 * does not. A signal without both kinds of examples fails structurally.
 */

const NOISE_TIERS = new Set(['precise', 'normal', 'noisy']);

describe('scan signal catalog', () => {
  it('has unique ids', () => {
    const ids = SIGNALS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const signal of SIGNALS) {
    describe(signal.id, () => {
      it('declares complete triage metadata', () => {
        expect(SEVERITY_ORDER).toContain(signal.severity);
        expect(NOISE_TIERS.has(signal.noise)).toBe(true);
        expect(signal.why.length).toBeGreaterThan(0);
        expect(signal.fix.startsWith('references/')).toBe(true);
      });

      it('declares at least one match and one noMatch example', () => {
        expect(signal.examples.match.length).toBeGreaterThan(0);
        expect(signal.examples.noMatch.length).toBeGreaterThan(0);
      });

      for (const [index, example] of signal.examples.match.entries()) {
        it(`match example ${index + 1} (${example.file}) fires`, () => {
          const findings = scanFile(example.file, example.content);
          const own = findings.filter((f) => f.signal === signal.id);
          expect(own.length).toBeGreaterThan(0);
        });
      }

      for (const [index, example] of signal.examples.noMatch.entries()) {
        it(`noMatch example ${index + 1} (${example.file}) stays silent`, () => {
          const findings = scanFile(example.file, example.content);
          const own = findings.filter((f) => f.signal === signal.id);
          expect(own).toEqual([]);
        });
      }
    });
  }
});
