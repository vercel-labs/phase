import { createTicker } from '.';

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

it('shares one native frame timestamp across tickers', async () => {
  let firstTime = 0;
  let secondTime = 0;
  const first = createTicker({
    onTick: (frame) => {
      firstTime = frame.time;
    },
  });
  const second = createTicker({
    onTick: (frame) => {
      secondTime = frame.time;
    },
  });
  first.start();
  second.start();

  await vi.waitFor(() => {
    expect(firstTime).toBeGreaterThan(0);
    expect(secondTime).toBe(firstTime);
  });

  first.stop();
  second.stop();
});

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
