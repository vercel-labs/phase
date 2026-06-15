import {
  easeOutCubic,
  easeOutQuart,
  easeOutBack,
  easeInOutCubic,
  linear,
  clamp,
  clamp01,
  lerp,
  inverseLerp,
  remap,
} from '.';

// ---------------------------------------------------------------------------
// Easing functions
// ---------------------------------------------------------------------------

describe('easing functions', () => {
  describe('easeOutCubic', () => {
    it('returns 0 at progress=0', () => expect(easeOutCubic(0)).toBe(0));
    it('returns 1 at progress=1', () => expect(easeOutCubic(1)).toBe(1));
    it('returns > 0.5 at progress=0.5 (decelerating curve above linear)', () => {
      expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    });
    it('is monotonically increasing', () => {
      let prev = easeOutCubic(0);
      for (let i = 1; i <= 100; i++) {
        const curr = easeOutCubic(i / 100);
        expect(curr).toBeGreaterThanOrEqual(prev);
        prev = curr;
      }
    });
  });

  describe('easeOutQuart', () => {
    it('returns 0 at progress=0', () => expect(easeOutQuart(0)).toBe(0));
    it('returns 1 at progress=1', () => expect(easeOutQuart(1)).toBe(1));
    it('is monotonically increasing', () => {
      let prev = easeOutQuart(0);
      for (let i = 1; i <= 100; i++) {
        const curr = easeOutQuart(i / 100);
        expect(curr).toBeGreaterThanOrEqual(prev);
        prev = curr;
      }
    });
    it('decelerates harder than cubic', () => {
      expect(easeOutQuart(0.5)).toBeGreaterThan(easeOutCubic(0.5));
    });
  });

  describe('easeOutBack', () => {
    it('returns 0 at progress=0', () =>
      expect(easeOutBack(0)).toBeCloseTo(0, 10));
    it('returns 1 at progress=1', () =>
      expect(easeOutBack(1)).toBeCloseTo(1, 10));
    it('overshoots: peak value > 1 somewhere in 0-1 range', () => {
      let maxVal = 0;
      for (let i = 0; i <= 100; i++) {
        maxVal = Math.max(maxVal, easeOutBack(i / 100));
      }
      expect(maxVal).toBeGreaterThan(1);
    });
    it('custom overshoot parameter changes the curve', () => {
      const defaultVal = easeOutBack(0.5);
      const highOvershoot = easeOutBack(0.5, 3);
      expect(highOvershoot).not.toBeCloseTo(defaultVal, 5);
    });
  });

  describe('easeInOutCubic', () => {
    it('returns 0 at progress=0', () => expect(easeInOutCubic(0)).toBe(0));
    it('returns 1 at progress=1', () => expect(easeInOutCubic(1)).toBe(1));
    it('returns exactly 0.5 at progress=0.5 (symmetric inflection)', () => {
      expect(easeInOutCubic(0.5)).toBe(0.5);
    });
    it('first half is below linear', () => {
      expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    });
    it('second half is above linear', () => {
      expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75);
    });
  });

  describe('linear', () => {
    it('returns input unchanged', () => {
      expect(linear(0)).toBe(0);
      expect(linear(0.5)).toBe(0.5);
      expect(linear(1)).toBe(1);
      expect(linear(0.73)).toBe(0.73);
    });
  });
});

// ---------------------------------------------------------------------------
// Numerical edge cases
// ---------------------------------------------------------------------------

