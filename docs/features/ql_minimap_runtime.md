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

Fixed Icon Size changes outer and inner minimap geometry together. It prevents
whole-map magnification but does not guarantee that every native icon keeps a
fixed pixel size. Turning it off must release inner width and height overrides.
Check markers, click targets, range circles, Alt/Tab switching and reset in the
repacked client.
