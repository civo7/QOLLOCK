# ql_minimap_timers

Minimap objective overlays; consumes Rejuvenator state instead of owning another phase engine.

Source: [manifest.js](../../panorama/scripts/manifests/ql_minimap_timers/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Starts with an immediate tick and a 0.3-second loop. Renders standard and
bridge-positioned buff/Rejuvenator plates. Reads `QOL.state.rejuvState` maintained
by `ql_rejuv_hud`; do not duplicate its phase state machine here. Objective
spawner queries and overlay-anchor caching have different lifetimes. Preserve
position signatures and verify actual alignment at the requested minimap sizes;
base-coordinate scaling is not proof of drift-free rendering at every size.

## Declared settings

- `ENABLE_MINIMAP_REJUV_TIMER` (toggle)
- `ENABLE_MINIMAP_BUFF_TIMER` (toggle)
- `ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE` (toggle)
- `ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS` (toggle)
- `ENABLE_TAB_ZOOM` (toggle)
- `ENABLE_ALT_ZOOM` (toggle)
- `MINIMAP_SMALL_SIZE` (slider)
- `MINIMAP_LARGE_SIZE` (slider)
- `MINIMAP_LARGE_SIZE_ALT` (slider)
- `MINIMAP_LARGE_SIZE_TAB` (slider)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
