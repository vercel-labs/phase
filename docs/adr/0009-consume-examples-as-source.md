# Consume examples as source

## Context

The examples corpus must supply verbatim consumer code to documentation and generated snippets while also mounting unchanged in the cross-browser harness. A separate build output would create a second representation and require every downstream adapter to coordinate with another build lifecycle.

## Decision

Keep `@usephase/examples` as raw TypeScript and TSX source with no build task. Downstream applications transpile the corpus, while imports of `phase` continue through its public exports map to the built `packages/phase/dist` output. The generated manifest is the runtime mounting seam; stable source paths are the snippet seam.

## Reason

One source representation keeps rendered behavior and published snippets together while exercising `phase` through the same package interface consumers use. The small source interface also lets future tools wrap the corpus without making their runtime part of the examples contract.

## Considered options

- Building a corpus `dist` directory would decouple applications from its TypeScript settings, but would add build ordering and make generated output compete with source as the canonical snippet representation.
- Storybook, Ladle, and React Cosmos provide component catalogs, but their story formats and preview runtimes are not verbatim consumer code. Preview frames also alter the viewport environment used to verify IntersectionObserver, animation-frame, and reduced-motion behavior. They may consume the corpus later as adapters.
- Sandpack supports editable documentation playgrounds, but does not replace the deterministic bare-page browser harness. It may also consume the corpus later as a documentation adapter.

## Consequences

Applications consuming `@usephase/examples` must transpile workspace source. Browser-test and documentation tools remain optional adapters rather than dependencies of the corpus.
