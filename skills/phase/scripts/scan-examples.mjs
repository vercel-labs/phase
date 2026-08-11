/**
 * Executable examples for every scanner signal, keyed by signal id.
 * Contributor tooling only: not shipped in the skill zip. The test suite
 * verifies each `match` example produces a finding for its signal and each
 * `noMatch` example does not; a signal without examples fails structurally,
 * as does an example keyed to a signal that no longer exists.
 */

export const SIGNAL_EXAMPLES = {
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
        content: 'requestAnimationFrame(step);\n',
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
        // A rAF line already reported as setstate-in-raf is not
        // double-counted as a manual loop (supersedes).
        file: 'src/counter.tsx',
        content: 'requestAnimationFrame(() => setCount((c) => c + 1));\n',
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
        content: "requestAnimationFrame(() => dispatch({ type: 'tick' }));\n",
      },
      {
        // Real callbacks routinely exceed the old fixed ±5-line window.
        file: 'src/long-progress.tsx',
        content:
          'requestAnimationFrame(() => {\n  measure();\n  normalize();\n  clampValue();\n  interpolate();\n  applyEasing();\n  writeFrame();\n  setProgress(next);\n});\n',
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
    ],
    noMatch: [
      {
        file: 'src/reveal.ts',
        content: "import { useSize } from 'phase/react';\n",
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
        file: 'src/motion.ts',
        content:
          "const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;\n",
      },
    ],
    noMatch: [
      {
        file: 'src/breakpoint.ts',
        content:
          "import { useMediaQuery } from 'phase/react';\nconst isWide = useMediaQuery('(min-width: 768px)');\n",
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
        content: 'requestAnimationFrame(spin);\n',
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
          "import { clamp } from 'phase';\nrequestAnimationFrame(spin);\n",
      },
    ],
    noMatch: [
      {
        file: 'src/spin.ts',
        content:
          "import { useLoop } from 'phase/react';\nuseLoop({ onTick: spin });\n",
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
    ],
    noMatch: [
      {
        // Regression: "position" as a plain variable near a timer is not
        // animation work (an old context pattern matched the bare word).
        file: 'src/queue.ts',
        content:
          'setTimeout(() => {\n  const position = queue.indexOf(job);\n  report(position);\n}, 1000);\n',
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
    ],
    noMatch: [
      {
        // No layout read in the handler: cheap, not a reflow storm.
        file: 'src/spotlight.ts',
        content:
          "el.addEventListener('pointermove', (e) => {\n  last.x = e.clientX;\n  last.y = e.clientY;\n});\n",
      },
      {
        file: 'src/spotlight.tsx',
        content: "import { usePointer } from 'phase/react';\n",
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
          "createLoop({ element: el, onTick: draw, reducedMotion: 'ignore' });\n",
      },
    ],
    noMatch: [
      {
        file: 'src/hero.ts',
        content:
          "createLoop({ element: el, onTick: draw, reducedMotion: 'respect' });\n",
      },
    ],
  },
  'core-primitive-in-component': {
    match: [
      {
        file: 'src/spinner.tsx',
        content:
          'useEffect(() => {\n  const loop = createLoop({ element: ref.current, onTick });\n  return () => loop.stop();\n}, []);\n',
      },
    ],
    noMatch: [
      {
        // Custom hook modules (.ts) composing core primitives are the
        // documented escape hatch.
        file: 'src/use-spinner.ts',
        content:
          'const loop = createLoop({ element, onTick });\nreturn () => loop.stop();\n',
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
};
