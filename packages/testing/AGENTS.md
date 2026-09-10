# Testing helper instructions

This private package owns simulated browser APIs shared by core and React unit tests, plus DOM fixtures shared by native browser specs.

- Keep each helper's observable simulation aligned with the browser contract it represents.
- Production packages may use this package only as a development dependency.
- Native browser specs may import only `@usephase/testing/browser`; they must exercise real browser APIs instead of simulated ones.
