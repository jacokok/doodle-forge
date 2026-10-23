# Phase 5 — metadata authoring increment

Phase 5 now includes a usable metadata library/editor, [safe private original upload/preview](phase-5-uploads.md) and the JSON API below, not full Phase 5 acceptance. Creative-choice catalog/wizard, version/history/generated previews, approval/publication UI and real job boundaries remain incomplete. Generation remains unavailable.

## Metadata library

Open **Character library** from the studio home page, or visit `/characters`. Create an identity with name, description and body type; select an existing identity to edit it. These are mutable authoring fields, not a generated version or publication status. Names/descriptions render as plain text. Unsupported features are explicitly labeled unavailable; no successful generation, version or job is fabricated.

The same-app UI uses thin SvelteKit remote queries/commands over `CharacterService`, not fetch wrappers or legacy load/actions. Shared contracts validate domain inputs and supply the body-type options. Expected revisions remain attached to the loaded editor snapshot. Validation errors retain input and identify fields; stale edit/archive conflicts block mutations and retain local text. Copy anything needed before deliberately using **Reload library and discard local edits**; there is no automatic retry with a newer token. Selecting another library entry or New character replaces the local editor, so save/copy edits first.

Mutations disable editor/library controls while pending. Network failures keep input and block resubmission until a deliberate reload because a lost response does not prove the server did not save. For an uncertain create, check the reloaded library for the saved identity before creating another. Query failures retain input and offer reload. Archive has a separate confirmation with keyboard focus initially on Cancel; it discards unsaved metadata but never revokes published content.

Remote outcomes carry sanitized structured errors and reference IDs, while framework transport errors use an explicit uncertainty message. Remote functions retain SvelteKit's origin protection plus an explicit same-origin domain-dispatch guard; adapter request limits apply. The JSON-specific 16 KiB/UTF-8 transport policy below remains specific to the preserved JSON API. See setup for the pinned framework's build-time origin requirement.

## JSON API

- `GET /api/characters`: `{characters:[...]}` for non-archived identities.
- `POST /api/characters`: required `{name,description,bodyType}`; returns the new identity with HTTP 201 and `editRevision:1`.
- `GET /api/characters/:id`: current non-archived identity.
- `PATCH /api/characters/:id`: `{expectedRevision,...metadataChanges}`; at least one metadata field required. Returns the identity with incremented revision.
- `DELETE /api/characters/:id`: JSON `{expectedRevision}`; archives the identity, increments its revision, returns empty 204. This is not physical deletion or unpublication.

Metadata uses the shared browser-safe `@doodleforge/contracts/authoring` schemas. Name is trimmed, 1–80 Unicode code points; description is trimmed, at most 2000; body type is `humanoid`, `quadruped`, `floating` or `other`. Text is plain text, not HTML; views render escaped text. Unknown fields are rejected. Creative choices are not editable in this slice: newly created identities have `fightingStyle:unselected` and `specialPower:none`, not executable abilities.

Mutations require `Content-Type: application/json` and an `Origin` exactly matching the request URL origin, including for non-browser clients. Bodies are limited to 16 KiB while reading, without trusting Content-Length; invalid JSON/UTF-8 is rejected. The adapter's existing request-size cap still applies independently. This loopback-only API is not authenticated multi-user hosting. The same-app UI uses thin remote functions over the domain service (ADR-026); these explicit routes remain the planned JSON API, not client fetch-wrapper guidance.

Responses are `no-store` with `nosniff` and an `X-Request-Id`. Failures have `{error:{code,message,fieldErrors?,requestId}}`: 400 invalid input/JSON, 403 missing/wrong origin, 404 missing/archived identity, 409 stale revision, 413 size, 415 media type and sanitized 503 operational failures. Reload and reconcile edits after 409; do not blindly retry with a newer token. Both edit and archive use a conditional database update against the expected revision and non-archived state.

## Content boundary

Authoring identities are mutable; frozen review snapshots, approvals and ready releases are not changed by editing or archiving. Archive hides an identity from authoring list/get and prevents further edits; historical published membership remains available through the content API. Nothing here creates a version, approval, job or release. Changing published content still requires a separate new frozen version, approval and publication. No new migration was needed for the initial metadata fields. Upload migration 0003 adds immutable original/preview assets and a selected original reference; attachment shares the identity's optimistic edit revision. See the [upload policy and private HTTP boundary](phase-5-uploads.md).

## Verification and limits

`apps/studio/src/lib/server/characters.test.ts` tests actual routes/domain/repositories against migrated temporary SQLite, including two-connection stale edits, publication isolation, origin/validation failures and chunked-body cancellation. `character-result.test.ts` covers serialized domain outcomes and sanitized failures. Real Chromium tests in `tools/browser-tests/characters.spec.ts` and `character-errors.spec.ts` exercise create/edit/archive persistence, structured validation, keyboard focus/navigation, stale edit/archive conflicts, pending controls, origin rejection and recoverable network/query failures against a built studio with migrated temporary SQLite/storage. The harness builds for its isolated origin and cleans temporary data on shutdown. Progress records exact executed checks. This is focused automated browser/keyboard coverage, not a full accessibility audit, child-usability observation, upload-to-generation/factory E2E or manual graphical acceptance.
