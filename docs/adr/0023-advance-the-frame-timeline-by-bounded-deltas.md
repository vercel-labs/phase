# Advance the frame timeline by bounded deltas

## Context

An animation callback reads two numbers each frame: how far to advance right now (`frame.delta`) and how far it has come in total (`frame.elapsed`). The ticker used to bound delta at 40ms while accumulating elapsed from wall-clock time. The two diverged on any stall (a main-thread gap between frames) longer than 40ms, and on every frame under a low FPS cap, because the 40ms bound was borrowed from a library with no per-ticker caps. An animation positioned by delta and a progress bar positioned by elapsed would disagree about where the animation was.

## Decision

`frame.elapsed` advances by exactly the `frame.delta` delivered to each callback, so elapsed is always the sum of delivered deltas. The delta bound is FPS-aware: at most 40ms without a cap, or one FPS interval plus 40ms with a cap, because a capped ticker legitimately waits one interval between deliveries. The first delivery after `start()` or `resume()` reports 16.67ms without a cap or one interval with a cap, since no previous frame exists to measure from. `frame.time` stays the browser's unmodified `requestAnimationFrame` timestamp for code that needs source time.

## Reason

One coherent timeline means the numbers a callback reads never disagree, and a stall steps animations forward by a bounded amount instead of teleporting them. The cost is that elapsed is animation time, not wall-clock time: after a stall, elapsed reads less than a wall clock would. That is the intended trade, and `frame.time` keeps wall-alignment available.

Implemented by [#61](https://github.com/vercel-labs/phase/pull/61).
