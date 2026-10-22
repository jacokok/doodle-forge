# Phase 3 fixture prototype playtest

Run from the checkout with the pinned engine/templates (see [setup](setup.md)):

```sh
mise exec node@22.23.3 -- npm exec --yes --package=pnpm@10.34.7 -- pnpm dev:game
```

Run the main scene in the editor. Or use `godot --path apps/game -- --fixture=comet` to select Comet on launch (Sprout is default). These are fixed development fixtures from `packages/contracts`, not published/API/bundle content. No studio/worker/server is needed. Five required fixture animations currently have **one authored frame each**; state changes are visible, but this is not smooth multi-frame artwork.

Choose Sprout or Comet, then Start / restart. WASD/arrows move, Space jumps, hold J for repeated light attacks subject to cooldown. Two bounded waves contain two then three enemies, with at most two active. Health reaches zero on defeat; restart resets selection, health and waves. Selection changes reset the run. Arena limits constrain ground positions, independently of jumping.

## Manual acceptance checklist — NOT YET EXECUTED

This session has no DISPLAY/WAYLAND_DISPLAY. Headless resource/state assertions are not visual acceptance.

- [ ] Play both fixtures; confirm distinct idle art, foot alignment and readable walk/attack/hurt/KO state art.
- [ ] Walk in all eight directions: diagonal speed consistent; move in front of/behind enemies and confirm ground-point Y-sort, no torso/anchor flicker.
- [ ] Jump standing and moving: ground shadow stays under ground point, shrinks, visual rises/lands without depth drift; Space must not reactivate Start.
- [ ] Face left/right: art and attack reach mirror together; attack stops ordinary walking; airborne light attack is disallowed.
- [ ] Confirm startup/recovery cannot hit, repeated active ticks do not stack damage, out-of-depth/elevated targets miss; hurt interrupts attacks and knockback recovers.
- [ ] Verify health bar, player KO/loss/restart, selecting another fixture, bounded spawns, both waves and completion message.
- [ ] Record platform/engine, actual result, feel/readability problems and any fixes in progress before accepting Phase 3.

Automated `pnpm test:godot` checks input through the arena, actual PNG/atlas resources, both fixture speeds, normalization, bounds, jump/shadow transforms, state animation selection, attack timing/boxes/filtering/deduplication, damage/knockback/KO/HUD, AI approach/attack, player-melee defeat of controlled targets across both waves, cap/completion/loss/reset. Controlled combat tests do not substitute for a human playing against active AI.
