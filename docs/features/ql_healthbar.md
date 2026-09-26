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
