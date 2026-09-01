import { createLifecycle } from '.';
import { createScrollFixture } from '../../__tests__/browser-fixtures';

it('pauses for the browser reduced-motion preference', () => {
  const lifecycle = createLifecycle({ target: document });

  expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
  expect(lifecycle.phase).toBe('paused');
  expect(lifecycle.phaseReason).toBe('reduced-motion');

  lifecycle.stop();
});

it('pauses and resumes with native viewport visibility', async () => {
  const fixture = createScrollFixture();
  const lifecycle = createLifecycle({
    target: fixture.target,
    reducedMotion: 'ignore',
    intersectionOptions: { root: fixture.root },
  });

  await vi.waitFor(() => expect(lifecycle.phase).toBe('paused'));
  fixture.root.scrollTop = 150;
  await vi.waitFor(() => expect(lifecycle.phase).toBe('active'));
  fixture.root.scrollTop = 0;
  await vi.waitFor(() => expect(lifecycle.phase).toBe('paused'));

  lifecycle.stop();
  fixture.cleanup();
});
