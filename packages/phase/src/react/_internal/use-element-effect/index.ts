import { useEffect, useRef, useState, type RefObject } from 'react';

import { useSyncedRef } from '../../use-synced-ref';

type ElementEffect<T extends Element> = (
  element: T,
) => (() => void) | undefined;

/**
 * Run a subscription effect against the element behind an object ref.
 * Re-runs when the ref, element identity, or a dependency changes and always
 * calls the latest effect closure. Like `useEffect`, dependencies must keep a
 * constant length and order.
 */
export function useElementEffect<T extends Element>(
  ref: RefObject<T | null>,
  effect: ElementEffect<T>,
  deps: readonly unknown[],
): void {
  const [nonce, setNonce] = useState(0);
  const observedRef = useRef<T | null>(null);
  const effectRef = useSyncedRef(effect);

  useEffect(() => {
    const element: T | null = ref.current;
    observedRef.current = element;
    if (!element) return;
    return effectRef.current(element);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, nonce, ...deps]);

  // Object refs do not notify React, so reconcile after any commit that swaps
  // or attaches their element.
  useEffect(() => {
    if (observedRef.current !== ref.current) setNonce((value) => value + 1);
  });
}
