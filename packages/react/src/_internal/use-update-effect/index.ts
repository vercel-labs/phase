import {
  useEffect,
  useRef,
  type EffectCallback,
  type DependencyList,
} from 'react';

/**
 * Like `useEffect` but skips the first invocation on mount.
 * Used by Presence to distinguish initial render from subsequent `show` changes.
 */
export function useUpdateEffect(
  effect: EffectCallback,
  deps: DependencyList,
): void {
  const isMounted = useRef(false);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