describe('numerical edge cases', () => {
  it('NaN through easing functions returns NaN', () => {
    expect(easeOutCubic(Number.NaN)).toBeNaN();
    expect(easeOutQuart(Number.NaN)).toBeNaN();
    expect(easeOutBack(Number.NaN)).toBeNaN();
    expect(easeInOutCubic(Number.NaN)).toBeNaN();
    expect(linear(Number.NaN)).toBeNaN();
  });

  it('NaN through clamp/clamp01 returns NaN', () => {
    expect(clamp(Number.NaN, 0, 1)).toBeNaN();
    expect(clamp01(Number.NaN)).toBeNaN();
  });

  it('NaN through lerp returns NaN', () => {
    expect(lerp(0, 100, Number.NaN)).toBeNaN();
  });

  it('Infinity through clamp is clamped', () => {
    expect(clamp(Infinity, 0, 100)).toBe(100);
    expect(clamp(-Infinity, 0, 100)).toBe(0);
  });

  it('Infinity - Infinity in lerp produces NaN (IEEE 754)', () => {
    // lerp(Inf, Inf, 0.5) = Inf + (Inf - Inf) * 0.5 = Inf + NaN = NaN
    expect(lerp(Infinity, Infinity, 0.5)).toBeNaN();
  });

  it('lerp with finite start and Infinity end extrapolates to Infinity', () => {
    expect(lerp(0, Infinity, 0.5)).toBe(Infinity);
  });

  it('easing functions accept progress outside 0-1 without clamping', () => {
    expect(typeof easeOutCubic(-0.5)).toBe('number');
    expect(typeof easeOutCubic(1.5)).toBe('number');
    expect(easeOutCubic(-0.5)).not.toBeNaN();
    expect(easeOutCubic(1.5)).not.toBeNaN();
  });
});

// ---------------------------------------------------------------------------
// Clamping
// ---------------------------------------------------------------------------

describe('clamping', () => {
  describe('clamp', () => {
    it('value below min returns min', () => expect(clamp(-5, 0, 10)).toBe(0));
    it('value above max returns max', () => expect(clamp(15, 0, 10)).toBe(10));
    it('value in range returns value unchanged', () =>
      expect(clamp(5, 0, 10)).toBe(5));
    it('value exactly at min returns min', () =>
      expect(clamp(0, 0, 10)).toBe(0));
    it('value exactly at max returns max', () =>
      expect(clamp(10, 0, 10)).toBe(10));
    it('works with negative ranges', () => expect(clamp(-5, -10, -1)).toBe(-5));
  });

  describe('clamp01', () => {
    it('negative returns 0', () => expect(clamp01(-0.5)).toBe(0));
    it('> 1 returns 1', () => expect(clamp01(1.5)).toBe(1));
    it('0.5 returns 0.5', () => expect(clamp01(0.5)).toBe(0.5));
    it('exactly 0 returns 0', () => expect(clamp01(0)).toBe(0));
    it('exactly 1 returns 1', () => expect(clamp01(1)).toBe(1));
  });
});

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

describe('interpolation', () => {
  describe('lerp', () => {
    it('lerp(0, 100, 0) === 0', () => expect(lerp(0, 100, 0)).toBe(0));
    it('lerp(0, 100, 1) === 100', () => expect(lerp(0, 100, 1)).toBe(100));
    it('lerp(0, 100, 0.5) === 50', () => expect(lerp(0, 100, 0.5)).toBe(50));
    it('works with negative ranges', () => expect(lerp(-10, 10, 0.5)).toBe(0));
    it('progress > 1 extrapolates', () => expect(lerp(0, 100, 1.5)).toBe(150));
    it('progress < 0 extrapolates', () => expect(lerp(0, 100, -0.5)).toBe(-50));
  });

  describe('inverseLerp', () => {
    it('inverseLerp(0, 100, 50) === 0.5', () =>
      expect(inverseLerp(0, 100, 50)).toBe(0.5));
    it('inverseLerp(0, 100, 0) === 0', () =>
      expect(inverseLerp(0, 100, 0)).toBe(0));
    it('inverseLerp(0, 100, 100) === 1', () =>
      expect(inverseLerp(0, 100, 100)).toBe(1));
    it('division-by-zero returns 0, not NaN', () => {
      expect(inverseLerp(5, 5, 5)).toBe(0);
    });
    it('value outside range returns > 1', () => {
      expect(inverseLerp(0, 100, 150)).toBe(1.5);
    });
    it('value below range returns < 0', () => {
      expect(inverseLerp(0, 100, -50)).toBe(-0.5);
    });
  });

  describe('remap', () => {
    it('maps midpoint correctly', () => {
      expect(
        remap({ inMin: 0, inMax: 100, outMin: 0, outMax: 1, value: 50 }),
      ).toBe(0.5);
    });
    it('identity remap returns same value', () => {
      expect(
        remap({ inMin: 0, inMax: 100, outMin: 0, outMax: 100, value: 73 }),
      ).toBe(73);
    });
    it('inverted output range reverses mapping', () => {
      expect(
        remap({ inMin: 0, inMax: 100, outMin: 1, outMax: 0, value: 25 }),
      ).toBe(0.75);
    });
  });
});
