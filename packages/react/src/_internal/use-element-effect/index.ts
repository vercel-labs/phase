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
 * Run a subscription effect for the element behind an object ref.
 *
 * The subscription restarts when the ref object, attached element, or a
 * dependency changes. Element changes reconcile after commit because object
 * refs do not notify React. Dependencies follow the `useEffect` contract: keep
 * their length and order constant and include every reactive value read while
 * creating the subscription.
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
