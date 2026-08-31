import type { ScanExample, ScanSignalId } from './signals.ts';

export interface SignalExample extends ScanExample {
  testId?: string;
}

export interface SignalExamples {
  match: SignalExample[];
  noMatch: SignalExample[];
}

/**
 * Executable examples for every scanner signal, keyed by signal id.
 * Contributor tooling only: not shipped in the skill zip. The test suite
 * verifies each `match` example produces a finding for its signal and each
 * `noMatch` example does not; a signal without examples fails structurally,
 * as does an example keyed to a signal that no longer exists.
 */

const SIGNAL_EXAMPLE_CATALOG = {
  'manual-raf': {
    match: [
      {
        file: 'src/anim.ts',
        content:
          'function tick() {\n  requestAnimationFrame(tick);\n  draw();\n}\nrequestAnimationFrame(tick);\n',
      },
      {
        // Regression: a consumer path containing the substring "phase" must
        // still be scanned (an old exclude silently skipped it).
        file: 'src/phases/timeline.ts',
        content:
          'const step = () => {\n  draw();\n  requestAnimationFrame(step);\n};\nrequestAnimationFrame(step);\n',
      },
      {
        file: 'src/worker.ts',
        content:
          'const tick = function () {\n  renderFrame();\n  self.requestAnimationFrame(tick);\n};\nself.requestAnimationFrame(tick);\n',
      },
      {
        file: 'src/shared-clock.ts',
        content:
          'function first() {\n  requestAnimationFrame(second);\n}\nfunction second() {\n  requestAnimationFrame(first);\n}\nrequestAnimationFrame(first);\nrequestAnimationFrame(second);\n',
      },
      {
        file: 'src/concise.ts',
        content:
          'const tick = () => requestAnimationFrame(tick);\nrequestAnimationFrame(tick);\n',
      },
    ],
    noMatch: [
      {
        file: 'src/anim.spec.ts',
        content: 'requestAnimationFrame(tick);\n',
      },
      {
        file: 'src/use-anim.ts',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: draw });\n",
      },
      {
        // One-shot frame scheduling does not own a recurring loop.
        file: 'src/counter.tsx',
        content: 'requestAnimationFrame(() => setCount((c) => c + 1));\n',
      },
      {
        file: 'src/scope.ts',
        content:
          'type Scope = {\n  requestAnimationFrame?: (callback: FrameRequestCallback) => number;\n};\n',
      },
      {
        file: 'src/initialize.ts',
        content:
          'function initialize() {\n  measure();\n}\nrequestAnimationFrame(initialize);\n',
      },
      {
        file: 'src/notes.ts',
        content:
          "// requestAnimationFrame(oldLoop);\nconst example = 'requestAnimationFrame(step)';\n",
      },
    ],
  },
  'setstate-in-raf': {
    match: [
      {
        file: 'src/progress.tsx',
        content:
          'function loop() {\n  setProgress((p) => p + 1);\n  requestAnimationFrame(loop);\n}\n',
      },
      {
        file: 'src/store.ts',
        content:
          "const tick = () => {\n  dispatch({ type: 'tick' });\n  requestAnimationFrame(tick);\n};\nrequestAnimationFrame(tick);\n",
      },
      {
        // Real callbacks routinely exceed the old fixed ±5-line window.
        file: 'src/long-progress.tsx',
        content:
          'function tick() {\n  measure();\n  normalize();\n  clampValue();\n  interpolate();\n  applyEasing();\n  writeFrame();\n  setProgress(next);\n  requestAnimationFrame(tick);\n}\nrequestAnimationFrame(tick);\n',
      },
    ],
    noMatch: [
      {
        // Regression: setAttribute is a recommended pattern inside rAF,
        // not a state update.
        file: 'src/meter.ts',
        content:
          "function loop() {\n  el.setAttribute('aria-valuenow', String(v));\n  requestAnimationFrame(loop);\n}\n",
      },
      {
        // Regression: style.setProperty is the recommended CSS-variable
        // write inside rAF.
        file: 'src/cursor.ts',
        content:
          "function loop() {\n  el.style.setProperty('--x', String(x));\n  requestAnimationFrame(loop);\n}\n",
      },
      {
        // Regression: setTimeout near a rAF is not a state update.
        file: 'src/fallback.ts',
        content:
          'requestAnimationFrame(start);\nsetTimeout(fallbackStart, 100);\n',
      },
      {
        file: 'src/removed-state.tsx',
        content:
          "requestAnimationFrame(() => {\n  // setCount((c) => c + 1);\n  log('setCount(1)');\n  ref.current.textContent = String(n);\n});\n",
      },
      {
        file: 'src/ready.tsx',
        content:
          'useEffect(() => {\n  const id = requestAnimationFrame(() => setReady(true));\n  return () => cancelAnimationFrame(id);\n}, []);\n',
      },
      {
        file: 'src/unrelated-state.tsx',
        content:
          'function tick() {\n  requestAnimationFrame(tick);\n}\nfunction update() {\n  setCount((c) => c + 1);\n}\n',
      },
    ],
  },
  'setstate-in-ontick': {
    match: [
      {
        file: 'src/progress-loop.tsx',
        content:
          'useLoop({\n  ref,\n  onTick: (frame) => {\n    setValue(frame.elapsed / 1000);\n  },\n});\n',
      },
      {
        file: 'src/visualizer.tsx',
        content:
          "useCanvas({\n  draw: ({ ctx, frame }) => {\n    dispatch({ type: 'frame', at: frame.elapsed });\n  },\n});\n",
      },
      {
        file: 'src/long-loop.tsx',
        content:
          'useLoop({\n  onTick: (frame) => {\n    step1();\n    step2();\n    step3();\n    step4();\n    step5();\n    step6();\n    setValue(frame.elapsed);\n  },\n});\n',
      },
    ],
    noMatch: [
      {
        // Ref and DOM writes are the recommended pattern inside onTick.
        file: 'src/progress-loop.tsx',
        content:
          "useLoop({\n  ref,\n  onTick: (frame) => {\n    ref.current.style.setProperty('--p', String(frame.elapsed));\n  },\n});\n",
      },
      {
        file: 'src/meter.tsx',
        content:
          "useLoop({\n  ref,\n  onTick: (frame) => {\n    ref.current.setAttribute('aria-valuenow', String(frame.elapsed));\n  },\n});\n",
      },
    ],
  },
  'per-frame-allocation': {
    match: [
      {
        file: 'src/manual-loop.ts',
        content:
          'function draw() {\n  const point = { x: 0, y: 0 };\n  const values = source.map(transform);\n  paint(point, values);\n  requestAnimationFrame(draw);\n}\nrequestAnimationFrame(draw);\n',
      },
      {
        file: 'src/canvas.tsx',
        content:
          "import { useCanvas } from 'phase/react';\nuseCanvas({\n  draw: (context) => {\n    const points = [...source];\n    paint(context, points);\n  },\n});\n",
      },
      {
        file: 'src/loop.tsx',
        content:
          "import { useLoop } from 'phase/react';\nconst tick = () => {\n  const visible = source.filter(isVisible);\n  const copy = { ...state };\n  paint(visible, copy);\n};\nuseLoop({ onTick: tick });\n",
      },
      {
        file: 'src/ticker.ts',
        content:
          "import { createTicker } from 'phase';\ncreateTicker({\n  onTick(frame) {\n    const point = [frame.elapsed, 0];\n    paint(point);\n  },\n});\n",
      },
      {
        file: 'src/core-loop.ts',
        content:
          "import { createLoop } from 'phase';\ncreateLoop({\n  target,\n  onTick: () => {\n    const point = { x: 0, y: 0 };\n    paint(point);\n  },\n});\n",
      },
      {
        file: 'src/concise-loop.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => [frame.x, frame.y] });\n",
      },
      {
        file: 'src/named-canvas.tsx',
        content:
          "import { useCanvas } from 'phase/react';\nconst draw = () => {\n  const points = source.map(project);\n  paint(points);\n};\nuseCanvas({ containerRef, canvasRef, draw });\n",
      },
      {
        testId: 'mixed-same-line',
        file: 'src/compact.tsx',
        content:
          "import { useLoop } from 'phase/react';\nconst setup = []; useLoop({ onTick: () => source.map(project) });\n",
      },
      {
        file: 'src/object-argument.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => paint({ x: frame.x, y: frame.y }) });\n",
      },
      {
        file: 'src/array-argument.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => paint([...source]) });\n",
      },
      {
        file: 'src/conditional.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  const points = active ? [] : cached;\n  paint(points);\n} });\n",
      },
      {
        file: 'src/parenthesized-return.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  return ({ x: frame.x, y: frame.y });\n} });\n",
      },
      {
        file: 'src/multiline-literal.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  const points =\n    [frame.x, frame.y];\n  paint(points);\n} });\n",
      },
      {
        file: 'src/guarded-assignment.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  if (active) points = [];\n  paint(points);\n} });\n",
      },
      {
        file: 'src/aliased-loop.tsx',
        content:
          "import { useLoop as useFrameLoop } from 'phase/react';\nuseFrameLoop({ onTick: () => {\n  const points = [];\n  paint(points);\n} });\n",
      },
      {
        file: 'src/namespaced-ticker.ts',
        content:
          "import * as Phase from 'phase';\nPhase.createTicker({ onTick: () => {\n  const point = { x: 0, y: 0 };\n  paint(point);\n} });\n",
      },
      {
        file: 'src/nested-default.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({\n  onTick: ({ elapsed = readElapsed() }) => {\n    const points = [];\n    paint(points, elapsed);\n  },\n});\n",
      },
      {
        file: 'src/quoted-property.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({\n  'onTick': () => {\n    const points = [];\n    paint(points);\n  },\n});\n",
      },
      {
        file: 'src/generic-loop.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop<SVGSVGElement & { dataset: DOMStringMap }>({\n  onTick: () => {\n    const points = [];\n    paint(points);\n  },\n});\n",
      },
      {
        file: 'src/regex-literal.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  const openingBrace = /\\{/;\n  const points = [];\n  paint(points, openingBrace);\n} });\n",
      },
      {
        file: 'src/dollar-alias.tsx',
        content:
          "import { useLoop as $loop } from 'phase/react';\n$loop({ onTick: () => {\n  const points = [];\n  paint(points);\n} });\n",
      },
      {
        file: 'src/parenthesized-callback.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: ((frame) => {\n  const points = [];\n  paint(points, frame);\n}) });\n",
      },
      {
        file: 'src/typed-function.ts',
        content:
          "import { createTicker } from 'phase';\ncreateTicker({ onTick: function (frame): void {\n  const points = [];\n  paint(points, frame);\n} });\n",
      },
      {
        file: 'src/async-method.ts',
        content:
          "import { createTicker } from 'phase';\ncreateTicker({ async onTick() {\n  const points = [];\n  paint(points);\n} });\n",
      },
      {
        file: 'src/named-nested-default.tsx',
        content:
          "import { useLoop } from 'phase/react';\nconst tick = ({ elapsed = readElapsed() }) => {\n  const points = [];\n  paint(points, elapsed);\n};\nuseLoop({ onTick: tick });\n",
      },
      {
        file: 'src/type-parameter-name.tsx',
        content:
          "import { useLoop } from 'phase/react';\ntype Factory = (useLoop: Hook) => void;\nuseLoop({ onTick: () => {\n  const points = [];\n  paint(points);\n} });\n",
      },
      {
        file: 'src/false-ternary-array.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  const points = active ? cached : [];\n  paint(points);\n} });\n",
      },
      {
        file: 'src/false-ternary-object.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  const point = active ? cached : { x: 0, y: 0 };\n  paint(point);\n} });\n",
      },
      {
        file: 'src/control-regex.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  if (ready) /\\{/.test(value);\n  const points = [];\n  paint(points);\n} });\n",
      },
      {
        file: 'src/type-then-runtime.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  const factory: () => number = getFactory();\n  register({ x: factory() });\n} });\n",
      },
      {
        file: 'src/typed-named-callback.tsx',
        content:
          "import { useLoop } from 'phase/react';\nconst tick: (frame: FrameState) => void = (frame) => {\n  const points = [];\n  paint(points, frame);\n};\nuseLoop({ onTick: tick });\n",
      },
      {
        file: 'src/asserted-reference.tsx',
        content:
          "import { useLoop } from 'phase/react';\nconst tick = () => {\n  const points = [];\n  paint(points);\n};\nuseLoop({ onTick: tick as LoopTickFn });\n",
      },
    ],
    noMatch: [
      {
        file: 'src/setup.ts',
        content:
          'const point = { x: 0, y: 0 };\nconst values = source.map(transform);\npaint(point, values);\n',
      },
      {
        file: 'src/component.tsx',
        content:
          'function Chart() {\n  const points = source.filter(isVisible);\n  return <Plot points={points} />;\n}\n',
      },
      {
        file: 'src/events.tsx',
        content:
          'return (\n  <canvas\n    onClick={() => paint([...source])}\n    onPointerMove={() => paint(source.map(project))}\n  />\n);\n',
      },
      {
        file: 'src/initialize.ts',
        content:
          'function initialize() {\n  const point = { x: 0, y: 0 };\n  paint(point);\n}\nrequestAnimationFrame(initialize);\n',
      },
      {
        file: 'src/third-party.ts',
        content:
          'renderer({\n  onTick: () => {\n    const point = [0, 0];\n    paint(point);\n  },\n  draw: () => source.map(project),\n});\n',
      },
      {
        file: 'src/transform.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({\n  onTick: (frame) => {\n    element.style.transform = `translateX(${frame.elapsed}px)`;\n  },\n});\n",
      },
      {
        file: 'src/helper.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({\n  onTick: () => {\n    const frame = buildFrame();\n    paint(frame);\n  },\n});\n",
      },
      {
        testId: 'same-line-outside-callback',
        file: 'src/options.tsx',
        content:
          "import { useLoop } from 'phase/react';\nconst samples = []; useLoop({ onTick: () => paint() });\n",
      },
      {
        testId: 'same-line-raf-setup',
        file: 'src/manual-options.ts',
        content:
          'const samples = []; function tick() { paint(); requestAnimationFrame(tick); } requestAnimationFrame(tick);\n',
      },
      {
        file: 'src/wrong-phase-property.tsx',
        content:
          "import { useCanvas, useLoop } from 'phase/react';\nuseCanvas({ onTick: () => { const points = []; paint(points); } });\nuseLoop({ draw: () => source.map(project) });\n",
      },
      {
        file: 'src/nested-helper.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  function buildFrame() {\n    return [];\n  }\n  paint();\n} });\n",
      },
      {
        file: 'src/type-only-tuple.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  const factory: () => [number, number] = getFactory();\n  paint(factory);\n} });\n",
      },
      {
        file: 'src/unrelated-loop.tsx',
        content:
          "import { useLoop } from 'other-library';\nuseLoop({ onTick: () => {\n  const points = [];\n  paint(points);\n} });\n",
      },
      {
        file: 'src/local-loop.ts',
        content:
          'function useLoop(options) { return options; }\nuseLoop({ onTick: () => {\n  const points = [];\n  paint(points);\n} });\n',
      },
      {
        file: 'src/shadowed-loop.tsx',
        content:
          "import { useLoop } from 'phase/react';\nfunction Component(useLoop) {\n  useLoop({ onTick: () => {\n    const points = [];\n    paint(points);\n  } });\n}\n",
      },
      {
        file: 'src/duplicate-callback.tsx',
        content:
          "import { useLoop } from 'phase/react';\nfunction First() {\n  const tick = () => paint();\n  useLoop({ onTick: tick });\n}\nfunction Second() {\n  const tick = () => {\n    const points = [];\n    paint(points);\n  };\n}\n",
      },
      {
        file: 'src/nested-anonymous.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  schedule(() => {\n    const points = [];\n    paint(points);\n  });\n} });\n",
      },
      {
        file: 'src/nested-concise.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  schedule(() => []);\n  paint();\n} });\n",
      },
      {
        file: 'src/import-string.ts',
        content:
          'const example = "import { useLoop } from \'phase/react\'";\nuseLoop({ onTick: () => {\n  const points = [];\n  paint(points);\n} });\n',
      },
      {
        file: 'src/destructured-shadow.tsx',
        content:
          "import { useLoop } from 'phase/react';\nfunction Component() {\n  const { useLoop } = hooks;\n  useLoop({ onTick: () => {\n    const points = [];\n    paint(points);\n  } });\n}\n",
      },
      {
        file: 'src/aliased-shadow.tsx',
        content:
          "import { useLoop } from 'phase/react';\nfunction Component() {\n  const { loop: useLoop } = hooks;\n  useLoop({ onTick: () => {\n    const points = [];\n    paint(points);\n  } });\n}\n",
      },
      {
        file: 'src/namespace-shadow.ts',
        content:
          "import * as Phase from 'phase';\nfunction run() {\n  const [Phase] = hooks;\n  Phase.createLoop({ target, onTick: () => {\n    const points = [];\n    paint(points);\n  } });\n}\n",
      },
      {
        file: 'src/computed-override.tsx',
        content:
          "import { useLoop } from 'phase/react';\nconst tick = () => {\n  const points = [];\n  paint(points);\n};\nuseLoop({ onTick: tick, [callbackName]: noop });\n",
      },
      {
        file: 'src/async-override.tsx',
        content:
          "import { useLoop } from 'phase/react';\nconst tick = () => {\n  const points = [];\n  paint(points);\n};\nuseLoop({ onTick: tick, async onTick() { paint(); } });\n",
      },
      {
        file: 'src/nested-function-expression.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  schedule(function () {\n    const points = [];\n    paint(points);\n  });\n} });\n",
      },
      {
        file: 'src/nested-async-function.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  schedule(async function () {\n    const points = [];\n    paint(points);\n  });\n} });\n",
      },
      {
        file: 'src/array-destructuring.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  [x, y] = point;\n  paint(x, y);\n} });\n",
      },
      {
        file: 'src/object-destructuring.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  ({ x, y } = point);\n  paint(x, y);\n} });\n",
      },
      {
        file: 'src/multiline-tuple.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  const point:\n    [number, number] = cached;\n  paint(point);\n} });\n",
      },
      {
        file: 'src/multiline-type.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  type Point =\n    { x: number; y: number };\n  paint();\n} });\n",
      },
      {
        file: 'src/regex-only.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  const braces = /[{}]/;\n  test(braces);\n} });\n",
      },
      {
        file: 'src/regex-import.ts',
        content:
          "const example = /import { createLoop as frameLoop } from 'phase'/;\nframeLoop({ target, onTick: () => {\n  const points = [];\n  paint(points, example);\n} });\n",
      },
      {
        file: 'src/multiline-shadow.tsx',
        content:
          "import { useLoop } from 'phase/react';\nfunction Component() {\n  const {\n    useLoop,\n  } = hooks;\n  useLoop({ onTick: () => {\n    const points = [];\n    paint(points);\n  } });\n}\n",
      },
      {
        file: 'src/accessor-override.tsx',
        content:
          "import { useLoop } from 'phase/react';\nconst tick = () => {\n  const points = [];\n  paint(points);\n};\nuseLoop({ onTick: tick, get onTick() { return noop; } });\n",
      },
      {
        file: 'src/optional-type-property.tsx',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: () => {\n  let options: { first: string; points?: [] };\n  paint(options);\n} });\n",
      },
      {
        file: 'src/declared-callback.tsx',
        content:
          "import { useLoop } from 'phase/react';\ndeclare function tick(): void;\nfunction unrelated() {\n  const points = [];\n  paint(points);\n}\nuseLoop({ onTick: tick });\n",
      },
    ],
  },
  'forced-reflow': {
    match: [
      {
        file: 'src/reveal.ts',
        content: 'const rect = el.getBoundingClientRect();\n',
      },
      {
        file: 'src/sizer.ts',
        content: 'const w = el.offsetWidth;\n',
      },
      {
        // A real member read inside a JSX expression still counts.
        file: 'src/overlay.tsx',
        content: 'return <Overlay x={element.offsetLeft} />;\n',
      },
      {
        file: 'src/safe-sizer.ts',
        content: 'const w = el?.offsetWidth;\n',
      },
      {
        file: 'src/computed-access.ts',
        content: "const h = el['clientHeight'];\n",
      },
      {
        // Global invocation, no member access needed.
        file: 'src/styles.ts',
        content: 'const s = getComputedStyle(el);\n',
      },
    ],
    noMatch: [
      {
        file: 'src/reveal.ts',
        content: "import { useSize } from 'phase/react';\n",
      },
      {
        // Regression: JSX prop names are not DOM reads.
        file: 'src/overlay.tsx',
        content: 'return <Overlay offsetLeft={12} offsetTop={8} />;\n',
      },
      {
        // Destructuring proves nothing about the source object.
        file: 'src/props.ts',
        content: 'const { offsetLeft, clientWidth } = props;\n',
      },
      {
        // Reading the method reference does not invoke the layout API.
        file: 'src/method-reference.ts',
        content: 'const measure = element.getBoundingClientRect;\n',
      },
    ],
  },
  'js-layout-write': {
    match: [
      {
        file: 'src/vector-editor.tsx',
        content:
          'useLoop({\n  onTick: () => {\n    segmentTransform.setTranslate(x, y);\n    segmentTransform.setRotate(angle, 0, 0);\n  },\n});\n',
      },
      {
        file: 'src/vector-path.ts',
        content:
          "function tick() {\n  path.setAttribute('d', nextPath);\n  requestAnimationFrame(tick);\n}\n",
      },
      {
        file: 'src/vector-transform.ts',
        content:
          "function tick() {\n  group.setAttribute(\n    'transform',\n    `translate(${x} ${y})`,\n  );\n  requestAnimationFrame(tick);\n}\n",
      },
      {
        file: 'src/position.ts',
        content:
          'function tick() {\n  element.style.left = `${x}px`;\n  requestAnimationFrame(tick);\n}\n',
      },
      {
        file: 'src/size.ts',
        content:
          "useLoop({ onTick: () => element.style.setProperty('width', `${width}px`) });\n",
      },
    ],
    noMatch: [
      {
        file: 'src/composited.ts',
        content:
          "element.style.transform = 'translateX(10px)';\nelement.style.opacity = '0.5';\n",
      },
      {
        file: 'src/custom-property.ts',
        content: "element.style.setProperty('--x', `${x}px`);\n",
      },
      {
        file: 'src/meter.ts',
        content: "element.setAttribute('aria-valuenow', String(value));\n",
      },
      {
        file: 'src/canvas.ts',
        content: 'context.setTransform(a, b, c, d, e, f);\n',
      },
      {
        file: 'src/notes.ts',
        content:
          '// element.style.left = "10px";\nconst note = "path.setAttribute(\'d\', nextPath)";\n',
      },
    ],
  },
  'raw-io': {
    match: [
      {
        file: 'src/lazy.ts',
        content: 'const io = new IntersectionObserver(onEnter);\n',
      },
      {
        // Regression: "phase" substring in a consumer path must be scanned.
        file: 'src/game-phase.ts',
        content: 'const io = new IntersectionObserver(onEnter);\n',
      },
    ],
    noMatch: [
      {
        file: 'src/lazy.ts',
        content: "import { useSight } from 'phase/react';\n",
      },
    ],
  },
  'raw-ro': {
    match: [
      {
        file: 'src/panel.ts',
        content: 'const ro = new ResizeObserver(onResize);\n',
      },
    ],
    noMatch: [
      {
        file: 'src/panel.ts',
        content: "import { useSize } from 'phase/react';\n",
      },
    ],
  },
  'raw-matchmedia': {
    match: [
      {
        file: 'src/breakpoint.ts',
        content:
          "const mql = window.matchMedia('(min-width: 768px)');\nmql.addEventListener('change', onChange);\n",
      },
      {
        // Deprecated MediaQueryList listener API; still a pooled-subscription
        // miss.
        file: 'src/legacy.ts',
        content:
          "const mql = window.matchMedia('(pointer: coarse)');\nmql.addListener(onChange);\n",
      },
      {
        file: 'src/motion.ts',
        content:
          "window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', sync);\n",
      },
    ],
    noMatch: [
      {
        file: 'src/breakpoint.ts',
        content:
          "import { useMediaQuery } from 'phase/react';\nconst isWide = useMediaQuery('(min-width: 768px)');\n",
      },
      {
        // Regression: a one-shot `.matches` read subscribes to nothing, so
        // there is no listener to leak and nothing for the pool to key.
        file: 'src/pointer.ts',
        content:
          "const coarse = window.matchMedia('(pointer: coarse)').matches;\n",
      },
      {
        file: 'src/pointer.ts',
        content:
          "export function isCoarse() {\n  return window.matchMedia('(pointer: coarse)').matches;\n}\n",
      },
      {
        file: 'src/pointer.ts',
        content:
          "const { matches } = window.matchMedia('(pointer: coarse)');\n",
      },
      {
        // Regression: a listener on an unrelated receiver is not evidence that
        // the snapshot above subscribed. Looking for listener vocabulary
        // anywhere in the file would report this.
        testId: 'unrelated-listener',
        file: 'src/form.ts',
        content:
          "const coarse = window.matchMedia('(pointer: coarse)').matches;\nsetLayout(coarse);\ninput.addEventListener('change', onInput);\n",
      },
    ],
  },
  'mutationobserver-layout': {
    match: [
      {
        file: 'src/scrollbar.ts',
        content:
          'const mo = new MutationObserver(() => {\n  const h = el.scrollHeight;\n  sync(h);\n});\nmo.observe(el, { subtree: true, attributes: true });\n',
      },
      {
        file: 'src/tracker.ts',
        content:
          "const mo = new MutationObserver(onStyle);\nmo.observe(el, { subtree: true, attributeFilter: ['style'] });\n",
      },
    ],
    noMatch: [
      {
        file: 'src/list.ts',
        content:
          'const mo = new MutationObserver(onChildren);\nmo.observe(list, { childList: true });\n',
      },
      {
        // A class watcher neither observes styles nor reads layout; it may
        // still be a redundant-mutation-observers candidate, not this one.
        file: 'src/theme.ts',
        content:
          "const mo = new MutationObserver(onTheme);\nmo.observe(document.documentElement, { attributeFilter: ['class'] });\n",
      },
    ],
  },
  'js-opacity-transform': {
    match: [
      {
        file: 'src/fade.ts',
        content: "el.style.opacity = '0.5';\n",
      },
      {
        file: 'src/slide.ts',
        content: "el.style.transform = 'translateX(10px)';\n",
      },
    ],
    noMatch: [
      {
        file: 'src/fade.ts',
        content: "el.classList.add('faded');\n",
      },
    ],
  },
  'missing-reduced-motion': {
    match: [
      {
        file: 'src/spin.ts',
        content:
          'function spin() {\n  requestAnimationFrame(spin);\n}\nrequestAnimationFrame(spin);\n',
      },
      {
        // Regression: CSS animations without reduced-motion handling were
        // once never scanned (the signal only ran on JS files).
        file: 'src/styles.css',
        content:
          '@keyframes spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n.spinner {\n  animation: spin 1s linear infinite;\n}\n',
      },
      {
        // An unrelated phase import does not make a raw rAF respect motion.
        file: 'src/eased-spin.ts',
        content:
          "import { clamp } from 'phase';\nfunction spin() {\n  requestAnimationFrame(spin);\n}\nrequestAnimationFrame(spin);\n",
      },
    ],
    noMatch: [
      {
        file: 'src/spin.ts',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: spin });\n",
      },
      {
        file: 'src/ready.tsx',
        content:
          'useEffect(() => {\n  const id = requestAnimationFrame(() => setReady(true));\n  return () => cancelAnimationFrame(id);\n}, []);\n',
      },
      {
        file: 'src/styles.css',
        content:
          '.spinner {\n  animation: spin 1s linear infinite;\n}\n@media (prefers-reduced-motion: reduce) {\n  .spinner {\n    animation: none;\n  }\n}\n',
      },
      {
        // animation: none disables motion; it is not an animation.
        file: 'src/reset.css',
        content: '.static {\n  animation: none;\n}\n',
      },
    ],
  },
  'background-animation': {
    match: [
      {
        file: 'src/carousel.ts',
        content:
          "setInterval(() => {\n  track.style.transform = 'translateX(' + offset + 'px)';\n}, 3000);\n",
      },
      {
        // A timeout that reschedules itself recurs like an interval, and keeps
        // firing off-screen the same way.
        testId: 'slow-recurring-timeout',
        file: 'src/pulse.ts',
        content:
          'function step() {\n  node.style.opacity = nextOpacity();\n  timer = setTimeout(step, 1000);\n}\ntimer = setTimeout(step, 1000);\n',
      },
      {
        file: 'src/pulse.ts',
        content:
          'const step = () => {\n  node.style.opacity = nextOpacity();\n  timer = setTimeout(step, 1000);\n};\nsetTimeout(step, 1000);\n',
      },
    ],
    noMatch: [
      {
        // Regression: "position" as a plain variable near a timer is not
        // animation work (an old context pattern matched the bare word).
        file: 'src/queue.ts',
        content:
          'setTimeout(() => {\n  const position = queue.indexOf(job);\n  report(position);\n}, 1000);\n',
      },
      {
        // Regression: a one-shot timeout that ends a transition runs once and
        // stops. `js-opacity-transform` still covers the style write.
        testId: 'one-shot-style-write',
        file: 'src/press.ts',
        content:
          "node.style.transform = 'scale(.98)';\nconst id = setTimeout(() => {\n  node.style.transform = '';\n}, 100);\n",
      },
      {
        // Regression: a timeout backing up `transitionend` is a reliability
        // fallback, not background animation, even surrounded by transform
        // vocabulary.
        file: 'src/reveal.ts',
        content:
          "node.style.transform = 'translateY(0)';\nnode.addEventListener('transitionend', onDone, { once: true });\nconst fallback = setTimeout(onDone, 320);\n",
      },
      {
        file: 'src/reset.ts',
        content:
          "function reset() {\n  el.style.opacity = '1';\n}\nsetTimeout(reset, 200);\n",
      },
    ],
  },
  'manual-synced-ref': {
    match: [
      {
        file: 'src/use-latest.ts',
        content: 'const cbRef = useRef(cb);\ncbRef.current = cb;\n',
      },
    ],
    noMatch: [
      {
        file: 'src/use-latest.ts',
        content: 'const cbRef = useRef(null);\ncbRef.current = cb;\n',
      },
    ],
  },
  'manual-stable-callback': {
    match: [
      {
        file: 'src/use-handler.tsx',
        content:
          'const cbRef = useRef(onChange);\ncbRef.current = onChange;\nconst stable = useCallback((v) => cbRef.current(v), []);\n',
      },
      {
        file: 'src/panel.tsx',
        content:
          'const stable = useCallback(\n  (event) => {\n    handlerRef.current?.(event);\n  },\n  [],\n);\n',
      },
    ],
    noMatch: [
      {
        // An ordinary memoized callback is not the idiom.
        file: 'src/list.tsx',
        content: 'const onPick = useCallback((id) => select(id), [select]);\n',
      },
      {
        // Empty deps but nothing read through a ref: the behavior really is
        // frozen, which is a different thing entirely.
        file: 'src/list.tsx',
        content: "const onMount = useCallback(() => track('open'), []);\n",
      },
      {
        // A ref call with real deps is not a stability shim.
        file: 'src/list.tsx',
        content:
          'const run = useCallback((v) => cbRef.current(v), [cbRef, extra]);\n',
      },
    ],
  },
  'global-has-selector': {
    match: [
      {
        file: 'src/globals.css',
        content: 'body:has(.modal-open) {\n  overflow: hidden;\n}\n',
      },
    ],
    noMatch: [
      {
        file: 'src/card.css',
        content: '.card:has(img) {\n  padding: 0;\n}\n',
      },
      {
        // CSS signals must not fire on JS files.
        file: 'src/globals.ts',
        content: "const css = 'body:has(.modal-open) { overflow: hidden; }';\n",
      },
    ],
  },
  'permanent-will-change': {
    match: [
      {
        file: 'src/card.css',
        content: '.card {\n  will-change: transform;\n}\n',
      },
      {
        // will-change on layout properties is worse than transform, and an
        // old pattern missed it entirely.
        file: 'src/panel.css',
        content: '.panel {\n  will-change: left, top;\n}\n',
      },
      {
        // The gate is the enclosing rule, not the file: an unrelated :hover
        // rule elsewhere used to silence the whole stylesheet, which is to
        // say every real stylesheet.
        file: 'src/card.css',
        content:
          '.card {\n  will-change: transform;\n}\n\n.button:hover {\n  color: red;\n}\n',
      },
    ],
    noMatch: [
      {
        file: 'src/card.css',
        content: ".card[data-active='true'] {\n  will-change: transform;\n}\n",
      },
      {
        file: 'src/reset.css',
        content: '.static {\n  will-change: auto;\n}\n',
      },
      {
        // Managed alongside a play-state toggle in the same rule.
        file: 'src/marquee.css',
        content:
          '.marquee {\n  will-change: transform;\n  animation-play-state: paused;\n}\n',
      },
    ],
  },
  'non-compositor-animation': {
    match: [
      {
        file: 'src/menu.css',
        content: '.menu {\n  transition: all 0.3s ease;\n}\n',
      },
      {
        file: 'src/drawer.css',
        content: '.drawer {\n  transition: width 0.2s;\n}\n',
      },
      {
        // A bare-duration shorthand names no property, so it animates
        // `all` by default.
        file: 'src/tab.css',
        content: '.tab {\n  transition: 0.3s;\n}\n',
      },
      {
        // Duration, timing function, and delay, still naming no property.
        file: 'src/sheet.css',
        content: '.sheet {\n  transition: 0.3s ease-in-out 0.1s;\n}\n',
      },
      {
        file: 'src/multiline.css',
        content: '.card {\n  transition:\n    all 300ms ease;\n}\n',
      },
    ],
    noMatch: [
      {
        file: 'src/menu.css',
        content: '.menu {\n  transition: opacity 0.3s, transform 0.3s;\n}\n',
      },
      {
        file: 'src/menu.css',
        content: '.menu {\n  transition-property: opacity;\n}\n',
      },
      {
        file: 'src/menu.css',
        content: '.menu {\n  transition: 0.3s opacity;\n}\n',
      },
      {
        // Vendor-prefixed lines must not count: the unprefixed sibling
        // (always present alongside) carries the single finding.
        file: 'src/legacy.css',
        content:
          '.card {\n  -webkit-transition: all 0.3s ease-out;\n  -moz-transition: all 0.3s ease-out;\n}\n',
      },
      {
        file: 'src/removed.css',
        content: '/* transition: all 0.3s; */\n.card { opacity: 1; }\n',
      },
    ],
  },
  'keyframes-layout-animation': {
    match: [
      {
        file: 'src/slide.css',
        content:
          '@keyframes slide-in {\n  from {\n    left: -200px;\n  }\n  to {\n    left: 0;\n  }\n}\n',
      },
      {
        file: 'src/grow.css',
        content:
          '@keyframes grow {\n  0% {\n    height: 0;\n  }\n  100% {\n    height: 300px;\n  }\n}\n',
      },
      {
        // Compact single-line frames are the common hand-written form.
        file: 'src/drop.css',
        content:
          '@keyframes drop {\n  from { top: -10px; }\n  to { top: 0; }\n}\n',
      },
      {
        // Vendor-prefixed keyframes blocks animate layout just the same.
        file: 'src/legacy.css',
        content:
          '@-webkit-keyframes rise {\n  from {\n    height: 0;\n  }\n}\n',
      },
      {
        // A whole block on one line: the at-rule sits on the property's own
        // line, so a backward-only walk never saw it.
        file: 'src/compact.css',
        content: '@keyframes drop { from { top: -10px; } to { top: 0; } }\n',
      },
      {
        // Nested in an at-rule, which shifts the brace depth.
        file: 'src/responsive.css',
        content:
          '@media (min-width: 600px) {\n  @keyframes grow {\n    from {\n      width: 0;\n    }\n  }\n}\n',
      },
    ],
    noMatch: [
      {
        file: 'src/slide.css',
        content:
          '@keyframes slide-in {\n  from {\n    transform: translateX(-200px);\n    opacity: 0;\n  }\n}\n',
      },
      {
        file: 'src/layout.css',
        content: '.sidebar {\n  width: 240px;\n  top: 0;\n}\n',
      },
      {
        // Single-line ordinary rules are not keyframes, even nested.
        file: 'src/media.css',
        content:
          '@media (min-width: 600px) {\n  .sidebar { width: 240px; }\n}\n',
      },
      {
        file: 'src/commented.css',
        content: '/* @keyframes old { */\n.sidebar { width: 240px; }\n',
      },
    ],
  },
  'bare-window-listener': {
    match: [
      {
        file: 'src/sidebar.ts',
        content:
          "window.addEventListener('resize', () => {\n  const w = el.getBoundingClientRect().width;\n  setCollapsed(w < 240);\n});\n",
      },
    ],
    noMatch: [
      {
        file: 'src/sidebar.ts',
        content:
          "window.addEventListener('resize', () => {\n  schedule();\n});\n",
      },
      {
        file: 'src/button.ts',
        content:
          "el.addEventListener('click', () => {\n  const w = el.offsetWidth;\n  log(w);\n});\n",
      },
    ],
  },
  'pointer-listener-layout-read': {
    match: [
      {
        file: 'src/spotlight.ts',
        content:
          "el.addEventListener('pointermove', (e) => {\n  const rect = el.getBoundingClientRect();\n  move(e.clientX - rect.left, e.clientY - rect.top);\n});\n",
      },
      {
        // Inline JSX move handler with a layout read in the body.
        file: 'src/slider.tsx',
        content:
          'return (\n  <div\n    onPointerMove={(event) => {\n      const rect = event.currentTarget.getBoundingClientRect();\n      move(event.clientX - rect.left);\n    }}\n  />\n);\n',
      },
      {
        // One-hop `useCallback` binding defined away from the JSX.
        file: 'src/scrubber.tsx',
        content:
          'const handleMouseMove = useCallback((event) => {\n  const rect = container.getBoundingClientRect();\n  move(event.clientX - rect.left);\n}, []);\n\nreturn <div onMouseMove={handleMouseMove} />;\n',
      },
      {
        // One-hop function declaration binding.
        file: 'src/tracker.tsx',
        content:
          'function handlePointerMove(event) {\n  const width = surface.offsetWidth;\n  move(event.clientX / width);\n}\n\nreturn <section onPointerMove={handlePointerMove} />;\n',
      },
    ],
    noMatch: [
      {
        // No layout read in the handler means no reflow to batch.
        file: 'src/spotlight.ts',
        content:
          "el.addEventListener('pointermove', (e) => {\n  last.x = e.clientX;\n  last.y = e.clientY;\n});\n",
      },
      {
        file: 'src/spotlight.tsx',
        content: "import { usePointer } from 'phase/react';\n",
      },
      {
        // A coordinate-only JSX handler has no reflow to batch.
        file: 'src/glow.tsx',
        content:
          'return <div onPointerMove={(e) => move(e.clientX, e.clientY)} />;\n',
      },
      {
        // A custom component prop does not prove a DOM event.
        file: 'src/panel.tsx',
        content:
          'return (\n  <Overlay\n    onPointerMove={(e) => {\n      const rect = box.getBoundingClientRect();\n      move(e.clientX - rect.left);\n    }}\n  />\n);\n',
      },
      {
        // Click handlers are not move-frequency events.
        file: 'src/expander.tsx',
        content:
          'return (\n  <div\n    onClick={(e) => {\n      const w = e.currentTarget.offsetWidth;\n      log(w);\n    }}\n  />\n);\n',
      },
      {
        // The handler only calls a helper the scanner cannot resolve.
        file: 'src/delegate.tsx',
        content:
          'const handleMouseMove = useCallback((event) => {\n  measure(event);\n}, []);\n\nreturn <div onMouseMove={handleMouseMove} />;\n',
      },
      {
        // A layout read outside the move callback belongs to other signals.
        file: 'src/nearby.tsx',
        content:
          'const width = el.offsetWidth;\nreturn <div onPointerMove={(e) => move(e.clientX / width)} />;\n',
      },
      {
        // Member-expression handlers (class methods, forwarded props) are
        // not resolvable with one local hop.
        file: 'src/canvas-surface.tsx',
        content:
          'const width = surface.offsetWidth;\nreturn <canvas onPointerMove={this.handleCanvasPointerMove} onTouchMove={props.onTouchMove} />;\n',
      },
      {
        // An unspaced `<` comparison in an earlier prop must not read as a tag
        // opening. The move prop belongs to a capitalized component.
        file: 'src/gauge.tsx',
        content:
          "return <Overlay className={x <y ? 'a' : 'b'} onPointerMove={(e) => { const r = el.getBoundingClientRect(); move(r.left); }} />;\n",
      },
      {
        // An arrow inside a call expression runs during render, not during the
        // move event.
        file: 'src/registry.tsx',
        content:
          'return <div onPointerMove={handlers.find((h) => h.el.offsetWidth > 0)} />;\n',
      },
    ],
  },
  'redundant-mutation-observers': {
    match: [
      {
        file: 'src/theme.ts',
        content:
          'const mo = new MutationObserver(onTheme);\nmo.observe(document.documentElement, { attributes: true });\n',
      },
    ],
    noMatch: [
      {
        file: 'src/widget.ts',
        content:
          'const mo = new MutationObserver(onChange);\nmo.observe(ref.current, { childList: true });\n',
      },
    ],
  },
  'tailwind-transition-all': {
    match: [
      {
        file: 'src/card.tsx',
        content:
          '<div className="transition-all duration-300 hover:scale-105" />;\n',
      },
      {
        // Most Tailwind class strings in a real codebase live in variant
        // modules, not in JSX; a jsx-only signal missed all of them.
        file: 'src/button-variants.ts',
        content: "export const button = cva('rounded transition-all');\n",
      },
    ],
    noMatch: [
      {
        file: 'src/card.tsx',
        content: '<div className="transition-colors duration-300" />;\n',
      },
      {
        file: 'src/card.ts',
        content: "const cls = 'transition-colors duration-300';\n",
      },
      {
        // Stylesheets have their own signal (non-compositor-animation).
        file: 'src/card.css',
        content: '.card {\n  transition: all 0.3s;\n}\n',
      },
    ],
  },
  'tailwind-permanent-will-change': {
    match: [
      {
        file: 'src/logo.tsx',
        content: '<div className="will-change-transform animate-spin" />;\n',
      },
      {
        file: 'src/logo-variants.ts',
        content: "export const logo = cva('will-change-transform');\n",
      },
    ],
    noMatch: [
      {
        file: 'src/logo.tsx',
        content: "<div className={active ? 'will-change-transform' : ''} />;\n",
      },
      {
        file: 'src/logo.tsx',
        content: "<div className={spinning && 'will-change-transform'} />;\n",
      },
    ],
  },
  'reduced-motion-ignored': {
    match: [
      {
        file: 'src/hero.ts',
        content:
          "createLoop({ target: el, onTick: draw, reducedMotion: 'ignore' });\n",
      },
    ],
    noMatch: [
      {
        file: 'src/hero.ts',
        content:
          "createLoop({ target: el, onTick: draw, reducedMotion: 'respect' });\n",
      },
    ],
  },
  'core-primitive-in-component': {
    match: [
      {
        file: 'src/spinner.tsx',
        content:
          'useEffect(() => {\n  const loop = createLoop({ target: ref.current, onTick });\n  return () => loop.stop();\n}, []);\n',
      },
    ],
    noMatch: [
      {
        // Custom hook modules (.ts) composing core primitives are the
        // documented escape hatch.
        file: 'src/use-spinner.ts',
        content:
          'const loop = createLoop({ target, onTick });\nreturn () => loop.stop();\n',
      },
    ],
  },
  'phase-loop-browser-keyframes': {
    match: [
      {
        file: 'src/logo-editor.tsx',
        content:
          'const tick = (frame) => {\n  const p = clamp01(frame.elapsed / 800);\n  segment.style.transform = `translateX(${p * 20}px)`;\n  cursor.style.opacity = String(p);\n};\nuseLoop({ onTick: tick });\n',
      },
      {
        // SVGTransform writes were the confirmed real-world miss: the
        // deterministic logo timeline was sampled in JS every frame.
        file: 'src/vector-editor.tsx',
        content:
          'const tick = (frame) => {\n  const p = frame.elapsed / 1000;\n  transform.setTranslate(p * 10, 0);\n  rotation.setRotate(p * 20, 0, 0);\n};\nconst { ref } = useLoop<SVGSVGElement>({ onTick: tick });\n',
      },
      {
        file: 'src/aliased-frame.tsx',
        content:
          'const tick = (f) => {\n  const p = f.elapsed / 800;\n  segment.style.transform = `translateX(${p * 20}px)`;\n};\nuseLoop({ onTick: tick });\n',
      },
      {
        file: 'src/destructured-frame.tsx',
        content:
          'useLoop({\n  onTick: ({ elapsed }) => {\n    const p = elapsed / 800;\n    segment.style.transform = `translateX(${p * 20}px)`;\n  },\n});\n',
      },
    ],
    noMatch: [
      {
        // Delta integration suggests simulation/physics, not a timeline that
        // can be completely described before playback.
        file: 'src/particles.tsx',
        content:
          'useLoop({\n  onTick: (frame) => {\n    velocity += gravity * frame.delta;\n    position += velocity * frame.delta;\n    particle.style.transform = `translateY(${position}px)`;\n  },\n});\n',
      },
      {
        // Elapsed time alone is not enough; there must also be visible output
        // that browser keyframes plausibly own.
        file: 'src/clock.tsx',
        content:
          "useLoop({\n  onTick: (frame) => label.setAttribute('aria-valuenow', String(frame.elapsed)),\n});\n",
      },
      {
        file: 'src/css-gate.tsx',
        content:
          "const { ref, isActive } = useLifecycle();\nreturn <div ref={ref} style={{ animationPlayState: isActive ? 'running' : 'paused' }} />;\n",
      },
    ],
  },
  'when-visible-no-fallback': {
    match: [
      {
        file: 'src/comments.tsx',
        content: '<WhenVisible>\n  <Comments postId={id} />\n</WhenVisible>\n',
      },
      {
        file: 'src/chat.tsx',
        content:
          '<WhenIdle rootMargin="200px">\n  <ChatWidget />\n</WhenIdle>\n',
      },
    ],
    noMatch: [
      {
        file: 'src/comments.tsx',
        content:
          '<WhenVisible fallback={<div style={{ height: 480 }} />}>\n  <Comments postId={id} />\n</WhenVisible>\n',
      },
      {
        file: 'src/chat.tsx',
        content:
          '<WhenIdle\n  rootMargin="200px"\n  fallback={<Skeleton height={320} />}\n>\n  <ChatWidget />\n</WhenIdle>\n',
      },
      {
        // A comparison inside a prop expression is not the end of the tag;
        // ending there hid the fallback declared below it.
        file: 'src/gallery.tsx',
        content:
          "<WhenVisible\n  rootMargin={count > 3 ? '400px' : '100px'}\n  fallback={<Skeleton height={200} />}\n>\n  <Gallery />\n</WhenVisible>\n",
      },
    ],
  },
} satisfies Record<ScanSignalId, SignalExamples>;

export const SIGNAL_EXAMPLES: Record<string, SignalExamples> =
  SIGNAL_EXAMPLE_CATALOG;
