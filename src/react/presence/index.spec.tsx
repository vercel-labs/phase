import { render, screen } from '@testing-library/react';
import { createRef } from 'react';

import { Presence } from './index.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Presence component', () => {
  it('renders a div with data-phase attribute when show=true', () => {
    render(
      <Presence show={true} data-testid="presence">
        content
      </Presence>,
    );
    const el = screen.getByTestId('presence');
    expect(el.tagName).toBe('DIV');
    expect(el.dataset.phase).toBe('entered');
  });

  it('returns null when show=false and mode=mount', () => {
    render(
      <Presence show={false} data-testid="presence">
        content
      </Presence>,
    );
    expect(screen.queryByTestId('presence')).toBeNull();
  });

  it('renders children when show=true', () => {
    render(
      <Presence show={true}>
        <span data-testid="child">hello</span>
      </Presence>,
    );
    expect(screen.getByTestId('child').textContent).toBe('hello');
  });

  it('passes className and other div props through', () => {
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

  it('forwards ref via useImperativeHandle', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Presence show={true} ref={ref} data-testid="presence">
        content
      </Presence>,
    );
    expect(ref.current).toBe(screen.getByTestId('presence'));
  });

  it('mode=reveal: div stays in DOM even when show=false', () => {
    render(
      <Presence show={false} mode="reveal" data-testid="presence">
        content
      </Presence>,
    );
    const el = screen.getByTestId('presence');
    expect(el).toBeTruthy();
    expect(el.dataset.phase).toBe('idle');
  });
});
