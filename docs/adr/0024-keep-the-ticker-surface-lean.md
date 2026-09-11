# Keep the ticker surface lean

## Context

A 2026-08-25 audit compared phase's ticker and frame clock against GSAP's ticker and fastdom. Several of their features had plausible cases here. Each was considered and rejected in that session; this record keeps the next proposal from relitigating them without new evidence.

## Decision

The following stay out of the timing core:

| Considered                                                                                 | Decision | Why                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual tick stepping (advancing the clock by hand, mainly for tests)                       | No       | Tests use fake `requestAnimationFrame`. A public API that exists only for tests fails the admission criteria.                                                                     |
| A delta-ratio helper (delta divided by a target frame interval)                            | No       | It is one division. At most a skill pattern.                                                                                                                                      |
| `once` / `prioritize` subscription flags (run a callback one time, or earlier than others) | No       | Loops own their callbacks, and the input-before-tick stages ([ADR 0010](./0010-run-input-work-before-frame-loops.md)) solve ordering structurally.                                |
| Configurable lag smoothing (tunable thresholds for how the timeline absorbs a stall)       | No       | One zero-config bound covers it ([ADR 0023](./0023-advance-the-frame-timeline-by-bounded-deltas.md)).                                                                             |
| try/catch around callback dispatch                                                         | No       | Deliberate hot-path rule. Errors surface through the animation frame to `window.onerror`; input-stage error semantics are in ADR 0010.                                            |
| `useTween` on the shared clock                                                             | No       | A tween is finite and self-completing and needs no cross-loop synchronization. Joining the shared clock would add bundle cost without benefit; the rationale lives in its source. |
| Global pause / time-scale devtools hooks                                                   | Not now  | Speculative. A real devtools need would get its own proposal.                                                                                                                     |

## Reason

Every export must earn its size and its support burden. These features solve problems phase either solves structurally, does not have, or does not have yet.
