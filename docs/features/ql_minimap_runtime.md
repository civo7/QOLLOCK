# Minimap runtime contracts

The [manifest](../../panorama/scripts/manifests/ql_minimap_runtime/manifest.js)
owns Base, Alt and Tab minimap geometry, opacity, crates and tunnels.
[ql_compass](ql_compass.md) owns rotation and flip; objective overlays and
Rejuvenator phase state have separate owners. Crate positions come from
`ql_minimap_crate_data.js`.

Draw-over-UI behavior uses a stacking override without reparenting
`minimap_persp`. The native location labels inherit their district/building
dialog variables through the HUD hierarchy and resolve as `INVALID` if that
listener is moved. Tab state comes from the stationary HUD scoreboard listener.
Scoreboard toggle is a refresh trigger, not a boolean state payload. Deferred
refreshes belong to the feature Scheduler task group so disable cancels them;
event subscriptions still require explicit removal.

The feature's `geometry.js` owns scoped native-panel discovery and its style
records. Base, Alt and Tab use the same viewport geometry path; replacement
panels invalidate the applied presentation. Disabling releases only the geometry
overrides and renderer class owned by that path. Whole-HUD classes remain owned
by the app's complete configuration synchronization.

Content discovery also observes replacements of `canvas` and `map_render`
inside an unchanged viewport. Previous living native targets release their
owned tint/opacity/range overrides; tunnel and crate panels belong to the
current anchor generation. Missing native sources are retried without treating
a live cached handle as evidence that the current map still contains it.

Settings are derived in lifecycle hooks; the active poll samples native view
state without rebuilding the configuration model. Stopped settings/event hooks
cannot recreate presentation or polling. Current HUD replacement releases the
previous presentation, and temporary loading roots cannot own map overlays.
Crate and tunnel trees use complete created-child ownership, including markers
moved outside their container. Crate data replacement reuses unchanged indices
and retires removed branches. Partial construction or style writes stay hidden
until a later active poll succeeds; rapid re-enable waits for previous queued
trees to retire rather than adopting them.

Objective overlays consume the separate [phase producer](ql_objective_timers.md).
Their fixed-icon bridge surface and placement use the same Base/Alt/Tab size
and view precedence as this owner. Ordinary map scaling retains the logical
surface that scales with its parent; fixed-icon mode keeps timer text/icon size
while moving the bridge positions with the resized viewport.

Fixed Icon Size resizes the viewport without magnifying its HUD parent. The
renderer must resize with it: leaving `hud_minimap` at its fixed native pixel
dimensions enlarges only the surrounding frame. The scoped renderer class in
`hud_minimap.css` expresses native dimensions as viewport-relative percentages,
preserving the original render/viewport proportions. Native zoom-level and
scoreboard selectors still choose the corresponding internal render surface;
the large zoom surface must not be replaced by a viewport-sized square. Turning
Fixed Icon Size off releases the viewport width/height overrides and class so
the native pixel dimensions apply again.

The same build changed `minimap_persp` to a non-square native host so location
text and edge UI fit around the square map viewport. Scaling may use `ui-scale`,
but must not replace that host's native width or height.
Check markers, click targets, range circles, Alt/Tab switching and reset in the
repacked client.
