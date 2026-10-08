#!/usr/bin/env bash
set -euo pipefail

if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --shell bash)"
  fnm use --install-if-missing
fi

node --eval '
  if (process.versions.node.split(".")[0] !== "24") {
    console.error("Phase setup requires Node.js 24 (see .nvmrc).");
    process.exit(1);
  }
'

corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm --filter @usephase/core exec playwright install chromium firefox webkit
