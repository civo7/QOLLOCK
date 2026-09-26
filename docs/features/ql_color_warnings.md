# ql_color_warnings

Player/ally/enemy health warning classes and colors; shared threshold keys.

Source: [manifest.js](../../panorama/scripts/manifests/ql_color_warnings/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Starts a 0.16-second loop; the source attributes that cadence to warning
pulse animation. It handles health warning/color state for the player and
ally/enemy top-bar contexts, not low-stamina screen-border alerts. Threshold
keys overlap related health/top-bar settings; inspect every owner before
changing normalization or enable routing.

## Declared settings

- `ENABLE_COLORED_HEALTHBAR` (toggle)
- `ENABLE_COLOR_WARNING_25` (toggle)
- `ENABLE_COLOR_WARNING_65` (toggle)
- `ENABLE_COLOR_WARNING_75` (toggle)
- `ENABLE_ENEMY_COLORED_HEALTHBAR` (toggle)
- `ENABLE_TOPBAR_ENEMY_HP_WARNING_25` (toggle)
- `ENABLE_TOPBAR_ENEMY_HP_WARNING_65` (toggle)
- `ENABLE_TOPBAR_ENEMY_HP_WARNING_75` (toggle)
- `ENABLE_ALLY_COLORED_HEALTHBAR` (toggle)
- `ENABLE_TOPBAR_ALLY_HP_WARNING_25` (toggle)
- `ENABLE_TOPBAR_ALLY_HP_WARNING_65` (toggle)
- `ENABLE_TOPBAR_ALLY_HP_WARNING_75` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
