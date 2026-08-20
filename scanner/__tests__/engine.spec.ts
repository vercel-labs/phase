import { SIGNAL_EXAMPLES } from '../examples.ts';
import { newDiag, scanFile } from '../index.ts';
import {
  maskComments,
  maskStrings,
  parseSuppressionDirective,
} from '../lex.ts';

function signalExample(
  signal: string,
  kind: 'match' | 'noMatch',
  testId: string,
) {
  const examples = SIGNAL_EXAMPLES[signal];
  if (!examples) throw new Error(`Missing scanner examples for ${signal}`);
  const example = examples[kind].find(
    (candidate) => candidate.testId === testId,
  );
  if (!example)
    throw new Error(`Missing ${kind} example ${testId} for ${signal}`);
  return example;
}

describe('lexical masks', () => {
  it('preserves every source position while masking comments and strings', () => {
    const lines = [
      'const url = "https://example.com/a"; // requestAnimationFrame(fake)',
      '/* block comment */ const value = `animated`;',
    ];
    const uncommented = maskComments(lines);
    const code = maskStrings(uncommented);

    expect(uncommented.map((line) => line.length)).toEqual(
      lines.map((line) => line.length),
    );
    expect(code.map((line) => line.length)).toEqual(
      lines.map((line) => line.length),
    );
  });

  it('parses suppression directives from extracted comment text', () => {
    expect(
      parseSuppressionDirective(
        '// phase-scan-ignore manual-raf -- accepted ownership',
      ),
    ).toEqual({ signalId: 'manual-raf', reason: 'accepted ownership' });
  });
});

describe('file selection', () => {
  it('matches uppercase extensions (case-insensitive filesystems)', () => {
    const findings = scanFile(
      'src/Card.TSX',
      '<div className="transition-all" />;\n',
    );
    expect(findings.some((f) => f.signal === 'tailwind-transition-all')).toBe(
      true,
    );
  });

  it('excludes agent-config dirs, vendored tooling, and the skill itself', () => {
    const raf = 'requestAnimationFrame(t);\n';
    expect(scanFile('.agents/skills/phase/tool.ts', raf)).toEqual([]);
    expect(scanFile('.cursor/rules/example.ts', raf)).toEqual([]);
    expect(scanFile('.yarn/releases/yarn-4.13.0.cjs', raf)).toEqual([]);
    expect(
      scanFile('skills/phase/evals/scenarios/x/workspace/src/t.ts', raf),
    ).toEqual([]);
    // The signal catalog is full of deliberate anti-patterns; a repo that
    // vendors the skill must not have them reported as its own.
    expect(scanFile('skills/phase/scripts/scan-examples.mjs', raf)).toEqual([]);
  });
});

