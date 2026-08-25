import { render, screen, act } from '@testing-library/react';
import { createRef } from 'react';

import { createMockMatchMedia } from '../../__mocks__/match-media';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

let mockMM: ReturnType<typeof createMockMatchMedia>;

beforeEach(() => {
  vi.useFakeTimers();
  mockMM = createMockMatchMedia();
  vi.stubGlobal('matchMedia', mockMM.mockMatchMedia);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function getPresence() {
  const mod = await import('.');
  return mod.Presence;
}

describe('Presence component', () => {
  it('renders a div with data-phase="entered" when show=true', async () => {
    const Presence = await getPresence();
    render(
      <Presence show={true} data-testid="presence">
        content
      </Presence>,
    );
    const el = screen.getByTestId('presence');
    expect(el.tagName).toBe('DIV');
    expect(el.dataset.phase).toBe('entered');
  });

  it('stamps data-enter="animate" when enter=animate and motion allowed', async () => {
    const Presence = await getPresence();
    render(
      <Presence show={true} enter="animate" data-testid="presence">
        content
      </Presence>,
    );
    const el = screen.getByTestId('presence');
    expect(el.dataset.enter).toBe('animate');
  });

  it('does NOT stamp data-enter when enter=instant', async () => {
    const Presence = await getPresence();
    render(
      <Presence show={true} enter="instant" data-testid="presence">
        content
      </Presence>,
    );
    const el = screen.getByTestId('presence');
    expect(el.dataset.enter).toBeUndefined();
  });

  it('does NOT stamp data-enter when reduced motion is active', async () => {
    mockMM.setMatches(REDUCED_MOTION_QUERY, true);
    const Presence = await getPresence();
    render(
      <Presence show={true} enter="animate" data-testid="presence">
        content
      </Presence>,
    );
    const el = screen.getByTestId('presence');
    expect(el.dataset.enter).toBeUndefined();
  });

  it('stamps data-enter when reducedMotion=ignore despite preference', async () => {
    mockMM.setMatches(REDUCED_MOTION_QUERY, true);
    const Presence = await getPresence();
    render(
      <Presence
        show={true}
        enter="animate"
        reducedMotion="ignore"
        data-testid="presence"
      >
        content
      </Presence>,
    );
    const el = screen.getByTestId('presence');
    expect(el.dataset.enter).toBe('animate');
  });

  it('returns null when show=false and mode=mount', async () => {
    const Presence = await getPresence();
    render(
      <Presence show={false} data-testid="presence">
        content
      </Presence>,
    );
    expect(screen.queryByTestId('presence')).toBeNull();
  });

  it('renders with data-phase="idle" when show=false, mode=reveal', async () => {
    const Presence = await getPresence();
    render(
      <Presence show={false} mode="reveal" data-testid="presence">
        content
      </Presence>,
    );
    const el = screen.getByTestId('presence');
    expect(el).toBeTruthy();
    expect(el.dataset.phase).toBe('idle');
  });

  it('renders children when show=true', async () => {
    const Presence = await getPresence();
    render(
      <Presence show={true}>
        <span data-testid="child">hello</span>
      </Presence>,
    );
    expect(screen.getByTestId('child').textContent).toBe('hello');
  });

  it('passes className and other div props through', async () => {
    const Presence = await getPresence();
    render(
      <Presence
        show={true}
        className="my-class"
        id="my-id"
        data-testid="presence"
      >
        content
      </Presence>,
    );
    const el = screen.getByTestId('presence');
    expect(el.className).toBe('my-class');
    expect(el.id).toBe('my-id');
  });

  it('forwards ref via useImperativeHandle', async () => {
    const Presence = await getPresence();
    const ref = createRef<HTMLDivElement>();
    render(
      <Presence show={true} ref={ref} data-testid="presence">
        content
      </Presence>,
    );
    expect(ref.current).toBe(screen.getByTestId('presence'));
  });
});

describe('Presence exit', () => {
  it('stamps data-phase="exiting" during exit', async () => {
    const Presence = await getPresence();
    const { rerender } = render(
      <Presence show={true} data-testid="presence">
        content
      </Presence>,
    );

    rerender(
      <Presence show={false} data-testid="presence">
        content
      </Presence>,
    );
    const el = screen.getByTestId('presence');
    expect(el.dataset.phase).toBe('exiting');
  });

  it('unmounts after exit timeout', async () => {
    const Presence = await getPresence();
    const { rerender } = render(
      <Presence show={true} exitDuration={200} data-testid="presence">
        content
      </Presence>,
    );

    rerender(
      <Presence show={false} exitDuration={200} data-testid="presence">
        content
      </Presence>,
    );
    expect(screen.getByTestId('presence')).toBeTruthy();

    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByTestId('presence')).toBeNull();
  });
});
