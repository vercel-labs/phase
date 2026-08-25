import type { DegradedBehavior } from '../../../core/loop';

export type DegradedConfig =
  | { degraded?: 'throttle'; degradedFps?: number }
  | { degraded: 'pause' }
  | { degraded: 'ignore' };

/**
 * Map flat `degraded` / `degradedFps` hook options onto the loop's discriminated
 * union. `degradedFps` is only meaningful in `'throttle'` mode.
 */
export function degradedConfig(
  degraded: DegradedBehavior | undefined,
  degradedFps: number | undefined,
): DegradedConfig {
  if (degraded === 'pause') return { degraded: 'pause' };
  if (degraded === 'ignore') return { degraded: 'ignore' };
  return { degraded: 'throttle', degradedFps };
}
