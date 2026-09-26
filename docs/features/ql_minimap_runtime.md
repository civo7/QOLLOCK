# ql_minimap_runtime

Base/Alt/Tab geometry, opacity, crates, tunnels and minimap presentation.

Source: [manifest.js](../../panorama/scripts/manifests/ql_minimap_runtime/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Owns base/Alt/Tab geometry and presentation, not the objective state
machine. `engine:scoreboard_toggle` schedules an immediate follow-up tick.
`_determineOptimalRate` returns 0.05 seconds when Alt zoom is enabled or the
base minimap size is customized; otherwise it returns 0.5 seconds. Do not copy
the nearby stale 10Hz comment instead of this function. Preserve original-parent
tracking for draw-over-UI behavior and shared rotation/flip ownership with
`ql_compass`. Crate positions come from `ql_minimap_crate_data.js`.

## Declared settings

- `ENABLE_ALT_ZOOM` (toggle)
- `ENABLE_TAB_ZOOM` (toggle)
- `MINIMAP_BASE_OPACITY` (slider)
- `MINIMAL_MINIMAP` (toggle)
- `MINIMAL_MINIMAP_OPACITY` (slider)
- `MINIMAP_SMALL_SIZE` (number)
- `MINIMAP_X_OFFSET` (number)
- `MINIMAP_Y_OFFSET` (number)
- `MINIMAP_LARGE_SIZE_ALT` (number)
- `MINIMAP_LARGE_SIZE_TAB` (number)
- `ZOOM_X_OFFSET_ALT` (number)
- `ZOOM_Y_OFFSET_ALT` (number)
- `ZOOM_X_OFFSET_TAB` (number)
- `ZOOM_Y_OFFSET_TAB` (number)
- `ALT_ZOOM_OPACITY` (slider)
- `TAB_ZOOM_OPACITY` (slider)
- `ALT_ZOOM_DRAW_OVER_UI` (toggle)
- `TAB_ZOOM_DRAW_OVER_UI` (toggle)
- `ENABLE_MINIMAP_CRATE_OVERLAY` (toggle)
- `ENABLE_MINIMAP_REM_TUNNELS` (toggle)
- `MINIMAP_REM_TUNNELS_OPACITY` (slider)
- `ENABLE_ALT_ZOOM_REM_TUNNELS` (toggle)
- `ALT_ZOOM_REM_TUNNELS_OPACITY` (slider)
- `ENABLE_TAB_ZOOM_REM_TUNNELS` (toggle)
- `TAB_ZOOM_REM_TUNNELS_OPACITY` (slider)
- `MINIMAP_ICON_COLOR` (palette)
- `MINIMAP_FLIP` (toggle)
- `MINIMAP_ROTATE_WITH_PLAYER` (toggle)
- `ENABLE_MINIMAP_ELEVATION_MARKERS` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
