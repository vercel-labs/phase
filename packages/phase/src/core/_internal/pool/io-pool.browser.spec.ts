import { createScrollFixture } from '../../../__tests__/browser-fixtures';
import { observeIntersection } from './io-pool';

it('delivers native intersections to every subscriber', async () => {
  const fixture = createScrollFixture();
  const first = vi.fn();
  const second = vi.fn();
  const options = { element: fixture.target, root: fixture.root };
  const releaseFirst = observeIntersection({ ...options, onIntersect: first });
  const releaseSecond = observeIntersection({
    ...options,
    onIntersect: second,
  });

  await vi.waitFor(() => {
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });
  first.mockClear();
  second.mockClear();
  releaseFirst();
  fixture.root.scrollTop = 150;
  await vi.waitFor(() => expect(second).toHaveBeenCalled());
  expect(first).not.toHaveBeenCalled();

  releaseSecond();
  fixture.cleanup();
});
