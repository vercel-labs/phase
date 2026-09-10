// API
export { createTicker } from './tick';
export { createSight } from './sight';
export { createLifecycle } from './lifecycle';
export { createLoop } from './loop';
export { createScrollProgress } from './scroll-progress';
export { createRenderState } from './render-state';
export { createDevicePixelRatio } from './device-pixel-ratio';
export { whenIdle } from './idle';
export { prefersReducedMotion } from './reduced-motion';
export { createMutation } from './mutation';
export { createPointer } from './pointer';
export { createScroll } from './scroll';
export { createThrottle } from './throttle';
export { createDebounce } from './debounce';
export { PhaseError, isPhaseError } from './error';

// Types
export type {
  FrameState,
  Ticker,
  TickerOptions,
  TickerPhase,
  TickerReason,
} from './tick';
export type { Sight, SightOptions, SightPhase, SightReason } from './sight';
export type {
  Lifecycle,
  LifecycleOptions,
  LifecyclePhase,
  LifecycleReason,
  LifecycleReducedMotion,
} from './lifecycle';
export type {
  DegradedBehavior,
  DegradedReason,
  Loop,
  LoopOptions,
  LoopPhase,
  LoopReason,
  Quality,
  ReducedMotionBehavior,
} from './loop';
export type { ScrollProgress, ScrollProgressOptions } from './scroll-progress';
export type {
  RenderPhase,
  RenderState,
  RenderStateOptions,
} from './render-state';
export type {
  DevicePixelRatio,
  DevicePixelRatioOptions,
} from './device-pixel-ratio';
export type { IdleOptions } from './idle';
export type {
  Mutation,
  MutationOptions,
  MutationPhase,
  MutationReason,
} from './mutation';
export type {
  Pointer,
  PointerOptions,
  PointerPhase,
  PointerReason,
  PointerState,
} from './pointer';
export type {
  CreateScrollOptions,
  Scroll,
  ScrollPhase,
  ScrollReason,
  ScrollState,
} from './scroll';
export type { Throttle, ThrottleEdge, ThrottleOptions } from './throttle';
export type { Debounce, DebounceOptions } from './debounce';
export type { PhaseErrorCode } from './error';
