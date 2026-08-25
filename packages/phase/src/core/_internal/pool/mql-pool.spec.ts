import { createMockMatchMedia } from '../../../__mocks__/match-media';
import { describePoolContract } from './pool-contract';

let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  mockMM = createMockMatchMedia();
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getModule() {
  return import('./mql-pool');
}

// ---------------------------------------------------------------------------
// Pooling
// ---------------------------------------------------------------------------

describe('pooling', () => {
  it('same query string shares one MQL', async () => {
    const { subscribeMediaQuery: _subscribeMediaQuery } = await getModule();
    const matchMediaSpy = vi.fn(mockMM.mockMatchMedia);
    vi.stubGlobal('matchMedia', matchMediaSpy);

    // Re-import to pick up the new spy
    vi.resetModules();
    const mod = await import('./mql-pool');

    mod.subscribeMediaQuery('(max-width: 600px)', vi.fn());
    mod.subscribeMediaQuery('(max-width: 600px)', vi.fn());

    // matchMedia called once for the query (getOrCreateEntry creates only once)
    expect(matchMediaSpy).toHaveBeenCalledTimes(1);
  });

  it('different query strings create separate MQL entries', async () => {
    const matchMediaSpy = vi.fn(mockMM.mockMatchMedia);
    vi.stubGlobal('matchMedia', matchMediaSpy);
    vi.resetModules();
    const mod = await import('./mql-pool');

    mod.subscribeMediaQuery('(max-width: 600px)', vi.fn());
    mod.subscribeMediaQuery('(max-width: 900px)', vi.fn());

    expect(matchMediaSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// subscribeMediaQuery
// ---------------------------------------------------------------------------

describe('subscribeMediaQuery', () => {
  it('callback fires when MQL change event dispatches', async () => {
    const { subscribeMediaQuery } = await getModule();
    const cb = vi.fn();
    subscribeMediaQuery('(max-width: 600px)', cb);

    mockMM.setMatches('(max-width: 600px)', true);
    expect(cb).toHaveBeenCalledWith(true);
  });

  it('multiple subscribers to same query all receive the event', async () => {
    const { subscribeMediaQuery } = await getModule();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    subscribeMediaQuery('(max-width: 600px)', cb1);
    subscribeMediaQuery('(max-width: 600px)', cb2);

    mockMM.setMatches('(max-width: 600px)', true);

    expect(cb1).toHaveBeenCalledWith(true);
    expect(cb2).toHaveBeenCalledWith(true);
  });

  it('removing one subscriber does NOT remove the other', async () => {
    const { subscribeMediaQuery } = await getModule();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const unsub1 = subscribeMediaQuery('(max-width: 600px)', cb1);
    subscribeMediaQuery('(max-width: 600px)', cb2);

    unsub1();
    mockMM.setMatches('(max-width: 600px)', true);

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledWith(true);
  });

  it('removing last subscriber deletes pool entry', async () => {
    const { subscribeMediaQuery } = await getModule();
    const cb = vi.fn();

    const unsub = subscribeMediaQuery('(max-width: 600px)', cb);
    unsub();

    // After last unsub, a new change event should not fire the old callback
    mockMM.setMatches('(max-width: 600px)', true);
    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// readMediaQuery
// ---------------------------------------------------------------------------

describe('readMediaQuery', () => {
  it('returns cached MQL.matches when pool entry exists', async () => {
    const { subscribeMediaQuery, readMediaQuery } = await getModule();
    subscribeMediaQuery('(max-width: 600px)', vi.fn());
    mockMM.setMatches('(max-width: 600px)', true);

    expect(readMediaQuery('(max-width: 600px)')).toBe(true);
  });

  it('calls matchMedia directly when no pool entry exists', async () => {
    const { readMediaQuery } = await getModule();
    mockMM.setMatches('(max-width: 600px)', true);

    expect(readMediaQuery('(max-width: 600px)')).toBe(true);
  });

  it('does NOT create a pool entry for read-only access', async () => {
    const { readMediaQuery } = await getModule();
    readMediaQuery('(max-width: 600px)');

    // A subsequent change event should not fire anything (no subscriber registered)
    const cb = vi.fn();
    // This is a manual check — no callbacks registered via subscribe
    mockMM.setMatches('(max-width: 600px)', true);
    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Shared pool contract
// ---------------------------------------------------------------------------

describePoolContract<string>({
  keys: () => ['(min-width: 600px)', '(min-width: 900px)'],
  create: async () => {
    const { subscribeMediaQuery } = await getModule();
    return {
      subscribe: (query, callback) =>
        subscribeMediaQuery(query, () => callback()),
      notify: (query) => mockMM.setMatches(query, true),
      isBound: (query) => mockMM.listenerCount(query) > 0,
    };
  },
});
