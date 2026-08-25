import { renderHook } from '@testing-library/react';

import { useSyncedRef } from '.';

describe('useSyncedRef', () => {
  it('ref.current is the initial value on first render', () => {
    const { result } = renderHook(() => useSyncedRef(42));
    expect(result.current.current).toBe(42);
  });

  it('ref.current updates to new value after re-render', () => {
    const { result, rerender } = renderHook(
      ({ val }: { val: number }) => useSyncedRef(val),
      { initialProps: { val: 1 } },
    );
    expect(result.current.current).toBe(1);

    rerender({ val: 99 });
    expect(result.current.current).toBe(99);
  });

  it('returns the same ref object identity across re-renders', () => {
    const { result, rerender } = renderHook(
      ({ val }: { val: number }) => useSyncedRef(val),
      { initialProps: { val: 1 } },
    );
    const firstRef = result.current;

    rerender({ val: 2 });
    expect(result.current).toBe(firstRef);
  });
});
