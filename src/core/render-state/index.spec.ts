import { createRenderState } from '.';

function dispatchStateChange(element: Element, skipped: boolean): void {
  const event = new Event('contentvisibilityautostatechange');
  Object.defineProperty(event, 'skipped', { value: skipped });
  element.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// Phase reporting
// ---------------------------------------------------------------------------

describe('phase reporting', () => {
  it('starts rendered', () => {
    const el = document.createElement('div');
    const render = createRenderState({ element: el });
    expect(render.phase).toBe('rendered');
    render.stop();
  });

  it('reports skipped when the browser skips rendering', () => {
    const el = document.createElement('div');
    const cb = vi.fn();
    const render = createRenderState({ element: el, onPhaseChange: cb });

    dispatchStateChange(el, true);

    expect(render.phase).toBe('skipped');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('skipped');
    render.stop();
  });

  it('reports rendered again when the browser resumes', () => {
    const el = document.createElement('div');
    const phases: string[] = [];
    const render = createRenderState({
      element: el,
      onPhaseChange: (p) => phases.push(p),
    });

    dispatchStateChange(el, true);
    dispatchStateChange(el, false);

    expect(phases).toEqual(['skipped', 'rendered']);
    expect(render.phase).toBe('rendered');
    render.stop();
  });

  it('does not fire when the phase is unchanged', () => {
    const el = document.createElement('div');
    const cb = vi.fn();
    const render = createRenderState({ element: el, onPhaseChange: cb });

    dispatchStateChange(el, false); // already rendered
    expect(cb).not.toHaveBeenCalled();

    dispatchStateChange(el, true);
    dispatchStateChange(el, true); // already skipped
    expect(cb).toHaveBeenCalledTimes(1);
    render.stop();
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe('cleanup', () => {
  it('stops firing after stop()', () => {
    const el = document.createElement('div');
    const cb = vi.fn();
    const render = createRenderState({ element: el, onPhaseChange: cb });

    render.stop();
    dispatchStateChange(el, true);

    expect(cb).not.toHaveBeenCalled();
  });

  it('stop() is idempotent', () => {
    const el = document.createElement('div');
    const render = createRenderState({ element: el });
    expect(() => {
      render.stop();
      render.stop();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe('guards', () => {
  it('throws without an element', () => {
    expect(() =>
      createRenderState({ element: null as unknown as Element }),
    ).toThrow();
  });

  it('throws on the server', async () => {
    vi.stubGlobal('document', undefined);
    const { createRenderState: ssrCreate } = await import('.');
    expect(() => ssrCreate({ element: {} as Element })).toThrow(/server/i);
    vi.unstubAllGlobals();
    vi.resetModules();
  });
});
