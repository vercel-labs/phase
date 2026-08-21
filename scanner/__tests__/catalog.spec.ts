import { NOISE_TIERS, SEVERITY_ORDER, SIGNALS } from '../signals.ts';

describe('scan signal catalog', () => {
  it('has unique ids', () => {
    const ids = SIGNALS.map((signal) => signal.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const signal of SIGNALS) {
    describe(signal.id, () => {
      it('declares complete triage metadata', () => {
        expect(SEVERITY_ORDER).toContain(signal.severity);
        expect(NOISE_TIERS).toContain(signal.noise);
        expect(signal.why.length).toBeGreaterThan(0);
        expect(signal.replacement.length).toBeGreaterThan(0);
        expect(signal.fix.startsWith('references/')).toBe(true);
        if (signal.supersedes) {
          expect(
            SIGNALS.some((candidate) => candidate.id === signal.supersedes),
          ).toBe(true);
        }
      });
    });
  }
});
