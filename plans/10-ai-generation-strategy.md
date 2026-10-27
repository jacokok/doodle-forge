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

## Current offline increment
`packages/ai` now implements pinned `deterministic-mock` v1 description analysis, cleanup and master capabilities with bounded shared-contract inputs and strictly validated real PNG candidates (ADR-035). Stages persist artifact/content/provider/resolved-input provenance through the durable library. Cleanup/master are explicitly heuristic/synthetic; styles do not claim art fidelity, text normalization is not moderation, and fixed 256×256 candidates are not anchor-normalized frames. Body/pose/frame capabilities, worker composition, full mock E2E and all real-provider selection remain incomplete. No credentials, network artwork transfer or remote fallback.

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

## Requested integration direction (not implemented)

User requests investigating their OpenAI Codex subscription with a model called “luna”, and possibly pi durable agents, after completing Phase 5. At request time, provider/model ID, entitlement, programmatic/OAuth access terms, image capabilities, privacy/retention and cost/limits were unverified. The public-source investigation below now identifies the public model ID and declared modalities, but account entitlement and integration permission remain unverified. Do not assume a coding/chat subscription grants image-generation API access or map “luna” to another model silently. No credentials or private artwork have been read/sent as part of this request.

Phase 6 remains deterministic mock-first/offline under ADR-010. Evaluate real capabilities in Phase 7 behind provider adapters, with consent and bounded test inputs. Pi SDK persisted sessions can retain finalized agent context, but are not the SQLite workflow queue, leases, fencing, checkpoint adoption or exactly-once billing. Any pi stage integration must expose narrowly scoped tools and keep untrusted drawings/descriptions away from shell/credential access; no default unrestricted coding-agent session over project/user files. No SDK dependency or orchestration replacement is selected here. A provider/SDK decision needs separate capability/terms evaluation and ADR before implementation.

## Public-source investigation (2026-10-26; no account access)

- Official [model guidance](https://learn.chatgpt.com/docs/models) explicitly identifies Luna as `gpt-6-luna` (`codex -m gpt-6-luna`). This verifies the public identifier, **not this user's entitlement**; availability varies by plan/client/workspace/rollout. No substitution or default model change.
- The [Luna API model page](https://developers.openai.com/api/docs/models/gpt-6-luna) states text/image input and **text output**. It does not establish native image generation/editing. A model's ability to interpret images is not a sprite-generation capability; any image tool/model needs separate capability, access and cost evaluation.
- Official [authentication guidance](https://learn.chatgpt.com/docs/auth) distinguishes ChatGPT subscription sign-in from separately billed API-key access. It recommends API-key authentication for programmatic CLI workflows and describes enterprise access tokens for trusted automation where workspace admins grant permission. These public docs do not verify that a personal subscription/OAuth session may be reused as a general unattended image-generation backend or that pi has such entitlement.
- **Still gated/unverified:** user's exact plan/workspace/model availability, applicable automation terms, pi/provider compatibility, image-tool entitlement, consent/retention/licensing/budget and actual capabilities under that account. No credentials/configuration inspected, login performed, SDK installed, live provider invoked or artwork transmitted. Do not enable integration from public documentation alone.
- Search was degraded and returned irrelevant results; evidence above comes from direct official pages, not search snippets. Initial batch reads were partial; model/auth pages were then read fully. The image-generation guide was only partially read and is not evidence of subscription entitlement. Phase 7 evaluation remains required under ADR-010.

## Future considerations
Local models, reference/pose conditioning, multiple candidate selection, effects providers and quality metrics; preserve adapter contract and approval gate.