describe('pathological input', () => {
  it('matches a long transition declaration in linear time', () => {
    // An ambiguous separator inside a quantifier made a failing match
    // exponential: a 124-character line took 27 seconds.
    const line = `.x { transition: ${'1s '.repeat(40)}allow-discrete; }`;
    const started = performance.now();
    scanFile('src/a.css', `${line}\n`);
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe('execution context', () => {
  it('marks a layout read driven by a frame loop', () => {
    const finding = scanFile(
      'src/a.ts',
      'function loop() {\n  const w = el.offsetWidth;\n  requestAnimationFrame(loop);\n}\n',
    ).find((f) => f.signal === 'forced-reflow');
    expect(finding?.execution).toBe('per-frame');
  });

  it('marks a one-shot layout read as incidental', () => {
    const finding = scanFile(
      'src/a.ts',
      'function onClick() {\n  const rect = el.getBoundingClientRect();\n}\n',
    ).find((f) => f.signal === 'forced-reflow');
    expect(finding?.execution).toBe('incidental');
  });

  it('does not heat nearby work around a one-shot frame callback', () => {
    const finding = scanFile(
      'src/a.ts',
      'requestAnimationFrame(() => initialize());\nconst width = el.offsetWidth;\n',
    ).find((f) => f.signal === 'forced-reflow');
    expect(finding?.execution).toBe('incidental');
  });

  it('marks an entire recurring callback as per-frame', () => {
    const finding = scanFile(
      'src/a.ts',
      'function tick() {\n  const width = el.offsetWidth;\n  step1();\n  step2();\n  step3();\n  step4();\n  step5();\n  step6();\n  step7();\n  requestAnimationFrame(tick);\n}\nrequestAnimationFrame(tick);\n',
    ).find((f) => f.signal === 'forced-reflow');
    expect(finding?.execution).toBe('per-frame');
  });

  it('leaves stylesheet findings unclassified', () => {
    const [finding] = scanFile('src/a.css', '.x { transition: all 0.3s; }\n');
    expect(finding?.execution).toBe(null);
  });
});

describe('recurring rAF ownership', () => {
  const RAF_SIGNALS = new Set([
    'manual-raf',
    'missing-reduced-motion',
    'setstate-in-raf',
  ]);

  function rafSignals(content: string) {
    return new Set(
      scanFile('src/a.tsx', content)
        .filter((finding) => RAF_SIGNALS.has(finding.signal))
        .map((finding) => finding.signal),
    );
  }

  it('reports manual ownership and missing reduced motion for a loop', () => {
    expect(
      rafSignals(
        'function tick() {\n  renderFrame();\n  requestAnimationFrame(tick);\n}\nrequestAnimationFrame(tick);\n',
      ),
    ).toEqual(new Set(['manual-raf', 'missing-reduced-motion']));
  });

  it('reports state updates reached through recurring frame work', () => {
    expect(
      rafSignals(
        'function tick() {\n  setReady(true);\n  requestAnimationFrame(tick);\n}\nrequestAnimationFrame(tick);\n',
      ).has('setstate-in-raf'),
    ).toBe(true);
  });

  it.each([
    'requestAnimationFrame(() => setReady(true));\n',
    'type Scope = { requestAnimationFrame?: (callback: FrameRequestCallback) => number };\n',
  ])('forbids rAF signals without recurring ownership', (content) => {
    expect(rafSignals(content)).toEqual(new Set());
  });
});

describe('media query subscription evidence', () => {
  function subscriptions(content: string) {
    return scanFile('src/a.ts', content).filter(
      (finding) => finding.signal === 'raw-matchmedia',
    );
  }

  it('does not count a listener on an unrelated receiver', () => {
    const example = signalExample(
      'raw-matchmedia',
      'noMatch',
      'unrelated-listener',
    );
    expect(
      scanFile(example.file, example.content).filter(
        (finding) => finding.signal === 'raw-matchmedia',
      ),
    ).toEqual([]);
  });

  it('reports only the subscribed query when a file holds both', () => {
    const found = subscriptions(
      "const a = window.matchMedia('(pointer: coarse)').matches;\nconst b = window.matchMedia('(min-width: 48em)');\nb.addEventListener('change', onChange);\n",
    );
    expect(found.map((finding) => finding.line)).toEqual([2]);
  });
});

describe('recurring timer evidence', () => {
  function timers(content: string) {
    return scanFile('src/a.ts', content).filter(
      (finding) => finding.signal === 'background-animation',
    );
  }

  it('does not let a one-shot timeout suppress an interval on the same line', () => {
    expect(
      timers(
        'let t;\nlet i;\nt = setTimeout(reset, 100); i = setInterval(() => { el.style.opacity = v(); }, 16);\n',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('still reports the style write behind a dropped timer finding', () => {
    const example = signalExample(
      'background-animation',
      'noMatch',
      'one-shot-style-write',
    );
    const signals = scanFile(example.file, example.content).map(
      (finding) => finding.signal,
    );
    expect(signals).toContain('js-opacity-transform');
  });

  it('does not rank a slow recurring timer as per-frame', () => {
    const example = signalExample(
      'background-animation',
      'match',
      'slow-recurring-timeout',
    );
    const found = scanFile(example.file, example.content).filter(
      (finding) => finding.signal === 'background-animation',
    );
    expect(found.map((finding) => finding.execution)).not.toContain(
      'per-frame',
    );
  });
});

describe('coverage accounting', () => {
  it('does not count an excluded file as scanned', () => {
    const diag = newDiag();
    scanFile('src/anim.spec.ts', 'requestAnimationFrame(step);\n', diag);
    expect(diag.analyzed).toBe(0);
    expect(diag.skipped.excluded).toBe(1);
  });

  it('scans a file whose only long line is an embedded blob', () => {
    // An average-line-length heuristic dropped the whole file — findings and
    // all — over one inlined data URI.
    const content = [
      'function step() { requestAnimationFrame(step); }',
      `const LOGO = 'data:image/png;base64,${'A'.repeat(20000)}';`,
    ].join('\n');
    const diag = newDiag();
    const findings = scanFile('src/hero.ts', content, diag);
    expect(findings.some((f) => f.signal === 'manual-raf')).toBe(true);
    expect(diag.analyzed).toBe(1);
    expect(diag.linesSkipped).toBe(1);
  });

  it('still finds nothing scannable in a minified bundle', () => {
    const minified = `${'var a=1;'.repeat(200)}setInterval(()=>{el.style.transform='translateX(1px)'},16);`;
    expect(scanFile('src/seed-bundle.mjs', minified)).toEqual([]);
  });
});

describe('matcher windows', () => {
  it('does not flag a long WhenVisible tag whose fallback comes late', () => {
    const props = Array.from({ length: 16 }, (_, i) => `  p${i}={v}`).join(
      '\n',
    );
    const tag = `<WhenVisible\n${props}\n  fallback={<Box />}\n>\n`;
    const findings = scanFile('src/x.tsx', tag);
    expect(
      findings.filter((f) => f.signal === 'when-visible-no-fallback'),
    ).toEqual([]);
  });
});

describe('cache performance', () => {
  it('scans a 4k-line keyframes file without rebuilding ranges per line', () => {
    const body = Array.from({ length: 3998 }, (_, index) =>
      index % 2 === 0 ? '  from { left: 0; }' : '  to { left: 1px; }',
    ).join('\n');
    const started = performance.now();
    scanFile('src/large.css', `@keyframes move {\n${body}\n}`);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('suppression directive', () => {
  const RAF_WITH_DIRECTIVE =
    'function step() {\n' +
    '  // phase-scan-ignore manual-raf -- accepted: replaced next sprint\n' +
    '  requestAnimationFrame(step);\n' +
    '}\n';

  it('suppresses the named signal on the next line and counts it', () => {
    const diag = newDiag();
    const findings = scanFile('src/anim.ts', RAF_WITH_DIRECTIVE, diag);
    expect(findings.filter((f) => f.signal === 'manual-raf')).toEqual([]);
    expect(diag.suppressed).toBe(1);
    expect(diag.warnings).toEqual([]);
  });

  it('does not suppress other signals on the same line', () => {
    const findings = scanFile('src/anim.ts', RAF_WITH_DIRECTIVE);
    const others = findings.filter(
      (f) => f.signal === 'missing-reduced-motion',
    );
    expect(others.length).toBe(1);
  });

  it('ignores a directive without a reason and warns', () => {
    const diag = newDiag();
    const findings = scanFile(
      'src/anim.ts',
      'function step() {\n// phase-scan-ignore manual-raf\nrequestAnimationFrame(step);\n}\n',
      diag,
    );
    expect(findings.some((f) => f.signal === 'manual-raf')).toBe(true);
    expect(diag.suppressed).toBe(0);
    expect(diag.warnings.length).toBe(1);
    expect(diag.warnings[0]).toContain('missing a reason');
  });

  it('warns on an unknown signal id instead of silently ignoring the typo', () => {
    const diag = newDiag();
    const findings = scanFile(
      'src/anim.ts',
      'function step() {\n// phase-scan-ignore manual-raff -- typo\nrequestAnimationFrame(step);\n}\n',
      diag,
    );
    expect(findings.some((f) => f.signal === 'manual-raf')).toBe(true);
    expect(diag.suppressed).toBe(0);
    expect(diag.warnings.length).toBe(1);
    expect(diag.warnings[0]).toContain('unknown signal');
  });

  it('suppresses a per-file signal for the whole file, not just one line', () => {
    const diag = newDiag();
    const findings = scanFile(
      'src/anim.ts',
      '// phase-scan-ignore missing-reduced-motion -- decorative, owner approved\nfunction a() { requestAnimationFrame(a); }\nfunction b() { requestAnimationFrame(b); }\n',
      diag,
    );
    expect(
      findings.filter((f) => f.signal === 'missing-reduced-motion'),
    ).toEqual([]);
    expect(diag.suppressed).toBe(1);
  });

  it('does not count a dangling directive with nothing to suppress', () => {
    const diag = newDiag();
    scanFile(
      'src/anim.ts',
      '// phase-scan-ignore missing-reduced-motion -- leftover\nconst x = 1;\n',
      diag,
    );
    expect(diag.suppressed).toBe(0);
  });

  it('accepts the colon form of the directive', () => {
    const diag = newDiag();
    const findings = scanFile(
      'src/anim.ts',
      'function step() {\n// phase-scan-ignore: manual-raf -- accepted loop\nrequestAnimationFrame(step);\n}\n',
      diag,
    );
    expect(findings.filter((f) => f.signal === 'manual-raf')).toEqual([]);
    expect(diag.suppressed).toBe(1);
  });

  it('does not interpret directive text in a string as a suppression', () => {
    const diag = newDiag();
    const findings = scanFile(
      'src/anim.ts',
      'const help = "phase-scan-ignore manual-raf -- example";\nfunction step() { requestAnimationFrame(step); }\n',
      diag,
    );
    expect(findings.some((f) => f.signal === 'manual-raf')).toBe(true);
    expect(diag.suppressed).toBe(0);
  });
});
