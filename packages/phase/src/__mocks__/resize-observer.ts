interface MockROInstance {
  readonly observed: Set<Element>;
  disconnect: () => void;
}

export interface MockResizeObserverResult {
  MockClass: typeof ResizeObserver;
  instances: MockROInstance[];
  trigger: (element: Element, width: number, height: number) => void;
  triggerWithBorderBox: (
    element: Element,
    contentWidth: number,
    contentHeight: number,
    borderWidth: number,
    borderHeight: number,
  ) => void;
  triggerWithPhysicalSize: (
    element: Element,
    cssWidth: number,
    cssHeight: number,
    physicalWidth: number,
    physicalHeight: number,
  ) => void;
  triggerWithoutPhysicalSize: (
    element: Element,
    width: number,
    height: number,
  ) => void;
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

  function triggerWithBorderBox(
    element: Element,
    contentWidth: number,
    contentHeight: number,
    borderWidth: number,
    borderHeight: number,
  ): void {
    for (const inst of instances) {
      if (inst.observed.has(element)) {
        const cb = callbacksByInstance.get(inst);
        if (cb) {
          const entry = {
            target: element,
            contentBoxSize: [
              { inlineSize: contentWidth, blockSize: contentHeight },
            ],
            borderBoxSize: [
              { inlineSize: borderWidth, blockSize: borderHeight },
            ],
            devicePixelContentBoxSize: [
              { inlineSize: contentWidth, blockSize: contentHeight },
            ],
            contentRect: {
              width: contentWidth,
              height: contentHeight,
              x: 0,
              y: 0,
              top: 0,
              left: 0,
              bottom: contentHeight,
              right: contentWidth,
            } as DOMRectReadOnly,
          } as ResizeObserverEntry;
          cb([entry], inst as unknown as ResizeObserver);
        }
      }
    }
  }

  function triggerWithPhysicalSize(
    element: Element,
    cssWidth: number,
    cssHeight: number,
    physicalWidth: number,
    physicalHeight: number,
  ): void {
    for (const inst of instances) {
      if (inst.observed.has(element)) {
        const cb = callbacksByInstance.get(inst);
        if (cb) {
          const entry = {
            target: element,
            contentBoxSize: [{ inlineSize: cssWidth, blockSize: cssHeight }],
            borderBoxSize: [{ inlineSize: cssWidth, blockSize: cssHeight }],
            devicePixelContentBoxSize: [
              { inlineSize: physicalWidth, blockSize: physicalHeight },
            ],
            contentRect: {
              width: cssWidth,
              height: cssHeight,
              x: 0,
              y: 0,
              top: 0,
              left: 0,
              bottom: cssHeight,
              right: cssWidth,
            } as DOMRectReadOnly,
          } as ResizeObserverEntry;
          cb([entry], inst as unknown as ResizeObserver);
        }
      }
    }
  }

  function triggerWithoutPhysicalSize(
    element: Element,
    width: number,
    height: number,
  ): void {
    for (const inst of instances) {
      if (inst.observed.has(element)) {
        const cb = callbacksByInstance.get(inst);
        if (cb) {
          const entry = {
            target: element,
            contentBoxSize: [{ inlineSize: width, blockSize: height }],
            borderBoxSize: [{ inlineSize: width, blockSize: height }],
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
          } as unknown as ResizeObserverEntry;
          cb([entry], inst as unknown as ResizeObserver);
        }
      }
    }
  }

  return {
    MockClass: MockRO as unknown as typeof ResizeObserver,
    instances,
    trigger,
    triggerWithBorderBox,
    triggerWithPhysicalSize,
    triggerWithoutPhysicalSize,
  };
}
