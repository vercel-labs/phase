// Native media-query coverage lives in index.browser.spec.ts. Keep only
// deterministic no-preference and server-context scenarios here.
import { createMockMatchMedia } from '../../__mocks__/match-media';

let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  mockMM = createMockMatchMedia();
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('prefersReducedMotion()', () => {
  it('returns false when matchMedia is undefined (SSR)', async () => {
    vi.stubGlobal('matchMedia', undefined);
    vi.resetModules();
    const { prefersReducedMotion } = await import('.');
    expect(prefersReducedMotion()).toBe(false);
  });

  it('returns false when prefers-reduced-motion does not match', async () => {
    const { prefersReducedMotion } = await import('.');
    expect(prefersReducedMotion()).toBe(false);
  });
});
