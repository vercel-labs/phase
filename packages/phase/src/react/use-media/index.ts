import { useState, useEffect } from 'react';

import {
  subscribeMediaQuery,
  readMediaQuery,
} from '../../core/_internal/pool/mql-pool';

/**
 * Subscribe to a media query via the shared MQL pool.
 *
 * Returns `false` during SSR and initial hydration render,
 * then the live value from the first `useEffect`.
 *
 * @example
 * const isNarrow = useMediaQuery('(max-width: 600px)');
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    setMatches(readMediaQuery(query));
    return subscribeMediaQuery(query, setMatches);
  }, [query]);

  return matches;
}
