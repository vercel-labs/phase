# Run scheduling-subject specs in real engines

## Context

Phase depends on browser scheduling and observation semantics that jsdom does not implement. Mocked IntersectionObserver, ResizeObserver, matchMedia, requestAnimationFrame, idle callbacks, and content-visibility events verify phase against a model but cannot expose differences between Chromium, Firefox, and WebKit.

Some tests still need deterministic control over faults or states that headless automation cannot produce, including background tabs, persisted page restores, and device-pixel-ratio changes within one browsing context.

## Decision

Use separate Vitest `unit` and `browser` projects. Run scheduling-subject behavior in the browser project against native APIs in headless Chromium, Firefox, and WebKit on every pull request. Keep deterministic policy, fault injection, server-context behavior, and headless-unreachable scenarios in jsdom.

Split mixed suites into one native browser spec and one residual unit spec. Each behavior exists in exactly one project. Browser specs may dispatch synthetic DOM events when automation cannot produce the platform trigger, but they must not replace the browser API under test with simulated semantics.

## Reason

Real engines verify the contracts most likely to differ in production while residual specs preserve coverage that browser automation cannot drive reliably. The split avoids maintaining duplicate assertions and keeps the default unit suite fast and deterministic.

## Consequences

Contributors must classify tests by subject rather than by module. Browser specs wait for observable outcomes instead of asserting exact callback timing, and CI maintains a separate browser check because local unit validation does not install or launch browsers.
