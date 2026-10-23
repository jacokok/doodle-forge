# Phase 5 — metadata authoring increment

This is the first bounded Phase 5 backend slice, not a usable authoring UI or full Phase 5 acceptance. The library/wizard/editor, uploads, creative-choice catalog, history/previews, approval/publication UI and job boundaries remain incomplete. Generation remains unavailable.

## JSON API

- `GET /api/characters`: `{characters:[...]}` for non-archived identities.
- `POST /api/characters`: required `{name,description,bodyType}`; returns the new identity with HTTP 201 and `editRevision:1`.
- `GET /api/characters/:id`: current non-archived identity.
- `PATCH /api/characters/:id`: `{expectedRevision,...metadataChanges}`; at least one metadata field required. Returns the identity with incremented revision.
- `DELETE /api/characters/:id`: JSON `{expectedRevision}`; archives the identity, increments its revision, returns empty 204. This is not physical deletion or unpublication.

Metadata uses the shared browser-safe `@doodleforge/contracts/authoring` schemas. Name is trimmed, 1–80 Unicode code points; description is trimmed, at most 2000; body type is `humanoid`, `quadruped`, `floating` or `other`. Text is plain text, not HTML; future views must render escaped text. Unknown fields are rejected. Creative choices are not editable in this slice: newly created identities have `fightingStyle:unselected` and `specialPower:none`, not executable abilities.

Mutations require `Content-Type: application/json` and an `Origin` exactly matching the request URL origin, including for non-browser clients. Bodies are limited to 16 KiB while reading, without trusting Content-Length; invalid JSON/UTF-8 is rejected. The adapter's existing request-size cap still applies independently. This loopback-only API is not authenticated multi-user hosting. Same-app UI should use thin remote functions over the domain service when implemented (ADR-026); these explicit routes provide the planned JSON API, not client fetch-wrapper guidance.

Responses are `no-store` with `nosniff` and an `X-Request-Id`. Failures have `{error:{code,message,fieldErrors?,requestId}}`: 400 invalid input/JSON, 403 missing/wrong origin, 404 missing/archived identity, 409 stale revision, 413 size, 415 media type and sanitized 503 operational failures. Reload and reconcile edits after 409; do not blindly retry with a newer token. Both edit and archive use a conditional database update against the expected revision and non-archived state.

## Content boundary

Authoring identities are mutable; frozen review snapshots, approvals and ready releases are not changed by editing or archiving. Archive hides an identity from authoring list/get and prevents further edits; historical published membership remains available through the content API. Nothing here creates a version, approval, job or release. Changing published content still requires a separate new frozen version, approval and publication. No new migration is needed for these existing identity fields.

## Verification and limits

`apps/studio/src/lib/server/characters.test.ts` tests actual routes/domain/repositories against migrated temporary SQLite, including two-connection stale edits, publication isolation, origin/validation failures and chunked-body cancellation. Progress records actual executed checks. Browser, keyboard/a11y, upload and manual graphical acceptance are not established by these tests.
