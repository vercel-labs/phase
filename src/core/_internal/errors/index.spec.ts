import { PhaseError, isPhaseError, tickerStoppedError } from '.';

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

describe('PhaseError properties', () => {
  it('exposes code, reason, fix, and link', () => {
    try {
      tickerStoppedError();
    } catch (err) {
      expect(err).toBeInstanceOf(PhaseError);
      const pe = err as PhaseError;
      expect(pe.code).toBe('ticker_stopped');
      expect(pe.reason).toBeDefined();
      expect(pe.fix).toBeDefined();
      expect(pe.name).toBe('PhaseError');
    }
  });
});
