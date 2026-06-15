// ---------------------------------------------------------------------------
// Mock IntersectionObserver
// ---------------------------------------------------------------------------

type IOCallback = IntersectionObserverCallback;

interface MockIOInstance {
  readonly observed: Set<Element>;
  readonly options: IntersectionObserverInit | undefined;
  disconnect: () => void;
}

export interface MockIntersectionObserverResult {
  MockClass: typeof IntersectionObserver;
  instances: MockIOInstance[];
  trigger: (element: Element, isIntersecting: boolean) => void;
}

export function createMockIntersectionObserver(): MockIntersectionObserverResult {
  const instances: MockIOInstance[] = [];
  const callbacksByInstance = new Map<MockIOInstance, IOCallback>();

  class MockIO {
    readonly observed = new Set<Element>();
    readonly options: IntersectionObserverInit | undefined;

    constructor(callback: IOCallback, options?: IntersectionObserverInit) {
      this.options = options;
      const inst = this as unknown as MockIOInstance;
      instances.push(inst);
      callbacksByInstance.set(inst, callback);
    }

    observe(el: Element): void {
      this.observed.add(el);
    }

    unobserve(el: Element): void {
      this.observed.delete(el);
    }

    disconnect(): void {
      this.observed.clear();
    }

    // eslint-disable-next-line class-methods-use-this
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }

    // eslint-disable-next-line class-methods-use-this
    get root(): Element | Document | null {
      return null;
    }
    // eslint-disable-next-line class-methods-use-this
    get rootMargin(): string {
      return '0px';
    }
    // eslint-disable-next-line class-methods-use-this
    get thresholds(): readonly number[] {
      return [0];
    }
  }

  function trigger(element: Element, isIntersecting: boolean): void {
    for (const inst of instances) {
      if (inst.observed.has(element)) {
        const cb = callbacksByInstance.get(inst);
        if (cb) {
          const entry = {
            target: element,
            isIntersecting,
            intersectionRatio: isIntersecting ? 1 : 0,
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
            time: performance.now(),
          } as IntersectionObserverEntry;
          cb([entry], inst as unknown as IntersectionObserver);
        }
      }
    }
  }

  return {
    MockClass: MockIO as unknown as typeof IntersectionObserver,
    instances,
    trigger,
  };
}

// ---------------------------------------------------------------------------
// Mock ResizeObserver
// ---------------------------------------------------------------------------

interface MockROInstance {
  readonly observed: Set<Element>;
  disconnect: () => void;
}

export interface MockResizeObserverResult {
  MockClass: typeof ResizeObserver;
  instances: MockROInstance[];
  trigger: (element: Element, width: number, height: number) => void;
}

export function createMockResizeObserver(): MockResizeObserverResult {
  const instances: MockROInstance[] = [];
  const callbacksByInstance = new Map<MockROInstance, ResizeObserverCallback>();

  class MockRO {
    readonly observed = new Set<Element>();

    constructor(callback: ResizeObserverCallback) {
      const inst = this as unknown as MockROInstance;
      instances.push(inst);
      callbacksByInstance.set(inst, callback);
    }

    observe(el: Element): void {
      this.observed.add(el);
    }

    unobserve(el: Element): void {
      this.observed.delete(el);
    }

    disconnect(): void {
      this.observed.clear();
    }
  }

  function trigger(element: Element, width: number, height: number): void {
    for (const inst of instances) {
      if (inst.observed.has(element)) {
        const cb = callbacksByInstance.get(inst);
        if (cb) {
          const entry = {
            target: element,
            contentBoxSize: [{ inlineSize: width, blockSize: height }],
            borderBoxSize: [{ inlineSize: width, blockSize: height }],
            devicePixelContentBoxSize: [
              { inlineSize: width, blockSize: height },
            ],
            contentRect: {
              width,
              height,
              x: 0,
              y: 0,
              top: 0,
              left: 0,
              bottom: height,
              right: width,
            } as DOMRectReadOnly,
          } as ResizeObserverEntry;
          cb([entry], inst as unknown as ResizeObserver);
        }
      }
    }
  }

  return {
    MockClass: MockRO as unknown as typeof ResizeObserver,
    instances,
    trigger,
  };
}

// ---------------------------------------------------------------------------
// Mock matchMedia
// ---------------------------------------------------------------------------

export interface MockMatchMediaResult {
  mockMatchMedia: typeof matchMedia;
  setMatches: (query: string, matches: boolean) => void;
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

  return { mockMatchMedia: mockMatchMedia as typeof matchMedia, setMatches };
}
