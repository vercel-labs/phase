// Browser event coverage lives in index.browser.spec.ts. Keep only deterministic
// React wiring and teardown scenarios here.
import { renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';

import { useRenderState } from '.';

function dispatchStateChange(element: Element, skipped: boolean): void {
  const event = new Event('contentvisibilityautostatechange');
  Object.defineProperty(event, 'skipped', { value: skipped });
  element.dispatchEvent(event);
}

describe('useRenderState', () => {
  it('returns rendered by default', () => {
    const el = document.createElement('div');
    const ref = { current: el } as RefObject<HTMLDivElement>;
    const { result } = renderHook(() => useRenderState(ref));
    expect(result.current).toBe('rendered');
  });

  it('stops listening on unmount', () => {
    const el = document.createElement('div');
    const ref = { current: el } as RefObject<HTMLDivElement>;
    const { result, unmount } = renderHook(() => useRenderState(ref));

    unmount();
    act(() => dispatchStateChange(el, true));
    expect(result.current).toBe('rendered');
  });

  it('stays rendered when the ref is empty', () => {
    const ref = { current: null } as RefObject<HTMLDivElement | null>;
    const { result } = renderHook(() => useRenderState(ref));
    expect(result.current).toBe('rendered');
  });
});
