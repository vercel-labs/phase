import {
  Diagnostic,
  createConsoleReporter,
  defineDiagnostics,
  defineProdDiagnostics,
} from 'nostics';
import { createDevReporter } from 'nostics/reporters/dev';

/**
 * A Phase diagnostic. Every Phase error helper throws an instance of this.
 * Aliased from nostics' `Diagnostic` so `error instanceof PhaseError` works.
 */
export { Diagnostic as PhaseError };

/** Every code documents to `vercel.com/docs/errors/phase/<code>`. */
const docsBase = 'https://vercel.com/docs/errors/phase';

/** Code catalog shared by the dev and prod factories. */
const codes = {
  R01_server_context: {
    why: (p: { fn: string }) =>
      `${p.fn}() cannot be called on the server. Browser APIs like requestAnimationFrame are not available during SSR.`,
    fix: (p: { fn: string }) =>
      `Move ${p.fn}() into a useEffect or a client-only module.`,
  },
  R02_no_element: {
    why: (p: { fn: string }) =>
      `${p.fn}() requires a mounted DOM element. The element ref is null, which usually means the element has not mounted yet or has been unmounted.`,
    fix: (p: { fn: string }) =>
      `Call ${p.fn}() inside a useEffect after the ref is populated, or use the hook equivalent which handles this automatically.`,
  },
  R03_sight_disposed: {
    why: 'Cannot interact with a disposed Sight instance. dispose() was already called on it.',
    fix: 'Create a new Sight instance instead of reusing a disposed one.',
  },
  R04_invalid_duration: {
    why: (p: { fn: string; value: number }) =>
      `${p.fn}() received an invalid duration: ${p.value}. Duration must be a finite positive number.`,
    fix: 'Pass a positive number for duration (e.g., 300 for 300ms).',
  },
  R05_ticker_stopped: {
    why: 'Cannot resume a stopped ticker. stop() is terminal — a stopped ticker cannot be restarted, which prevents accidental zombie loops.',
    fix: 'Create a new ticker instance instead of resuming a stopped one.',
  },
  R06_presence_no_children: {
    why: 'Presence was rendered without any children to track.',
    fix: 'Pass the element you want to animate as a child of the Presence component.',
  },
  R07_missing_context: {
    why: (p: { child: string; parent: string }) =>
      `<${p.child}> must be used inside <${p.parent}>. <${p.child}> reads from a React context that <${p.parent}> provides; without the parent, the context is null.`,
    fix: (p: { child: string; parent: string }) =>
      `Wrap <${p.child}> with <${p.parent}>: <${p.parent}><${p.child} /></${p.parent}>`,
  },
} as const;

/**
 * Scoped diagnostic catalog. In development it carries the full `why`/`fix`
 * text and reports through the console + dev reporters. In production it is the
 * lean {@link defineProdDiagnostics} proxy: codes still throw with a stable
 * name and docs URL, but every catalog string tree-shakes out of the bundle.
 */
export const diagnostics =
  process.env.NODE_ENV !== 'development'
    ? /*#__PURE__*/ defineProdDiagnostics({ docsBase })
    : /*#__PURE__*/ defineDiagnostics({
        docsBase,
        reporters: [
          /*#__PURE__*/ createConsoleReporter(),
          /*#__PURE__*/ createDevReporter(),
        ],
        codes,
      });

/** Check if a value is a Phase diagnostic. */
export const isPhaseError = (error: unknown): error is Diagnostic =>
  error instanceof Diagnostic;
