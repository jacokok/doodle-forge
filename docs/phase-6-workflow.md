# Phase 6 mock worker increment

The worker now executes one registered offline stage: `analyze-description@1`. This is not a complete generation feature. Studio and worker health still report generation unavailable because capture, image processing, frozen review snapshots and publication-job orchestration are not connected. No real AI is enabled.

## Boundaries

- `packages/workflow/src/index.ts`: strict envelope, generic `Stage<I,O>`, canonical input hashes, acyclic graph enqueue, schema-checked execution and fenced adoption.
- `packages/workflow/src/runner.ts`: one-second polling, capability-filtered claims, bounded concurrency, per-attempt heartbeats, cancellation observation and shutdown.
- `packages/database/src/workflow.ts`: SQLite job/step/attempt history; immediate transactions for claims, heartbeat, completion, retries, expiry, relinquishment and cancellation.
- `packages/ai`: typed capability requests/results and the only enabled provider, `deterministic-mock@1`. It returns structured description briefs and real nonempty transparent 256×256 PNG frame candidates with hashes/provenance. At most eight frames per request; zero cost and explicit synthetic-output warnings. These silhouettes test mechanics, not fidelity to uploaded drawings. Unsupported capabilities fail without fallback.
- `apps/worker/src/stages.ts`: description-analysis stage narrows the shared input schema and validates provider output/provenance. Provider is injected behind an interface; the current stage rejects non-mock provider identity/version.
- `apps/worker/src/runtime.ts`: checks workflow migrations, binds health before claiming, then starts the scheduler. Health remains liveness, not a claim of a working factory.

Run explicit `pnpm db:migrate`, then `pnpm dev` for Studio plus worker (or use the existing worker workspace command). Default stage concurrency is one; `DOODLEFORGE_WORKER_CONCURRENCY=1..4` is the only new environment knob. There is deliberately no public enqueue endpoint or demo seed; integration tests enqueue synthetic internal jobs. Startup never implicitly queues work, selects credentials or sends artwork anywhere.

## Protocol

Claims filter by the worker's exact registered stage keys and implementation versions, leaving unsupported queued rows untouched. They use short immediate transactions with 60-second leases and 15-second heartbeats. Each poll recovers up to 100 expired leases and checks active claims for cancellation/loss; cancelled handlers are signalled within the next poll when the event loop is responsive. Every adopted completion checks worker, attempt, fence, running job and strictly unexpired lease. Event-loop stalls can lose a lease; late work cannot be adopted.

Handlers execute outside transactions, receive immutable attempt identity and an abort signal, and return validated JSON checkpoints (256 KiB bound). The worker validates brief schemas and provider identity/version/seed before adoption. Descriptions are plain untrusted data, not tool/shell instructions. No raw prompt, artwork, provider error text or DB path is logged/persisted as a scheduler error; only fixed codes are retained.

Explicit mock provider transient errors become `RetryableStageError`; other errors fail permanently. Default request budget is three attempts (maximum ten), with deterministic 2/4-second retry delays. A terminal failure blocks remaining work and fences in-flight siblings. Provider billing ambiguity, jitter/Retry-After and real-provider classification remain future/gated work.

On SIGINT/SIGTERM, stop claiming and polling, abort handlers, clear heartbeat timers and transactionally relinquish owned attempts before closing SQLite. Relinquishment records a cancelled attempt with `WORKER_STOPPED`, consumes its attempt budget and queues retry with backoff (or fails at exhaustion); it does not set user cancellation on the job. Wait at most five seconds for handlers. The generic stage executor checks abort again before completion, so an abort-ignoring handler cannot adopt after shutdown. Uncooperative external resources are not forcibly terminated by this library; no such provider is registered. A killed worker is recovered via lease expiry, not conversation/session state.

Permanent/budget-exhausted failure fails the job and blocks pending work. Adopted checkpoints and ended attempts are immutable. Completed computation alone leaves a job running; review-ready/success gate transitions will arrive with actual frozen snapshots and explicit publication. No job lease is retained once its step finishes.

## Still unavailable

Only analysis is registered for durable execution. PNG candidates are currently provider-level in-memory outputs tested via Sharp, **not persisted worker artifacts or game packages**. The analysis test graph uses synthetic pre-frozen metadata and is not the full capture-first pipeline. Next: capture/original verification, attempt-scoped artifact writing/hash verification, master/pose/frame stages, normalization/sheet packing and frozen review snapshots, followed by Studio progress and durable publication.

No output-file cache reuse, selective regeneration/manual retry, provider request bookkeeping, approval/gate orchestration or full upload-to-game flow yet. A JSON checkpoint is not proof that an image exists or is valid. Same-host UTC clock assumptions remain. Leases guarantee fenced SQLite adoption, not exactly-once side effects. Existing bounded synchronous fixture publication remains until the durable publication increment replaces it; generation never runs in HTTP handlers.

## Verification

```sh
mise exec -- pnpm exec vitest run packages/ai/src/mock.test.ts packages/workflow/src/runner.test.ts apps/worker/src/runtime.test.ts apps/worker/src/lifecycle.test.ts
```

Tests use temporary real migrated SQLite, deterministic fake-clock timer checks and actual Node worker processes. They cover stable PNG dimensions/hashes/transparency/distinct frames, rejected capabilities/bounds, polling/concurrency, 15-second heartbeats, cancellation, retries, competing workers, SIGKILL recovery and shutdown/restart without repeated checkpoint adoption. They do not establish factory E2E, artwork fidelity or power-loss durability.
