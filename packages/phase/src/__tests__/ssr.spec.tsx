// @vitest-environment node
//
// Runs with no DOM at all, which is the condition that matters: a client
// component still renders on the server for the initial HTML. Anything that
// touches a browser global outside an effect throws here, and effects never run
// during `renderToString`, so this proves the render path is clean.
//
// This exists because `useScroll({ target: document })` shipped and threw during
// server rendering: hook options are built while the component renders, so the
// literal `document` raised a ReferenceError before the hook was ever called.
// Types stop a TS caller passing a Document; only rendering proves SSR safety.

import { useRef } from 'react';
import { renderToString } from 'react-dom/server';

import {
  clamp,
  clamp01,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  easeOutQuart,
  inverseLerp,
  lerp,
  linear,
  remap,
} from '../ease';
import {
  createDebounce,
  createDevicePixelRatio,
  createLifecycle,
  createLoop,
  createMutation,
  createPointer,
  createRenderState,
  createScroll,
  createScrollProgress,
  createSight,
  createThrottle,
  createTicker,
  isPhaseError,
  PhaseError,
  prefersReducedMotion,
  whenIdle,
} from '../index';
import {
  Defer,
  Presence,
  Swap,
  WhenIdle,
  WhenVisible,
  useCanvas,
  useContainerQuery,
  useDebouncedCallback,
  useDevicePixelRatio,
  useIdle,
  useLifecycle,
  useLoop,
  useMediaQuery,
  useMutation,
  usePointer,
  usePrefersReducedMotion,
  usePresence,
  useRenderState,
  useScroll,
  useScrollProgress,
  useSight,
  useSize,
  useStableCallback,
  useSyncedRef,
  useThrottledCallback,
  useTween,
  useWhenIdle,
} from '../react';

/** No DOM here at all; that is the point. */
function assertNoDom(): void {
  expect(typeof document).toBe('undefined');
  expect(typeof window).toBe('undefined');
}

describe('server rendering', () => {
  it('has no DOM globals', () => {
    assertNoDom();
  });

  describe('page targets render on the server', () => {
    it('useScroll', () => {
      function C(): React.ReactNode {
        useScroll({ target: 'page', onScroll: () => undefined });
        return 'ok';
      }
      expect(renderToString(<C />)).toContain('ok');
    });

    it('useSight', () => {
      function C(): React.ReactNode {
        const { phase } = useSight({ target: 'page' });
        return phase;
      }
      expect(renderToString(<C />)).toContain('unknown');
    });

    it('useLifecycle', () => {
      function C(): React.ReactNode {
        const { phase } = useLifecycle({ target: 'page' });
        return phase;
      }
      expect(renderToString(<C />)).toContain('idle');
    });

    it('useLoop', () => {
      function C(): React.ReactNode {
        const { phase } = useLoop({ target: 'page', onTick: () => undefined });
        return phase;
      }
      expect(renderToString(<C />)).toContain('idle');
    });
  });

  describe('element targets render on the server', () => {
    it('renders every ref-based hook', () => {
      function C(): React.ReactNode {
        useScroll({ onScroll: () => undefined });
        useSight();
        useLifecycle();
        useLoop({ onTick: () => undefined });
        useScrollProgress();
        usePointer({ onPointer: () => undefined });
        useMutation({
          mutation: { attributes: true },
          onMutations: () => undefined,
        });
        useSize();
        useRenderState(useRef<HTMLDivElement>(null));
        useContainerQuery({ minWidth: 400 });
        return 'ok';
      }
      expect(renderToString(<C />)).toContain('ok');
    });

    it('renders the canvas hook', () => {
      function C(): React.ReactNode {
        const containerRef = useRef<HTMLDivElement>(null);
        const canvasRef = useRef<HTMLCanvasElement>(null);
        useCanvas({ containerRef, canvasRef, draw: () => undefined });
        return (
          <div ref={containerRef}>
            <canvas ref={canvasRef} />
          </div>
        );
      }
      expect(renderToString(<C />)).toContain('canvas');
    });
  });

  describe('hooks that read environment state render on the server', () => {
    it('media, DPR, reduced motion, idle and timing hooks', () => {
      function C(): React.ReactNode {
        const wide = useMediaQuery('(min-width: 400px)');
        const dpr = useDevicePixelRatio();
        const reduced = usePrefersReducedMotion();
        const idle = useIdle();
        const value = useTween({ to: 1 });
        useWhenIdle(() => undefined);
        useThrottledCallback(() => undefined, { interval: 100 });
        useDebouncedCallback(() => undefined, { wait: 100 });
        return `${String(wide)}|${String(dpr)}|${String(reduced)}|${String(idle)}|${String(value)}`;
      }
      // Defaults, not a crash: false for queries, 1 for DPR, the tween target.
      expect(renderToString(<C />)).toContain('false|1|false|false|1');
    });
  });

  describe('composition components render on the server', () => {
    it('Defer keeps children in the server HTML', () => {
      // Defer is the SSR-safe render-gating primitive: content must be present.
      expect(renderToString(<Defer>deferred content</Defer>)).toContain(
        'deferred content',
      );
    });

    it('WhenVisible and WhenIdle render their fallback, not their children', () => {
      const visible = renderToString(
        <WhenVisible fallback={<span>reserved</span>}>gated</WhenVisible>,
      );
      expect(visible).toContain('reserved');
      expect(visible).not.toContain('gated');

      const idle = renderToString(
        <WhenIdle fallback={<span>reserved</span>}>gated</WhenIdle>,
      );
      expect(idle).toContain('reserved');
      expect(idle).not.toContain('gated');
    });

    it('Presence and Swap render', () => {
      expect(renderToString(<Presence show>shown</Presence>)).toContain(
        'shown',
      );
      expect(
        renderToString(
          <Swap active="a">
            <Swap.State id="a">first</Swap.State>
          </Swap>,
        ),
      ).toContain('first');
    });

    it('usePresence renders', () => {
      function C(): React.ReactNode {
        const { mounted } = usePresence({ show: true });
        return mounted ? 'mounted' : 'absent';
      }
      expect(renderToString(<C />)).toContain('mounted');
    });
  });
});

