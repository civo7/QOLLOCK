# Customize completion and movement investigation

This is the active follow-up to the October 2026 Customize audit. Source and
tests remain the authority for current values. Offline completion and client
acceptance are separate states. No item below claims native rendering or FPS.

## Completed offline

- One-pixel Ammo/Stats movement and a default-relative Better Unsecured Y display.
- Ammo group movement/scale across digits and sibling magazine rings, including
  ring-only layouts; independent Current/Max offsets with Max's native separator.
- Missing surface opacity controls with default override release.
- Scoped Target Shapes discovery, missing Stat Bonuses source backoff and
  reduced duplicate Crosshair Stats discovery.
- Shrinkable Current/Max fonts and expanded Reload offset metadata.
- Conditional CSS overflow release on verified Ammo/Reload layout ancestors.
  The original native parents, bindings and radial clips remain intact.
- Expanded pixel bounds for owned overlays and shop/purchase surfaces; own
  overlays use x/y over fixed baselines rather than offset-sized margins.
- Conditional Shop/NavPanel overflow release, preserving history scroll masks.

## Movement investigation

The extracted gun layout gives the gun a small fixed canvas and the reticle a
smaller fixed square. Native progress bars use intentional radial clipping.
The numeric reload label is a QOL child of the reticle; Ammo digits and magazine
rings also descend from the gun. Opening overflow on the leaf alone cannot
address an ancestor clip. The conditional CSS change opens only layout ancestors
when a participating owner requests non-default geometry.

Do not widen every setting blindly. Inspect each ancestor's bounds, overflow,
clip, visibility, opacity and engine-driven placement. Margins participate in
layout and can consume a fit-children container's available size; x/y or a
translation may be a better offset adapter if client evidence confirms this.
Changing transform can overwrite native animation, so retain the owner's
existing convention unless a verified adapter preserves it.

Preferred escalation order:

1. Scoped CSS overflow on the confirmed blocking layout ancestor. Keep scroll
   containers, compass tick masks and radial progress clips intact.
2. Fix the placement adapter if the panel shrinks or is pushed out of layout.
3. A dedicated layout canvas/XML wrapper when a confirmed hierarchy requires
   it. Preserve native IDs, context/bindings, listener inheritance and selectors;
   native C++ direct-child assumptions must be checked before changing ancestry.
4. If CSS does not prevent disappearance, capture the live ancestor chain at
   the last visible and first invisible offset. Do not infer engine culling
   or recreate native bound panels from an offline simulator.

No new mirrored native renderer is planned. Existing feature mirrors are not
an instruction to duplicate more panels for geometry.

## Remaining implementation

- Inspect remaining native Keyboard/minimap/healthbar bounds and percentage
  cooldown placement. Keep legacy units and defaults; do not open scroll masks.
- Confirm native geometry for changed offset adapters and compare saved
  nonzero positions against the previous build before declaring visual parity.
- Complete the inspector/theme/localization visual pass, including control
  ordering, units, small typography and Basic/Advanced capabilities.
- Audit remaining missing-source Timer/Audio discovery, chat image embedding,
  Recent Purchases and populated Active Stats. Preserve replacement and short
  transient source detection; do not trade correctness for lower counters.
- Compare matched populated-source profiles with Customize open/closed and
  transition scenarios. Counter reductions are not frame-time improvements.
- Optional separate scope: independent Quickbuy, map timers, Build ID and
  top-bar details. These require confirmed owners rather than invented paths.

## Maintainer client acceptance

After maintainer compile/repack, verify distant movement and all corner resizes,
typed input, magnets, undo/redo/reset, Cancel/Escape during gestures, save,
restart and imports. Include normal gun/Tokamak, all healthbar variants,
Base/Alt/Tab maps, Basic/Advanced cooldowns, resolutions/aspects/UI scales,
shop, scoreboard, death/respawn, hideout and living owner replacement.

For disappearing panels capture the leaf and each ancestor through HudCore:
ID/type/classes, actual layout size/offset, computed overflow/clip/visibility/
opacity/transform, at two neighboring offsets before and after disappearance.
Use identical hero, scene and settings for native frame-time/1% low comparisons.
