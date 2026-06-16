import { isPhaseError, missingContextError, tickerStoppedError } from '.';

describe('isPhaseError', () => {
  it('returns true for PhaseError instances', () => {
    try {
      tickerStoppedError();
    } catch (err) {
      expect(isPhaseError(err)).toBe(true);
    }
  });

  it('returns false for plain Error', () => {
    expect(isPhaseError(new Error('nope'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isPhaseError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isPhaseError(undefined)).toBe(false);
  });

  it('returns false for non-error objects', () => {
    expect(isPhaseError({ message: 'fake' })).toBe(false);
  });
});

describe('diagnostics', () => {
  it('exposes the code, message, fix, and docs link', () => {
    try {
      missingContextError('Swap.State', 'Swap');
    } catch (err) {
      if (!isPhaseError(err)) throw err;
      expect(err.name).toBe('missing_context');
      expect(err.message).toContain('<Swap.State> must be used inside <Swap>');
      expect(err.fix).toContain('Wrap <Swap.State> with <Swap>');
      expect(err.docs).toBe(
        'https://vercel.com/docs/errors/phase/missing_context',
      );
    }
  });
});
