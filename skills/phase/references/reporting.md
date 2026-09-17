# Audit reporting

Read this file only after every finding and opportunity has been classified and
blast-radius checked. It controls how to turn that work into a report. It does
not change what the audit covers or how findings are judged.

## What the report must do

A reader should be able to answer these questions in about a minute:

1. Which audit scopes ran, and which were unavailable?
2. Is the requested page or component affected?
3. When does the problem run?
4. Which scope owns each action, and what comes first within that scope?
5. Why is the recommendation the cheapest complete fix?
6. Does the fix belong in shared code or at one usage site?
7. What behavior changes, and what needs testing?

If the report cannot answer one of these questions, state what is unknown. Do
not hide missing facts behind a polished presentation.

## Bring the facts, then write

Step 0 and Step 2.5 of the audit collect the facts below. Re-check a usage site
if any field is missing. Do not infer broad impact from a shared-looking file
name.

- **Where it lives:** the requested page or component, a parent layout or site
  shell, shared code, optional content such as a CMS entry, or code that was
  not available to inspect.
- **When it runs:** always, only for certain content, only after an interaction,
  only in draft or preview mode, or unknown.
- **How widely it is reused:** verified callers, registry entries, routes, and
  the number of instances that can appear together. Say "not checked" when it
  was not checked.
- **Why this approach fits:** the cheapest tier that solves the current problem.
  If hand-written code resembles a phase primitive but phase is not the right
  choice, say why deletion, browser behavior, or another tool is cheaper or
  more complete.
- **Where to fix it:** the shared definition when the rule is true for every
  caller, or the usage site when behavior depends on placement or route policy.
- **What changes:** server HTML, mount or hydration timing, visible behavior,
  accessibility behavior, or nothing user-visible.
- **What supports the claim:** a performance trace, work visible directly in
  the source, an inference, or an open question.
- **Intent conflicts:** stated no-op, must-stay, or future behavior that conflicts
  with observed runtime work or current producers, plus evidence for each side.
- **Who owns the audit action:** phase, React performance, or Next.js best
  practices, plus any companion review required for a composite change.
- **What to test:** the requested area plus representative callers affected by
  a shared change.

Reduced motion, cleanup, and stopping work that can never be seen are usually
component rules. Lazy mounting and below-the-fold rendering are usually usage
site decisions because the same component may also appear above the fold.
Verify the callers before choosing.

## Rank browser-runtime work separately

The severity tier describes how harmful a finding is when it is actionable. It
does not know whether the code is reachable on this page, how often it runs, or
how many callers share it.

Keep the severity and noise tiers in the technical details. Inside the phase
browser-runtime section, rank phase-owned fixes as one queue using:

- the harm when a finding is actionable, with severity as one input rather
  than the order;
- whether the work runs on the audited path;
- whether it runs continuously or only after an interaction;
- how many users, routes, or component instances can hit it;
- whether one shared change fixes several callers;
- the size and regression risk of the change needed to realize the benefit;
- whether the claim is measured, directly visible in source, or inferred.

A parent layout or shared runtime can have wider impact than a route-local
component. That also means a wider regression risk. Report the larger benefit
and the larger test scope together, backed by verified usage sites.

Use **Fix first**, **Fix next**, and **Later** only for browser-runtime work when
the owner and a safe fix are established. Preserve severity and noise tiers in
the finding details or appendix. If readers may not know the scanner terms,
explain once that noise means detection uncertainty, not sound or runtime work.
Do not relabel an unmeasured source finding as measured.

When a performance trace was used, use measured cost or frame impact for the
findings it exercised. Keep findings outside the recorded path clearly labeled
as unmeasured. Rank browser-runtime fixes with the factors above; unmeasured
means not observed, not zero impact.

In a phase-only report, qualify **Fix first** as the first browser-runtime
action. When adjacent React or Next.js evidence could change the overall order,
put a **Priority caveat** directly below the result. Name the source evidence
and companion owner, say it may outrank the phase action, and leave overall
page priority unresolved until the companion audit runs.

