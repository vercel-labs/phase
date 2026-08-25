import { useRef, type RefObject } from 'react';

/**
 * Ref whose `.current` is always the latest value, updated synchronously on
 * every render. Readable from any callback or effect without triggering re-render.
 *
 * @example
 * const propsRef = useSyncedRef(props);
 * useEffect(() => {
 *   // propsRef.current is always fresh
 * }, []);
 */
export function useSyncedRef<T>(value: T): RefObject<T> {
  // Writes ref.current during render — opt out of React Compiler
  // memoization so the write is never skipped. No-op without the compiler.
  'use no memo';

  const ref = useRef(value);
  ref.current = value;
  return ref;
}
