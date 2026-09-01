import { renderHook, waitFor } from '@testing-library/react';

import { useWhenIdle } from '.';

it('runs the effect through the browser idle scheduling path', async () => {
  const callback = vi.fn();
  const { unmount } = renderHook(() => useWhenIdle(callback, { timeout: 100 }));

  await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

  unmount();
});
