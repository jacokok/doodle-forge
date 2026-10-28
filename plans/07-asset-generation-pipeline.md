# 07 — Asset generation pipeline

## Purpose
Convert immutable drawings and creative choices into consistent, validated game packages while retaining review control.

## Scope
Typed stage graph from capture through generation, validation, approval and publication. Mock stages precede paid provider integration. Workflow mechanics are specified in plan 08.

## Technical approach
Each stage accepts a Zod-validated input envelope `{schemaVersion, characterId, characterVersion, sourceSnapshotHash, inputs, parameters}` and returns a validated output containing immutable asset references/hashes and stage-specific metadata. Store large images on disk, never in job JSON. Stage definition version participates in cache keys. Write temp outputs, verify them, then atomically rename into attempt-specific paths before checkpoint commit.

| Stage | Typed input -> output | Owner / behavior |
|---|---|---|
| 1 capture artwork | uploaded asset ID/hash -> verified source ref + oriented preview | image-processing; preserve original bytes |
| 2 analyze description | bounded description + creative choices -> structured design brief | ai; mock deterministic parsing; reject unsafe/unsupported requests |
| 3 clean image | source preview + style -> transparent cleaned PNG | ai/image-processing; cleanup/background removal |
| 4 generate character master | clean image + brief + style -> canonical master + provenance | ai; original/cartoon/pixel policy |
| 5 determine body type | master + selected body type -> effective type + anchors | ai + validation; explicit user's choice wins; suggestion requires confirmation if changed |
| 6 generate poses | master + type + animation target -> pose refs | ai; one branch per animation |
| 7 generate animation frames | poses + master + animation spec -> ordered raw frame refs | ai/animation; per-animation retry |
| 8 align and normalize frames | frames + fixed anchor/canvas -> aligned 256×256 RGBA refs | image-processing; validate bounds |
| 9 build sprite sheets | normalized frames + sequence settings -> PNG sheet + layout | animation/Sharp; deterministic row-major packing |
| 10 generate metadata | sheets + brief + approved gameplay catalog -> v1 manifest bytes/hash | contracts; no AI-written executable behavior |
| 11 validate assets | manifest + files -> validation report + frozen review snapshot | publisher validation helpers; full decode/hash checks |
| 12 await approval | review snapshot hash -> persisted matching approval event | workflow suspension, no worker lease held |
| 13 publish character | explicit publish request + valid approval -> release ID/index hash | publisher; only on user's separate publish command |

Steps 2/3 may execute independently after capture; master requires both. Body type follows master as specified, but supplied type also guides generation. Required animation branches join before metadata; optional branches are included only when requested and valid. Approval alone does not automatically publish.

## Architecture and responsibilities
Worker composes stage implementations; `workflow` owns execution and retries, not pixel algorithms. `ai` returns candidate images/metadata; `image-processing` validates/normalizes; `animation` packs ordered frames; `contracts` validates definitions; `content-publisher` shares validation and makes releases visible. Studio displays persisted outputs/errors, never infers job completion from file existence.

## Key design decisions
Frame anchor convention follows plan 04. Determine nontransparent bounds conservatively, fit with padding rather than silently crop limbs/effects, and translate consistently to foot anchor. The standalone normalizer uses all nonzero-alpha pixels and rejects source-edge contact (ADR-041); its bounding-box foot estimate remains provisional. Preserve aspect ratio. Pixel style uses nearest-neighbor resizing; cartoon/original uses documented smooth resampling. Deterministic seed, palette and fixed canvas make mock outputs reproducible. Mock output must include nonempty visually distinguishable frames, not a success-only stub.

An animation regeneration reuses source/master and unaffected sheets; invalidate only chosen branch and metadata/validation/approval/publication descendants. Whole-master regeneration invalidates all dependent branches. Each regeneration creates a new review version with new manifest hash. Transparent/empty results, clipped bounds, inconsistent dimensions and invalid attack metadata block approval. Real art fidelity remains a human judgment.

## Dependencies
Contract and fixture (Phase 2), publisher validation/API (Phase 4), studio approval flow (Phase 5), durable executor and mock provider (Phase 6). Real AI waits until mock end-to-end proof.

## Current bounded implementation
Capture is a library stage that verifies a pinned immutable original ID/hash/owner, strictly decodes source bytes, and stores its oriented preview as an attempt-scoped PNG. The executor revalidates declared files and their attempt identity before fenced checkpoint adoption (ADR-034). Offline mock analysis/cleanup/master stages now consume adopted same-job typed dependencies, reverify source artifacts, and persist provider/seed/style/content-hash/resolved-input provenance (ADR-035). Candidates are real nonempty transparent 256×256 PNGs; mock cleanup is a limited white-background heuristic and master is explicitly synthetic, not art-fidelity or safety evaluation. This is not production worker composition, automatic cache reuse, anchor normalization or a complete graph. A library-only body stage preserves the selected body type and specifies the target foot anchor (ADR-038); a library-only animation-branch pose stage persists one validated synthetic provider candidate (ADR-039). The mock conditions on the master hash rather than its pixels. A library-only raw-frame stage now persists bounded ordered frame sequences against the selected pose branch (ADR-040), but the mock provider does not consume the pose as a conditioning input. Frame-stage tests cover stale-attempt fencing, a malformed later frame and branch mismatch (plan 14). Frame normalization is integrated as a library-only, branch-addressed durable stage (ADRs 041/042), with selected-file revalidation and fenced checkpoint adoption. A library-only sheet stage packs the selected normalized branch into an attempt-scoped deterministic row-major PNG, preserving ordered source hashes and layout with fenced adoption (ADR-043). A pure library assembler now constructs and validates canonical v1 manifest metadata from explicit character, gameplay, timing and five-sheet inputs (ADR-044); it does not verify asset bytes or freeze a review snapshot. Durable metadata integration, an approved gameplay catalog and production worker integration remain.

## Implementation tasks
- [ ] Define stage input/output schemas, dependency graph and implementation versions.
- [ ] Implement deterministic source processing, normalization and sheet packing.
- [ ] Add mock stages and per-animation branching/provenance.
- [ ] Add review snapshot assembly, diagnostics and targeted regeneration.
- [ ] Test arbitrary stage failure/restart without altering original/master.

## Acceptance criteria
One upload produces all five required valid sheets/manifest through a restartable mock job. Retrying failed walk generation reuses unchanged upstream artifacts. Identical deterministic inputs produce identical bytes/hashes. Publishing cannot bypass validation or approval; no generated work overwrites original bytes.

## Risks and limitations
Automatically estimating feet on unusual drawings may fail; provide review diagnostics and future manual anchor adjustment. AI pose temporal consistency is not guaranteed. Disk/memory costs grow with frame counts; cap parallel processing and decoded pixels.

## Future considerations
User-adjustable anchors, batch generations, effect branches, quality scoring and richer body templates; optional models must preserve typed boundaries and provenance.
