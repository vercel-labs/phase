import { renderHook } from '@testing-library/react';

import { useUpdateEffect } from '.';

describe('useUpdateEffect', () => {
  it('skips effect on first mount', () => {
    const effect = vi.fn();
    renderHook(() => useUpdateEffect(effect, [1]));
    expect(effect).not.toHaveBeenCalled();
  });

  it('runs effect on subsequent dep changes', () => {
    const effect = vi.fn();
    const { rerender } = renderHook(
      ({ dep }: { dep: number }) => useUpdateEffect(effect, [dep]),
      { initialProps: { dep: 1 } },
    );

    expect(effect).not.toHaveBeenCalled();

    rerender({ dep: 2 });
    expect(effect).toHaveBeenCalledTimes(1);

    rerender({ dep: 3 });
    expect(effect).toHaveBeenCalledTimes(2);
  });

  it('returns cleanup function from the effect', () => {
    const cleanup = vi.fn();
    const effect = vi.fn(() => cleanup);
    const { rerender } = renderHook(
      ({ dep }: { dep: number }) => useUpdateEffect(effect, [dep]),
      { initialProps: { dep: 1 } },
    );

    rerender({ dep: 2 });
    expect(cleanup).not.toHaveBeenCalled();

    rerender({ dep: 3 });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('cleanup runs on unmount', () => {
    const cleanup = vi.fn();
    const effect = vi.fn(() => cleanup);
    const { rerender, unmount } = renderHook(
      ({ dep }: { dep: number }) => useUpdateEffect(effect, [dep]),
      { initialProps: { dep: 1 } },
    );

    rerender({ dep: 2 });
    expect(cleanup).not.toHaveBeenCalled();

    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
