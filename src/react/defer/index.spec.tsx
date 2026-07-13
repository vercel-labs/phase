import { render, screen } from '@testing-library/react';
import { createRef } from 'react';

import { Defer } from '.';

describe('Defer component', () => {
  it('renders children', () => {
    render(<Defer data-testid="defer">content</Defer>);
    expect(screen.getByTestId('defer').textContent).toBe('content');
  });

  it('applies content-visibility and a default intrinsic size', () => {
    render(<Defer data-testid="defer">content</Defer>);
    const el = screen.getByTestId('defer');
    expect(el.style.contentVisibility).toBe('auto');
    expect(el.style.containIntrinsicSize).toBe('auto 1000px');
  });

  it('uses the provided estimatedHeight', () => {
    render(
      <Defer data-testid="defer" estimatedHeight="600px">
        content
      </Defer>,
    );
    expect(screen.getByTestId('defer').style.containIntrinsicSize).toBe(
      'auto 600px',
    );
  });

  it('styles via className without exposing a style prop', () => {
    render(
      <Defer data-testid="defer" className="my-section">
        content
      </Defer>,
    );
    const el = screen.getByTestId('defer');
    expect(el.className).toBe('my-section');
    expect(el.style.contentVisibility).toBe('auto');
    expect(el.style.containIntrinsicSize).toBe('auto 1000px');
  });

  it('forwards the ref and extra div props', () => {
    const ref = createRef<HTMLElement>();
    render(
      <Defer ref={ref} data-testid="defer" className="section">
        content
      </Defer>,
    );
    expect(ref.current).toBe(screen.getByTestId('defer'));
    expect(ref.current?.className).toBe('section');
  });

  it('renders as div by default', () => {
    render(<Defer data-testid="defer">content</Defer>);
    expect(screen.getByTestId('defer').tagName).toBe('DIV');
  });

  it('renders as a different element via the as prop', () => {
    render(
      <Defer as="li" data-testid="defer">
        content
      </Defer>,
    );
    const el = screen.getByTestId('defer');
    expect(el.tagName).toBe('LI');
    expect(el.style.contentVisibility).toBe('auto');
  });

  it('renders as section with custom estimatedHeight', () => {
    render(
      <Defer as="section" data-testid="defer" estimatedHeight="200px">
        content
      </Defer>,
    );
    const el = screen.getByTestId('defer');
    expect(el.tagName).toBe('SECTION');
    expect(el.style.containIntrinsicSize).toBe('auto 200px');
  });

  it('forwards ref with a custom element type', () => {
    const ref = createRef<HTMLElement>();
    render(
      <Defer as="article" ref={ref} data-testid="defer">
        content
      </Defer>,
    );
    expect(ref.current).toBe(screen.getByTestId('defer'));
    expect(ref.current?.tagName).toBe('ARTICLE');
  });
});
