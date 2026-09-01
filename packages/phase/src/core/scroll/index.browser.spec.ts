import { createScroll } from '.';
import { createScrollFixture } from '../../__tests__/browser-fixtures';

it('tracks native element scroll geometry on an animation frame', async () => {
  const target = document.createElement('div');
  const content = document.createElement('div');
  target.style.cssText = 'width:100px;height:100px;overflow:auto;';
  content.style.cssText = 'width:100px;height:300px;';
  target.append(content);
  document.body.append(target);
  const scroll = createScroll({
    target,
    visibility: 'ignore',
    onScroll: vi.fn(),
  });

  expect(scroll.state.maxY).toBe(200);
  target.scrollTo({ top: 100, behavior: 'instant' });

  await vi.waitFor(() => expect(scroll.state.y).toBeCloseTo(100, 0));
  expect(scroll.state.progressY).toBeCloseTo(0.5, 2);

  scroll.stop();
  target.remove();
});

it('strong-pauses native scroll delivery while off-screen', async () => {
  const fixture = createScrollFixture();
  const content = document.createElement('div');
  fixture.target.style.overflow = 'auto';
  content.style.height = '300px';
  fixture.target.append(content);
  const scroll = createScroll({ target: fixture.target, onScroll: vi.fn() });

  await vi.waitFor(() => expect(scroll.phase).toBe('paused'));
  fixture.root.scrollTop = 150;
  await vi.waitFor(() => expect(scroll.phase).toBe('tracking'));
  fixture.target.scrollTo({ top: 100, behavior: 'instant' });
  await vi.waitFor(() => expect(scroll.state.y).toBeCloseTo(100, 0));

  fixture.root.scrollTop = 0;
  await vi.waitFor(() => expect(scroll.phase).toBe('paused'));
  fixture.target.scrollTo({ top: 150, behavior: 'instant' });
  await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(scroll.state.y).toBeCloseTo(100, 0);

  scroll.stop();
  fixture.cleanup();
});
