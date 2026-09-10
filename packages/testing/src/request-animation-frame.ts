export interface MockRequestAnimationFrame {
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
  frame: (timestamp: number) => void;
  pending: Map<number, FrameRequestCallback>;
}

export function createMockRequestAnimationFrame(): MockRequestAnimationFrame {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();

  function request(callback: FrameRequestCallback): number {
    const id = nextId++;
    pending.set(id, callback);
    return id;
  }

  function cancel(id: number): void {
    pending.delete(id);
  }

  function frame(timestamp: number): void {
    const callbacks = Array.from(pending.values());
    pending.clear();
    for (const callback of callbacks) callback(timestamp);
  }

  return { request, cancel, frame, pending };
}
