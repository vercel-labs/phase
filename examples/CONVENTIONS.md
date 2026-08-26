# Example conventions

`@usephase/examples` is the canonical renderable examples corpus for documentation, browser tests, generated snippets, and agent evaluations. The corpus shares examples across those adapters, but assertions stay in the adapters.

The repository vocabulary for an example, variant, example slug, manifest, example meta, and structural determinism lives in [`CONTEXT.md`](../CONTEXT.md#examples-corpus).

## File contract

- Give each phase export its own kebab-case directory: `examples/<export-kebab>/`.
- Give each variant a kebab-case TSX file. Its example slug is `<export-kebab>/<variant>`, such as `use-loop/basic`.
- Every variant starts with `'use client'` and default-exports one React component.
- Every component is self-contained, requires zero props, and is structurally deterministic.
- Every directory has a `meta.ts` that default-exports an object satisfying `ExampleMeta`. Metadata names the title, description, and phase exports demonstrated. Variant names come from the files and generated manifest, not duplicated metadata.
- Run `pnpm --filter @usephase/examples manifest` after adding, renaming, or removing a variant. The generator checks this structure and writes `manifest.ts` in example-slug order.

## Rendering contract

- An example must render correctly inside an arbitrary MDX page and a bare harness page. Do not rely on a surrounding theme, layout, global stylesheet, or CSS build step.
- Use inline styles or a scoped `<style>` element. Attribute-driven transitions use a deterministic, corpus-unique class such as `.phx-presence-basic`.
- Do not use `Math.random()`, `Date.now()`, locale-dependent output, or timezone-dependent output. Frame elapsed time may change continuous animated values, but it must not change the DOM structure, attributes, class names, or text unpredictably.
- Interactive examples expose visible, human-readable buttons. Do not add hidden controls, debug counters, `data-testid` attributes, or other test residue.
- Library-owned `data-phase` and `data-enter` attributes are the contract surface for adapters. Examples do not add assertions.
- Core primitive variants remain React components. Create the primitive in an effect and stop it in cleanup so every adapter mounts examples through the same interface.

## Phase invariants

- Keep frame callbacks allocation-free. Do not create objects, arrays, strings, or closures inside `onTick` or `draw`.
- Never call React state setters from `onTick` or `draw`. Reactive phase readouts are allowed because phase changes are infrequent and occur outside the frame callback.
- Never read synchronous layout in a frame callback. Use the dimensions phase provides.
- Keep reduced-motion behavior at the library default unless the example specifically demonstrates an override.
- A `WhenVisible` fallback reserves the exact final in-flow height. A page or harness that needs to demonstrate scrolling supplies the surrounding spacer; the example remains the canonical consumer pattern.
- A `Defer` example uses a realistic `estimatedHeight` and avoids decoration that paint containment would clip.
