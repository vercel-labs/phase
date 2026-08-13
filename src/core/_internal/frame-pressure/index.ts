import { setSharedFrameMonitor } from '../frame-clock';

export type FramePressureState = 'full' | 'degraded' | 'probing';
export type FramePressureCallback = (state: FramePressureState) => void;

const LEARNING_FRAMES = 8;
const SHIFT_FRAMES = 4;
const PRESSURE_FRAMES = 3;
const PROBE_HEALTHY_FRAMES = 30;
const PROBE_MIN_DELIVERIES = 3;
const RETRY_MS = 2000;

let state: FramePressureState = 'full';
let cadence = 0;
let learningCount = 0;
let learningSum = 0;
let learningMin = Infinity;
let learningMax = 0;
let shiftCount = 0;
let shiftSum = 0;
let shiftMin = Infinity;
let shiftMax = 0;
let pressureCount = 0;
let probeHealthyCount = 0;
let probeDeliveries = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const callbacks = new Set<FramePressureCallback>();

function resetShift(): void {
  shiftCount = 0;
  shiftSum = 0;
  shiftMin = Infinity;
  shiftMax = 0;
}

function resetMeasurements(): void {
  cadence = 0;
  learningCount = 0;
  learningSum = 0;
  learningMin = Infinity;
  learningMax = 0;
  resetShift();
  pressureCount = 0;
  probeHealthyCount = 0;
  probeDeliveries = 0;
}

function notify(next: FramePressureState): void {
  if (state === next) return;
  state = next;

  let firstError: unknown;
  let hasError = false;
  const currentCallbacks = Array.from(callbacks);
  for (const callback of currentCallbacks) {
    if (!callbacks.has(callback)) continue;
    try {
      callback(next);
    } catch (error) {
      if (!hasError) {
        firstError = error;
        hasError = true;
      }
    }
  }
  if (hasError) throw firstError;
}

function scheduleProbe(): void {
  if (retryTimer !== null || callbacks.size === 0) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    pressureCount = 0;
    probeHealthyCount = 0;
    probeDeliveries = 0;
    notify('probing');
  }, RETRY_MS);
}

function enterDegraded(): void {
  pressureCount = 0;
  probeHealthyCount = 0;
  probeDeliveries = 0;
  notify('degraded');
  scheduleProbe();
}

function learnCadence(gap: number): boolean {
  learningCount++;
  learningSum += gap;
  if (gap < learningMin) learningMin = gap;
  if (gap > learningMax) learningMax = gap;
  if (learningCount < LEARNING_FRAMES) return false;

  cadence =
    LEARNING_FRAMES > 2
      ? (learningSum - learningMin - learningMax) / (LEARNING_FRAMES - 2)
      : learningSum / LEARNING_FRAMES;
  return true;
}

function isPacingPressure(gap: number, occupied: number): boolean {
  const lateLimit: number = Math.max(cadence * 1.5, cadence + 2);
  if (gap <= lateLimit) {
    resetShift();
    cadence += (gap - cadence) / 16;
    return false;
  }

  // A stable, low-work cadence change is a display/VRR mode shift, not jank.
  if (occupied < cadence * 0.75) {
    shiftCount++;
    shiftSum += gap;
    if (gap < shiftMin) shiftMin = gap;
    if (gap > shiftMax) shiftMax = gap;
    if (shiftCount < SHIFT_FRAMES) return false;

    const mean: number = shiftSum / shiftCount;
    const stable: boolean = shiftMax - shiftMin <= Math.max(2, mean * 0.2);
    resetShift();
    if (stable) {
      cadence = mean;
      return false;
    }
  } else {
    resetShift();
  }

  return true;
}

function observeFrame(
  _time: number,
  gap: number,
  occupied: number,
  deliveries: number,
): void {
  if (gap <= 0) return;
  if (cadence === 0 && !learnCadence(gap)) return;

  const overloaded: boolean =
    deliveries > 0 &&
    (isPacingPressure(gap, occupied) || occupied >= cadence * 0.9);

  if (state === 'degraded') return;

  if (state === 'full') {
    pressureCount = overloaded ? pressureCount + 1 : 0;
    if (pressureCount >= PRESSURE_FRAMES) enterDegraded();
    return;
  }

  if (deliveries === 0) return;
  probeDeliveries += deliveries;
  if (overloaded) {
    probeHealthyCount = 0;
    pressureCount++;
    if (pressureCount >= PRESSURE_FRAMES) enterDegraded();
    return;
  }

  pressureCount = 0;
  if (occupied <= cadence * 0.7) {
    probeHealthyCount++;
    if (
      probeHealthyCount >= PROBE_HEALTHY_FRAMES &&
      probeDeliveries >= PROBE_MIN_DELIVERIES
    ) {
      notify('full');
    }
  } else {
    probeHealthyCount = 0;
  }
}

export function readFramePressure(): FramePressureState {
  return state;
}

export function subscribeFramePressure(
  callback: FramePressureCallback,
): () => void {
  callbacks.add(callback);
  if (callbacks.size === 1) {
    resetMeasurements();
    state = 'full';
    setSharedFrameMonitor(observeFrame);
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    callbacks.delete(callback);
    if (callbacks.size > 0) return;

    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    setSharedFrameMonitor(null);
    state = 'full';
    resetMeasurements();
  };
}
