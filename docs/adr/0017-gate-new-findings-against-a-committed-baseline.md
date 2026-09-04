# Gate new findings against a committed baseline

## Context

Turning the scanner into a PR gate on an existing codebase fails on day one: every pre-existing finding blocks the first gated change. Identifying findings by file and line number does not help, because unrelated edits move lines and would make old findings look new.

## Decision

Every JSON finding carries a fingerprint built from its signal, file, a twelve-character SHA-256 prefix of the whitespace-normalized source line, and an occurrence index for identical lines in the same file. A committed baseline file records the fingerprints a repository has accepted; when one is present, `--fail-on` counts only new findings, and pre-existing findings are reported without failing the gate.

A baseline entry with no matching finding in the current scan is stale. Staleness is passive: every summary shows the stale count, nothing fails because of it, and only `--write-baseline` prunes stale entries. A version difference between the baseline and the running scanner warns and never fails.

## Reason

Adopting the gate requires no cleanup: commit a baseline and only regressions fail. Fingerprints survive the edits that move code without changing it, while the occurrence index keeps repeated identical lines distinct. Passive staleness keeps bookkeeping out of the gate, so a baseline refresh is a deliberate, reviewable commit instead of a side effect of someone's PR.

Implemented by [PR #76](https://github.com/vercel-labs/phase/pull/76).
