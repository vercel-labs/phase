import {
  useEffect,
  useRef,
  useState,
  type DependencyList,
  type RefObject,
} from 'react';

import { useSyncedRef } from '../../use-synced-ref';

type ElementEffect<T extends Element> = (
  element: T,
) => (() => void) | undefined;

/**
 * Start an effect for the element attached to an object ref.
 *
 * The element may appear after a condition changes, disappear, or be replaced
 * while the same ref is used. Clean up the old effect before starting one for
 * a new element. Changing the ref object or a dependency also restarts it.
 *
 * Updating `ref.current` does not re-render the component, so an element
 * change is handled after commit and may add one render. Keep dependencies at
 * a fixed length and order, and include every reactive value used to create
 * the effect.
 */
export function useElementEffect<T extends Element>(
  ref: RefObject<T | null>,
  effect: ElementEffect<T>,
  deps: DependencyList,
): void {
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const subscribedElementRef = useRef<T | null>(null);
  const effectRef = useSyncedRef(effect);

  useEffect(() => {
    const element: T | null = ref.current;
    subscribedElementRef.current = element;
    if (!element) return;
    return effectRef.current(element);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, subscriptionVersion, ...deps]);

  // Ref attachment happens during commit without scheduling a render. Bump the
  // version only when React committed a different element, which lets the
  // subscription effect clean up the old element before subscribing to the new.
  useEffect(() => {
    if (subscribedElementRef.current === ref.current) return;
    setSubscriptionVersion((version) => version + 1);
  });
}
