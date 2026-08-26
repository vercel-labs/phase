# Architecture decision records

Name ADRs sequentially as `NNNN-short-slug.md` and never renumber them. Keep each ADR to a title and concise Context, Decision, and Reason sections; add Status, Considered Options, or Consequences only when they add useful information.

ADRs are point-in-time records of durable choices, not pull-request summaries or implementation inventories. When traceability matters, use one trailing `Implemented by` line with public PR links. When a decision changes, add a new ADR and mark the old one as superseded instead of rewriting history.

Never include point-in-time rendered output sizes, bundle sizes, benchmark results, or other measurements that change with tooling or builds. Keep that evidence in the implementing pull request; the ADR records only the durable threshold, decision, and tradeoff.
