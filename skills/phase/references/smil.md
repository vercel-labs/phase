# SVG SMIL lifecycle and reduced motion

Keep SVG SMIL browser-managed when `<animate>`, `<animateMotion>`, or `<animateTransform>` already describes the timeline. Add phase only as the `when` layer: reduced motion chooses static output, and `useLifecycle` controls the owning SVG root.

## Choose the owner

- Keep SMIL for an existing declarative SVG attribute timeline.
- Use CSS or WAAPI for an HTML transform or opacity timeline.
- Use `useLoop` only when values depend on live input or simulation state.

React does no per-frame work in the SMIL branch.

## Core recipe

Render meaningful static SVG attributes outside `<animate*>`. Use `begin="indefinite"` so server output cannot move before client visibility and motion preferences are known. Start once when lifecycle becomes active, then pause or resume the root timeline without restarting it.

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useLifecycle, usePrefersReducedMotion } from 'phase/react';

export function StatusPulse() {
  const svgRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<SVGAnimateElement>(null);
  const hasBegunRef = useRef(false);
  const reducedMotion = usePrefersReducedMotion();
  const { isActive } = useLifecycle({
    ref: svgRef,
    onPhaseChange: (phase) => {
      if (phase !== 'active') svgRef.current?.pauseAnimations?.();
    },
  });

  useEffect(() => {
    const svg = svgRef.current;
    if (
      !svg ||
      typeof svg.pauseAnimations !== 'function' ||
      typeof svg.unpauseAnimations !== 'function'
    ) {
      return;
    }

    if (reducedMotion || !isActive) {
      if (reducedMotion) hasBegunRef.current = false;
      svg.pauseAnimations();
      return;
    }

    svg.unpauseAnimations();
    const animation = animationRef.current;
    if (
      !hasBegunRef.current &&
      animation &&
      typeof animation.beginElement === 'function'
    ) {
      animation.beginElement();
      hasBegunRef.current = true;
    }
  }, [isActive, reducedMotion]);

  return (
    <svg ref={svgRef} viewBox="0 0 24 24" aria-label="Loading">
      <circle cx="12" cy="12" r="4">
        {!reducedMotion && (
          <animate
            ref={animationRef}
            attributeName="r"
            values="4;8;4"
            begin="indefinite"
            dur="1.2s"
            repeatCount="indefinite"
          />
        )}
      </circle>
    </svg>
  );
}
```

`usePrefersReducedMotion()` returns `false` during SSR and initial hydration. Conditional omission alone therefore cannot prevent first-paint motion from an auto-starting SMIL element; the inert `begin="indefinite"` state closes that gap. If root control is unsupported, the effect leaves this state static.

## Delayed imperative starts

Keep the immediate start above unless existing behavior requires a delayed `beginElement()`. For that branch, schedule the timer only after the root API checks and active-lifecycle checks pass. Extend `onPhaseChange` to clear the timer synchronously, and recheck eligibility when the callback runs:

```tsx
const timerRef = useRef<number | null>(null);
const playbackAllowedRef = useRef(false);

function clearBeginTimer() {
  if (timerRef.current === null) return;
  window.clearTimeout(timerRef.current);
  timerRef.current = null;
}

// In onPhaseChange:
playbackAllowedRef.current = phase === 'active';
if (phase !== 'active') {
  clearBeginTimer();
  svgRef.current?.pauseAnimations?.();
}

// In the active effect, instead of the immediate beginElement() call:
if (hasBegunRef.current) return;
timerRef.current = window.setTimeout(() => {
  timerRef.current = null;
  const animation = animationRef.current;
  if (
    !playbackAllowedRef.current ||
    svgRef.current !== svg ||
    !animation ||
    typeof animation.beginElement !== 'function'
  ) {
    return;
  }
  animation.beginElement();
  hasBegunRef.current = true;
}, 600);
return clearBeginTimer;
```

The root identity check prevents a stale timer from starting a replacement SVG. `hasBegunRef` prevents pause/resume from scheduling a second start. Effect cleanup handles unmount.

## Compatibility boundary

Feature-detect root pause/resume and imperative start methods. Root pause before begin, position-preserving resume, finite completion, and timer cleanup were verified in Chromium and Firefox. Safari and real background-tab behavior were not verified. Test the product's supported browser matrix before claiming parity, and do not depend on the browser pausing background or off-screen SMIL by itself.

## Completion checklist

- Static SVG remains meaningful without `<animate*>`.
- Server output cannot auto-start before motion preference is known.
- One SVG root owns pause and resume.
- Reduced motion omits animation instead of reducing repetitions.
- Delayed starts are canceled on pause and teardown.
- Missing root APIs leave output static.
- React performs no per-frame work.
- Compatibility claims match retained browser evidence.

## See also

- [useLifecycle](./use-lifecycle.md). Supplies the root active/paused decision
- [usePrefersReducedMotion](./use-prefers-reduced-motion.md). Reacts to preference changes
- [timed sequences](./timed-sequences.md). Chooses browser timing before JavaScript timers
- [audit](./audit.md). Classifies `svg-smil-animation` findings
