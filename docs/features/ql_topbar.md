# ql_topbar

Top-bar geometry/visibility and shared warning/objective settings.

Source: [manifest.js](../../panorama/scripts/manifests/ql_topbar/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Applies immediately, then starts a 0.5-second loop. Owns top-bar geometry
and selected native presentation classes, not every child overlay. Nicknames,
rank, ultimate text, purchases and health warning logic have separate owners.
Before changing a shared parent or key, check those consumers and disable-state
restoration.

## Declared settings

- `HUD_TOP_BAR_ENABLED` (toggle)
- `ENABLE_OBJ_MAP` (toggle)
- `ENABLE_MISSING_HERO` (toggle)
- `ENABLE_OBJ_DMG` (toggle)
- `DISABLE_PLAYER_NAME_BLUR` (toggle)
- `ENABLE_TOPBAR_ENEMY_HP_WARNING` (multitoggle)
- `ENABLE_TOPBAR_ALLY_HP_WARNING` (multitoggle)
- `ENABLE_URN_DIFF` (toggle)
- `TOP_BAR_OPACITY` (slider)
- `TOP_BAR_SCALE` (slider)
- `TOP_BAR_X_OFFSET` (slider)
- `TOP_BAR_Y_OFFSET` (slider)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
