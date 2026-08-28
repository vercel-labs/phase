import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { page } from 'vitest/browser';

import { usePointer } from '.';

it('updates the hook from browser-driven pointer input', async () => {
  const target = document.createElement('div');
  target.dataset.testid = 'hook-pointer-target';
  target.style.cssText = 'width:100px;height:100px;';
  document.body.append(target);
  const ref = createRef<HTMLDivElement>();
  ref.current = target;
  const states: Array<{ x: number; y: number; active: boolean }> = [];
  const { result, unmount } = renderHook(() =>
    usePointer({
      ref,
      visibility: 'ignore',
      onPointer: (state) => states.push({ ...state }),
    }),
  );

  await act(() =>
    page
      .getByTestId('hook-pointer-target')
      .hover({ position: { x: 25, y: 35 } }),
  );
  await vi.waitFor(() =>
    expect(states.some((state) => state.active)).toBe(true),
  );
  const activeState = states.find((state) => state.active);
  expect(activeState?.x).toBeCloseTo(25, 0);
  expect(activeState?.y).toBeCloseTo(35, 0);
  expect(result.current.phaseRef.current).toBe('tracking');
  expect(result.current.phaseReasonRef.current).toBe('enter');
  expect(result.current.stateRef.current.x).toBeCloseTo(25, 0);
  expect(result.current.stateRef.current.y).toBeCloseTo(35, 0);
  expect(result.current.stateRef.current.active).toBe(true);

  unmount();
  target.remove();
});
