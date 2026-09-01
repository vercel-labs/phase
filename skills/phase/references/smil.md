# SVG SMIL lifecycle and reduced motion

Use browser-managed SVG SMIL (`<animate>`, `<animateMotion>`, or `<animateTransform>`) for a declarative SVG timeline, then use `useLifecycle` to decide when the owning SVG root may play. SMIL does not inherit CSS `animation-play-state`, and browsers do not make it respect `prefers-reduced-motion` automatically.

## When to use

- Existing SVG artwork already expresses its timeline with SMIL.
- A browser-managed SVG attribute animation is simpler than per-frame JavaScript.
- The animation must pause when its SVG is off-screen or the document is hidden.

## When not to use

| Instead of SMIL                                 | Use                                          |
| ----------------------------------------------- | -------------------------------------------- |
| An HTML transform or opacity timeline           | CSS animation or WAAPI                       |
| Values depend on live input or simulation state | `useLoop` with direct DOM writes             |
| A spring or gesture owns the timeline           | Motion, GSAP, or the existing gesture system |

## Lifecycle recipe

Keep one owner: attach `useLifecycle` to the `<svg>` root and pause or resume the root's SMIL timeline. Keep a delayed `beginElement()` under the same lifecycle owner so pause and teardown clear its timer.

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useLifecycle, usePrefersReducedMotion } from 'phase/react';

export function RouteIndicator() {
  const svgRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<SVGAnimateElement>(null);
  const hasBegunRef = useRef(false);
  const playbackAllowedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  function clearBeginTimer() {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  const { isActive } = useLifecycle({
    ref: svgRef,
    onPhaseChange: (phase) => {
      playbackAllowedRef.current = phase === 'active';
      if (phase === 'active') return;
      clearBeginTimer();
      svgRef.current?.pauseAnimations?.();
    },
  });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (
      typeof svg.pauseAnimations !== 'function' ||
      typeof svg.unpauseAnimations !== 'function'
    ) {
      return;
    }

    if (reducedMotion) {
      playbackAllowedRef.current = false;
      hasBegunRef.current = false;
      clearBeginTimer();
      svg.pauseAnimations();
      return;
    }

    if (!isActive) {
      playbackAllowedRef.current = false;
      clearBeginTimer();
      svg.pauseAnimations();
      return;
    }

    playbackAllowedRef.current = true;
    svg.unpauseAnimations();
    if (hasBegunRef.current) return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const currentSvg = svgRef.current;
      const animation = animationRef.current;
      if (
        !playbackAllowedRef.current ||
        currentSvg !== svg ||
        typeof currentSvg.pauseAnimations !== 'function' ||
        typeof currentSvg.unpauseAnimations !== 'function' ||
        !animation ||
        typeof animation.beginElement !== 'function'
      ) {
        return;
      }
      animation.beginElement();
      hasBegunRef.current = true;
    }, 600);

    return clearBeginTimer;
  }, [isActive, reducedMotion]);

  return (
    <svg ref={svgRef} viewBox="0 0 120 24" aria-label="Loading route">
      <path d="M4 12 C32 2 88 22 116 12">
        {!reducedMotion && (
          <animate
            ref={animationRef}
            attributeName="d"
            values="M4 12 C32 2 88 22 116 12;M4 12 C32 22 88 2 116 12;M4 12 C32 2 88 22 116 12"
            begin="indefinite"
            dur="1.8s"
            repeatCount="indefinite"
          />
        )}
      </path>
    </svg>
  );
}
```

`begin="indefinite"` keeps server output and initial hydration static. `usePrefersReducedMotion()` initially returns `false`, so conditional omission alone cannot prevent first-paint motion from an auto-starting SMIL element. The lifecycle starts the inert element only after client-side visibility and reduced-motion signals allow playback.

Once playback has begun, a pause clears no animation state. `unpauseAnimations()` resumes the root timeline from its paused position, and `hasBegunRef` prevents the delayed start from restarting it. `onPhaseChange` clears the timer synchronously when lifecycle pauses; the timer also rechecks eligibility at its deadline. The next active phase schedules a canceled start again.

## Reduced motion

Render the meaningful static SVG attributes outside the animation element and omit `<animate*>` while reduced motion is preferred. Changing `repeatCount="indefinite"` to a finite count still plays motion and does not satisfy the preference.

The inert `begin="indefinite"` first paint is required for server-rendered React because the server cannot know the client preference. For client-only SVG, conditional omission is sufficient once the preference is known.

## Browser compatibility

Feature-detect root control (`svg.pauseAnimations` and `svg.unpauseAnimations`) and imperative starts (`animation.beginElement`). If root control is missing, keep the static output rather than claiming lifecycle gating works.

Browser verification on 2026-09-01 produced this bounded evidence:

| Environment                                  | Pause before delayed begin                                                           | Pause/resume                                                                      | Finite completion                                                        | Background visibility                                                               | Unmount timer cleanup |
| -------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------------------- |
| Chromium 151 (Playwright Chrome for Testing) | An imperative begin stayed inert while the root was paused and advanced after resume | The SVG root time stopped and continued without resetting                         | A completed `fill="freeze"` animation did not restart after pause/resume | Headless tab switching did not change `document.hidden`; no browser-autopause claim | Passed                |
| Firefox 153 (Playwright)                     | An imperative begin stayed inert while the root was paused and advanced after resume | Root time and the animated value stopped, then continued from the paused position | A completed `fill="freeze"` animation did not restart after pause/resume | Headless tab switching did not change `document.hidden`; no browser-autopause claim | Passed                |
| Safari 26.5                                  | Not verified: Safari remote automation was disabled on the test host                 | Not verified                                                                      | Not verified                                                             | Not verified                                                                        | Not verified          |

These results do not establish universal parity. Test supported production browsers, finite-fill choices, preference changes, real tab backgrounding, and component teardown before making stronger compatibility claims. `useLifecycle` supplies the visibility decision; do not depend on a browser pausing off-screen or background SMIL by itself.

## Avoid

- Driving SMIL values through React state or a requestAnimationFrame loop. Keep playback browser-managed.
- Calling pause/resume on each animation child. The `<svg>` root owns one timeline.
- Scheduling `beginElement()` outside lifecycle-owned cleanup.
- Adding a `useSmilLifecycle` wrapper. `useLifecycle` already supplies the active/paused decision.

## See also

- [useLifecycle](./use-lifecycle.md). Supplies the root's active/paused decision
- [usePrefersReducedMotion](./use-prefers-reduced-motion.md). Reacts when the user changes the preference
- [timed sequences](./timed-sequences.md). Chooses browser-managed timelines before JavaScript timers
- [audit](./audit.md). Classifies `svg-smil-animation` scanner findings
