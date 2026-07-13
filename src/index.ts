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
export { createLifecycle } from './core/lifecycle';
export { createLoop } from './core/loop';
export { createScrollProgress } from './core/scroll-progress';
export { createRenderState } from './core/render-state';
export { createDevicePixelRatio } from './core/device-pixel-ratio';
export { whenIdle } from './core/idle';
export { prefersReducedMotion } from './core/reduced-motion';
export { createMutation } from './core/mutation';
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
  Lifecycle,
  LifecycleOptions,
  LifecyclePhase,
  LifecycleReason,
  LifecycleReducedMotion,
} from './core/lifecycle';
export type {
  DegradedBehavior,
  DegradedReason,
  Loop,
  LoopOptions,
  LoopPhase,
  LoopReason,
  Quality,
  ReducedMotionBehavior,
} from './core/loop';
export type {
  ScrollProgress,
  ScrollProgressOptions,
} from './core/scroll-progress';
export type {
  RenderPhase,
  RenderState,
  RenderStateOptions,
} from './core/render-state';
export type {
  DevicePixelRatio,
  DevicePixelRatioOptions,
} from './core/device-pixel-ratio';
export type { IdleOptions } from './core/idle';
export type {
  Mutation,
  MutationOptions,
  MutationPhase,
  MutationReason,
} from './core/mutation';
export type { PhaseErrorCode } from './core/error';
