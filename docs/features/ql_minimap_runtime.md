# Minimap runtime contracts

The [manifest](../../panorama/scripts/manifests/ql_minimap_runtime/manifest.js)
owns Base, Alt and Tab minimap geometry, opacity, crates and tunnels.
[ql_compass](ql_compass.md) owns rotation and flip; objective overlays and
Rejuvenator phase state have separate owners. Crate positions come from
`ql_minimap_crate_data.js`, refreshed from the supplied MapHunter static table.
It is an authoring input rather than a loaded HUD script.
Crates belong to the native `hud_minimap` render surface so native zoom,
rotation and flip apply to their reference coordinates. Tunnels retain their
viewport anchor. Crates and tough crates follow their toggles throughout the match.
Crate container and marker rules load through the native minimap stylesheet.
Both reference owners suppress their overlays in hideout and Street Brawl in
their runtime paths, so inline visibility cannot defeat the mode gate.

Ordinary crates, tough crates, healing snacks and statues each render as one
full-map image panel. Their generated `.vsvg` resources preserve the source
coordinates, colors, outlines and underground opacity. Run
`node scripts/generate_minimap_reference_images.js` after changing the reference
tables; regression checks reject stale generated resources. Marker size selects
a prepared image through the existing setting. Positions stay fixed while the
selected point sizes change; the images and their points scale with the native
map in Base, Alt, Tab and native zoom, including Fixed Icon Size mode. This is an
agreed change from independently pixel-sized point panels. Numeric bounds and
steps remain owned by the current settings catalog; default and codec IDs are
unchanged. No per-point panel implementation remains active.

The separate `ql_minimap_loot` owner adds static tough-crate, healing-snack,
statue, localized district-name and numbered route layers. Their source is
`ql_minimap_loot_data.js`; this is a reference map, with no live loot availability
tracking. Discovery follows direct native owner breadcrumbs and waits when they
are absent. A positive native Midtown class is required for these new layers.
Native district tokens supply HUD translations, independently of the settings
language. Routes follow their toggle throughout the match; appearance settings never
move the map-relative coordinates. Opacity and visibility changes reuse the
created groups and images. Marker size switches images without recreating panels;
names and routes retain their existing individual text/stroke panels.
Marker and route scale changes refresh only their
affected geometry, including hidden groups before reveal; district-name selection
retires only the name group. Disable/replacement retires all owned children.

Route strokes use one owned panel per nonempty straight leg with a shared white
dash texture, tinted by lane. Native background repetition clips the last tile
at the leg endpoint. The tile period is a fraction of the leg width, preserving
map-relative dash lengths and gaps while its height follows the pixel route
scale. Native renderer resizing, zoom, rotation and flip therefore continue to
position the strokes; numbered stops retain their individual loot-text
orientation classes. The native CSS background-size, background-position and
background-repeat contracts are exposed in the current client, including
percentage sizes and repeat-x. After maintainer compile/repack, check dash
spacing, endpoints, lane colors and stop numbers in Base/Alt/Tab, both icon-size
modes and native zoom levels. Offline geometry checks do not establish texture
filtering, native rendering or FPS gains.

The ordinary-crate and loot roots request an offscreen native composition layer
and its persistent cache through creation properties. Native inspection confirmed
that `require-composition-layer` contributes a layer-creation reason, whereas
`always-cache-composition-layer` only affects an already-created layer. Both are
needed for this request; copying only the cache policy from a translucent native
component does not establish a layer for an otherwise opaque reference root.
Only the two static reference trees request this composition. Native moving map
content and tunnels are not included in either tree; individual markers do not
request their own composition layers.
Images own the point coordinates; remaining text and route children still own
their geometry and localization. Each category keeps its original setting gate.

Both feature instances expose a diagnostic-only `diagnostics.begin()` lease to
the minimap investigation runner. The lease has `apply(controls)`, `snapshot()`
and `restore()`: controls are transient, do not alter configuration, and are
rejected after disable or replacement by a newer lease. Visibility gates remain
inside the owners, so recurring updates cannot accidentally undo a diagnostic
hide. Loot groups can be hidden individually without retiring their children.
Runtime controls separately release its geometry or native decoration overrides
while preserving created references and native content. A temporary skip-sweep
control is for causal measurements, not a change to normal lifetime recovery.
Native decoration targets and coherent placement/viewport groups can be released
independently; selectable individual geometry roles carry a visual/structural
confound warning. `diagnostics.inspect()` reads state without acquiring a lease.
`diagnostics.retirement()` remains callable on a retired instance and reports
actual owned-tree/native-style cleanup completion. State proofs also validate
native-style leases and current readbacks in ordinary baseline states.

