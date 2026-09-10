import { renderHook, waitFor } from '@testing-library/react';

import { useDevicePixelRatio } from '.';

it('reads the browser device pixel ratio after mount', async () => {
  const { result, unmount } = renderHook(() => useDevicePixelRatio());

  await waitFor(() => expect(result.current).toBe(window.devicePixelRatio));

  unmount();
});
