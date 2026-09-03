# phase command

> **Status: pre-release.** This package remains private until it is renamed from `@usephase/cli` to `phase` for publication.

`phase` scans JavaScript, TypeScript, and CSS for animation and rendering performance findings. Findings identify source locations that need review; they are not confirmed defects.

After this package is published as `phase`, scan committed files changed since the merge base with `origin/main`:

```bash
npx phase scan --diff origin/main
```

Or scan explicit files and directories:

```bash
npx phase scan src components/animated-card.tsx
```

Explain a reported signal and its recommended fix:

```bash
npx phase explain setstate-in-raf
```

Run `npx phase --help` for all scan, baseline, filter, and output options.
