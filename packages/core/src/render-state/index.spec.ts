// Browser event coverage lives in index.browser.spec.ts. Keep only deterministic
// policy and teardown scenarios here.
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
    const render = createRenderState({ target: el });
    expect(render.phase).toBe('rendered');
    render.stop();
  });

  it('does not fire when the phase is unchanged', () => {
    const el = document.createElement('div');
    const cb = vi.fn();
    const render = createRenderState({ target: el, onPhaseChange: cb });

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
    const render = createRenderState({ target: el, onPhaseChange: cb });

    render.stop();
    dispatchStateChange(el, true);

    expect(cb).not.toHaveBeenCalled();
  });

  it('stop() is idempotent', () => {
    const el = document.createElement('div');
    const render = createRenderState({ target: el });
    expect(() => {
      render.stop();
      render.stop();
    }).not.toThrow();
  });

  it('aborting the signal stops the observer', () => {
    const el = document.createElement('div');
    const cb = vi.fn();
    const controller = new AbortController();
    createRenderState({
      target: el,
      onPhaseChange: cb,
      signal: controller.signal,
    });

    controller.abort();
    dispatchStateChange(el, true);

    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe('guards', () => {
  it('throws without an element', () => {
    expect(() =>
      createRenderState({ target: null as unknown as Element }),
    ).toThrow();
  });

  it('throws on the server', async () => {
    vi.stubGlobal('document', undefined);
    const { createRenderState: ssrCreate } = await import('.');
    expect(() => ssrCreate({ target: {} as Element })).toThrow(/server/i);
    vi.unstubAllGlobals();
    vi.resetModules();
  });
});
