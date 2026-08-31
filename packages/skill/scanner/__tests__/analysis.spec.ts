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

  it('per-frame-allocation accepts matches only in the direct body of a proven recurring frame callback', () => {
    const recurring =
      'function tick() { const points = []; requestAnimationFrame(tick); } requestAnimationFrame(tick);';
    expect(evidenceMatches('per-frame-allocation', recurring, 0, /\[/)).toBe(
      true,
    );

    const phase =
      "import { useLoop } from 'phase/react'; const setup = []; useLoop({ onTick: () => source.map(project) });";
    expect(evidenceMatches('per-frame-allocation', phase, 0, /\[/)).toBe(false);
    expect(evidenceMatches('per-frame-allocation', phase, 0, /\.map\(/)).toBe(
      true,
    );

    expect(
      evidenceMatches(
        'per-frame-allocation',
        'renderer({ onTick: () => source.map(project) });',
        0,
        /\.map\(/,
      ),
    ).toBe(false);
    expect(
      evidenceMatches(
        'per-frame-allocation',
        'function initialize() { return []; } requestAnimationFrame(initialize);',
        0,
        /\[/,
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

describe('analysis', () => {
  it('identifies self-recursive rAF ownership by line', () => {
    const analysis = analysisOf(
      'function tick() {\n  requestAnimationFrame(tick);\n}\nrequestAnimationFrame(tick);',
    );

    expect([...analysis.raf.recurringScheduleLines]).toEqual([1, 3]);
    expect([...analysis.raf.recurringCallbackLines]).toEqual([0, 1, 2]);
  });

  it('identifies mutually recursive scheduled callbacks', () => {
    const analysis = analysisOf(
      'function first() { requestAnimationFrame(second); }\nfunction second() { requestAnimationFrame(first); }\nrequestAnimationFrame(first);',
    );

    expect([...analysis.raf.recurringScheduleLines]).toEqual([0, 1, 2]);
    expect([...analysis.raf.recurringCallbackLines]).toEqual([0, 1]);
  });

  it('does not classify a named one-shot callback as recurring', () => {
    const analysis = analysisOf(
      'function initialize() { mount(); }\nrequestAnimationFrame(initialize);',
    );

    expect(analysis.raf.recurringScheduleLines).toEqual(new Set());
    expect(analysis.raf.recurringCallbackLines).toEqual(new Set());
  });

  it('does not infer recurring ownership when callback names are ambiguous', () => {
    const analysis = analysisOf(
      'function tick() { requestAnimationFrame(tick); }\nfunction tick() { requestAnimationFrame(tick); }',
    );

    expect(analysis.raf.recurringScheduleLines).toEqual(new Set());
    expect(analysis.raf.recurringCallbackLines).toEqual(new Set());
  });

  it('reports only MediaQueryLists that are subscribed', () => {
    const analysis = analysisOf(
      "const snapshot = matchMedia('(hover: hover)').matches;\nconst query = matchMedia('(min-width: 48em)');\nquery.addEventListener('change', update);",
    );

    expect(analysis.subscribedMediaQueries).toEqual(new Set([1]));
  });

  it('maps intrinsic move props to their named handler lines', () => {
    const analysis = analysisOf(
      'function move() {\n  const width = target.offsetWidth;\n}\n<div onPointerMove={move} />;',
    );

    expect(analysis.moveHandlers.propRanges).toEqual(
      new Map([[3, { start: 0, end: 2 }]]),
    );
    expect(analysis.moveHandlers.handlerLines).toEqual(new Set([0, 1, 2]));
  });
});
