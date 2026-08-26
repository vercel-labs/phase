import { SIGNAL_EXAMPLES } from '../examples.ts';
import { scanFile, SIGNALS } from '../index.ts';

describe('scanner examples', () => {
  it('has no orphan example keys', () => {
    for (const key of Object.keys(SIGNAL_EXAMPLES)) {
      expect(SIGNALS.some((signal) => signal.id === key)).toBe(true);
    }
  });

  for (const signal of SIGNALS) {
    const examples = SIGNAL_EXAMPLES[signal.id] ?? { match: [], noMatch: [] };

    describe(signal.id, () => {
      it('has at least one match and one noMatch example', () => {
        expect(examples.match.length).toBeGreaterThan(0);
        expect(examples.noMatch.length).toBeGreaterThan(0);
      });

      for (const [index, example] of examples.match.entries()) {
        it(`match example ${index + 1} (${example.file}) fires`, () => {
          const findings = scanFile(example.file, example.content);
          expect(
            findings.filter((finding) => finding.signal === signal.id).length,
          ).toBeGreaterThan(0);
        });
      }

      for (const [index, example] of examples.noMatch.entries()) {
        it(`noMatch example ${index + 1} (${example.file}) stays silent`, () => {
          const findings = scanFile(example.file, example.content);
          expect(
            findings.filter((finding) => finding.signal === signal.id),
          ).toEqual([]);
        });
      }
    });
  }
});
