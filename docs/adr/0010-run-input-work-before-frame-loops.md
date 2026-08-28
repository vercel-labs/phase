# Run input work before frame loops

## Context

Event-derived work and frame loops used to request separate animation frames. Two callbacks raced every frame, and the winner changed with request order. A frame loop could therefore read either this-frame input or last-frame input.

## Decision

The shared clock has two stages: input, then tick. Pointer, scroll, mutation, and throttle flushes run in the input stage. Frame-loop callbacks run in the tick stage. Input queued before frame dispatch begins is eligible for that frame and runs before every eligible tick callback. Input queued during either stage runs in the next frame. Order within either stage is not part of the contract.

An input callback error does not prevent other input or tick callbacks from running. The clock rethrows the first input error after both stages complete. A tick callback error retains existing ticker behavior: it aborts the remaining tick callbacks and takes precedence over a deferred input error.

## Reason

One fixed boundary makes event-derived state current before frame logic reads it, without adding a public scheduler or a larger read-update-render ladder. One-shot input subscriptions preserve zero scheduling cost while idle.
