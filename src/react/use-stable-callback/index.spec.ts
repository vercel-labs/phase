import { renderHook } from '@testing-library/react';

import { useStableCallback } from './index.js';

describe('useStableCallback', () => {
  it('returned function has stable identity across re-renders', () => {
    const { result, rerender } = renderHook(
      ({ val }: { val: number }) => useStableCallback(() => val),
      { initialProps: { val: 1 } },
    );
    const firstFn = result.current;

    rerender({ val: 2 });
    expect(result.current).toBe(firstFn);
  });

  it('calls the latest version of the callback', () => {
    const { result, rerender } = renderHook(
      ({ val }: { val: number }) => useStableCallback(() => val),
      { initialProps: { val: 1 } },
    );

    expect(result.current()).toBe(1);

    rerender({ val: 42 });
    expect(result.current()).toBe(42);
  });

  it('works with changing closure values', () => {
    let counter = 0;
    const { result, rerender } = renderHook(() =>
      useStableCallback(() => ++counter),
    );

    expect(result.current()).toBe(1);
    rerender({});
    expect(result.current()).toBe(2);
  });

  it('safe to call during render (reads latest ref synchronously)', () => {
    const { result, rerender } = renderHook(
      ({ val }: { val: string }) => {
        const fn = useStableCallback(() => val);
        // Call during render — should read latest ref
        return fn();
      },
      { initialProps: { val: 'first' } },
    );

    expect(result.current).toBe('first');

    rerender({ val: 'second' });
    expect(result.current).toBe('second');
  });
});
