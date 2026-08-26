# Share one clock across duplicate phase copies

## Context

A JavaScript global can accidentally contain two copies of phase, for example when independently deployed components bundle it separately. Each copy previously kept its frame clock in module state, so they ran separate `requestAnimationFrame` loops without a shared subscriber lifecycle.

## Decision

Copies in the same JavaScript global that use clock protocol version 1 share a minimal clock record through `globalThis[Symbol.for('phase.clock@1')]`. The record contains the subscribers, pending frame ID, frame count, and last timestamp, and phase accesses it only after confirming that `requestAnimationFrame` exists.

`globalThis` is the current JavaScript environment's global object. Modules in the same browser window share it; separate iframe windows do not. `Symbol.for` turns a stable string into a shared property key. A protocol version names the record shape and its behavior. A subscriber is one ticker callback, and the pending frame ID identifies the scheduled browser callback so phase can cancel it.

Any change to the subscriber shape or join and leave behavior must use the key `phase.clock@2`. Different protocol versions run independent clocks; phase will not adapt between them.

## Reason

The registry gives duplicate copies one native frame callback and deterministic cancellation when the final subscriber leaves. It was selected after meeting the ticket's size gate; the point-in-time measurement evidence belongs in the implementing pull request.

## Consequences

Copies using the same protocol coordinate through one record in their shared JavaScript global. A future incompatible protocol safely falls back to an independent clock instead of risking shared-state corruption.
