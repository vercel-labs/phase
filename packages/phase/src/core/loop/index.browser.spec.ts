import { createLoop } from '.';
import { createScrollFixture } from '../../__tests__/browser-fixtures';

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

it('strong-pauses native frames while its target is off-screen', async () => {
  const fixture = createScrollFixture();
  let frameCount = 0;
  const loop = createLoop({
    target: fixture.target,
    reducedMotion: 'ignore',
    intersectionOptions: { root: fixture.root },
    onTick() {
      frameCount++;
    },
  });

  await vi.waitFor(() => expect(loop.phase).toBe('paused'));
  fixture.root.scrollTop = 150;
  await vi.waitFor(() => expect(frameCount).toBeGreaterThan(1));

  fixture.root.scrollTop = 0;
  await vi.waitFor(() => expect(loop.phase).toBe('paused'));
  const pausedFrameCount = frameCount;
  await nextFrame();
  await nextFrame();
  expect(frameCount).toBe(pausedFrameCount);

  fixture.root.scrollTop = 150;
  await vi.waitFor(() => expect(frameCount).toBeGreaterThan(pausedFrameCount));
  loop.stop();
  fixture.cleanup();
});
