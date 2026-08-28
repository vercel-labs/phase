# Share one clock across duplicate phase copies

## Context

The same browser window can load phase more than once. Each copy used to start its own frame loop.

## Decision

Copies in the same browser window share one clock through `globalThis[Symbol.for('phase.clock@1')]`. Phase reads this record only after checking that a browser API that uses the clock is available. The record holds input and ticker callbacks, the scheduled frame ID, the frame count, and the last timestamp.

The `@1` suffix names the clock protocol. During alpha, the record and its subscription behavior may evolve in place under `@1`. Use a new suffix when separately published copies must preserve compatibility across protocol changes; different suffixes run separate clocks.

## Reason

One clock means one native frame callback, deterministic work ordering, and one place to stop scheduling when no work remains. Separate iframe windows still use separate clocks.
