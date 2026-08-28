import { act, renderHook, waitFor } from '@testing-library/react';
import { createRef } from 'react';

import { useSight } from '.';
import { createScrollFixture } from '../../__tests__/browser-fixtures';

it('updates React state from native intersections', async () => {
  const fixture = createScrollFixture();
  const ref = createRef<HTMLDivElement>();
  ref.current = fixture.target;
  const { result, unmount } = renderHook(() =>
    useSight({ ref, root: fixture.root }),
  );

  await waitFor(() => expect(result.current.phase).toBe('hidden'));
  act(() => {
    fixture.root.scrollTop = 150;
  });
  await waitFor(() => expect(result.current.phase).toBe('visible'));

  unmount();
  fixture.cleanup();
});
