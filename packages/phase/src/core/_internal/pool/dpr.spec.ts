import { createMockMatchMedia } from '../../../__mocks__/match-media';
import { describePoolContract } from './pool-contract';

let mockMM: ReturnType<typeof createMockMatchMedia>;
/** Tracks the DPR the pool is currently bound to; it rebinds on every change. */
let currentDpr: number;

beforeEach(() => {
  mockMM = createMockMatchMedia();
  currentDpr = 2;
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
  vi.stubGlobal('devicePixelRatio', currentDpr);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const resolutionQuery = (dpr: number): string => `(resolution: ${dpr}dppx)`;

// A single process-wide subscription rather than a keyed one, so the contract
// runs with one key and the adapter ignores it.
describePoolContract<'dpr'>({
  keys: () => ['dpr'],
  create: async () => {
    const { subscribeDpr } = await import('./dpr');
    return {
      subscribe: (_key, callback) => subscribeDpr(() => callback()),
      notify: () => {
        const previous = currentDpr;
        currentDpr += 1;
        vi.stubGlobal('devicePixelRatio', currentDpr);
        // The pool listens on the query for the DPR it last saw, so the change
        // is announced against the previous resolution.
        mockMM.setMatches(resolutionQuery(previous), false);
      },
      isBound: () => mockMM.listenerCount(resolutionQuery(currentDpr)) > 0,
    };
  },
});
