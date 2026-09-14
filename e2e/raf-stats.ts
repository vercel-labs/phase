export function installRafStats(): void {
  const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  const pending = new Set<number>();
  const stats = {
    scheduled: 0,
    invoked: 0,
    canceled: 0,
    pending: 0,
  };

  Object.seal(stats);
  Object.defineProperty(window, '__rafStats', {
    configurable: false,
    enumerable: false,
    value: stats,
    writable: false,
  });

  window.requestAnimationFrame = (callback): number => {
    let handle = 0;
    handle = nativeRequestAnimationFrame((timestamp) => {
      if (!pending.delete(handle)) return;
      stats.pending = pending.size;
      stats.invoked++;
      callback(timestamp);
    });
    pending.add(handle);
    stats.scheduled++;
    stats.pending = pending.size;
    return handle;
  };

  window.cancelAnimationFrame = (handle): void => {
    if (pending.delete(handle)) {
      stats.canceled++;
      stats.pending = pending.size;
    }
    nativeCancelAnimationFrame(handle);
  };
}
