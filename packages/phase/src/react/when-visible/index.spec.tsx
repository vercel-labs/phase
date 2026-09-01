// Native observer coverage lives in index.browser.spec.tsx. Keep only
// deterministic composition and headless-unreachable scenarios here.
import { render, screen, act } from '@testing-library/react';
import { createRef } from 'react';

import { createMockIntersectionObserver } from '../../__mocks__/intersection-observer';
import { createMockMatchMedia } from '../../__mocks__/match-media';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

let mockIO: ReturnType<typeof createMockIntersectionObserver>;
let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  mockIO = createMockIntersectionObserver();
  mockMM = createMockMatchMedia();
  vi.stubGlobal('IntersectionObserver', mockIO.MockClass);
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
  Object.defineProperty(document, 'hidden', {
    value: false,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getWhenVisible() {
  const mod = await import('.');
  return mod.WhenVisible;
}

function getSentinel(): HTMLElement {
  return screen.getByTestId('when-visible');
}

// ---------------------------------------------------------------------------
// Before intersection
// ---------------------------------------------------------------------------

describe('before intersection', () => {
  it('renders sentinel div for IO to observe', async () => {
    const WhenVisible = await getWhenVisible();
    render(
      <WhenVisible data-testid="when-visible">
        <span data-testid="child">content</span>
      </WhenVisible>,
    );
    expect(screen.getByTestId('when-visible')).toBeTruthy();
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('does NOT render children before intersection', async () => {
    const WhenVisible = await getWhenVisible();
    render(
      <WhenVisible data-testid="when-visible">
        <span data-testid="child">content</span>
      </WhenVisible>,
    );
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('renders fallback when provided', async () => {
    const WhenVisible = await getWhenVisible();
    render(
      <WhenVisible
        data-testid="when-visible"
        fallback={<div data-testid="fallback">loading</div>}
      >
        <span data-testid="child">content</span>
      </WhenVisible>,
    );
    expect(screen.getByTestId('fallback')).toBeTruthy();
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('spreads divProps onto sentinel', async () => {
    const WhenVisible = await getWhenVisible();
    render(
      <WhenVisible data-testid="when-visible" className="my-class" id="my-id">
        content
      </WhenVisible>,
    );
    const el = getSentinel();
    expect(el.className).toBe('my-class');
    expect(el.id).toBe('my-id');
  });
});

// ---------------------------------------------------------------------------
// After intersection
// ---------------------------------------------------------------------------

describe('after intersection', () => {
  it('stamps data-phase="entered" on content div', async () => {
    const WhenVisible = await getWhenVisible();
    render(<WhenVisible data-testid="when-visible">content</WhenVisible>);

    act(() => mockIO.trigger(getSentinel(), true));

    const el = screen.getByTestId('when-visible');
    expect(el.dataset.phase).toBe('entered');
  });

  it('stamps data-enter="animate" when motion allowed', async () => {
    const WhenVisible = await getWhenVisible();
    render(<WhenVisible data-testid="when-visible">content</WhenVisible>);

    act(() => mockIO.trigger(getSentinel(), true));

    const el = screen.getByTestId('when-visible');
    expect(el.dataset.enter).toBe('animate');
  });

  it('does NOT stamp data-enter when reduced motion active', async () => {
    mockMM.setMatches(REDUCED_MOTION_QUERY, true);
    const WhenVisible = await getWhenVisible();
    render(<WhenVisible data-testid="when-visible">content</WhenVisible>);

    act(() => mockIO.trigger(getSentinel(), true));

    const el = screen.getByTestId('when-visible');
    expect(el.dataset.enter).toBeUndefined();
  });

  it('does not render fallback after intersection', async () => {
    const WhenVisible = await getWhenVisible();
    render(
      <WhenVisible
        data-testid="when-visible"
        fallback={<div data-testid="fallback">loading</div>}
      >
        <span data-testid="child">content</span>
      </WhenVisible>,
    );

    act(() => mockIO.trigger(getSentinel(), true));

    expect(screen.queryByTestId('fallback')).toBeNull();
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('spreads divProps onto content div', async () => {
    const WhenVisible = await getWhenVisible();
    render(
      <WhenVisible data-testid="when-visible" className="content-class">
        content
      </WhenVisible>,
    );

    act(() => mockIO.trigger(getSentinel(), true));

    const el = screen.getByTestId('when-visible');
    expect(el.className).toBe('content-class');
  });
});

// ---------------------------------------------------------------------------
// One-shot policy
// ---------------------------------------------------------------------------

describe('one-shot policy', () => {
  it('stays mounted after visibility changes back to hidden', async () => {
    const WhenVisible = await getWhenVisible();
    render(
      <WhenVisible data-testid="when-visible">
        <span data-testid="child">content</span>
      </WhenVisible>,
    );

    const sentinel = getSentinel();
    act(() => mockIO.trigger(sentinel, true));
    expect(
      mockIO.instances.some((instance) => instance.observed.has(sentinel)),
    ).toBe(false);
    act(() => mockIO.trigger(screen.getByTestId('when-visible'), false));

    expect(screen.getByTestId('child')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

describe('options', () => {
  it('default rootMargin is 200px', async () => {
    const WhenVisible = await getWhenVisible();
    render(<WhenVisible data-testid="when-visible">content</WhenVisible>);

    expect(mockIO.instances.length).toBeGreaterThan(0);
    expect(mockIO.instances[0]?.options?.rootMargin).toBe('200px');
  });

  it('custom rootMargin passed to IO', async () => {
    const WhenVisible = await getWhenVisible();
    render(
      <WhenVisible data-testid="when-visible" rootMargin="400px">
        content
      </WhenVisible>,
    );

    const instance = mockIO.instances[mockIO.instances.length - 1];
    expect(instance?.options?.rootMargin).toBe('400px');
  });

  it('custom threshold passed to IO', async () => {
    const WhenVisible = await getWhenVisible();
    render(
      <WhenVisible data-testid="when-visible" threshold={0.5}>
        content
      </WhenVisible>,
    );

    const instance = mockIO.instances[mockIO.instances.length - 1];
    expect(instance?.options?.threshold).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Ref forwarding
// ---------------------------------------------------------------------------

describe('ref forwarding', () => {
  it('ref points at the sentinel div at mount (before intersection)', async () => {
    const WhenVisible = await getWhenVisible();
    const ref = createRef<HTMLDivElement>();
    render(
      <WhenVisible data-testid="when-visible" ref={ref}>
        content
      </WhenVisible>,
    );

    expect(ref.current).toBe(getSentinel());
  });

  it('ref is attached to content div after intersection', async () => {
    const WhenVisible = await getWhenVisible();
    const ref = createRef<HTMLDivElement>();
    render(
      <WhenVisible data-testid="when-visible" ref={ref}>
        content
      </WhenVisible>,
    );

    act(() => mockIO.trigger(getSentinel(), true));

    expect(ref.current).toBe(screen.getByTestId('when-visible'));
  });

  it('supports callback refs in both states', async () => {
    const WhenVisible = await getWhenVisible();
    const nodes: (HTMLDivElement | null)[] = [];
    render(
      <WhenVisible
        data-testid="when-visible"
        ref={(node) => {
          nodes.push(node);
        }}
      >
        content
      </WhenVisible>,
    );

    expect(nodes.at(-1)).toBe(getSentinel());

    act(() => mockIO.trigger(getSentinel(), true));

    expect(nodes.at(-1)).toBe(screen.getByTestId('when-visible'));
  });
});
