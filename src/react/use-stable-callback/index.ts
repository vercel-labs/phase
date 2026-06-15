import { useRef, useCallback } from 'react';

/**
 * Returns a function with **stable identity** that always calls the latest
 * version of `callback`. Safe in deps arrays and as a prop to `memo()`'d children.
 *
 * @example
 * const handleClick = useStableCallback((e: MouseEvent) => {
 *   console.log(latestValue); // always fresh
 * });
 */
export function useStableCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
): T {
  // Writes callbackRef.current during render — opt out of React Compiler
  // memoization so the write is never skipped. No-op without the compiler.
  'use no memo';

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Stable wrapper created once — delegates to the ref on every call.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(
    ((...args: unknown[]) => callbackRef.current(...args)) as unknown as T,
    [],
  );
}
