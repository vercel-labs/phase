import { act, renderHook, waitFor } from '@testing-library/react';
import { createRef } from 'react';

import { useScrollProgress } from '.';
import { createScrollFixture } from '../../__tests__/browser-fixtures';

it('updates React state from native intersection ratios', async () => {
  const fixture = createScrollFixture({ beforeSize: 0, targetSize: 200 });
  const ref = createRef<HTMLDivElement>();
  ref.current = fixture.target;
  const { result, unmount } = renderHook(() =>
    useScrollProgress({ ref, root: fixture.root, steps: 4 }),
  );

  await waitFor(() => expect(result.current.progress).toBeCloseTo(0.5, 1));
  act(() => {
    fixture.root.scrollTop = 200;
  });
  await waitFor(() => expect(result.current.progress).toBe(0));

  unmount();
  fixture.cleanup();
});
