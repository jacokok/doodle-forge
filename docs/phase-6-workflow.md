# Phase 6 workflow foundation

This combines a metadata-only mock worker with separately tested capture-first artifact libraries; it is not an available generation feature. Studio and worker still truthfully report generation unavailable. No real AI is enabled.

## Boundaries

- `packages/workflow/src/index.ts`: strict shared envelope, generic `Stage<I,O>` schemas, canonical input hash, validated acyclic graph enqueue, schema-checked execution and fenced checkpoint adoption.
- `packages/database/src/workflow.ts`: job/step/attempt persistence, claim, heartbeat, completion, failure/retry, cancellation and expired-lease recovery.
- `apps/worker`: actual bounded runner/health lifecycle; only metadata `analyze-description@1` is registered. Capture-first stages are not registered.
- `packages/workflow/src/runner.ts`: polling, filtered claims, bounded concurrency, heartbeats, cancellation and shutdown. `stageHandler(stage, log?, artifacts?)` preserves custom lease duration and can explicitly supply verified storage.
- `@doodleforge/ai`: capture-first mock analysis/cleanup/master provider and strict single-image candidate validation.
- `@doodleforge/ai/capabilities`: metadata/frame capability provider preserved from ADR-033. Its brief schema and two-argument `generate(request, {signal})` differ from the artifact provider's `generate(request, sourceBytes, signal)`. Frames remain in memory. These are intentionally separate exports, not a union or silent fallback.
- `packages/workflow/src/mock-stages.ts`: analysis, cleanup and master stages consuming adopted typed dependencies and recording provenance. Review snapshots, progress and durable publication remain future work.
- `packages/workflow/src/artifacts.ts`: private PNG storage, bounded confined reads, attempt-scoped immutable installation and verification.
- `packages/workflow/src/capture.ts`: pinned original ID/hash/owner verification and deterministic oriented preview capture; library stage, not production worker wiring.

Run explicit `pnpm db:migrate`, then `pnpm dev` for Studio plus the metadata-only worker. Concurrency defaults to one, configurable by `DOODLEFORGE_WORKER_CONCURRENCY=1..4`. Migration 0004 is additive; no automatic production enqueue, seed or execution is added. A job may reference a version only if that version belongs to its character. Generation may start before a frozen version exists.

## Protocol

The runtime polls each second, filters claims by registered key/version, heartbeats every 15 seconds and recovers at most 100 expired leases per poll. Claims use short immediate transactions and default 60-second leases. Shutdown stops polling, aborts handlers and transactionally relinquishes claims before closing SQLite, with at most five seconds grace; same-host/event-loop assumptions apply. Every accepted mutation checks worker/attempt/fence plus unexpired lease and uncancelled job. Expiry does not become runnable until recovery records the attempt and sets its backoff due time. Default request budget is three attempts, bounded to ten.

Handlers execute outside transactions, receive attempt identity, abort signal and frozen adopted-dependency metadata/JSON strings, and return validated JSON checkpoints (256 KiB bound). Handlers do not select outputs or change scheduler state. Cancellation blocks adoption even if the handler ignores its abort signal. Asset-producing stages declare `artifactRefs(output)` and require the worker-supplied `ArtifactStore`. Execution verifies each produced reference belongs to this step/attempt and rereads/decodes/hashes files before fenced completion. JSON alone still proves neither current file integrity nor availability: consumers must use `ArtifactStore.read` on every reuse. The mock provider is supplied by stage factory composition; automatic cache reuse remains future work.

Permanent/budget-exhausted failure fails the job and blocks pending work, cancelling sibling in-flight attempts. Successful checkpoints and ended attempts are immutable. Regeneration will require new graph/version rows rather than rewriting history. Computation completion deliberately does not transition the job to review-ready or successful: snapshot/approval/publication orchestration is not wired yet.

The metadata adapter classifies only known-safe mock transient errors as retryable; runner failures persist fixed sanitized codes, not raw provider messages. Retries use deterministic 2/4-second delays. Real-provider classification, jitter/Retry-After, manual retries, selective invalidation, cache validation and external request reconciliation remain unimplemented. Clocks assume one local host. Leases guarantee fenced SQLite adoption, not exactly-once provider billing or publication side effects.

The existing bounded synchronous fixture-publication path remains until the durable publication increment replaces it; generation never runs in HTTP handlers.

## Artifact/capture protocol

