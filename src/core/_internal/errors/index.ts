import { Diagnostic, defineDiagnostics } from 'nostics';

/**
 * A Phase diagnostic. Every Phase error helper throws an instance of this.
 * Aliased from nostics' `Diagnostic` so `error instanceof PhaseError` works.
 */
export { Diagnostic as PhaseError };

/** Scoped diagnostic catalog - every code documents to `vercel.com/docs/errors/phase/<code>`. */
const diagnostics = /*#__PURE__*/ defineDiagnostics({
  docsBase: 'https://vercel.com/docs/errors/phase',
  codes: {
    server_context: {
      why: (p: { fn: string }) =>
        `${p.fn}() cannot be called on the server. Browser APIs like requestAnimationFrame are not available during SSR.`,
      fix: (p: { fn: string }) =>
        `Move ${p.fn}() into a useEffect or a client-only module.`,
    },
    no_element: {
      why: (p: { fn: string }) =>
        `${p.fn}() requires a mounted DOM element. The element ref is null, which usually means the element has not mounted yet or has been unmounted.`,
      fix: (p: { fn: string }) =>
        `Call ${p.fn}() inside a useEffect after the ref is populated, or use the hook equivalent which handles this automatically.`,
    },
    sight_disposed: {
      why: 'Cannot interact with a disposed Sight instance. dispose() was already called on it.',
      fix: 'Create a new Sight instance instead of reusing a disposed one.',
    },
    invalid_duration: {
      why: (p: { fn: string; value: number }) =>
        `${p.fn}() received an invalid duration: ${p.value}. Duration must be a finite positive number.`,
      fix: 'Pass a positive number for duration (e.g., 300 for 300ms).',
    },
    ticker_stopped: {
      why: 'Cannot resume a stopped ticker. stop() is terminal — a stopped ticker cannot be restarted, which prevents accidental zombie loops.',
      fix: 'Create a new ticker instance instead of resuming a stopped one.',
    },
    presence_no_children: {
      why: 'Presence was rendered without any children to track.',
      fix: 'Pass the element you want to animate as a child of the Presence component.',
    },
    missing_context: {
      why: (p: { child: string; parent: string }) =>
        `<${p.child}> must be used inside <${p.parent}>. <${p.child}> reads from a React context that <${p.parent}> provides; without the parent, the context is null.`,
      fix: (p: { child: string; parent: string }) =>
        `Wrap <${p.child}> with <${p.parent}>: <${p.parent}><${p.child} /></${p.parent}>`,
    },
  },
});

export type PhaseErrorCode = keyof typeof diagnostics;

/** Check if a value is a Phase diagnostic. */
export const isPhaseError = (error: unknown): error is Diagnostic =>
  error instanceof Diagnostic;

// TODO: clean up these wrapper functions — now that nostics gives each code a
// typed handle, call sites can `throw diagnostics.<code>(params)` directly and
// these `*Error()` helpers can be removed.
export function serverContextError(fn: string): never {
  throw diagnostics.server_context({ fn });
}

export function noElementError(fn: string): never {
  throw diagnostics.no_element({ fn });
}

export function sightDisposedError(): never {
  throw diagnostics.sight_disposed();
}

export function invalidDurationError(fn: string, value: number): never {
  throw diagnostics.invalid_duration({ fn, value });
}

export function tickerStoppedError(): never {
  throw diagnostics.ticker_stopped();
}

export function missingContextError(child: string, parent: string): never {
  throw diagnostics.missing_context({ child, parent });
}
