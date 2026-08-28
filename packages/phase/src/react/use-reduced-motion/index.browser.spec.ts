import { renderHook, waitFor } from '@testing-library/react';

import { usePrefersReducedMotion } from '.';

it('updates from the native reduced-motion preference after mount', async () => {
  const { result, unmount } = renderHook(() => usePrefersReducedMotion());

  await waitFor(() => expect(result.current).toBe(true));

  unmount();
});
