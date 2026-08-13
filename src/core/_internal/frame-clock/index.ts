export interface FrameSubscription {
  readonly callback: (time: number) => boolean;
  active: boolean;
  joinedFrame: number;
}

export type SharedFrameMonitor = (
  time: number,
  gap: number,
  occupied: number,
  deliveries: number,
) => void;

let rafId = 0;
let frameNumber = 0;
let lastTime = 0;
let monitor: SharedFrameMonitor | null = null;
const subscriptions = new Set<FrameSubscription>();

function dispatchFrame(time: number): void {
  rafId = 0;
  if (subscriptions.size === 0) {
    lastTime = 0;
    return;
  }

  frameNumber++;
  const gap: number = lastTime === 0 ? 0 : time - lastTime;
  lastTime = time;

  // Schedule before dispatch so a throwing callback cannot wedge the clock.
  // Leaving the final subscription cancels this pending frame.
  rafId = requestAnimationFrame(dispatchFrame);

  let deliveries = 0;
  for (const subscription of subscriptions) {
    // Set iteration is live. A subscription added or re-added during this
    // dispatch must wait until the next browser frame.
    if (subscription.joinedFrame >= frameNumber) continue;
    if (subscription.callback(time)) deliveries++;
  }

  if (monitor !== null) {
    monitor(time, gap, performance.now() - time, deliveries);
  }
}

export function createFrameSubscription(
  callback: (time: number) => boolean,
): FrameSubscription {
  return { callback, active: false, joinedFrame: 0 };
}

export function joinSharedFrame(subscription: FrameSubscription): void {
  if (subscription.active) return;

  subscription.active = true;
  subscription.joinedFrame = frameNumber;
  subscriptions.add(subscription);

  if (rafId === 0) {
    lastTime = 0;
    rafId = requestAnimationFrame(dispatchFrame);
  }
}

export function leaveSharedFrame(subscription: FrameSubscription): void {
  if (!subscription.active) return;

  subscription.active = false;
  subscriptions.delete(subscription);

  if (subscriptions.size === 0 && rafId !== 0) {
    cancelAnimationFrame(rafId);
    rafId = 0;
    lastTime = 0;
  }
}

export function setSharedFrameMonitor(
  nextMonitor: SharedFrameMonitor | null,
): void {
  monitor = nextMonitor;
}
