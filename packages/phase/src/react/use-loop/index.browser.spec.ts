import { renderHook, waitFor } from '@testing-library/react';

import { useLoop } from '.';

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

it('runs and tears down a page-anchored loop on native frames', async () => {
  const onTick = vi.fn();
  const { result, unmount } = renderHook(() =>
    useLoop({ target: 'page', onTick, reducedMotion: 'ignore' }),
  );

  await waitFor(() => expect(result.current.phase).toBe('running'));
  await vi.waitFor(() => expect(onTick).toHaveBeenCalled());
  unmount();
  const callsAfterUnmount = onTick.mock.calls.length;
  await nextFrame();
  await nextFrame();
  expect(onTick).toHaveBeenCalledTimes(callsAfterUnmount);
});
