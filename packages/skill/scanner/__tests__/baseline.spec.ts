import {
  assignFingerprints,
  classifyFindings,
  hashFindingLine,
  normalizeLine,
  parseBaseline,
  serializeBaseline,
} from '../baseline.ts';
import type { ScanFinding } from '../index.ts';
import { scanFile } from '../index.ts';

function finding(
  line: number,
  text = 'const width = target.offsetWidth;',
): ScanFinding {
  return {
    signal: 'forced-reflow',
    severity: 'critical',
    noise: 'precise',
    execution: 'incidental',
    file: 'src/card.ts',
    line,
    text,
    fix: 'references/use-size.md',
  };
}

describe('finding fingerprints', () => {
  it('normalizes surrounding and repeated whitespace', () => {
    expect(normalizeLine('  hello \t  world  ')).toBe('hello world');
  });

  it('uses the first twelve SHA-256 hex characters', () => {
    expect(hashFindingLine('hello world')).toBe('b94d27b9934d');
  });

  it('keeps identity across line shifts and changes it when the line changes', () => {
    const original = assignFingerprints([finding(4)])[0];
    const shifted = assignFingerprints([finding(40)])[0];
    const edited = assignFingerprints([
      finding(4, 'const height = target.offsetHeight;'),
    ])[0];

    expect(shifted?.fingerprint).toBe(original?.fingerprint);
    expect(edited?.fingerprint).not.toBe(original?.fingerprint);
  });

  it('hashes the complete source line rather than its display excerpt', () => {
    const prefix = `const width = target.offsetWidth; // ${'x'.repeat(200)}`;
    const [original] = scanFile('src/card.ts', `${prefix}a\n`);
    const [edited] = scanFile('src/card.ts', `${prefix}b\n`);

    expect(original?.text).toBe(edited?.text);
    expect(
      assignFingerprints([original as ScanFinding])[0]?.fingerprint,
    ).not.toBe(assignFingerprints([edited as ScanFinding])[0]?.fingerprint);
  });

  it('indexes duplicate lines in file order regardless of input order', () => {
    const assigned = assignFingerprints([finding(9), finding(3)]);
    const byLine = assigned.toSorted((a, b) => a.line - b.line);

    expect(byLine[0]?.fingerprint).toMatch(/:1$/);
    expect(byLine[1]?.fingerprint).toMatch(/:2$/);
  });
});

describe('baseline documents', () => {
  it('serializes sorted deterministic JSON and parses it back', () => {
    const serialized = serializeBaseline(
      [
        'manual-raf:src/b.ts:bbbbbbbbbbbb:1',
        'forced-reflow:src/a.ts:aaaaaaaaaaaa:1',
      ],
      '0.0.45',
      '..',
    );

    expect(serialized).toBe(
      '{\n' +
        '  "schemaVersion": 1,\n' +
        '  "cliVersion": "0.0.45",\n' +
        '  "root": "..",\n' +
        '  "fingerprints": [\n' +
        '    "forced-reflow:src/a.ts:aaaaaaaaaaaa:1",\n' +
        '    "manual-raf:src/b.ts:bbbbbbbbbbbb:1"\n' +
        '  ]\n' +
        '}\n',
    );
    expect(parseBaseline(serialized)).toEqual({
      schemaVersion: 1,
      cliVersion: '0.0.45',
      root: '..',
      fingerprints: [
        'forced-reflow:src/a.ts:aaaaaaaaaaaa:1',
        'manual-raf:src/b.ts:bbbbbbbbbbbb:1',
      ],
    });
  });

  it.each([
    ['not JSON', '{', 'valid JSON'],
    ['the wrong schema', '{"schemaVersion":2}', 'schemaVersion must be 1'],
    [
      'an empty scanner version',
      '{"schemaVersion":1,"cliVersion":"","root":".","fingerprints":[]}',
      'cliVersion must be a non-empty string',
    ],
    [
      'a malformed fingerprint',
      '{"schemaVersion":1,"cliVersion":"1.0.0","root":".","fingerprints":["nope"]}',
      'fingerprints[0] is not a valid finding fingerprint',
    ],
    [
      'an unsafe scanner version',
      '{"schemaVersion":1,"cliVersion":"1.0.0\\u001b[2J","root":".","fingerprints":[]}',
      'cliVersion must be a safe version token',
    ],
  ])('rejects %s with an actionable error', (_, json, message) => {
    expect(() => parseBaseline(json)).toThrow(message);
  });

  it('does not quote untrusted field names in validation errors', () => {
    const field = 'evil\u001b[2J';
    const json = JSON.stringify({
      schemaVersion: 1,
      cliVersion: '1.0.0',
      root: '.',
      fingerprints: [],
      [field]: true,
    });

    expect(() => parseBaseline(json)).toThrow('baseline has unknown fields');
    try {
      parseBaseline(json);
    } catch (error) {
      expect(String(error)).not.toContain('\u001b');
    }
  });

  it('refuses to serialize duplicate fingerprints', () => {
    const fingerprint = 'forced-reflow:src/a.ts:aaaaaaaaaaaa:1';

    expect(() =>
      serializeBaseline([fingerprint, fingerprint], '1.0.0', '.'),
    ).toThrow('baseline fingerprints must not contain duplicates');
  });

  it.each([
    'line\rbreak.ts',
    'line\nbreak.ts',
    'line\u2028break.ts',
    'line\u2029break.ts',
  ])('round-trips a fingerprint containing %j', (file) => {
    const [assigned] = assignFingerprints([{ ...finding(1), file }]);
    const serialized = serializeBaseline(
      [assigned?.fingerprint as string],
      '1.0.0',
      '.',
    );

    expect(parseBaseline(serialized).fingerprints).toEqual([
      assigned?.fingerprint,
    ]);
  });

  it.each(['', '/absolute', 'C:\\absolute'])(
    'rejects an invalid baseline root %j',
    (root) => {
      expect(() =>
        parseBaseline(
          JSON.stringify({
            schemaVersion: 1,
            cliVersion: '1.0.0',
            root,
            fingerprints: [],
          }),
        ),
      ).toThrow('baseline root must be a relative path');
    },
  );
});

describe('finding classification', () => {
  it('separates new and pre-existing findings and counts stale entries', () => {
    const current = [finding(3), finding(8, 'const top = target.offsetTop;')];
    const [preExisting] = assignFingerprints([current[0] as ScanFinding]);
    const baseline = parseBaseline(
      serializeBaseline(
        [
          preExisting?.fingerprint as string,
          'manual-raf:src/removed.ts:aaaaaaaaaaaa:1',
        ],
        '0.0.44',
        '.',
      ),
    );

    const classified = classifyFindings(current, baseline);

    expect(classified.findings.map((item) => item.baselineState)).toEqual([
      'pre-existing',
      'new',
    ]);
    expect(classified.stale).toBe(1);
  });
});
