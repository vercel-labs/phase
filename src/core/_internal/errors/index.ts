import { VercelError, createErrors, isVercelError } from '@vercel/error';
import type { ErrorFactory } from '@vercel/error';

export type PhaseErrorCode =
  | 'server_context'
  | 'no_element'
  | 'sight_disposed'
  | 'invalid_duration'
  | 'ticker_stopped'
  | 'presence_no_children'
  | 'missing_context';

const SCOPE = '@vercel/phase';

/** Named error class so stack traces show `PhaseError`, not `VercelError`. */
export class PhaseError extends VercelError<PhaseErrorCode> {}

/** Check if a value is a PhaseError instance. */
export function isPhaseError(error: unknown): error is PhaseError {
  if (error instanceof PhaseError) return true;
  return isVercelError(error) && error.scope === SCOPE;
}

/** Scoped error factory - all errors are `PhaseError` instances with `scope: '@vercel/phase'`. */
const phaseError: ErrorFactory<PhaseErrorCode, PhaseError> = createErrors<
  PhaseErrorCode,
  PhaseError
>({
  scope: SCOPE,
  ErrorClass: PhaseError,
});

export function serverContextError(fn: string): never {
  phaseError.raise(`${fn}() cannot be called on the server.`, {
    code: 'server_context',
    reason:
      'Browser APIs like requestAnimationFrame are not available during SSR.',
    fix: `Move ${fn}() into a useEffect or a client-only module.`,
    link: 'https://vercel.com/docs/errors/phase/server_context',
  });
}

export function noElementError(fn: string): never {
  phaseError.raise(`${fn}() requires a mounted DOM element.`, {
    code: 'no_element',
    reason:
      'The element ref is null. This usually means the element has not mounted yet or has been unmounted.',
    fix: `Call ${fn}() inside a useEffect after the ref is populated, or use the hook equivalent which handles this automatically.`,
    link: 'https://vercel.com/docs/errors/phase/no_element',
  });
}

export function sightDisposedError(): never {
  phaseError.raise('Cannot interact with a disposed Sight instance.', {
    code: 'sight_disposed',
    reason: 'dispose() was already called on this Sight instance.',
    fix: 'Create a new Sight instance instead of reusing a disposed one.',
  });
}

export function invalidDurationError(fn: string, value: number): never {
  phaseError.raise(`${fn}() received an invalid duration: ${value}`, {
    code: 'invalid_duration',
    reason: 'Duration must be a finite positive number.',
    fix: `Pass a positive number for duration (e.g., 300 for 300ms).`,
  });
}

export function tickerStoppedError(): never {
  phaseError.raise('Cannot resume a stopped ticker.', {
    code: 'ticker_stopped',
    reason:
      'stop() is terminal — a stopped ticker cannot be restarted. This prevents accidental zombie loops.',
    fix: 'Create a new ticker instance instead of resuming a stopped one.',
  });
}

export function missingContextError(child: string, parent: string): never {
  phaseError.raise(`<${child}> must be used inside <${parent}>.`, {
    code: 'missing_context',
    reason: `<${child}> reads from a React context that <${parent}> provides. Without the parent, the context is null.`,
    fix: `Wrap <${child}> with <${parent}>: <${parent}><${child} /></${parent}>`,
  });
}
