import { subscribeDpr, readDpr } from '@usephase/core/internal';
import { useState, useEffect } from 'react';

/**
 * Reactive devicePixelRatio that updates when the user moves the window
 * between monitors with different DPR values.
 *
 * Returns `1` during SSR and initial hydration, then the live value.
 */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    setDpr(readDpr());
    return subscribeDpr(setDpr);
  }, []);

  return dpr;
}
