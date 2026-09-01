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

it('isolates observers with distinct custom roots', async () => {
  const first = createScrollFixture();
  const second = createScrollFixture();
  const firstCallback = vi.fn();
  const secondCallback = vi.fn();
  const releaseFirst = observeIntersection({
    element: first.target,
    root: first.root,
    onIntersect: firstCallback,
  });
  const releaseSecond = observeIntersection({
    element: second.target,
    root: second.root,
    onIntersect: secondCallback,
  });

  await vi.waitFor(() => {
    expect(firstCallback).toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalled();
  });
  firstCallback.mockClear();
  secondCallback.mockClear();
  second.root.scrollTop = 150;

  await vi.waitFor(() =>
    expect(secondCallback).toHaveBeenCalledWith(
      expect.objectContaining({ isIntersecting: true }),
    ),
  );
  expect(firstCallback).not.toHaveBeenCalled();

  releaseFirst();
  releaseSecond();
  first.cleanup();
  second.cleanup();
});
