import { renderHook, waitFor } from '@testing-library/react';

import { useIdle } from '.';

it('updates after the browser idle scheduling path runs', async () => {
  const { result, unmount } = renderHook(() => useIdle({ timeout: 100 }));

  await waitFor(() => expect(result.current).toBe(true));

  unmount();
});
