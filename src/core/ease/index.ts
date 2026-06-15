/** Cubic ease-out: decelerates to zero velocity. */
export function easeOutCubic(progress: number): number {
  const inv = progress - 1;
  return inv * inv * inv + 1;
}

/** Quartic ease-out: sharper deceleration than cubic. */
export function easeOutQuart(progress: number): number {
  const inv = progress - 1;
  return 1 - inv * inv * inv * inv;
}

/**
 * Ease-out with overshoot (elastic snap-back).
 * @param overshoot - Controls how far past the target the animation goes. Default 1.70158 (≈10% overshoot).
 */
export function easeOutBack(progress: number, overshoot = 1.70158): number {
  const inv = progress - 1;
  return inv * inv * ((overshoot + 1) * inv + overshoot) + 1;
}

/** Cubic ease-in-out: accelerates then decelerates symmetrically. */
export function easeInOutCubic(progress: number): number {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - (-2 * progress + 2) ** 3 / 2;
}

/** Linear (identity) — no easing. */
export function linear(progress: number): number {
  return progress;
}

/** Clamp a value between min and max. */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Clamp a value to the 0–1 range. */
export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Linear interpolation between start and end by progress (0–1). */
export function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

/** Inverse of lerp — returns the progress (0–1) for a given value between start and end. */
export function inverseLerp(start: number, end: number, value: number): number {
  return start === end ? 0 : (value - start) / (end - start);
}

export interface RemapOptions {
  inMin: number;
  inMax: number;
  outMin: number;
  outMax: number;
  value: number;
}

/** Map a value from one range to another. */
export function remap(options: RemapOptions): number {
  const progress = inverseLerp(options.inMin, options.inMax, options.value);
  return lerp(options.outMin, options.outMax, progress);
}
