export interface MockMatchMediaResult {
  mockMatchMedia: typeof matchMedia;
  setMatches: (query: string, matches: boolean) => void;
  getListenerCount: (query: string) => number;
}

export function createMockMatchMedia(): MockMatchMediaResult {
  const queries = new Map<
    string,
    { matches: boolean; listeners: Set<(e: MediaQueryListEvent) => void> }
  >();

  function getOrCreate(query: string) {
    let entry = queries.get(query);
    if (!entry) {
      entry = { matches: false, listeners: new Set() };
      queries.set(query, entry);
    }
    return entry;
  }

  function mockMatchMedia(query: string): MediaQueryList {
    const entry = getOrCreate(query);

    return {
      get matches() {
        return entry.matches;
      },
      media: query,
      onchange: null,
      addEventListener(
        _type: string,
        listener: EventListenerOrEventListenerObject,
      ) {
        if (typeof listener === 'function') {
          entry.listeners.add(listener as (e: MediaQueryListEvent) => void);
        }
      },
      removeEventListener(
        _type: string,
        listener: EventListenerOrEventListenerObject,
      ) {
        if (typeof listener === 'function') {
          entry.listeners.delete(listener as (e: MediaQueryListEvent) => void);
        }
      },
      addListener() {
        /* noop — deprecated API stub */
      },
      removeListener() {
        /* noop — deprecated API stub */
      },
      dispatchEvent() {
        return true;
      },
    } as MediaQueryList;
  }

  function setMatches(query: string, matches: boolean): void {
    const entry = getOrCreate(query);
    entry.matches = matches;
    const event = { matches, media: query } as MediaQueryListEvent;
    for (const listener of entry.listeners) {
      listener(event);
    }
  }

  function getListenerCount(query: string): number {
    return queries.get(query)?.listeners.size ?? 0;
  }

  return {
    mockMatchMedia: mockMatchMedia as typeof matchMedia,
    setMatches,
    getListenerCount,
  };
}
