import { createTicker } from '.';

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

it('strong-pauses and resumes native animation frames', async () => {
  let frameCount = 0;
  const ticker = createTicker({
    onTick() {
      frameCount++;
    },
  });
  ticker.start();
  await vi.waitFor(() => expect(frameCount).toBeGreaterThan(1));

  ticker.pause();
  const pausedFrameCount = frameCount;
  await nextFrame();
  await nextFrame();
  expect(frameCount).toBe(pausedFrameCount);

  ticker.resume();
  await vi.waitFor(() => expect(frameCount).toBeGreaterThan(pausedFrameCount));
  ticker.stop();
  const stoppedFrameCount = frameCount;
  await nextFrame();
  await nextFrame();
  expect(frameCount).toBe(stoppedFrameCount);
});
