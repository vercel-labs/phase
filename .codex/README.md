# Worktree setup

Use Corepack and Node.js 24 (see `.nvmrc`). When fnm is available, setup selects
or installs the version in `.nvmrc`; otherwise, activate Node.js 24 first.
The script uses the pnpm version pinned in `package.json`, installs frozen
dependencies, builds the workspace, and installs Chromium, Firefox, and WebKit
for the browser tests.

Select the `phase` Local Environment when creating a Codex desktop worktree.
For CLI or IDE checkouts, run the same setup from the repository root:

```bash
bash .codex/setup.sh
```

Linux hosts also need Playwright's system dependencies. Install those before
setup using your host's provisioning process; this script installs browsers
without changing system packages.
