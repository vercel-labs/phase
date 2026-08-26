export type PhaseErrorCode =
  | 'server_context'
  | 'no_target'
  | 'conflicting_target'
  | 'invalid_duration'
  | 'invalid_fps'
  | 'ticker_stopped'
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
    reason: 'Browser APIs are unavailable during SSR.',
    fix: 'Move into a useEffect or client-only module.',
  });
}

export function noTargetError(fn: string): never {
  throw new PhaseError(`${fn}() requires a target.`, {
    code: 'no_target',
    reason: 'The target was null or undefined.',
    fix: 'Pass a mounted Element, or use the React hook which manages the ref.',
  });
}

export function conflictingTargetError(fn: string): never {
  throw new PhaseError(`${fn}() received both ref and target.`, {
    code: 'conflicting_target',
    reason: 'A tracker has one anchor.',
    fix: "Pass one: ref for an element, target: 'page' for the page.",
  });
}

export function invalidDurationError(fn: string, value: number): never {
  throw new PhaseError(`${fn}() received an invalid duration: ${value}`, {
    code: 'invalid_duration',
    reason: 'Duration must be a finite positive number.',
    fix: 'Pass a positive number (e.g., 300 for 300ms).',
  });
}

export function invalidFpsError(fn: string, value: number): never {
  throw new PhaseError(`${fn}() received an invalid fps: ${value}`, {
    code: 'invalid_fps',
    reason: 'fps must be a finite number greater than 0.',
    fix: 'Pass a positive number (e.g. 30), or undefined to uncap.',
  });
}

export function tickerStoppedError(): never {
  throw new PhaseError('Cannot resume a stopped ticker.', {
    code: 'ticker_stopped',
    reason: 'stop() is terminal, so a stopped ticker cannot be resumed.',
    fix: 'Create a new ticker instance instead of resuming a stopped one.',
  });
}

export function missingContextError(child: string, parent: string): never {
  throw new PhaseError(`<${child}> must be used inside <${parent}>.`, {
    code: 'missing_context',
    reason: `<${child}> reads from a context that <${parent}> provides.`,
    fix: `Wrap <${child}> with <${parent}>.`,
  });
}
