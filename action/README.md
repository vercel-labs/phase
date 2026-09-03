# phase GitHub Action

Run phase's deterministic scanner in pull requests without installing an npm package. The action uses the scanner committed at the same repository ref, requires Node.js 22 or newer, and writes its report to the GitHub job summary.

## Usage

```yaml
name: phase

on:
  pull_request:
    paths:
      - 'src/**'

permissions:
  contents: read

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: vercel-labs/phase/action@v0
        with:
          targets: src
          fail-on: critical
          noise: precise
          annotations: true
```

`ubuntu-latest` provides a compatible Node.js version. If an earlier step replaces it with Node.js 20 or older, run phase before that step or in a separate job. phase is developed on Node.js 24 and supports Node.js 22 or newer.

The scan job needs only `contents: read`. Job summaries and annotations do not require pull-request write access. If a later workflow posts a PR comment, run that operation in a separate job that neither checks out nor executes pull-request code.

## Inputs

| Input         | Default       | Description                                                                                       |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `fail-on`     | `critical`    | Exit 1 when a new finding meets `critical`, `high`, or `medium`; use `none` for report-only mode. |
| `noise`       | `precise`     | Report only `precise`, `normal`, or `noisy` findings.                                             |
| `baseline`    | Auto-detected | Optional baseline path. Relative paths resolve from the workflow's working directory.             |
| `targets`     | `.`           | Space-separated files or directories. Paths containing whitespace are not supported.              |
| `annotations` | `true`        | Set to `false` for a summary without inline annotations.                                          |

The scanner auto-detects `phase-baseline.json` at the scan root. With a baseline, `fail-on` evaluates only new findings. Without one, every finding is new. Use a workflow `paths:` filter and scoped `targets` to limit the files scanned; this action does not expose the scanner's Git diff mode.

## Action-free workflow

Some organizations allow GitHub's checkout action but not third-party actions. A second checkout provides the same scanner without invoking this composite action. Pin the phase checkout to a reviewed 40-character commit SHA rather than a branch or floating tag.

```yaml
name: phase

on:
  pull_request:
    paths:
      - 'src/**'

permissions:
  contents: read

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/checkout@v6
        with:
          repository: vercel-labs/phase
          ref: FULL_40_CHARACTER_COMMIT_SHA
          path: .phase
          persist-credentials: false
      - name: Scan with phase
        run: >-
          node .phase/skills/phase/scripts/scan.mjs
          --format github
          --fail-on none
          --noise precise
          --no-annotations
          src
```

## Releasing the action

Each release has an immutable full-version tag and a floating major tag. For the first release, tag the merge commit as `v0.1.0`, then point `v0` at the same commit. On later `v0` releases, add a new immutable version tag and move `v0` to that merge commit. Never move a full-version tag.
