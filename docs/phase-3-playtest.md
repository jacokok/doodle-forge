# Phase 3 fixture prototype playtest

Run from the checkout with the pinned engine/templates (see [setup](setup.md)):

```sh
pnpm dev:game
```

Run the main scene in the editor. Or use `godot --path apps/game -- --fixture=comet` to select Comet on launch (Sprout is default). These are fixed development fixtures from `packages/contracts`, not published/API/bundle content. No studio/worker/server is needed. Five required fixture animations currently have **one authored frame each**; state changes are visible, but this is not smooth multi-frame artwork.

Choose Sprout or Comet, then Start / restart. WASD/arrows move, Space jumps, hold J for repeated light attacks subject to cooldown. Two bounded waves contain two then three enemies, with at most two active. Health reaches zero on defeat; restart resets selection, health and waves. Selection changes reset the run. Arena limits constrain ground positions, independently of jumping.

## Human feedback — 2026-10-23

User launched the game and confirmed it works as expected after clarifying that the colored checkerboard fixtures are the intended placeholder artwork, not missing textures. User reported combat is very difficult. This confirms launch and expected placeholder rendering, not execution of every checklist item below; engine/platform details and a completed two-wave human run were not explicitly reported. Difficulty remains a usability concern.

## Manual acceptance session — current

- Confirmed: with Sprout selected and idle, the intended checkerboard artwork and foot alignment looked as expected.
- Confirmed: Comet's sprite is visible and looks different from Sprout's.
- Confirmed: Comet's idle sprite appears aligned at its feet with the ground.
- Confirmed: passing Comet vertically in front of and behind an enemy changes draw order appropriately without visible flicker.
- Confirmed: a standing Space jump raises and lands the fighter while the shadow stays under the ground position and shrinks during the jump.
- Confirmed: Comet visibly changes from idle to walk and back when moved and stopped.
- Confirmed: Comet visibly shows its attack state when J is pressed.
- Confirmed: Comet stops ordinary movement during an attack and resumes afterward.
- Confirmed: diagonal movement appears about as fast as straight movement; user reports all four diagonal directions work.
- Confirmed: Comet's sprite faces left and right when turned in each direction.
- Confirmed: attacks reach in front of Comet when facing either direction; user also confirms jump direction works.
- Confirmed: moving and jumping does not cause unintended depth drift.
- Confirmed: light attack is prevented while Comet is airborne.
- Confirmed: Comet's health bar is visible and readable during the fight.
- Confirmed: an enemy approaches Comet and attempts to attack when close.
- Confirmed: user reports visible changes during combat exchanges. Specific attack/hit cues were not described separately.
- Difficulty feedback: user initially reported active combat was very difficult, almost impossible to win, and said they could not get past wave one. They later said combat worked better and explicitly confirmed completing both active-AI waves. No tuning was made.
- Confirmed: restarting returns Comet to full health and wave one; switching from Comet to Sprout also resets the run to wave one with full health.
- Confirmed: pressing Space during the active run jumps without triggering Start or restarting.
- Confirmed: an enemy hit decreases Comet's health and produces a hurt response.
- Confirmed: enemy-hit knockback is understandable and Comet regains control afterward.
- Confirmed: Comet's attack misses an enemy clearly separated in ground depth.
- Confirmed: a hit during an attack interrupts it with the hurt response.
- Confirmed: holding J produces separate attack cycles rather than continuous damage from one attack.
- Confirmed: damage appears limited to the visible attack, not startup or recovery.
- Confirmed: at zero health, the loss/knockout state and restart option work.
- Confirmed: user completed wave one against active AI and reached wave two; no more than two enemies were active at once.
- Wave-two progress: user initially reported combat worked better but they could not defeat both, then explicitly confirmed defeating the wave-two enemies and seeing the run-complete message. **Both active-AI waves are human-confirmed complete.**
- Confirmed: Sprout visibly changes from idle to walk and back when moved and stopped, and visibly shows an attack state when J is pressed.
- User asked to skip remaining Sprout checks and mark equivalent items confirmed, reporting the other same items work like Comet. These remaining Sprout details are user-reported, not individually checked in this session.
- Not yet checked: exact engine/platform details.
- Elevated-target limitation: user reports enemies did not jump, so attack behavior against an airborne/elevated enemy was not visually exercised; keep that criterion unchecked.

## Manual acceptance checklist — completed

The original automated session had no DISPLAY/WAYLAND_DISPLAY. Human feedback above is recorded separately; headless resource/state assertions are not visual acceptance.

- [x] Play both fixtures; confirm distinct idle art, foot alignment and readable walk/attack/hurt/KO state art. Sprout's remaining equivalent observations were marked confirmed at the user's explicit request, based on their report that they work the same as Comet.
- [x] Walk in all eight directions: diagonal speed consistent; move in front of/behind enemies and confirm ground-point Y-sort, no torso/anchor flicker. User confirmed all four cardinal and all four diagonal directions, plus appropriate Y-sort without visible flicker.
- [x] Jump standing and moving: ground shadow stays under ground point, shrinks, visual rises/lands without depth drift; Space must not reactivate Start.
- [x] Face left/right: art and attack reach mirror together; attack stops ordinary walking; airborne light attack is disallowed.
- [x] Confirm startup/recovery cannot hit, repeated active ticks do not stack damage, out-of-depth targets miss; hurt interrupts attacks and knockback recovers. Elevated-target behavior was not visually exercised because enemies did not jump; see limitation below.
- [x] Verify health bar, player KO/loss/restart, selecting another fixture, bounded spawns, both waves and completion message.
- [x] Record actual results and feel/readability feedback: both active-AI waves completed; initial difficulty concern and later improvement are retained above. Exact platform/engine details were not reported. No fixes/tuning were made.

Automated `pnpm test:godot` checks input through the arena, actual PNG/atlas resources, both fixture speeds, normalization, bounds, jump/shadow transforms, state animation selection, attack timing/boxes/filtering/deduplication, damage/knockback/KO/HUD, AI approach/attack, player-melee defeat of controlled targets across both waves, cap/completion/loss/reset. Controlled combat tests do not substitute for the recorded human playthrough against active AI.

Manual playtest acceptance is complete based on the confirmations above. Remaining limitation: the airborne/elevated-enemy miss case was not visually testable because enemies did not jump; exact engine/platform details are also unavailable. Neither limitation negates the completed shadow/Y-sort/feel review or human two-wave run.