## Separate audit scopes

Use **Phase browser-runtime audit** for an explicit phase or browser-runtime
request. Use **Page performance audit** when React or Next.js companions also
run. In a combined report, phase, React performance, and Next.js best practices
are sibling sections, and every action names its audit owner.

Return full findings for each companion that ran and record the exact skill.
For an unavailable capability, write: "Coverage gap: `<scope>` did not run
because no matching skill was available. I can install one if you want."
Keep each companion's priority labels and order inside its section. Phase's
**Fix first**, **Fix next**, and **Later** labels apply only to phase
browser-runtime actions.

The result may name one overall first action when common measurement or a clear
causal dependency makes cross-scope order defensible. Otherwise say that each
scope has its own priority order; do not create a global queue.

Use **Reduced-motion accessibility** for missing or bypassed
`prefers-reduced-motion` behavior. List confirmed issues without **Fix first**,
**Fix next**, or **Later** labels. Use the existing **Needs investigation** or
**Needs decision** outcomes when evidence or intended behavior is unresolved;
keep important **No change** decisions in the report's existing no-change
section.

When one change has both browser-runtime and reduced-motion effects, keep one
action in the browser-runtime queue, cross-reference it from the accessibility
section, and count the action once. Rank only the supported runtime effect.

## Choose the next action

Every phase browser-runtime action gets one of these outcomes:

- **Fix first / Fix next / Later:** the problem, owning component or module,
  safe fix, and verification scope are established.
- **Needs investigation:** the concern is supported, but its runtime cost,
  safe fix at that owner, or affected callers and behavior are not. State the
  evidence, unresolved question, likely owner, next measurement or source fact,
  and representative callers to inspect.
- **Needs decision:** several valid behaviors remain, or the change affects
  SSR, hydration, mount timing, accessibility, or visible interaction. State
  the options, their consequences, and who must approve the choice.

An uncertain shared finding stays at the shared owner. The audited route may be
the stress case, but it does not receive a local workaround unless the missing
evidence shows that the requirement is route-specific.

For an intent conflict, report the browser work, stated intent, contract
evidence, and disposition together. A comment alone proves neither `No change`
nor removal. If current performance and future behavior support different
actions, use `Needs decision` with the owner question and viable options.
Recommend phase only when its verified contract fits the chosen behavior.

For a composite change, name one primary audit owner and any required companion
review. Keep it as one action when the implementation and verification are
inseparable; split it only when each change can land and prove value on its own.

## Group by the fix a person would make

The scanner reports source locations. Engineers plan fixes. Keep these units
separate:

- **Findings:** source locations reported by the scanner.
- **Actionable findings:** findings that remain problems after inspection.
- **Fixes:** one code change may resolve several actionable findings.
- **Affected areas:** routes, layouts, shared callers, or optional components
  that receive the fix.

Group findings when they share one root cause and one fix. Keep every source
anchor in the grouped recommendation or an appendix. Split findings when they
need different owners, change different behavior, or require different tests.

Label every count with its unit. "26 actionable" is unclear. "26 actionable
findings grouped into 8 fixes" is clear.

## Choose the report size

Use the smallest report that gives the reader enough information to decide and
act. Default to a brief report. Use a shareable report when the user explicitly
asks for a document, artifact, or team handoff. Follow the requested format;
HTML is optional.

### Brief report

Use for a narrow audit or a direct answer in chat:

1. Result, audit scope, and any priority caveat.
2. Actions grouped by scope.
3. Important no-change decisions and unknowns.
4. The next useful check, if any.

Omit empty sections in either format. A one-component audit should not read
like a site-wide review.

### Shareable report

Use when the user asks for a document, artifact, or team handoff:

1. **Result:** whether the requested area is affected, the most important
   in-scope next action, whether priorities are global or per scope, and any
   companion handoff that could change the overall order.
