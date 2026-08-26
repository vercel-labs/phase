# Use example source files directly

## Context

Documentation and generated snippets must show the exact example source code. The browser test page must render those same files without changes. Building the examples first would create a second copy and force each tool to wait for that build.

## Decision

Keep `@usephase/examples` as TypeScript and TSX source and do not add a build step. Each application compiles these source files itself. Imports from `phase` still use its public interface and load the built files from `packages/phase/dist`. Tools load examples through the generated manifest when they run. Tools that publish snippets read the source files directly.

## Reason

Using one set of source files keeps rendered examples and published snippets in sync. It also tests `phase` through the same public interface that users rely on. Future tools can use the examples without becoming required dependencies.

## Considered options

- Building `@usephase/examples` into a `dist` directory would let applications ignore its TypeScript settings. However, tools would need to wait for that build, and it would be unclear whether snippets should come from source or generated files.
- Storybook, Ladle, and React Cosmos organize and preview components, but their story files are not the exact code users write. Their preview frames also change the browser area used to test IntersectionObserver, animation frames, and reduced motion. These tools could use the examples later.
- Sandpack provides editable examples in documentation, but it cannot replace a predictable browser test page with no surrounding application. It could use the examples later.

## Consequences

Applications that use `@usephase/examples` must compile its TypeScript and TSX files. Browser-test and documentation tools can use the examples, but the examples package does not depend on them.
