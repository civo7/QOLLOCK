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
- `MINIMAP_FIXED_ICON_SIZE` (toggle)
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

The experimental Icon Scale control and its per-icon runtime styling have been
removed. Compact 4.0.1 presets remain readable, but new exports omit that field.
The existing Size sliders control Base/Alt/Tab minimap geometry; native icon
rendering still requires client verification.

The checkbox to the right of Base -> Size, Fixed Icon Size, defaults off.
Off preserves the 400px geometry with
`uiScale` derived from the active Size setting. On uses the active Base/Alt/Tab
Size as the width and height of `minimap_persp` and the inner cached minimap
containers/frame, with outer `uiScale` fixed at 100%. The inner container and
frame have fixed 400px CSS dimensions: changing only the outer panel leaves the
map small and centers it within the enlarged parent. Turning the checkbox off
releases inner width/height overrides back to CSS. Row reset restores both Size
and the checkbox.
This removes whole-HUD magnification; it does not guarantee a fixed pixel size
for icons whose native dimensions depend on the map size. No individual icon
styles or new minimap CSS rules are applied. Switching modes is reactive and
uses the same offsets and zoom selection. Compact 4.0.2 stores the toggle.
Client checks must include camp/Sinner markers, range circles, icon positions,
click targets, Alt/Tab zoom and switching back to the default mode.

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).

Scoreboard visibility now uses `QOL.core.hud.isScoreboardOpen`, including the native GlobalClassListener fallback. The toggle event is a refresh trigger, not a boolean state payload.

Event-triggered deferred refreshes use `Scheduler.scheduleOnce` with the feature ID, so disabling the feature cancels pending callbacks as well as its recurring loop. Event unsubscription remains explicit.
