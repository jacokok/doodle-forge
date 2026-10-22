# Plans and project navigation

## Purpose
This directory is the implementation specification and project memory for DoodleForge. **Phase 0 planning is complete and reviewed; Phase 1 implementation is authorized.** See progress for the foundation evidence and remaining phase gates.

## Scope
The plans define system boundaries, content contract, persistence, workflow, UI, game, testing, risks, and ordered delivery. They are normative; resolve discrepancies here and in the decision record before coding.

## Technical approach
Read overview and architecture first, then the roadmap and progress. Implement only the current phase's checklist. Make small verified increments and update progress after each meaningful milestone.

## Architecture and responsibilities
`00` vision; `01` system topology; `02` repository layout; `03` Godot gameplay; `04` shared character package; `05` persistence; `06` studio; `07` asset generation; `08` durable workflow; `09` game integration/publication; `10` AI adapters; `11` verification; `12` ordered execution; `13` recorded decisions; `14` live status. Root `AGENTS.md` governs coding agents.

## Key design decisions
Use pnpm, SvelteKit as UI and API, TypeScript/Node worker, SQLite/Drizzle, Zod plus generated JSON Schema, filesystem blobs, deterministic mock AI, and Godot 4 2D renderer. No external infrastructure is mandatory. Published revisions are immutable and approval-gated.

## Dependencies
Phase order and cross-plan dependencies are explicit in `12-implementation-roadmap.md`. Key dependency chain: contract -> game runtime/repository -> studio and workflow -> publishing -> offline bundles. Godot **4.7.2-stable** was selected in Phase 0; Phase 1 verified the installed binary and matching Linux x86_64 export templates before project setup (plans 13/14).

## Implementation tasks
- [ ] Read all plans relevant to the next task.
- [ ] Follow roadmap phase checklist.
- [ ] Validate changes and record results in progress.
- [ ] Update decisions/docs when a boundary changes.

## Acceptance criteria
An agent can identify current state, locate interface definitions and dependencies, implement next tasks without undocumented assumptions, and report evidence. No conflicting schema, publication, or workflow ownership rules remain.

## Risks and limitations
Plans cannot determine current dependency versions or machine capabilities; verify when implementation begins and record exact versions. Provider behavior and AI consistency are inherently variable. Godot headless test tooling may require a separately installed binary.

## Future considerations
Extend content types for enemies, weapons, levels, backgrounds, bosses; add provider adapters only behind stable interfaces and with cost/safety evaluation.
