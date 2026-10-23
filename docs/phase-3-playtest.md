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
- Confirmed: Comet's sprite is visible and looks different from Sprout's. Comet foot alignment was not confirmed.
- Confirmed: passing Comet vertically in front of and behind an enemy changes draw order appropriately without visible flicker.
- Confirmed: a standing Space jump raises and lands the fighter while the shadow stays under the ground position and shrinks during the jump.
- Confirmed: Comet visibly changes from idle to walk and back when moved and stopped.
- Confirmed: Comet visibly shows its attack state when J is pressed.
- Confirmed: diagonal movement appears about as fast as straight movement.
- Confirmed: Comet's sprite faces left and right when turned in each direction.
- Confirmed: attacks reach in front of Comet when facing either direction; user also confirms jump direction works.
- Confirmed: moving and jumping does not cause unintended depth drift.
- Confirmed: light attack is prevented while Comet is airborne.
- Confirmed: Comet's health bar is visible and readable during the fight.
- Confirmed: an enemy approaches Comet and attempts to attack when close.
- Confirmed: user reports visible changes during combat exchanges. Specific attack/hit cues were not described separately.
- Difficulty concern: user reports active combat is very difficult, almost impossible to win. User reports they were unable to get past wave one; neither wave completion nor a full two-wave run is confirmed. No tuning was made.
- Confirmed: restarting returns Comet to full health and wave one.
- Confirmed: pressing Space during the active run jumps without triggering Start or restarting.
- Confirmed: an enemy hit decreases Comet's health and produces a hurt response.
- Confirmed: at zero health, the loss/knockout state and restart option work.
- Confirmed: user completed wave one against active AI and reached wave two.
- Wave-two status: user reports combat works better now but says they could not defeat both; wave-two completion/full-run completion is not confirmed.
- Not yet checked in this session: other animation states and all remaining checklist items below.

## Manual acceptance checklist — full review still pending

The original automated session had no DISPLAY/WAYLAND_DISPLAY. Human feedback above is recorded separately; headless resource/state assertions are not visual acceptance.

- [ ] Play both fixtures; confirm distinct idle art, foot alignment and readable walk/attack/hurt/KO state art.
- [ ] Walk in all eight directions: diagonal speed consistent; move in front of/behind enemies and confirm ground-point Y-sort, no torso/anchor flicker.
- [ ] Jump standing and moving: ground shadow stays under ground point, shrinks, visual rises/lands without depth drift; Space must not reactivate Start.
- [ ] Face left/right: art and attack reach mirror together; attack stops ordinary walking; airborne light attack is disallowed.
- [ ] Confirm startup/recovery cannot hit, repeated active ticks do not stack damage, out-of-depth/elevated targets miss; hurt interrupts attacks and knockback recovers.
- [ ] Verify health bar, player KO/loss/restart, selecting another fixture, bounded spawns, both waves and completion message.
- [ ] Record platform/engine, actual result, feel/readability problems and any fixes in progress before accepting Phase 3.

Automated `pnpm test:godot` checks input through the arena, actual PNG/atlas resources, both fixture speeds, normalization, bounds, jump/shadow transforms, state animation selection, attack timing/boxes/filtering/deduplication, damage/knockback/KO/HUD, AI approach/attack, player-melee defeat of controlled targets across both waves, cap/completion/loss/reset. Controlled combat tests do not substitute for a human playing against active AI.
