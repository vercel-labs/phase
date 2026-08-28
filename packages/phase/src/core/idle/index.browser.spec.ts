import { server } from 'vitest/browser';

import { whenIdle } from '.';

describe(`whenIdle in ${server.browser}`, () => {
  it('runs through the browser scheduling path', async () => {
    let called = false;

    whenIdle(
      () => {
        called = true;
      },
      { timeout: 100 },
    );

    await vi.waitFor(() => {
      expect(called).toBe(true);
    });
  });

  it('cancels before the next browser idle callback', async () => {
    const callback = vi.fn();
    const cancel = whenIdle(callback, { timeout: 100 });
    cancel();

    await new Promise<void>((resolve) => whenIdle(resolve, { timeout: 100 }));

    expect(callback).not.toHaveBeenCalled();
  });

  it('tears down when aborted before the next browser idle callback', async () => {
    const callback = vi.fn();
    const controller = new AbortController();
    whenIdle(callback, { signal: controller.signal, timeout: 100 });
    controller.abort();

    await new Promise<void>((resolve) => whenIdle(resolve, { timeout: 100 }));

    expect(callback).not.toHaveBeenCalled();
  });
});
