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

Fixed Icon Size changes the outer minimap and viewport geometry together, but
must leave `hud_minimap` width and height under native control. Build 6711 uses
a larger internal render surface for zoom modes; replacing it with viewport
dimensions distorts native text and map elements. Turning Fixed Icon Size off
must release the remaining inner width and height overrides.

The same build changed `minimap_persp` to a non-square native host so location
text and edge UI fit around the square map viewport. Scaling may use `ui-scale`,
but must not replace that host's native width or height.
Check markers, click targets, range circles, Alt/Tab switching and reset in the
repacked client.
