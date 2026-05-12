# QOLLOCK Test Checklist

Use this checklist after significant changes or before sharing a build.

## Build / Launch
- Run pipeline: `scripts/qollock_pipeline.ps1` with changed files.
- Confirm game closes, packs, then launches once at the end.
- Confirm no compile errors and pack archive is created.

## Core HUD Stability
- Open into a normal match and verify HUD loads (no missing critical panels).
- Open ESC/settings menu and confirm QOL LOCK menu opens normally.
- Check for Panorama error spam in console after 1-2 minutes.

## Item Cooldowns
- Enable Item Cooldowns and verify:
  - cooldown text appears and updates smoothly
  - ready flash triggers only at cooldown completion
  - rapid retrigger does not show stale `0.1` text
- Validate classless exceptions:
  - Express Shot
  - Backstabber
  - Spirit Shielding / Weapon Shielding pair
- Verify filter buckets still work (off/def, active/passive).

## Presets / Account Binding
- Confirm bound account auto-loads intended preset on startup.
- Confirm bound account can still manually change settings.
- Confirm preset button highlighting reflects current config state.

## Top Bar / Overlay Features
- Verify team SPM renders and does not start with bad negative values.
- Verify urn difference tracker displays and updates.
- Verify rejuv/buff timers display and update properly.

## Crosshair / Ammo / Reload
- Verify ammo controls: size, horizontal offset, vertical offset.
- Verify hide total ammo behavior uses opacity (no layout shifts).
- Verify reload cooldown text appears when expected.
- Verify hide reload icon / hide reload circle interactions.

## Minimap
- Check base minimap and tab-open behavior.
- Ensure enemy icons remain circular during visibility transitions.

## Keyboard Overlay
- Verify base key glyphs render.
- Verify fallback/unbound logic does not overlap.
- Verify no settings lockout behavior is introduced.

## Shop
- Verify shop category toggles apply correctly.
- Verify simplify shop, blur, quick-buy, and offset options.

## Performance Pass
- Let match run for several minutes with common enabled features.
- Confirm no persistent debug spam in hot paths.
- Confirm no obvious FPS/UI hitches from new logic.