2. **What was checked:** entry points, shared dependencies, optional content
   registries, branch-state evidence, companion skills, revision, and
   measurement status.
3. **Audit actions:** grouped by scope and ordered within each scope. Use
   **Browser runtime (phase)**, **Reduced-motion accessibility**, and companion
   audit subsections when applicable.
4. **Where the work applies:** requested area, optional content, parent shell,
   and verified shared callers.
5. **What already works:** the important no-change decisions.
6. **Other improvements:** useful changes found by manual review and adjacent
   work that belongs to another skill or specialist.
7. **Limits:** skipped files or lines, remote code, missing performance traces,
   and anything else the audit could not prove.
8. **How to verify:** cross-cutting checks, including cross-route checks for
   shared changes. Keep detailed tests with each action.
9. **Technical appendix:** severity tier, noise tier, source anchors, finding
   counts, and baseline details.

Use a small table or relationship map only when one fix affects at least three
callers and prose would make that relationship hard to follow.

## Write each recommendation

Use this information in either report size. Combine fields when that reads more
naturally, but do not drop the facts.

```markdown
### <Phase outcome | companion priority label>: <plain description>

**Audit owner:** <phase | React performance | Next.js best practices>
**Required review:** <companion scope when needed | none>
**Location:** <file:line>
**Affects:** <requested area and verified callers>
**When it happens:** <always | content-dependent | interaction-only | draft-only | unknown>
**Problem:** <what the browser does and why it matters>
**Next action:** <the smallest complete fix, investigation, or decision>
**Why this approach:** <why this ladder tier fits; explain why a plausible phase primitive was rejected>
**Why here:** <shared rule or usage-site policy>
**What changes:** <observable behavior and whether confirmation is required>
**Basis:** <measured details | work visible in source | inference | unknown>
**Test:** <requested path and other callers that need coverage>
**Suggested agent prompt:** <a bounded prompt matching the next action>
```

Add before-and-after code when it makes a main fix easier to apply. A compact
table is enough for repeated mechanical cleanup, as long as every source
location remains visible.

### Suggested agent prompts

For each next action in a shareable report, add a standalone prompt. Follow a
format the user supplies. Otherwise use this compact handoff shape:

```text
<Implement | Investigate | Measure | Propose> <outcome> in `<repo>`'s <owner>.

Audited at: `<repo>@<revision>`
Base path: `<shared repo-relative prefix>`
Start here:
- `<relative path>` - `<symbol>` owner
- `<relative path>` - <producer, consumer, or representative caller to preserve>

<Approach and approval boundary>. Preserve <observable behavior>. Done when
<one checkable outcome>. Report the exact checks run. Expand the source map
only if current callers differ.
```

Use the repo root as `Base path` when no narrower prefix fits. Keep `Start here`
to the owner and the smallest set of constraining producers, consumers, or
representative callers, normally two to four entries. Prefer symbols to
unpinned line numbers. Change `callers` in the closing sentence when another
boundary may have changed. If the action names a required companion review, add
one `Required review:` line; omit it otherwise.

The prompt is a handoff, not a second `AGENTS.md`. Leave routine repository
instructions, skill loading, command discovery, step-by-step plans, detailed
tests, checklists, and generic stop conditions in their existing sources or the
recommendation's `Test` field. Add sections only for a real safety, approval, or
measurement requirement. For investigations and decisions, state the evidence
required before implementation.

Use a labeled block in plain text or Markdown. In HTML, use a collapsed copy
control with selectable text. Add prompts to brief chat reports only when the
user requests a handoff. Omit them for no-change items.

## Write like a person explaining the work

Write for a reader who understands software but does not know this project.
Keep code names exact. Explain a browser or framework term the first time it is
needed.

- Put the result in the first paragraph.
- Name the component, route, timer, listener, animation, or browser work. Avoid
  vague phrases such as "performance concern" or "optimization opportunity."
