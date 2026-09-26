# ql_healthbar

Numeric healthbar-type dispatcher plus shared/variant modules; PLAYER_HEALTHBAR_* settings.

Source: [manifest.js](../../panorama/scripts/manifests/ql_healthbar/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

`shared.js` and the files in `variants/` load before this dispatcher in
`hud.xml`. `HEALTHBAR_TYPE` is numeric 0–5; do not introduce string theme names
into this contract. The dispatcher starts a 0.05-second loop and performs an
initial update. Variant teardown, common scale/opacity/offsets and accent state
all matter when switching styles. Profile the selected variant explicitly;
default-style measurements do not characterize Minecraft.

## Declared settings

- `HEALTHBAR_TYPE` (dropdown)
- `ENABLE_MINECRAFT_HEALTH_NUMBERS` (toggle)
- `PLAYER_HEALTHBAR_SCALE` (slider)
- `PLAYER_HEALTHBAR_OPACITY` (slider)
- `PLAYER_HEALTHBAR_X_OFFSET` (slider)
- `PLAYER_HEALTHBAR_Y_OFFSET` (slider)
- `PLAYER_HEALTHBAR_ACCENT_COLOR` (palette)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).

## Fighting Game geometry and lifecycle

FG reparents the existing gold `LevelAmount` / `HeroImage` subtree to the
`health_bar_border` inside `hud_health_bars`. It stays a sibling of the tinted
frame, so the frame wash does not tint the portrait. A CSS class positions it
at the hexagon center measured from the source frame texture and counter-rotates
it against the border's 90-degree turn. It inherits healthbar scale, offsets
and opacity; there is no separate scale-dependent portrait displacement.

The variant restores the original parent and child order on style switch,
disable, hideout, or loss/replacement of the anchor. Missing sources retry on
subsequent feature ticks. Native hero-image updates after reparenting still
require a client check, especially hero switching and respawn.

Regen uses an unrotated position below the bar in the same local coordinate
space. Current/max health and regen use upright `sansMono` text. The shared
scale reset clears the native `ui-scale` override, restoring the active CSS
base rather than pinning a replacement value.

`tests/healthbar_fg_reset.test.js` drives real settings row resets at 156/200
through all six healthbar modes and checks portrait ownership/restoration.
It also checks top/bottom bar resets and native CSS property-name conversion.
These are offline lifecycle/propagation checks. After compile/repack, verify
100/156/200 scales, both offsets, opacity, reset, hero switching, death/respawn,
style switching, and hideout return; inspect portrait binding and text geometry.
