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

function enableReducedMotion(): void {
  mockMM.setMatches('(prefers-reduced-motion: reduce)', true);
}

describe('prefersReducedMotion()', () => {
  it('returns false when matchMedia is undefined (SSR)', async () => {
    vi.stubGlobal('matchMedia', undefined);
    vi.resetModules();
    const { prefersReducedMotion } = await import('.');
    expect(prefersReducedMotion()).toBe(false);
  });

  it('returns true when prefers-reduced-motion matches', async () => {
    enableReducedMotion();
    const { prefersReducedMotion } = await import('.');
    expect(prefersReducedMotion()).toBe(true);
  });

  it('returns false when prefers-reduced-motion does not match', async () => {
    const { prefersReducedMotion } = await import('.');
    expect(prefersReducedMotion()).toBe(false);
  });
});
