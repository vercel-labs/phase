export type PhaseErrorCode =
  | 'server_context'
  | 'no_element'
  | 'sight_disposed'
  | 'invalid_duration'
  | 'ticker_stopped'
  | 'presence_no_children'
  | 'missing_context';

interface PhaseErrorOptions {
  code: PhaseErrorCode;
  reason?: string;
  fix?: string;
  link?: string;
}

/** Lightweight structured error for phase. */
export class PhaseError extends Error {
  readonly code: PhaseErrorCode;
  readonly reason: string | undefined;
  readonly fix: string | undefined;
  readonly link: string | undefined;

  constructor(message: string, options: PhaseErrorOptions) {
    super(message);
    this.name = 'PhaseError';
    this.code = options.code;
    this.reason = options.reason;
    this.fix = options.fix;
    this.link = options.link;
  }
}

/** Check if a value is a PhaseError instance. */
export function isPhaseError(error: unknown): error is PhaseError {
  return error instanceof PhaseError;
}

export function serverContextError(fn: string): never {
  throw new PhaseError(`${fn}() cannot be called on the server.`, {
    code: 'server_context',
    reason:
      'Browser APIs like requestAnimationFrame are not available during SSR.',
    fix: `Move ${fn}() into a useEffect or a client-only module.`,
  });
}

export function noElementError(fn: string): never {
  throw new PhaseError(`${fn}() requires a mounted DOM element.`, {
    code: 'no_element',
    reason:
      'The element ref is null. This usually means the element has not mounted yet or has been unmounted.',
    fix: `Call ${fn}() inside a useEffect after the ref is populated, or use the hook equivalent which handles this automatically.`,
  });
}

export function sightDisposedError(): never {
  throw new PhaseError('Cannot interact with a disposed Sight instance.', {
    code: 'sight_disposed',
    reason: 'dispose() was already called on this Sight instance.',
    fix: 'Create a new Sight instance instead of reusing a disposed one.',
  });
}

export function invalidDurationError(fn: string, value: number): never {
  throw new PhaseError(`${fn}() received an invalid duration: ${value}`, {
    code: 'invalid_duration',
    reason: 'Duration must be a finite positive number.',
    fix: `Pass a positive number for duration (e.g., 300 for 300ms).`,
  });
}

export function tickerStoppedError(): never {
  throw new PhaseError('Cannot resume a stopped ticker.', {
    code: 'ticker_stopped',
    reason:
      'stop() is terminal — a stopped ticker cannot be restarted. This prevents accidental zombie loops.',
    fix: 'Create a new ticker instance instead of resuming a stopped one.',
  });
}

export function missingContextError(child: string, parent: string): never {
  throw new PhaseError(`<${child}> must be used inside <${parent}>.`, {
    code: 'missing_context',
    reason: `<${child}> reads from a React context that <${parent}> provides. Without the parent, the context is null.`,
    fix: `Wrap <${child}> with <${parent}>: <${parent}><${child} /></${parent}>`,
  });
}
