// Native idle scheduling coverage lives in index.browser.spec.tsx. Keep only
// deterministic composition and headless-unreachable scenarios here.
import { render, screen, act } from '@testing-library/react';
import { createRef } from 'react';

import { createMockIdle } from '../../__mocks__/idle';
import { createMockMatchMedia } from '../../__mocks__/match-media';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

let mockIdle: ReturnType<typeof createMockIdle>;
let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  mockIdle = createMockIdle();
  mockMM = createMockMatchMedia();
  vi.stubGlobal('requestIdleCallback', mockIdle.requestIdleCallback);
  vi.stubGlobal('cancelIdleCallback', mockIdle.cancelIdleCallback);
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getWhenIdle() {
  const mod = await import('.');
  return mod.WhenIdle;
}

// ---------------------------------------------------------------------------
// Before idle
// ---------------------------------------------------------------------------

describe('before idle', () => {
  it('does not render children before idle', async () => {
    const WhenIdle = await getWhenIdle();
    render(
      <WhenIdle data-testid="when-idle">
        <span data-testid="child">content</span>
      </WhenIdle>,
    );
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('renders fallback while waiting', async () => {
    const WhenIdle = await getWhenIdle();
    render(
      <WhenIdle
        data-testid="when-idle"
        fallback={<div data-testid="fallback">loading</div>}
      >
        <span data-testid="child">content</span>
      </WhenIdle>,
    );
    expect(screen.getByTestId('fallback')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// After idle
// ---------------------------------------------------------------------------

describe('after idle', () => {
  it('stamps entered and animate when motion is allowed', async () => {
    const WhenIdle = await getWhenIdle();
    render(<WhenIdle data-testid="when-idle">content</WhenIdle>);

    act(() => mockIdle.flush());

    const element = screen.getByTestId('when-idle');
    expect(element.dataset.phase).toBe('entered');
    expect(element.dataset.enter).toBe('animate');
  });

  it('does not stamp data-enter under reduced motion', async () => {
    mockMM.setMatches(REDUCED_MOTION_QUERY, true);
    const WhenIdle = await getWhenIdle();
    render(
      <WhenIdle data-testid="when-idle">
        <span data-testid="child">content</span>
      </WhenIdle>,
    );

    act(() => mockIdle.flush());

    expect(screen.getByTestId('when-idle').dataset.enter).toBeUndefined();
  });

  it('forwards the ref once mounted', async () => {
    const ref = createRef<HTMLDivElement>();
    const WhenIdle = await getWhenIdle();
    render(
      <WhenIdle ref={ref} data-testid="when-idle">
        <span data-testid="child">content</span>
      </WhenIdle>,
    );

    act(() => mockIdle.flush());

    expect(ref.current).toBe(screen.getByTestId('when-idle'));
  });
});
