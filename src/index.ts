// Core barrel — re-exports ease, tick, sight, loop

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
  type RemapOptions,
} from './ease';

export {
  createTicker,
  type FrameState,
  type TickerPhase,
  type TickerReason,
  type TickerOptions,
  type Ticker,
} from './core/tick';

export {
  createSight,
  type SightPhase,
  type SightReason,
  type SightOptions,
  type Sight,
} from './core/sight';

export {
  createLoop,
  prefersReducedMotion,
  type ReducedMotionBehavior,
  type LoopPhase,
  type LoopReason,
  type Quality,
  type DegradedReason,
  type LoopOptions,
  type Loop,
} from './core/loop';

export { PhaseError, isPhaseError, type PhaseErrorCode } from './core/error';
