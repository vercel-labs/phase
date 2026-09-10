import { renderHook } from '@testing-library/react';
import { createRef } from 'react';

import { useScroll } from '.';

it('updates the hook from native scroll geometry', async () => {
  const target = document.createElement('div');
  const content = document.createElement('div');
  target.style.cssText = 'width:100px;height:100px;overflow:auto;';
  content.style.cssText = 'width:100px;height:300px;';
  target.append(content);
  document.body.append(target);
  const ref = createRef<HTMLDivElement>();
  ref.current = target;
  const { result, unmount } = renderHook(() =>
    useScroll({ ref, visibility: 'ignore', onScroll: vi.fn() }),
  );

  target.scrollTo({ top: 100, behavior: 'instant' });
  await vi.waitFor(() =>
    expect(result.current.stateRef.current.y).toBeCloseTo(100, 0),
  );
  expect(result.current.stateRef.current.progressY).toBeCloseTo(0.5, 2);

  unmount();
  target.remove();
});
