import { createDebounce } from '.';

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'hidden', {
    value: false,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    value: hidden,
    writable: true,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

// ---------------------------------------------------------------------------
// Quiet-period behavior
// ---------------------------------------------------------------------------

describe('quiet period', () => {
  it('fires once after the quiet period with the latest value', async () => {
    const cb = vi.fn();
    const debounce = createDebounce<number>({ callback: cb, wait: 200 });

    debounce.call(1);
    expect(cb).not.toHaveBeenCalled();
    expect(debounce.pending).toBe(true);

    vi.advanceTimersByTime(199);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1);
    expect(debounce.pending).toBe(false);
    debounce.stop();
  });

  it('each call restarts the timer', async () => {
    const cb = vi.fn();
    const debounce = createDebounce<number>({ callback: cb, wait: 200 });

    debounce.call(1);
    vi.advanceTimersByTime(150);
    debounce.call(2);
    vi.advanceTimersByTime(150);
    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(2);
    debounce.stop();
  });
});

// ---------------------------------------------------------------------------
// flush / cancel
// ---------------------------------------------------------------------------

describe('flush and cancel', () => {
  it('flush fires the pending call immediately', async () => {
    const cb = vi.fn();
    const debounce = createDebounce<number>({ callback: cb, wait: 200 });

    debounce.call(1);
    debounce.flush();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1);

    // Timer was cleared: no second fire.
    vi.advanceTimersByTime(200);
    expect(cb).toHaveBeenCalledTimes(1);
    debounce.stop();
  });

  it('flush is a no-op when nothing is pending', async () => {
    const cb = vi.fn();
    const debounce = createDebounce<number>({ callback: cb, wait: 200 });

    debounce.flush();
    expect(cb).not.toHaveBeenCalled();
    debounce.stop();
  });

  it('cancel discards the pending call', async () => {
    const cb = vi.fn();
    const debounce = createDebounce<number>({ callback: cb, wait: 200 });

    debounce.call(1);
    debounce.cancel();
    expect(debounce.pending).toBe(false);
    vi.advanceTimersByTime(200);
    expect(cb).not.toHaveBeenCalled();
    debounce.stop();
  });
});

// ---------------------------------------------------------------------------
// Document visibility
// ---------------------------------------------------------------------------

describe('document visibility', () => {
  it('flushes a pending call when the document hides (default)', async () => {
    const cb = vi.fn();
    const debounce = createDebounce<number>({ callback: cb, wait: 200 });

    debounce.call(1);
    setDocumentHidden(true);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1);

    vi.advanceTimersByTime(200);
    expect(cb).toHaveBeenCalledTimes(1);
    debounce.stop();
  });

  it('drops a pending call when hidden is drop', async () => {
    const cb = vi.fn();
    const debounce = createDebounce<number>({
      callback: cb,
      wait: 200,
      hidden: 'drop',
    });

    debounce.call(1);
    setDocumentHidden(true);
    expect(cb).not.toHaveBeenCalled();
    expect(debounce.pending).toBe(false);

    vi.advanceTimersByTime(200);
    expect(cb).not.toHaveBeenCalled();
    debounce.stop();
  });

  it('calls made while hidden wait for visibility, then the quiet period', async () => {
    const cb = vi.fn();
    const debounce = createDebounce<number>({ callback: cb, wait: 200 });

    setDocumentHidden(true);
    debounce.call(1);
    debounce.call(2);
    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();
    expect(debounce.pending).toBe(true);

    setDocumentHidden(false);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(2);
    debounce.stop();
  });

  it('restarts the quiet timer on bfcache restore', async () => {
    const cb = vi.fn();
    const debounce = createDebounce<number>({
      callback: cb,
      wait: 200,
      hidden: 'drop',
    });

    setDocumentHidden(true);
    debounce.call(1);

    const pageShow = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(pageShow, 'persisted', { value: true });
    window.dispatchEvent(pageShow);

    vi.advanceTimersByTime(200);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1);
    debounce.stop();
  });
});

// ---------------------------------------------------------------------------
// Stop / teardown
// ---------------------------------------------------------------------------

describe('stop', () => {
  it('drops pending work and ignores further calls', async () => {
    const cb = vi.fn();
    const debounce = createDebounce<number>({ callback: cb, wait: 200 });

    debounce.call(1);
    debounce.stop();
    expect(debounce.pending).toBe(false);

    debounce.call(2);
    debounce.flush();
    vi.advanceTimersByTime(200);
    expect(cb).not.toHaveBeenCalled();
  });

  it('stop is idempotent', async () => {
    const debounce = createDebounce({ callback: vi.fn(), wait: 200 });
    debounce.stop();
    expect(() => debounce.stop()).not.toThrow();
  });

  it('aborting the signal stops the debounce', async () => {
    const cb = vi.fn();
    const controller = new AbortController();
    const debounce = createDebounce<number>({
      callback: cb,
      wait: 200,
      signal: controller.signal,
    });

    debounce.call(1);
    controller.abort();
    vi.advanceTimersByTime(200);
    expect(cb).not.toHaveBeenCalled();
  });

  it('an already-aborted signal never subscribes', async () => {
    const cb = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const debounce = createDebounce<number>({
      callback: cb,
      wait: 200,
      signal: controller.signal,
    });

    debounce.call(1);
    vi.advanceTimersByTime(200);
    expect(cb).not.toHaveBeenCalled();
    expect(debounce.pending).toBe(false);
  });
});
