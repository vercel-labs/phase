# Run input work before frame loops

## Context

Event-derived work and frame loops used to request separate animation frames. Two callbacks raced every frame, and the winner changed with request order. A frame loop could therefore read either this-frame input or last-frame input.

## Decision

The shared clock has two stages: input, then tick. Pointer, scroll, mutation, and throttle flushes run in the input stage. Frame-loop callbacks run in the tick stage. Every eligible input callback runs before any eligible tick callback in the same frame; order within either stage is not part of the contract.

## Reason

One fixed boundary makes event-derived state current before frame logic reads it, without adding a public scheduler or a larger read-update-render ladder. One-shot input subscriptions preserve zero scheduling cost while idle.
