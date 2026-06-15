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
