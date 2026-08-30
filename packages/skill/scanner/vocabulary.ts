const FRAME_CALLBACK_NAMES = ['onTick', 'onDraw'] as const;
const POINTER_MOVE_EVENT_NAMES = [
  'pointermove',
  'mousemove',
  'touchmove',
] as const;
const WINDOW_LAYOUT_EVENT_NAMES = ['resize', 'scroll'] as const;
const OTHER_FRAME_EVENT_NAMES = ['wheel', 'drag'] as const;
const MOVE_HANDLER_NAMES = ['PointerMove', 'MouseMove', 'TouchMove'] as const;
const OBSERVER_NAMES = ['Intersection', 'Resize', 'Mutation'] as const;
const TIMER_NAMES = ['setInterval', 'setTimeout'] as const;
const [RESIZE_EVENT_NAME, SCROLL_EVENT_NAME] = WINDOW_LAYOUT_EVENT_NAMES;
const [
  INTERSECTION_OBSERVER_NAME,
  RESIZE_OBSERVER_NAME,
  MUTATION_OBSERVER_NAME,
] = OBSERVER_NAMES;
const [INTERVAL_TIMER_NAME] = TIMER_NAMES;

// Consumers: setstate-in-ontick detects callback definitions; FRAME_DRIVER
// uses the same callback names to rank nearby findings as per-frame work. The
// signal requires definition punctuation while ranking accepts a bare name;
// each preserves its existing false-positive boundary.
export const FRAME_CALLBACK_DEFINITION = new RegExp(
  [
    ...FRAME_CALLBACK_NAMES.map((name) => String.raw`\b${name}\s*[:=(]`),
    String.raw`\bdraw\s*:`,
  ].join('|'),
);
const FRAME_CALLBACK_REFERENCE = new RegExp(
  [
    ...FRAME_CALLBACK_NAMES.map((name) => String.raw`\b${name}\b`),
    String.raw`\bdraw\s*:`,
  ].join('|'),
);

// Consumers: pointer-listener-layout-read detects JSX props, move-handler
// analysis associates intrinsic props with callback bodies, and FRAME_DRIVER
// ranks nearby findings. Analysis drops custom-component props from signal
// evidence; ranking remains intentionally broad and may heat nearby work.
export const MOVE_HANDLER_PROP = new RegExp(
  String.raw`\bon(?:${MOVE_HANDLER_NAMES.join('|')})\s*=\s*\{`,
);
const POINTER_MOVE_EVENT_LISTENER = listenerPattern(POINTER_MOVE_EVENT_NAMES);

// Consumer: pointer-listener-layout-read detects raw listeners and JSX props.
// Its evidence gate requires a layout read in the local or associated body.
export const POINTER_MOVE_LISTENER = new RegExp(
  `${POINTER_MOVE_EVENT_LISTENER.source}|${MOVE_HANDLER_PROP.source}`,
);

// Consumers: bare-window-listener detects synchronous layout reads; FRAME_DRIVER
// ranks nearby findings driven by the same resize and scroll events. Both keep
// their existing broad listener match and rely on nearby findings for meaning.
export const WINDOW_LAYOUT_LISTENER = listenerPattern(
  WINDOW_LAYOUT_EVENT_NAMES,
);

// Consumers: each raw-observer signal detects one constructor; FRAME_DRIVER
// ranks findings near any observer callback as per-frame work. Constructor
// matching stays broad; signal context and severity distinguish their costs.
export const INTERSECTION_OBSERVER_CONSTRUCTOR = observerPattern(
  INTERSECTION_OBSERVER_NAME,
);
export const RESIZE_OBSERVER_CONSTRUCTOR =
  observerPattern(RESIZE_OBSERVER_NAME);
export const MUTATION_OBSERVER_CONSTRUCTOR = observerPattern(
  MUTATION_OBSERVER_NAME,
);

// Consumers: recurring timer evidence identifies interval calls;
// background-animation and timer-missing-reduced-motion detect interval and
// timeout scheduling; FRAME_DRIVER ranks only interval-driven work. Timeouts
// stay out of ranking because one-shot and recurring ownership require the
// scheduling analysis to distinguish them.
export const INTERVAL_CALL = new RegExp(
  String.raw`\b${INTERVAL_TIMER_NAME}\s*(?:\?\.)?\s*\(`,
);
export const TIMER_REFERENCE = new RegExp(TIMER_NAMES.join('|'));

const FRAME_MOVE_EVENT_NAMES = [
  ...POINTER_MOVE_EVENT_NAMES,
  SCROLL_EVENT_NAME,
  RESIZE_EVENT_NAME,
  ...OTHER_FRAME_EVENT_NAMES,
];
const FRAME_MOVE_LISTENER = new RegExp(
  String.raw`addEventListener\s*\(\s*['"](?:${FRAME_MOVE_EVENT_NAMES.join('|')})`,
);
const OBSERVER_CONSTRUCTORS = new RegExp(
  String.raw`new\s+(?:${OBSERVER_NAMES.join('|')})Observer`,
);
const INTERVAL_REFERENCE = new RegExp(String.raw`${INTERVAL_TIMER_NAME}\s*\(`);

/** Vocabulary that makes nearby scanner findings execution-critical. */
export const FRAME_DRIVER = new RegExp(
  [
    FRAME_CALLBACK_REFERENCE.source,
    String.raw`use(?:Loop|Canvas|Tween|Pointer|Scroll)\s*\(`,
    String.raw`create(?:Loop|Ticker|Pointer|Scroll)\s*\(`,
    FRAME_MOVE_LISTENER.source,
    MOVE_HANDLER_PROP.source,
    OBSERVER_CONSTRUCTORS.source,
    INTERVAL_REFERENCE.source,
  ].join('|'),
);

function listenerPattern(names: readonly string[]): RegExp {
  return new RegExp(
    String.raw`addEventListener\s*\(\s*['"](?:${names.join('|')})['"]`,
  );
}

function observerPattern(name: (typeof OBSERVER_NAMES)[number]): RegExp {
  return new RegExp(String.raw`new\s+${name}Observer`);
}
