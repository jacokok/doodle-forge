# 10 — AI generation strategy

## Purpose
Enable interchangeable generation capabilities while protecting creative control, original art, privacy and budget.

## Scope
Cleanup, background removal, normalization, character master/design, pose/frame generation and effects; deterministic mock provider first, real integrations only after mock contract/game proof.

## Technical approach
Define capability-based TypeScript adapter interfaces, not one required universal provider. `Provider` exposes ID/version, capabilities, `generate(request, context)` and optional `poll/cancel`. Requests contain capability discriminant, validated brief, input asset refs/bytes supplied by server, style, seed, desired dimensions and budget. Outputs contain candidate asset bytes/refs, MIME/dimensions, provider request ID, actual model version, usage/cost metadata and warnings. Validate all outputs before storing/adopting; remote image URLs are downloaded only by a constrained server fetcher with host/redirect/size/time limits to avoid SSRF.

## Architecture and responsibilities
`packages/ai` owns interfaces, routing, error classification and mock/real adapters. Worker selects provider per stage/capability from server configuration, not client arbitrary model URLs. SDKs remain private to adapters. Image processing normalizes outputs; contracts determine gameplay metadata. Users select creative intent, not executable behavior. Original images remain immutable and private in local storage even when derived copies are sent to providers.

## Key design decisions
- Mock adapter uses deterministic seed/hash-based palette, silhouette and frame offsets with Sharp; it must produce valid nonempty transparent frames compatible with the same contract as real output. Tests require no keys/network.
- Styles: `original` preserves the child's line/color identity and minimizes changes; `cartoon` polishes but uses original/master as reference; `pixel` uses constrained palette and nearest-neighbor normalization. UI shows before/after and never silently selects a changed identity.
- Freeze a canonical master, brief and reference hashes per version; every pose/frame request carries those references plus body type, facing, palette and anchor constraints. Prefer reference-conditioned generation; save seed/model/prompts/version metadata for reproducibility, excluding secrets.
- Route background removal and animation generation independently. A missing capability returns explicit unsupported error; do not assume any provider can handle every stage.
- Real provider selection is intentionally deferred to Phase 7 evaluation: current API capabilities, terms for children's uploaded drawings, retention/training opt-out, licensing, regional availability, cost and reference-image consistency must be verified before approval. No silent provider fallback that exports art to a new service.
- Require explicit consent before first external upload and explain what is sent. Strip EXIF/location from transmitted derivative, minimize personal details, use bounded plain-text descriptions. Treat user descriptions/provider output as untrusted data, never instructions to tools or shell.
- Set per-job frame/request/cost ceilings and display estimate before paid work. Ambiguous billed timeouts cannot be blindly retried (plan 08). Record rate limits/retry-after and request IDs; log no raw drawings/prompts by default.
- Human review remains required regardless of automated safety/quality checks. Handle provider safety refusals with child-friendly explanation and no attempt to evade safeguards.

## Dependencies
Stable contract and normalization conventions (04/07), durable retries (08), review UI (06). Phase 6 mock end-to-end must pass before Phase 7 real-adapter work.

## Implementation tasks
- [ ] Implement capability schemas, routing config, mock and deterministic tests.
- [ ] Add bounded downloads, credential isolation, error mapping and provenance records.
- [ ] Evaluate real providers against an explicit comparison matrix; record choice in plan 13.
- [ ] Implement one chosen capability adapter first; gate live smoke tests behind opt-in secrets/budget.
- [ ] Evaluate consistency on consenting sample drawings and document limitations before expanding.

## Acceptance criteria
Entire mock pipeline runs offline with deterministic hashes. Replacing provider configuration does not change stage/business/game code. Unsupported capabilities, invalid output and exceeded budget fail safely. Real tests report actual provider/model/cost and consented source; no paid API is required by default CI.

## Risks and limitations
No guarantee of temporal consistency, identity preservation, exact reproducibility or safe provider retention. Provider policies/capabilities may change. Mock art verifies mechanics, not real AI quality. Legal/guardian review is required before sending actual child data externally.

## Future considerations
Local models, reference/pose conditioning, multiple candidate selection, effects providers and quality metrics; preserve adapter contract and approval gate.