describe('core primitives on the server', () => {
  it('refuse with server_context rather than a raw ReferenceError', () => {
    const primitives = {
      createSight,
      createLoop,
      createLifecycle,
      createScroll,
      createPointer,
      createMutation,
      createRenderState,
      createScrollProgress,
      createTicker,
      createDevicePixelRatio,
      createThrottle,
      createDebounce,
      whenIdle,
    };

    for (const [name, factory] of Object.entries(primitives)) {
      let outcome = 'no throw';
      try {
        (factory as (arg: unknown, delay?: unknown) => unknown)(
          () => undefined,
          16,
        );
      } catch (error) {
        // instanceof as well as the guard: the real class has to survive the
        // module boundary, or consumers cannot catch it by type.
        expect(error).toBeInstanceOf(PhaseError);
        outcome = isPhaseError(error) ? error.code : `raw: ${String(error)}`;
      }
      // A raw ReferenceError would mean the primitive touched a global before
      // checking for one, which is the failure this guard exists to prevent.
      expect({ name, outcome }).toEqual({ name, outcome: 'server_context' });
    }
  });

  it('reports no reduced-motion preference without matchMedia', () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('the ease entry point is pure', () => {
  it('imports and computes with no DOM present', () => {
    assertNoDom();
    // README promises importing `phase/ease` in a server component pulls zero
    // browser APIs; this is that promise as a test.
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp01(2)).toBe(1);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(inverseLerp(0, 10, 5)).toBe(0.5);
    expect(
      remap({ value: 5, inMin: 0, inMax: 10, outMin: 0, outMax: 100 }),
    ).toBe(50);
    expect(linear(0.4)).toBe(0.4);
    for (const easing of [
      easeOutCubic,
      easeOutQuart,
      easeOutBack,
      easeInOutCubic,
    ]) {
      expect(Number.isFinite(easing(0.5))).toBe(true);
    }
  });
});

describe('utility hooks render on the server', () => {
  it('useSyncedRef and useStableCallback', () => {
    function C(): React.ReactNode {
      const synced = useSyncedRef('value');
      const stable = useStableCallback(() => undefined);
      expect(synced.current).toBe('value');
      expect(typeof stable).toBe('function');
      return 'utils';
    }
    expect(renderToString(<C />)).toContain('utils');
  });
});
