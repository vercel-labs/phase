import {
  analyzeFile,
  buildSourceIndex,
  EVIDENCE_REGISTRY,
} from '../analysis.ts';
import type { EvidenceName } from '../analysis.ts';
import { maskComments, maskStrings } from '../lex.ts';
import { SIGNALS } from '../signals.ts';

function analysisOf(content: string) {
  const lines = content.split('\n');
  const uncommentedLines = maskComments(lines);
  const codeLines = maskStrings(uncommentedLines);
  return analyzeFile(
    'js',
    buildSourceIndex(codeLines, codeLines.join('\n')),
    uncommentedLines,
  );
}

function evidenceMatches(
  name: EvidenceName,
  content: string,
  line: number,
  pattern: RegExp,
) {
  const match = pattern.exec(content.split('\n')[line] ?? '');
  if (!match) throw new Error(`Test pattern did not match line ${line + 1}`);
  return EVIDENCE_REGISTRY[name](analysisOf(content), line, match);
}

function signalPattern(id: string): RegExp {
  const signal = SIGNALS.find((candidate) => candidate.id === id);
  if (!signal?.pattern) throw new Error(`Missing pattern signal ${id}`);
  return signal.pattern;
}

describe('analysis evidence registry', () => {
  it('recurring-raf-cycle requires a scheduling cycle', () => {
    expect(
      evidenceMatches(
        'recurring-raf-cycle',
        'function tick() {\n  requestAnimationFrame(tick);\n}\nrequestAnimationFrame(tick);',
        3,
        /requestAnimationFrame/,
      ),
    ).toBe(true);
    expect(
      evidenceMatches(
        'recurring-raf-cycle',
        'requestAnimationFrame(() => initialize());',
        0,
        /requestAnimationFrame/,
      ),
    ).toBe(false);
  });

  it('recurring-raf-state requires state work in the recurring callback', () => {
    expect(
      evidenceMatches(
        'recurring-raf-state',
        'function tick() {\n  setReady(true);\n  requestAnimationFrame(tick);\n}\nrequestAnimationFrame(tick);',
        4,
        /requestAnimationFrame/,
      ),
    ).toBe(true);
    expect(
      evidenceMatches(
        'recurring-raf-state',
        'function tick() {\n  renderFrame();\n  requestAnimationFrame(tick);\n}\nrequestAnimationFrame(tick);',
        4,
        /requestAnimationFrame/,
      ),
    ).toBe(false);
  });

  it('subscribed-media-query requires a listener on the same receiver', () => {
    expect(
      evidenceMatches(
        'subscribed-media-query',
        "const query = matchMedia('(min-width: 48em)');\nquery.addEventListener('change', update);",
        0,
        /matchMedia/,
      ),
    ).toBe(true);
    expect(
      evidenceMatches(
        'subscribed-media-query',
        "const matches = matchMedia('(min-width: 48em)').matches;",
        0,
        /matchMedia/,
      ),
    ).toBe(false);
  });

  it('recurring-raf-branch gates only a matched rAF branch', () => {
    const pattern = /requestAnimationFrame|@keyframes/;
    expect(
      evidenceMatches(
        'recurring-raf-branch',
        'requestAnimationFrame(() => initialize());',
        0,
        pattern,
      ),
    ).toBe(false);
    expect(
      evidenceMatches(
        'recurring-raf-branch',
        '@keyframes fade { from { opacity: 0; } }',
        0,
        pattern,
      ),
    ).toBe(true);
  });

  it('recurring-raf-branch stays coupled to the signal pattern', () => {
    const pattern = signalPattern('missing-reduced-motion');
    expect(
      evidenceMatches(
        'recurring-raf-branch',
        'requestAnimationFrame(() => initialize());',
        0,
        pattern,
      ),
    ).toBe(false);
    expect(
      evidenceMatches(
        'recurring-raf-branch',
        '.spinner { animation: spin 1s linear infinite; }',
        0,
        pattern,
      ),
    ).toBe(true);
  });

  it('recurring-timer accepts intervals and recurring timeouts only', () => {
    expect(
      evidenceMatches(
        'recurring-timer',
        'setInterval(() => animate(), 16);',
        0,
        /setInterval|setTimeout/,
      ),
    ).toBe(true);
    expect(
      evidenceMatches(
        'recurring-timer',
        'setTimeout(() => animate(), 16);',
        0,
        /setInterval|setTimeout/,
      ),
    ).toBe(false);
  });

  it('move-handler-layout-read handles raw listeners and JSX handlers', () => {
    const pattern =
      /addEventListener\s*\(\s*['"]pointermove['"]|\bonPointerMove\s*=\s*\{/;
    expect(
      evidenceMatches(
        'move-handler-layout-read',
        "target.addEventListener('pointermove', move);\nconst width = target.offsetWidth;",
        0,
        pattern,
      ),
    ).toBe(true);
    expect(
      evidenceMatches(
        'move-handler-layout-read',
        "target.addEventListener('pointermove', move);\nmove();",
        0,
        pattern,
      ),
    ).toBe(false);

    const jsx =
      'function move() {\n  const width = target.offsetWidth;\n}\n<div onPointerMove={move} />;';
    expect(evidenceMatches('move-handler-layout-read', jsx, 3, pattern)).toBe(
      true,
    );
    expect(
      evidenceMatches(
        'move-handler-layout-read',
        'function move() {\n  updatePointer();\n}\n<div onPointerMove={move} />;',
        3,
        pattern,
      ),
    ).toBe(false);
  });

  it('move-handler-layout-read stays coupled to the signal pattern', () => {
    const pattern = signalPattern('pointer-listener-layout-read');
    expect(
      evidenceMatches(
        'move-handler-layout-read',
        "target.addEventListener('mousemove', move);\nconst width = target.offsetWidth;",
        0,
        pattern,
      ),
    ).toBe(true);
    expect(
      evidenceMatches(
        'move-handler-layout-read',
        'function move() {\n  const width = target.offsetWidth;\n}\n<div onMouseMove={move} />;',
        3,
        pattern,
      ),
    ).toBe(true);
  });
});
