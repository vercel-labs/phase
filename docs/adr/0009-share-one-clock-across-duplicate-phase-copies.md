# Share one clock across duplicate phase copies

## Context

A page can accidentally contain two copies of phase, for example when independently deployed components bundle it separately. Each copy previously kept its frame clock in module state, so the page ran two `requestAnimationFrame` loops and their timestamps were not guaranteed to stay together.

## Decision

Copies that use clock protocol version 1 share a minimal clock record through `globalThis[Symbol.for('phase.clock@1')]`. The record contains the subscribers, pending frame ID, frame count, and last timestamp, and phase accesses it only after confirming that `requestAnimationFrame` exists.

`globalThis` is the JavaScript object shared across the page. `Symbol.for` turns a stable string into a page-wide property key. A protocol version names the record shape and its behavior. A subscriber is one ticker callback, and the pending frame ID identifies the scheduled browser callback so phase can cancel it.

Any change to the subscriber shape or join and leave behavior must use the key `phase.clock@2`. Different protocol versions run independent clocks; phase will not adapt between them.

## Reason

The registry gives duplicate copies one browser frame and deterministic cancellation when the final subscriber leaves. `pnpm size` measured `createTicker` at 1035 B before and 1102 B after, a 67 B increase below the 80 B gate; transitive sizes changed from 2915 B to 2976 B for `createLoop`, 3218 B to 3278 B for `useLoop`, and 3781 B to 3836 B for `useCanvas`.

## Consequences

Copies using the same protocol coordinate through one page-global record. A future incompatible protocol safely falls back to an independent clock instead of risking shared-state corruption.