Composition must provision a private artifact root separately from originals and public releases. References contain UUID step/attempt/artifact IDs, SHA-256, byte size, PNG media type and dimensions, never arbitrary paths or inline artwork. Files live under `<stepId>/<attemptId>/<artifactId>.png`; originals retain their existing immutable asset rows and flat keys. Artifact references are selected only in immutable step checkpoint JSON, not new `assets` rows; promotion into frozen versions remains future work.

Writes validate/decode bounded PNG bytes, write an exclusive temporary file, make it read-only, fsync it, then install using a no-replace atomic hard link, remove the temp name and fsync the directory (including new parents). This same-filesystem Linux/local-storage protocol avoids overwrite races. Cancellation/crashes/expired attempts can leave private unreferenced files; these never imply a selected output. No destructive cleanup is added. File writes and SQLite adoption are not one transaction; power-loss durability is not established by process-restart tests.

Read paths derive exclusively from validated UUIDs. Roots/ancestors must be real directories without symlinks, final files open no-follow/nonblocking, and descriptor reads bound exact size before hash and strict PNG decode/dimension verification. Limits: 10 MiB compressed, 20 million decoded pixels, 4096 per edge, 100 declared output artifacts per stage. This is the existing trusted local-process model, not protection against privileged concurrent directory replacement or a hosted tenancy/aggregate quota scheme.

Capture accepts `inputs.original = {assetId, sha256}` and empty parameters. It checks immutable repository owner/kind/key/hash, reads/rehashes the preserved original, strictly decodes and checks source dimensions, and derives an oriented metadata-stripped PNG preview using the existing upload policy. Later original attachment changes do not change a queued capture's input. It does not generate, approve, publish or expose private bytes over HTTP.

## Offline mock slice (ADR-035)

Library composition now supports `capture-artwork` → parallel-ready `analyze-captured-description` / `clean-image` → `character-master`. Each new stage takes strict parameters `{providerId: 'deterministic-mock', providerVersion: '1', seed, style}`; seed is an unsigned 32-bit integer and style is original/cartoon/pixel. Analysis inputs reuse bounded description/body/fighting-style/power definitions from shared authoring contracts. Image-stage inputs are empty objects: **upstream outputs come from the declared graph, not client artifact hints**. No capture-first production registry or public enqueue is wired. The capture-first key is distinct from production metadata `analyze-description@1`; their input/output/dependency contracts must not share a registry identity. Previously internal capture-first graphs using the old key require explicit re-enqueue/reconciliation, not edits to immutable checkpoints (ADR-036).

Executor resolves only declared same-job succeeded dependencies, matching owner/version/source snapshot and validated original input hash. The adopted successful attempt identifies selected files. This increment expects one dependency per declared stage key; mock stages require version 1 and empty target. Typed output schemas and artifact reads reject missing, unsupported, stale/orphan or corrupt upstream inputs before provider work. More general per-animation branch addressing remains future work.

`input_hash` remains the immutable declared input identity. `resolvedInputHash` in new output provenance also binds sorted dependency checkpoint hashes; request/content source hashes, pinned provider/version, seed and style are persisted alongside it. Full checkpoint hashing includes UUID identity and is deliberately conservative, **not a cross-job content-cache key**. It is stable for a retry with unchanged adopted upstream checkpoints; generated PNG content depends on content hashes/creative inputs, not attempt UUIDs. Caching remains disabled.

Mock analysis normalizes plain text without tools and preserves explicit choices. Cleanup uses a simple near-white-background heuristic and transparent padded canvas; master is a deliberately synthetic colored silhouette. Fixed 256×256 output is a candidate format, not verified foot-anchor normalization. Original/cartoon/pixel are hash/resampling controls here, not real-provider art-fidelity promises. Blank output is rejected. Candidate validation requires a single <=2 MiB PNG with strict 256×256 decode, correct identity/source/hash and both visible and transparent pixels; adapter buffers are cloned. Description output explicitly warns that it is not safety moderation. No untrusted text becomes code, SVG, shell or tool instructions.

Next: persisted body/pose/frame stages using the provider candidates, normalization/sheet packing and explicit capture-first worker registration, followed by freeze/gates/progress. No generated review/publication authority is introduced by this slice. Phase 5 manual accessibility/child-usability checks remain deferred, not passed.

## Verification

`mise exec -- pnpm exec vitest run packages/ai/src/mock.test.ts packages/workflow/src/mock-stages.test.ts packages/workflow/src/workflow.test.ts packages/workflow/src/artifacts.test.ts packages/database/src/database.test.ts`

Tests use temporary migrated SQLite, injected time, competing connections and concurrent Node worker processes. They cover dependencies, fencing, heartbeat, restart/expiry, attempt budgets, cancellation and typed validation. They do not establish a running factory or power-loss durability.