- State the cause and effect. For example: "Six timers update React state ten
  times per second while the visual is off-screen."
- Use short, direct words. Prefer "use," "helps," and "runs" over "utilize,"
  "leverages," and "facilitates."
- Remove filler, praise, process narration, and claims that could fit any
  report. Avoid phrases such as "robust solution," "holistic review,"
  "seamless," "actionable insights," and "it is worth noting."
- Keep the natural number of points. Do not pad a list to three items.
- Preserve uncertainty. Say "not measured" or "the source shows" instead of
  turning an inference into a fact.
- Use headings only when they help a reader find an answer.

Before finalizing, read the report once without project context. For each
sentence, ask whether it adds a fact, decision, instruction, or needed
transition. Delete it if it does not. Replace vague nouns with the name of the
code or browser work. Restore any limit or caveat lost while editing.

**Vague:** "Leveraging phase provides a robust lifecycle solution with broad
impact across the visual surface."

**Plain:** "`useLifecycle` stops the globe animation when it is off-screen. The
shared globe is used by four visuals, so all four need regression tests."

## Coverage and measurement

Separate the result for the requested area from results for optional or shared
code. A clean route does not make every optional component clean, and a problem
in an optional component does not make the base route slow.

Optional content registries, such as CMS entries or plugin slots, are coverage
boundaries. When the user asks for all available components, report how many
entries were expanded and which implementations were inspected. Otherwise
name the boundary and offer it as a separate audit. Remote implementations and
generated lines the scanner skipped stay visible as limits.

When no performance trace was used, say so near the result. Give each
unmeasured top fix a specific measurement path when measurement would change
the order: page load, an interaction, scrolling the component off-screen, or
backgrounding the tab. Do not add estimated milliseconds or savings without
measurement. When measurement would resolve the remaining uncertainty, offer
capture steps for the specific load or interaction.

If a baseline was used, report new, pre-existing, and stale findings
separately. Include the revision, skill version, scan scope, and coverage gaps
so a later audit can make a fair comparison.

## Completion check

The report is complete when:

- the first paragraph states the result for the requested area;
- shared and optional code is separate from code that always runs there;
- fix order is distinct from the severity tier;
- each fix names the cheapest complete tier and explains why a plausible phase
  primitive was used or rejected;
- broad impact claims name verified callers or say they are unknown;
- shared fixes include the wider test scope;
- the title and sections match the scopes run, exact companion skill names are
  recorded, each combined-report action names its primary audit owner and
  required reviews, and each unavailable companion has one coverage-gap line
  with an installation offer;
- phase-only reports qualify **Fix first** as browser-runtime only and put any
  named priority-changing companion evidence directly below the result;
- browser-runtime priorities exclude accessibility-only findings;
- dual-effect changes appear once in the runtime queue and are cross-referenced
  from `Reduced-motion accessibility`;
- shared work stays at the shared owner unless verified route policy requires a
  usage-site change;
- uncertain work is labeled `Needs investigation` or `Needs decision` instead
  of receiving a speculative fix;
- intent conflicts include contract evidence and a disposition;
- semantics-changing fixes state what changes and require confirmation;
- every material claim has a source anchor or runtime measurement;
- skipped, remote, and unmeasured work is visible;
- completed companion audits return full owned findings;
- animation-library presence is not a defect, and an unperformed replacement
  inventory is a separate scope rather than a decision;
- useful changes found by manual review, no-change decisions, and work handed
  to another specialist are accounted for;
- counts distinguish findings, actionable findings, fixes, and affected areas;
- every action in a shareable report has a compact handoff prompt matched to
  its outcome, or follows the user's supplied format;
- report-level verification does not repeat each action's detailed test;
- the plain-language pass is complete;
- the report size matches the task.

Include one summary sentence with exact units: "The scanner reported N
findings. M remain actionable and are grouped into F fixes, plus P opportunities
and K important no-change decisions."
