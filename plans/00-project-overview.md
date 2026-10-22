# 00 — Project overview

## Purpose
Define DoodleForge's product outcomes, users, boundaries, and measurable first release.

## Scope
A child or guardian captures a drawing, adds name/description and creative choices, generates game assets, reviews and approves, then plays the immutable published character in a local Godot beat-'em-up. Preserve original uploads forever. Initial scope is playable characters; other asset families are future work.

## Technical approach
Deliver locally in phases. Studio is SvelteKit UI/API; SQLite stores metadata and filesystem stores binary assets; an independent TypeScript worker executes durable workflows; Godot obtains approved content through API in development or versioned bundle offline. Deterministic mock provider proves flow without credentials.

## Architecture and responsibilities
Studio owns character editing, uploads, previews, approvals and release requests. Database owns authoritative metadata/state. Worker owns asynchronous generation, not request handlers. Publisher validates and atomically exposes immutable revisions. Game owns simulation and rendering, not content authoring. Original bytes are distinct from all derived assets.

## Key design decisions
Child-friendly, responsive, accessible interaction; clear draft/published distinction; human approval before publication; local-first; data-driven content; no character-specific game code. Initial animations: idle, walk, attack_light, hurt, knockout; optional jump, attack_heavy, special.

## Dependencies
Plans 01–10 specify implementation boundaries. Phase 1 foundation and Phase 2 contract precede integration. Phase 3 prototype may use fixture data; Phase 4 proves dynamic loading.

## Implementation tasks
- [ ] Establish workspace and local run commands.
- [ ] Deliver schema fixture and runnable Godot arena.
- [ ] Connect studio, generation, approval, publishing, and game.
- [ ] Verify end-to-end addition of a second character without gameplay edits.

## Acceptance criteria
The complete workflow can be demonstrated locally from upload to playable character; original image remains retrievable; incomplete drafts never appear in game; tests and docs correspond to behavior.

## Risks and limitations
AI cannot guarantee fidelity/animation consistency; child data and uploads require privacy-minded handling. Local API connectivity and Godot runtime image decoding have platform limitations. No production hosting/security certification is implied by local prototype.

## Future considerations
Support additional content kinds and safeguarding/guardian controls; evaluate hosted deployment and provider costs only after local workflow works.
