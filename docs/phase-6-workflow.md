# Phase 6 workflow foundation

This is a library increment, not an available generation feature. Studio and worker still truthfully report generation unavailable. No real AI is enabled.

## Boundaries

- `packages/workflow/src/index.ts`: strict shared envelope, generic `Stage<I,O>` schemas, canonical input hash, validated acyclic graph enqueue, schema-checked execution and fenced checkpoint adoption.
- `packages/database/src/workflow.ts`: job/step/attempt persistence, claim, heartbeat, completion, failure/retry, cancellation and expired-lease recovery.
- `apps/worker`: existing health lifecycle only; actual scheduler composition is next.
- `packages/ai`: still empty; deterministic mock provider comes before image processing, review snapshots, progress and durable publication.

Run explicit `pnpm db:migrate` before future workflow use. Migration 0004 is additive; no automatic production enqueue, seed or execution is added. A job may reference a version only if that version belongs to its character. Generation may start before a frozen version exists.

## Protocol

Claims use short immediate transactions and default 60-second leases. The future worker must heartbeat every 15 seconds and invoke recovery; no background sweeper is installed by importing a library. Every accepted mutation checks worker/attempt/fence plus unexpired lease and uncancelled job. Expiry does not become runnable until recovery records the attempt and sets its backoff due time. Default request budget is three attempts, bounded to ten.

Handlers execute outside transactions, receive attempt identity and abort signal, and return validated JSON checkpoints (256 KiB bound). Handlers do not select outputs or change scheduler state. Cancellation blocks adoption even if the handler ignores its abort signal. Attempt-specific artifact paths, verified asset adoption and provider context are future work. Checkpoint JSON is not proof that an image file still exists or is valid.

Permanent/budget-exhausted failure fails the job and blocks pending work, cancelling sibling in-flight attempts. Successful checkpoints and ended attempts are immutable. Regeneration will require new graph/version rows rather than rewriting history. Computation completion deliberately does not transition the job to review-ready or successful: snapshot/approval/publication orchestration is not wired yet.

Retries currently accept an explicit internal retryable boolean with deterministic 2/4-second delays. Provider error classification, jitter/Retry-After, manual retries, selective invalidation, cache validation and external request reconciliation remain unimplemented. Clocks assume one local host. Leases guarantee fenced SQLite adoption, not exactly-once provider billing or publication side effects.

The existing bounded synchronous fixture-publication path remains until the durable publication increment replaces it; generation never runs in HTTP handlers.

## Verification

`mise exec -- pnpm exec vitest run packages/workflow/src/workflow.test.ts packages/database/src/database.test.ts`

Tests use temporary migrated SQLite, injected time, competing connections and concurrent Node worker processes. They cover dependencies, fencing, heartbeat, restart/expiry, attempt budgets, cancellation and typed validation. They do not establish a running factory or power-loss durability.
