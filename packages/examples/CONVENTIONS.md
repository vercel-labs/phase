# Example rules

`@usephase/examples` is the main set of React examples used in documentation, browser tests, generated snippets, and tests of agent behavior. Each tool uses the same examples but keeps its own checks.

[`CONTEXT.md`](../../CONTEXT.md#examples) defines example, variant, example slug, manifest, example metadata, and predictable output.

## File rules

- Give each phase export its own kebab-case directory: `packages/examples/<export-kebab>/`.
- Give each variant a kebab-case TSX file. Its example slug is `<export-kebab>/<variant>`, such as `use-loop/basic`.
- Every variant starts with `'use client'` and exports one React component as its default.
- Every component includes everything it needs, takes no props, and follows the predictable output rules.
- Every directory has a `meta.ts` file that exports one `ExampleMeta` object by default. It lists the title, description, and phase exports shown. Variant names come from filenames and the generated manifest, so do not repeat them in metadata.
- Run `pnpm --filter @usephase/examples generate-manifest` after adding, renaming, or removing a variant. The command checks these rules and writes `manifest.ts` in example-slug order.

## Rendering rules

- An example must work in any MDX page and on a plain browser test page. It must not depend on a surrounding theme, layout, global stylesheet, or CSS build step.
- Use inline styles or a scoped `<style>` element. For transitions controlled by attributes, use a stable class name that is unique within the examples package, such as `.phx-presence-basic`.
- Do not use `Math.random()`, `Date.now()`, or text that changes with the user's locale or time zone. Numbers may change as an animation runs, but the rendered HTML, attributes, class names, and text must otherwise stay predictable.
- Interactive examples must use visible buttons with clear labels. Do not add hidden controls, debug counters, `data-testid` attributes, or other code used only by tests.
- Tools may inspect the `data-phase` and `data-enter` attributes added by the library. Examples must not contain test assertions.
- Examples for core primitives must still export React components. Create the primitive in a React effect and stop it during cleanup so every tool renders examples in the same way.

## Phase rules

- Keep frame callbacks allocation-free. Do not create objects, arrays, strings, or closures inside `onTick` or `draw`.
- Never call React state setters from `onTick` or `draw`. You may use React state to display status changes because those changes are infrequent and happen outside frame callbacks.
- Never read element size or position in a frame callback because that can force the browser to recalculate layout. Use the dimensions provided by phase.
- Keep reduced-motion behavior at the library default unless the example specifically demonstrates an override.
- A `WhenVisible` fallback must reserve the exact height of the final content in normal page layout. If a page needs extra space to demonstrate scrolling, the page supplies that space instead of the example.
- A `Defer` example uses an `estimatedHeight` close to its actual height and avoids decoration that extends outside the element and would be cut off.
