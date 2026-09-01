import { act, renderHook, waitFor } from '@testing-library/react';
import { createRef } from 'react';

import { useLifecycle } from '.';
import { createScrollFixture } from '../../__tests__/browser-fixtures';

it('reflects the browser reduced-motion preference in React state', async () => {
  const { result, unmount } = renderHook(() =>
    useLifecycle({ target: 'page' }),
  );

  await waitFor(() => expect(result.current.phase).toBe('paused'));
  expect(result.current.phaseReason).toBe('reduced-motion');

  unmount();
});

it('updates React lifecycle state from native intersections', async () => {
  const fixture = createScrollFixture();
  const ref = createRef<HTMLDivElement>();
  ref.current = fixture.target;
  const { result, unmount } = renderHook(() =>
    useLifecycle({
      ref,
      reducedMotion: 'ignore',
      intersectionOptions: { root: fixture.root },
    }),
  );

  await waitFor(() => expect(result.current.phase).toBe('paused'));
  act(() => {
    fixture.root.scrollTop = 150;
  });
  await waitFor(() => expect(result.current.phase).toBe('active'));
  act(() => {
    fixture.root.scrollTop = 0;
  });
  await waitFor(() => expect(result.current.phase).toBe('paused'));
  expect(result.current.phaseReason).toBe('sight');

  unmount();
  fixture.cleanup();
});
