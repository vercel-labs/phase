# Phase runtime harness

This private Next.js application renders `@usephase/examples` for production
end-to-end tests. It has no product navigation, theme, or documentation shell.

## URL contract

- `/` lists every current example slug for contributors.
- `/examples/<example-slug>` renders one example between two scroll spacers.
- Unknown example slugs return 404.

An example slug has two path segments, such as `use-loop/basic`. The complete
URL is `/examples/use-loop/basic`.

## Commands

Run these commands from the repository root:

```bash
pnpm exec turbo run build --filter=@usephase/react
pnpm --filter @usephase/harness dev
pnpm --filter @usephase/e2e test:workspace
pnpm test:e2e
```

Build the runtime packages before starting the development server because the
examples resolve their public `dist` exports. `test:workspace` builds the
harness and runs Playwright against workspace packages for focused development.
`pnpm test:e2e` uses Turbo to build the runtime packages, then builds the app
from isolated packed copies of `@usephase/core` and `@usephase/react`; this is
the release gate.
