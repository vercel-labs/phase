# Share one clock across duplicate phase copies

## Context

The same browser window can load phase more than once. Each copy used to start its own frame loop.

## Decision

Copies in the same browser window share one clock through `globalThis[Symbol.for('phase.clock@1')]`. Phase reads this record only after checking that `requestAnimationFrame` exists. The record holds ticker callbacks, the scheduled frame ID, the frame count, and the last timestamp.

The `@1` suffix versions the record. If the record or how tickers join and leave changes, use `@2`. Different versions run separate clocks.

## Reason

One clock means one native frame callback and one place to stop it when the final ticker leaves. Separate iframe windows still use separate clocks.
