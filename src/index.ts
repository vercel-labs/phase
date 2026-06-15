// Core barrel — re-exports ease, tick, sight, loop

// API
export {
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
} from './ease';
export { createTicker } from './core/tick';
export { createSight } from './core/sight';
export { createLoop, prefersReducedMotion } from './core/loop';
export { PhaseError, isPhaseError } from './core/error';

// Types
export type { RemapOptions } from './ease';
export type {
  FrameState,
  Ticker,
  TickerOptions,
  TickerPhase,
  TickerReason,
} from './core/tick';
export type {
  Sight,
  SightOptions,
  SightPhase,
  SightReason,
} from './core/sight';
export type {
  DegradedReason,
  Loop,
  LoopOptions,
  LoopPhase,
  LoopReason,
  Quality,
  ReducedMotionBehavior,
} from './core/loop';
export type { PhaseErrorCode } from './core/error';