Creation-time composition variants (`cache`, `layer`, `none`) retire and rebuild
only the owner's created trees; the runner must wait for complete reconstruction
before sampling. Restoring the lease returns to the production cache policy.
Snapshots report actual handle identities, immediate child counts, expected
marker counts, requested creation policy, local visibility/code/size evidence
and stage counters. Local visibility evidence is not proof of native clipping,
ancestor computed opacity or composition reuse. These diagnostic controls do
not measure FPS; only the external native capture can establish frame effects.

After repacking, compare native PresentMon frame captures in the same scene.
Check cache updates after marker/route scale, opacity, group and district-name
changes, Base/Alt/Tab resize, native zoom, rotation/flip and renderer replacement.
Also check edge clipping, text quality and GPU memory use: the simulator cannot
verify native invalidation, composition reuse or performance.


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
Geometry and native renderer/content appearance use the common native-style
owner, with distinct property plans. Native readback invalidates cached writes;
rejected retirement remains retryable after disable. Created tunnel and crate
trees retain their separate created-child lifecycle. The renderer's minimalist
class has one native owner rather than parallel discovery and render writers.

Content discovery also observes replacements of `canvas`, legacy `map_render`
and the background images inside `MinimapBackgroundTest` in an unchanged
viewport. Minimalist opacity fades those images individually, preserving the
native surface/underground/tunnel opacity gates and the sibling canvas/effects.
Previous living native targets release their
owned tint/opacity overrides and range class; tunnel and crate panels belong to the
current anchor generation. Missing native sources are retried without treating
a live cached handle as evidence that the current map still contains it.

Range normalization is scoped by a renderer-owned class in the native minimap
stylesheet. Doorway and ability-range descendants, including late or replaced
snippets, inherit the rule without runtime range discovery or per-circle code
styles. Default map size, decoration release, renderer replacement and disable
remove that gate. Diagnostic snapshots alone query range presence so the
native-ranges contrast still requires an actual target; its release control
removes the same class. After compile/repack, verify range circles with enlarged
Base/Alt/Tab maps and doorway recasts; offline checks do not compute native CSS.

Settings are derived in lifecycle hooks; the active poll samples native view
state without rebuilding the configuration model. Stopped settings/event hooks
cannot recreate presentation or polling. Current HUD replacement releases the
previous presentation, and temporary loading roots cannot own map overlays.
Alt/Tab offsets retain their existing one-sided margin units: center alignment
moves the viewport by half the margin change. Customize accounts for that ratio
in dragging, frame previews, alignment, resize anchoring and slider travel;
saved offsets and the Base minimap's edge-aligned units remain unchanged.
Crate and tunnel trees use complete created-child ownership, including images
moved outside their container. Reference data changes require regenerating the
source images rather than changing live JavaScript coordinate arrays.
Partial construction or style writes stay hidden
until a later active poll succeeds; rapid re-enable waits for previous queued
trees to retire rather than adopting them.
The single crate image uses the existing owned-tree batch and complete ownership
checks. Source replacement and rejected creation/style writes still recover at
the active cadence without reconstructing per-point children.

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

`minimap_persp` is a non-square native host for location text and edge UI. Both
icon modes keep its native dimensions and unit scale, with `noclip` allowing the
square viewport to grow beyond it. Magnifying that taller host can let screen
height constrain one axis before the other. Ordinary mode instead applies
`ui-scale` to the square viewport; fixed-icon mode changes its dimensions.
Both paths neutralize the viewport's native scale and insets, align its bottom
right corner in Base, and center it in Alt/Tab. Switching icon modes therefore
keeps the same map size and anchor. The viewport retains native clipping, and
disable releases the owned geometry without changing saved sizes or offsets.
Configured Base/Alt/Tab opacity applies to the square viewport, including its map
overlays. The smaller native host remains opaque: native alpha composition clips
an enlarged viewport to that host's bounds even with `noclip`. Location labels
and hints outside the viewport retain their native opacity. Check translucent
views as well as fully opaque views after repacking.
Check markers, click targets, range circles, Alt/Tab switching and reset in the
repacked client.
