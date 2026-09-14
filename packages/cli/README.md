# phase

`phase` scans JavaScript, TypeScript, and CSS for animation and rendering performance findings. Findings identify source locations that need review; they are not confirmed defects.

Scan committed files changed since the merge base with `origin/main`:

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

Read the [full documentation](https://github.com/vercel-labs/phase#readme), review the [changelog](https://github.com/vercel-labs/phase/blob/main/packages/cli/CHANGELOG.md), or see the [MIT license](https://github.com/vercel-labs/phase/blob/main/packages/cli/LICENSE).
