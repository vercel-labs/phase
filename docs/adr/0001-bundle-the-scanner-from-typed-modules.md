# Bundle the scanner from typed modules

## Context

The scanner needed to be split into typed modules so its internal areas could be changed and tested safely. Users still needed one dependency-free script with the same installed layout.

## Decision

Keep scanner source as TypeScript modules under `scanner/`. A pinned tsdown build creates the committed `skills/phase/scripts/scan.mjs` file, and CI verifies that the generated file is current and repeatable. Users still receive one ESM file runnable with `node scan.mjs`, using only `node:` builtins and reading metadata from `../metadata.json`.

## Reason

Keeping types and code together prevents them from drifting apart and lets each internal area be tested independently. Keeping source at the repository root also avoided tying it to either the installed skill folder or a possible future package layout.

## Consequences

Contributors edit the TypeScript source, not the generated script. Updating the pinned bundler can change the output and requires review. Consumers receive only the generated file.

Implemented by [PR #46](https://github.com/vercel-labs/phase/pull/46) and [PR #47](https://github.com/vercel-labs/phase/pull/47).
