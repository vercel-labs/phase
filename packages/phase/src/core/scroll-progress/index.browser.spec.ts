import { createScrollProgress } from '.';
import { createScrollFixture } from '../../__tests__/browser-fixtures';

it('reports ratios from native intersection geometry', async () => {
  const fixture = createScrollFixture({ beforeSize: 0, targetSize: 200 });
  const progress = createScrollProgress({
    target: fixture.target,
    root: fixture.root,
    steps: 4,
    onProgress: vi.fn(),
  });

  await vi.waitFor(() => expect(progress.ratio).toBeCloseTo(0.5, 1));
  fixture.root.scrollTop = 200;
  await vi.waitFor(() => expect(progress.ratio).toBe(0));

  progress.stop();
  fixture.cleanup();
});
