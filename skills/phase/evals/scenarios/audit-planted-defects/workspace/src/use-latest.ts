import { useRef } from 'react';

export function useLatest<T>(value: T) {
  const valueRef = useRef(value);
  valueRef.current = value;
  return valueRef;
}
