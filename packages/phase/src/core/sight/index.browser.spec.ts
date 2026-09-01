import { createSight } from '.';
import { createScrollFixture } from '../../__tests__/browser-fixtures';

it('tracks native viewport intersections', async () => {
  const fixture = createScrollFixture();
  const sight = createSight({
    target: fixture.target,
    intersectionOptions: { root: fixture.root },
  });

  await vi.waitFor(() => expect(sight.phase).toBe('hidden'));
  fixture.root.scrollTop = 150;
  await vi.waitFor(() => expect(sight.phase).toBe('visible'));
  fixture.root.scrollTop = 0;
  await vi.waitFor(() => expect(sight.phase).toBe('hidden'));

  sight.stop();
  fixture.cleanup();
});
