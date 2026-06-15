import { VercelError } from '@vercel/error';

import { isPhaseError, tickerStoppedError } from './errors.js';

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

  it('returns false for VercelError with different scope', () => {
    const other = new VercelError('test', { scope: 'other-package' });
    expect(isPhaseError(other)).toBe(false);
  });
});
