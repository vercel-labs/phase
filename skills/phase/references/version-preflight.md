# Version preflight

Read this reference only for a selected-path handoff, a newer source version, a possible Phase runtime recommendation, or an update request.

## Selected path changed

Load the selected `SKILL.md` and restart its preflight. Do not merge copies or substitute a newer user copy for a repository pin.

## Newer source version

Name the selected path, installed version, fixed source URL, and newer version. Before an audit, scanner run, ship-readiness review, or baseline update, ask whether to update the selected skill. For other work, mention the newer version once and continue. If the user declines an update, continue and report the selected path and version.

## Runtime coverage

Check runtime coverage only when a Phase primitive is the likely recommendation. Read the selected skill's `metadata.json` and resolve every installed `@usephase/core` and `@usephase/react` version used by the affected code. If coverage is missing or any resolved version differs from `documentedAgainst`, state the drift and ask before giving Phase-specific guidance. Continue generic CSS, browser API, and raw JavaScript work. No installed Phase runtime means this check is not applicable until one is proposed.

## Update request

Name the selected path and fixed source URL, then use the existing skill installer. This skill never downloads, executes, copies, or replaces remote files. Updating a repository copy does not update the user copy, and updating the user copy does not update a repository copy.
