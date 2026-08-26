import { newDiag, scanFile } from '../detect.ts';
import { parseSuppressionDirective } from '../lex.ts';

function forcedReflow(content: string) {
  return scanFile('src/example.ts', content).find(
    (candidate) => candidate.signal === 'forced-reflow',
  );
}

function contentAtDriverDistance(distance: number): string {
  return [
    'onTick(() => {});',
    ...Array.from({ length: distance - 1 }, () => ''),
    'const width = target.offsetWidth;',
  ].join('\n');
}

describe('executionOf', () => {
  it('classifies recurring callback and schedule lines as per-frame', () => {
    expect(
      forcedReflow(
        'function tick() {\n  const width = target.offsetWidth;\n  requestAnimationFrame(tick);\n}\nrequestAnimationFrame(tick);',
      )?.execution,
    ).toBe('per-frame');
  });

  it('classifies move-handler bodies and prop lines as per-frame', () => {
    expect(
      forcedReflow(
        'function move() {\n  const width = target.offsetWidth;\n}\n<div onPointerMove={move} />;',
      )?.execution,
    ).toBe('per-frame');
  });

  it('includes the FRAME_DRIVER window boundary but not the next line', () => {
    expect(forcedReflow(contentAtDriverDistance(5))?.execution).toBe(
      'per-frame',
    );
    expect(forcedReflow(contentAtDriverDistance(6))?.execution).toBe(
      'per-frame',
    );
    expect(forcedReflow(contentAtDriverDistance(7))?.execution).toBe(
      'incidental',
    );
  });

  it('does not classify stylesheet execution', () => {
    const finding = scanFile(
      'src/example.css',
      '.x { transition: all 1s; }',
    )[0];
    expect(finding?.execution).toBe(null);
  });
});

describe('dedup/supersedes', () => {
  it('keeps the specific finding and removes its same-line general finding', () => {
    const findings = scanFile(
      'src/example.ts',
      'function tick() {\n  setReady(true);\n  requestAnimationFrame(tick);\n}\nrequestAnimationFrame(tick);',
    );

    expect(
      findings
        .filter((candidate) => candidate.signal === 'setstate-in-raf')
        .map((candidate) => candidate.line),
    ).toEqual([3, 5]);
    expect(
      findings.filter((candidate) => candidate.signal === 'manual-raf'),
    ).toEqual([]);
  });

  it('keeps the general finding when the superseding finding never matched', () => {
    const findings = scanFile(
      'src/example.ts',
      'function tick() {\n  render();\n  requestAnimationFrame(tick);\n}\nrequestAnimationFrame(tick);',
    );

    expect(
      findings.filter((candidate) => candidate.signal === 'manual-raf'),
    ).toHaveLength(2);
    expect(
      findings.filter((candidate) => candidate.signal === 'setstate-in-raf'),
    ).toEqual([]);
  });
});

describe('suppressions', () => {
  it('parses the supported grammar and rejects unrelated comments', () => {
    expect(
      parseSuppressionDirective(
        'phase-scan-ignore: manual-raf -- accepted ownership',
      ),
    ).toEqual({ signalId: 'manual-raf', reason: 'accepted ownership' });
    expect(parseSuppressionDirective('// ordinary comment')).toBe(null);
  });

  it('suppresses the directive line and the next line only', () => {
    const diag = newDiag();
    const findings = scanFile(
      'src/anim.ts',
      'function tick() {\n  /* phase-scan-ignore manual-raf -- accepted */ requestAnimationFrame(tick);\n  requestAnimationFrame(tick);\n  requestAnimationFrame(tick);\n}',
      diag,
    ).filter((candidate) => candidate.signal === 'manual-raf');

    expect(findings.map((candidate) => candidate.line)).toEqual([4]);
    expect(diag.suppressed).toBe(2);
  });

  it('does not count a dangling per-file directive', () => {
    const diag = newDiag();
    scanFile(
      'src/anim.ts',
      '// phase-scan-ignore missing-reduced-motion -- accepted\nconst ready = true;',
      diag,
    );

    expect(diag.suppressed).toBe(0);
  });

  it('applies a per-file directive wherever its finding occurs', () => {
    const diag = newDiag();
    const findings = scanFile(
      'src/anim.ts',
      'function tick() { requestAnimationFrame(tick); }\n// phase-scan-ignore missing-reduced-motion -- accepted',
      diag,
    );

    expect(
      findings.some(
        (candidate) => candidate.signal === 'missing-reduced-motion',
      ),
    ).toBe(false);
    expect(diag.suppressed).toBe(1);
  });
});
