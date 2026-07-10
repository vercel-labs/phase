'use client';

// React hooks barrel

// API
export { useSyncedRef } from './use-synced-ref';
export { useStableCallback } from './use-stable-callback';
export { useLoop } from './use-loop';
export { useLifecycle } from './use-lifecycle';
export { useDevicePixelRatio } from './use-device-pixel-ratio';
export { useMediaQuery } from './use-media';
export { usePrefersReducedMotion } from './use-reduced-motion';
export { useSight } from './use-sight';
export { useSize } from './use-size';
export { useContainerQuery } from './use-container-query';
export { useScrollProgress } from './use-scroll-progress';
export { useRenderState } from './use-render-state';
export { useIdle } from './use-idle';
export { useWhenIdle } from './use-when-idle';
export { useCanvas } from './use-canvas';
export { useMutation } from './use-mutation';
export { usePointer } from './use-pointer';
export { useTween } from './use-tween';
export { usePresence } from './use-presence';
export { Presence } from './presence';
export { WhenVisible } from './when-visible';
export { WhenIdle } from './when-idle';
export { Defer } from './defer';
export { Swap } from './swap';

// Types
export type { LoopTickFn, UseLoopOptions, UseLoopResult } from './use-loop';
export type { UseLifecycleOptions, UseLifecycleResult } from './use-lifecycle';
export type {
  LifecyclePhase,
  LifecycleReason,
  LifecycleReducedMotion,
} from '../core/lifecycle';
export type {
  SightCallback,
  UseSightOptions,
  UseSightReactiveResult,
  UseSightResult,
  UseSightTransientResult,
} from './use-sight';
export type {
  Size,
  SizeCallback,
  UseSizeOptions,
  UseSizeReactiveResult,
  UseSizeResult,
  UseSizeTransientResult,
} from './use-size';
export type {
  ContainerBreakpoint,
  UseContainerQueryOptions,
  UseContainerQueryResult,
} from './use-container-query';
export type {
  ScrollProgressCallback,
  UseScrollProgressOptions,
  UseScrollProgressReactiveResult,
  UseScrollProgressResult,
  UseScrollProgressTransientResult,
} from './use-scroll-progress';
export type { RenderPhase } from './use-render-state';
export type { IdleOptions } from './use-idle';
export type {
  CanvasDrawFn,
  UseCanvasOptions,
  UseCanvasResult,
} from './use-canvas';
export type {
  MutationCallback,
  UseMutationOptions,
  UseMutationResult,
} from './use-mutation';
export type {
  PointerCallback,
  UsePointerOptions,
  UsePointerResult,
} from './use-pointer';
export type { UseTweenOptions } from './use-tween';
export type {
  PresenceMode,
  PresencePhase,
  PresenceReason,
  UsePresenceOptions,
  UsePresenceResult,
} from './use-presence';
export type { PresenceProps } from './presence';
export type { WhenVisibleProps } from './when-visible';
export type { WhenIdleProps } from './when-idle';
export type { DeferProps } from './defer';
export type { SwapProps, SwapStateProps } from './swap';
