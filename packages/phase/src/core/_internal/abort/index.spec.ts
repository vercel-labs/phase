import { linkAbortSignal } from '.';

describe('linkAbortSignal()', () => {
  it('returns a no-op and never calls stop when no signal is passed', () => {
    const stop = vi.fn();
    const unlink = linkAbortSignal(undefined, stop);
    expect(stop).not.toHaveBeenCalled();
    expect(() => unlink()).not.toThrow();
  });

  it('calls stop synchronously when the signal is already aborted', () => {
    const stop = vi.fn();
    linkAbortSignal(AbortSignal.abort(), stop);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('calls stop when the signal aborts later', () => {
    const stop = vi.fn();
    const controller = new AbortController();
    linkAbortSignal(controller.signal, stop);

    expect(stop).not.toHaveBeenCalled();
    controller.abort();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('calls stop only once even if abort fires repeatedly', () => {
    const stop = vi.fn();
    const controller = new AbortController();
    linkAbortSignal(controller.signal, stop);

    controller.abort();
    controller.abort();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('unlink removes the listener so a later abort does not call stop', () => {
    const stop = vi.fn();
    const controller = new AbortController();
    const unlink = linkAbortSignal(controller.signal, stop);

    unlink();
    controller.abort();
    expect(stop).not.toHaveBeenCalled();
  });
});
