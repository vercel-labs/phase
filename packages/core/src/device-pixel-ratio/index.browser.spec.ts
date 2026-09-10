import { createDevicePixelRatio } from '.';

it('reads the browser device pixel ratio', () => {
  const watcher = createDevicePixelRatio({ onChange: vi.fn() });

  expect(watcher.dpr).toBe(window.devicePixelRatio);

  watcher.stop();
});
