# 06 — SvelteKit Character Studio

## Purpose
Provide a child-friendly authoring and review interface plus the single server API.

## Scope
Library, creation/editing, uploads, creative choices, generation progress, original/generated/animation previews, selective regeneration, version history, approval and publication. API supports studio and development Godot consumption.

**Current Phase 5 boundary:** a responsive three-step editor (details → optional private original → review/history) is implemented over existing services. Step transitions retain local fields/files; switching characters requires explicit discard when unsaved, and leaving warns. This is in-memory retention, not autosave. Metadata saves and uploads remain separate, revision-checked actions; no implicit save or newer-token retry. Frozen snapshots remain immutable; review decisions are append-only and publication is explicit. Side-by-side current-original/frozen-animation comparison is available only when the frozen version is already present in a ready release, through existing private-original and published-content routes. Supported unpublished fixture art has an owner-checked private review route (ADR-031); it grants no public game visibility. Confirmed review/publication commands act on exact version/hash/latest decision order. Unsupported unpublished sources await Phase 6 registration/jobs. Generation/jobs remain unavailable until Phase 6; comprehensive accessibility and observed child-usability acceptance remain pending. Chromium covers guided keyboard completion, failure/removal focus recovery and a narrow viewport, not a full accessibility audit. See the [focused accessibility coverage and outstanding manual checklist](../docs/phase-5-accessibility.md).

## Technical approach
SvelteKit/Svelte 5 with runes for local reactive UI, Tailwind CSS and adapter-node. Enable and use Svelte's experimental async support and remote functions wherever applicable for studio data loading, queries and mutations; do not default to hand-written fetch wrappers or legacy load/form-action plumbing when a remote function expresses the interaction. Use async Svelte expressions/derived state where they simplify dependent asynchronous UI. Keep business operations in domain services, not `.svelte` files or remote-function modules. Browser bundles must not import database or provider SDKs; keep server modules in server-only boundaries. Use optimistic revision tokens on editing requests.

These framework features are experimental: use the APIs supported by the repository's pinned Svelte/SvelteKit versions, isolate framework-facing calls behind small modules, and add focused tests for serialization, validation/errors and pending states. Do not use remote functions for the stable public game-content HTTP contract, health/webhook/third-party endpoints, streaming/binary upload paths, or any interaction whose protocol/transport requirements are not supported by remote functions; retain explicit SvelteKit `+server` routes there. Prefer remote functions for internal same-app studio interactions, but do not force them where they make the boundary less safe or clear. Reassess compatibility on framework upgrades rather than silently migrating experimental APIs.

## Architecture and responsibilities
Routes/views: `/characters` library; `/characters/new` upload/name/description wizard; `/characters/[id]` creative choices and side-by-side preview; `/characters/[id]/versions/[version]` read-only snapshot/history/approval; job detail panel with step status, retry/cancel and clear errors. Use body types from contract, curated fighting styles and power catalog, not raw arbitrary combat code. Current supported authoring catalog (ADR-029): `unselected`/`light_melee` fighting style and `none` special power only. These are authoring intent, not generated runtime configuration; no other powers have executable v1 support. Unknown legacy selections remain visible and unchanged until deliberately replaced.

Planned API (same-origin mutation requests):
- `POST /api/characters`, `GET/PATCH /api/characters/:id`: validate authoring DTO and expected edit revision.
- `POST /api/characters/:id/originals`: bounded multipart upload; immutable asset reference.
- `POST /api/characters/:id/generations`: enqueue snapshot, style and requested targets; 202 + job ID; idempotency key.
- `GET /api/jobs/:id`, `POST /api/jobs/:id/{retry,cancel}`: persisted progress, safe transitions.
- `POST /api/characters/:id/versions/:versionId/approvals`: exact manifest hash + expected latest decision order + approve/reject/revoke.
- `POST /api/characters/:id/versions/:versionId/publish`: Phase 5 bounded fixture command returns actual 200 `{releaseId}`; explicit matching hash/order/approval. Phase 6 adds durable asynchronous publication jobs/idempotency keys (ADR-031).
- Private preview routes address authorized asset IDs, not disk paths; supported frozen fixture sheets use `/api/characters/:id/versions/:versionId/assets/:assetId` with no-store/hash/owner checks.
- Public game API is `/api/content/index`, `/api/content/releases/:releaseId/index`, `/api/content/characters/:id/versions/:version/manifest` and `/api/content/characters/:id/versions/:version/assets/:hash.png`; only published revisions served (plan 09).

Phase 5 original upload implementation uses multipart fields `image` and `expectedRevision`; it selects an immutable original/preview pair using the shared authoring revision. Replacement retains earlier pairs, and archived identities cannot attach/read authoring images (ADR-028). Private delivery is `/api/characters/:id/originals/:assetId/{original|preview}`; no filesystem keys are exposed. The bounded multipart envelope allows 64 KiB framing beyond the 10 MiB file limit; compressed PNG ancillary metadata is conservatively refused in addition to the base image policy. See [upload guide](../docs/phase-5-uploads.md).

Return structured `{error:{code,message,fieldErrors?,requestId}}`; use 400 validation, 404 missing, 409 stale revision/transition, 413 size, 415 type, 422 invalid assets, 503 transient unavailable. Do not leak paths, stack traces or provider keys. Job poll starts at 1 second, backs off to 5 seconds, pauses when hidden; SSE can be added later.

## Key design decisions
Upload policy: JPEG/PNG/WebP only, 10 MiB compressed max, 20 megapixels decoded max, one original per request. Enforce request size at adapter/proxy and streaming boundary before buffering. Verify magic bytes and decode with Sharp's pixel limit; MIME/extension alone insufficient. Reject SVG, animated/multipage files, truncated images and decompression bombs. Store original bytes unmodified with hash and generated filename; derive EXIF-oriented, metadata-stripped preview separately. Never expose originals publicly or put child descriptions in logs. Names/descriptions are plain text; server validates length and renders escaped text.

Keep original visible beside generated art; labels distinguish original/draft/review/approved/published and generation costs. Approval and publication are separate deliberate actions with adult-oriented confirmation when external provider use/cost is involved. Regeneration lists impacted descendants and creates a new version, never changes a published one. Keyboard navigation, labeled inputs, visible focus, large touch targets, reduced motion, non-color status indicators and ARIA progress are required. Failed jobs retain work and offer targeted retry, not a forced restart.

## Dependencies
Foundation and database; contract previews; Phase 4 published fixture API. Phase 5 UI uses existing seeded content for review/publish tests and an explicit unavailable/enqueue state until Phase 6 worker exists—do not fake successful generation. Mock-worker integration completes workflow UI acceptance in Phase 6.

## Implementation tasks
- [ ] Implement validated services/routes and private asset streaming.
- [ ] Build responsive library/wizard/editor/history and animation preview component.
- [ ] Add stale-edit protection, error recovery, progress and selective actions.
- [ ] Add upload limits, origin/CSRF safeguards and accessibility tests.
- [ ] Connect full mock flow once Phase 6 stages are implemented.

## Acceptance criteria
A keyboard-only user can create, attach art, choose options, review and publish a validated fixture version; invalid/oversized uploads never become assets. Drafts cannot appear in game. After Phase 6, progress/retry/cancel/preview operate on real persisted jobs, and original art remains retrievable unchanged.

## Risks and limitations
Large multipart buffering can exhaust memory unless limits are enforced before decode. Child usability requires observation beyond automated a11y tests. Local identity is not multi-user authorization; public deployment is blocked until authentication/ownership rules exist.

## Future considerations
Localization, guardian accounts, camera capture/cropping, guided power descriptions and offline studio authoring.
