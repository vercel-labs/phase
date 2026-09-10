type MOCallback = MutationCallback;

interface MockMOInstance {
  readonly target: Node | null;
  readonly options: MutationObserverInit | undefined;
  disconnect: () => void;
}

export interface MockMutationObserverResult {
  MockClass: typeof MutationObserver;
  instances: MockMOInstance[];
  trigger: (target: Node, records: Partial<MutationRecord>[]) => void;
}

export function createMockMutationObserver(): MockMutationObserverResult {
  const instances: MockMOInstance[] = [];
  const callbacksByInstance = new Map<MockMOInstance, MOCallback>();

  class MockMO {
    _target: Node | null = null;
    _options: MutationObserverInit | undefined;
    _callback: MOCallback;

    constructor(callback: MOCallback) {
      this._callback = callback;
      const inst = this as unknown as MockMOInstance;
      instances.push(inst);
      callbacksByInstance.set(inst, callback);
    }

    observe(target: Node, options?: MutationObserverInit): void {
      this._target = target;
      this._options = options;
    }

    disconnect(): void {
      this._target = null;
    }

    // eslint-disable-next-line class-methods-use-this
    takeRecords(): MutationRecord[] {
      return [];
    }

    get target() {
      return this._target;
    }

    get options() {
      return this._options;
    }
  }

  function trigger(target: Node, records: Partial<MutationRecord>[]): void {
    for (const inst of instances) {
      const mo = inst as unknown as MockMO;
      if (mo._target === target) {
        const cb = callbacksByInstance.get(inst);
        if (cb) {
          const fullRecords = records.map(
            (r) =>
              ({
                type: 'childList',
                target,
                addedNodes: { length: 0 } as NodeList,
                removedNodes: { length: 0 } as NodeList,
                previousSibling: null,
                nextSibling: null,
                attributeName: null,
                attributeNamespace: null,
                oldValue: null,
                ...r,
              }) as MutationRecord,
          );
          cb(fullRecords, mo as unknown as MutationObserver);
        }
      }
    }
  }

  return {
    MockClass: MockMO as unknown as typeof MutationObserver,
    instances,
    trigger,
  };
}
