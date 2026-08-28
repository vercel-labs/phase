# Share one clock across duplicate phase copies

## Context

The same browser window can load phase more than once. Each copy used to start its own frame loop.

## Decision

Copies in the same browser window share one clock through a versioned global record, currently `globalThis[Symbol.for('phase.clock@2')]`. Phase reads this record only after checking that a browser API that uses the clock is available. The record holds input and ticker callbacks, the scheduled frame ID, the frame count, and the last timestamp.

The suffix names the clock protocol. Incompatible record or subscription changes use a new suffix. Different protocol versions run separate clocks instead of interpreting incompatible shared state.

## Reason

One clock means one native frame callback, deterministic work ordering, and one place to stop scheduling when no work remains. Separate iframe windows still use separate clocks.
