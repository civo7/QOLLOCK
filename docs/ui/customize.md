# HUD customization editor

Customize is a registered settings tab. It edits existing persistent keys; it
does not introduce a second configuration format or a gameplay renderer.

Gameplay section headers also expose Customize for their declared surface. These
entries call the same editor with `start(onStop, {elementId})`. A scoped session
creates only that element's frame and inspector and hides the full catalog. Its
key whitelist rejects edits and resets belonging to other elements; lock controls
cannot expand the scope. Unknown IDs fail before opening or changing HUD state.
The standalone Customize tab lists editable HUD surfaces with independent frames.
It shows available surfaces by default; All elements also reveals hidden or
conditional surfaces. The current selection remains listed when hidden so it can
be re-enabled. Search filters this list, including localized field names. Empty
reference entries, separate-context screens and settings-only children do not
appear in the canvas catalog; their settings section retains its scoped action.
Scope and locks are
session-only and add no persistent settings or defaults.

Section entry bindings live in `ui/gameplay_tabs.js`; `ui/controls.js` only hosts
the optional action, and `ui/customize/tab.js` owns its launch behavior. The
ordinary gameplay tabs use these actions in place of position, scale, size and
opacity sliders. Exact values remain in the inspector, using the same stored
keys and wire precision. Search indexes the moved field names and keys and
returns the scoped action; section reset includes the action's settings. Native children follow their
parent's movement and existing shared colors retain their established ownership.

Whole-HUD root classes use the shared complete-configuration projector from the
app sync and reactive feature hooks.
Top Bar updates apply only that feature's styles; passing its local config slice
to the global class synchronizer would transiently reset unrelated settings.

The editor can open wherever the settings window is available, including menus
without gameplay HUD scripts. In that context exact values, HEX, reset, history
and Apply/Cancel remain available. No draft is sent to a generic menu publication
root, no live-preview acknowledgment is claimed, and native selection frames
remain absent. HUD identity comes from a named `Hud` or `CitadelHud` owner rather
than persistence's generic-root fallback. A context/HUD change ends the draft
instead of transferring it to a different gameplay tree.

`ql_customize_data.js` and the data modules in `scripts/customize/` are shared by
HUD and settings. They define scoped owner paths, existing editable fields and
normalization against current settings metadata. Published compact schemas stay
frozen; unsupported current values use the existing JSON envelope. The catalog includes native
HUD families, overlays, map/shop states and additions in other script contexts;
see [the visual surface inventory](../CUSTOMIZE_SURFACE_INVENTORY.md).

The shop surface uses `Shop/MainPanel`, while recent purchases use the sibling
`Shop/NavPanel/RecentPurchasesPanel` from the native shop layout. Quickbuy mode
controls include the existing Enhanced toggle and retain their shared config units.

The settings-only modules in `ui/customize/` separate the session, measured geometry,
inspector, window chrome, overlay and tab. Native HUD owners remain under their original parents.
Frames use the existing Panorama DragStart/DragEnd contract. A temporary,
input-transparent proxy is the compositor's displayPanel, while native HUD panels,
selection frames and corners retain their parents. The proxy origin is sampled
after native placement, so that the first compositor reparent cannot become a
HUD offset. Proxy movement updates only the draft; the gameplay manifest owns
the resulting HUD layout. Proxies are deleted after move drops or resize
settling, on canceled gestures and on exit, including after reparenting outside
the editor subtree.
Drop handling retains the last sampled compositor position if the temporary
visual has already been released before DragEnd delivery. Removing that visual
must not turn the final position into the origin or erase the gesture's history.
Movable frames receive the verified native XML `draggable` attribute at creation;
`SetDraggable` remains optional, as in the existing settings-header dragger.
The earlier unconditional call could abort startup on a native API without that
method, although the simulator always supplied it. Locks and capability guards
also gate the event handlers.

Idle frames are transparent. Hover and selection show an outline without a
content tint. Frames belong to independent movable/resizable surfaces and
explicitly measured standalone selections such as stamina/AP. Settings-only
entries that inherit an owner's geometry (health warnings, top-bar details,
quickbuy) remain in the catalog without a competing hit-test frame. Their native
owners can still be measured for availability. Hover identifies the element by localized
tooltip. Smaller surfaces have input priority within larger family frames;
editor chrome remains above all frames. Small elements receive a padded input
area with a separate outline of the actual measured content. Corners use the
padded area so the center remains available for moving.
Show frames exposes the outlines together. Hide panels
temporarily collapses the catalog and inspector while retaining the view controls.
These controls update actual panel visibility/outline styles as well as classes.
Catalog, inspector and toolbar have dedicated draggable headers; their positions
are session-only and bounded to the measured viewport. Interactive children do
not act as window drag handles. Viewport and selection changes re-clamp moved
windows without transferring them to the compositor.
These view choices are session-only. Missing elements are dimmed in the catalog;
the selected inspector shows their availability without repeating a suffix on
every catalog row.
The canvas consumes activation, and EscapeBackground is guarded during an editor
session. Missed clicks preserve the draft instead of resuming gameplay. Explicit
Cancel and Escape discard the draft and return to the still-open settings
window. The overlay's `oncancel`, focused settings window, native escape-menu
root and existing MenuBack binding all route through the same cancellation
guard. Duplicate delivery of one MenuBack cannot also close settings or resume
gameplay; the next separate Escape retains ordinary settings/menu behavior.

Colors appear in the inspector with preset swatches, a HEX entry,
preview chip and native Default action. Numeric and HEX entries also submit on
blur; malformed values remain marked rather than overwriting the accepted draft.
The AP/infinity currency has its own selection frame under AbilitiesContainer.
Its inspector exposes the existing shared bottom-bar color and an independent
overall scale and independent offsets. AP and stamina offsets are applied by
`ql_presentation_scale`; their native parents stay unchanged. They use the
existing settings envelope without changing any published compact schema.

Modern compact stats are measured through the active owner's HudStatBlock;
expanded modifier rows do not enlarge the compact block's hit box. The coexisting legacy owner is
selected only when its content has layout; otherwise the active owner is used by
both editor and gameplay manifest. Stamina frames measure the native foreground
pips rather than an unrelated ability-charge widget.
The stamina runtime first resolves the same named dash owner as the editor.
Resetting rotation/color releases the owned native style overrides, matching
initial default startup instead of leaving a forced transform or wash behind.

The editor suppresses hero-testing controls and the native party/friends container
while active. The session class releases both visibility overrides on exit.
The separate native
ClientStatus overlay removes its default logo/early-build block through the
`citadel_client_status.css` override. Its connection, version and matchmaking
status entries retain native styles; they are not part of the hidden menu tree.

Top-bar frames measure the union of native player detail cards, clock, score and
objective content from the extracted top-bar layouts. They exclude the full-height
TopBar, TeamsContainer, PlayersContainer, chat and background owners. If no known
content can be measured, no full-screen fallback frame is created.

Panels, buttons and typography use the shared `QOLUnifiedModal*`, `ModalTitle`,
`ModalInstructions` and `ValueInput` styles. The active settings theme applies to
the editor through the ordinary theme classes. Customize CSS owns its layout,
selection frames, swatches and invalid-field state; it does not define a separate
button palette or text font. The launch page uses the same shared controls.
Startup/update exceptions are logged and shown as diagnostic text rather than
being described as a requirement to enter a match.

The session holds a draft, selection locks and bounded undo/redo history. Reset
stays beside Undo/Redo outside the scrolling inspector and reads current defaults
for the selected element from source. Undo reverses one accepted edit or gesture;
Redo restores the edit reversed by Undo until a new edit replaces that branch.
History actions accept valid pending entries first. Toggle, enum and palette
actions accept pending entries in other fields together with their own change.
Button captions do not intercept input intended for their button.
The inspector previews valid numeric and HEX input after a short typing pause;
Enter and blur also accept it. Incomplete input stays in its field and does not
overwrite the preview. Accepted typing preserves the caret until blur; history,
reset, selection changes and closing cancel pending callbacks. Opacity and
multiplier scales display percentages while retaining their original stored
units. Exact position remains visible without a disclosure; color presets can
be expanded separately. Player Stats placement uses the same coordinates and
canvas gestures as other surfaces; its legacy Side setting is absent from both
the editor and ordinary gameplay controls. Visibility controls distinguish hiding a panel from
enabling custom layout or a magazine indicator.
Range feedback localizes the complete `Use a number from {min} to {max}.`
source key before substituting the displayed numeric limits.

Stamina Rotation displays an additional angle from the current native layout:
zero leaves the native transform unchanged. `ql_customize_data.js` owns the
shared `toDisplayValue`/`fromDisplayValue` conversion used by the inspector,
ordinary slider and stamina renderer. The published `STAMINA_CHARGE_ANGLE` field
retains its legacy no-op sentinel for existing configs; rendering a control does
not rewrite it. This sentinel is not evidence that the engine rotates the native
container by that angle. Default/color-only presentation releases the transform
override, and custom rotation composes with the observed native transform.

Numeric entries use current field metadata; supported
color entries use [tagged RGB](../core/custom_colors.md). Missing conditional
panels keep their controls available through All elements or a scoped action.
Children without independent offsets inherit
their parent's placement. Souls, items, stamina, compact stats, speed, ammo, AP and damage report have
independent overall scales, applied by `ql_presentation_scale` through `ui-scale`.
It multiplies the verified CSS baseline for the current mode and releases its
override at default, disable or owner replacement; content, rotations and
visibility keep their existing owners.
Compact stats scale the content block rather than its full-screen wrapper.
Frame geometry uses actual native layout measurements, including stamina pip
unions, without multiplying them again by the configured scale.
A panel replacement or hidden owner cancels an active move/resize gesture.
Measurements account for menu origin, scroll offsets and native UI scale; the
simulator cannot establish native layout or input behavior.

Selected surfaces with a declared overall scale or size expose a draggable
handle at each of the four corners. Every handle is aligned inside the input frame;
it is never a separately positioned drag visual. The selected inspector explains
the element's actual move/resize capabilities. Corner movement projects onto the
signed starting input-frame diagonal and edits the existing scale/size on its current settings grid, preserving its bounds and making one history
entry per gesture. It changes uniform scale/size rather than independent dimensions. Where pixel
offsets exist, the opposite corner is held using acknowledged native layout
measurements. A preview acknowledgment alone is insufficient: compensation
waits for dimensions to reflect the requested scale and remain stable across
samples. A new scale supersedes the old anchor measurement. End-of-drag
settling remains part of the same undo entry. Elements without independent
pixel offsets retain their native placement. Geometry controls precede palettes.
Shop, reload, item cooldowns and base/Alt/Tab minimap corners reuse their existing
scale/size fields.
Ammo's legacy panel-scale key aliases current-ammo font size, so it remains
accepted by the session but is hidden from the inspector; the current and total
ammo controls remain available. Overall ammo resizing uses a separate scale for
the complete group, including the magazine, without changing those text sizes.

Magnets align viewport/neighbor edges and centers in canvas units. Guides appear
only when acknowledged native bounds meet the proposed alignment; clamped or
delayed offsets do not produce a false guide. Explicit alignment actions use
the measured viewport and the same offset conversion as dragging. Actions after
typed edits wait for their preview and the measured offset/size change before
calculating a delta; an unavailable layout times out without applying a stale
alignment. History, Reset and selection changes cancel a queued action. Magnets are
session-only and independent of persistent offsets.

Current pixel offsets use finer settings precision independently of historical
compact schemas. Native souls/items/top-bar/signature/active-item offset bounds
agree between current metadata and gameplay consumers. The existing envelope
preserves values outside the frozen binary layout.

Dragging requires declared offsets. Cooldown offsets retain their percentage
units and convert against the measured parent's physical dimensions; missing
measurements prevent an edit instead of assuming a screen resolution. Verify
both Basic and Advanced containing blocks in the client. Minimap base/Alt/Tab
entries measure the content but move the native host, with Alt priority when both
zoom states apply. World-bound targets and damage numbers use their existing
size/visibility controls, without screen-position frames.

Ammo and player-stats placement use expanded current-schema bounds consistently
in the editor, ordinary controls and gameplay owners. Historical compact schemas
retain their original bounds. The stats manifest and editor share the same
visible-owner selection, including the coexisting collapsed legacy stats block.
Legacy Side values round-trip without changing native docking or exposing a control.

`core/ql_customize_preview.js` carries a leased draft through HUD attributes.
The existing app config poll validates the session stamp and field whitelist,
then normalizes the draft through the ordinary config merger and applies it to
feature configuration and shared root styles/classes. Derived threshold masters
and legacy ammo-scale aliases therefore follow the normal save semantics.
Canonical `State.lastConfig`,
storage attributes and exports remain unchanged during preview. Cancel, menu
exit, expired leases and conflicting canonical edits restore canonical settings.
Withdrawal expands a sparse canonical snapshot with current defaults before
loading merging feature buckets; missing keys must not retain preview values.
The preview indicator requires acknowledgment of the current payload, not just
an earlier payload from the same session.
Benchmark stress configuration blocks the preview layer.

The player healthbar frame measures its shared scale canvas, while position and
opacity remain on the native owner. See [healthbar contracts](../features/ql_healthbar.md).
Other overall scales that compensate CSS baselines read feature classes from
`CitadelHud`, not its separate native window root.

The native souls, inventory, top bar and signature owners use an owned collapse
style while their visibility setting is off. This cannot be outbid by native
ID/state CSS rules as the generic `qol-hidden` class could. Enabling, replacement
and teardown release that override so native conditional visibility applies.
Souls and healthbar offsets explicitly return layout coordinates to zero before
releasing native `position`; a cleared JS x/y record alone is not a layout check.

Apply commits pending valid input through MarkConfigDirty/FlushPendingSave, then
uses storageBridge.saveSettings. The editor reports success only after the CEF
response. Failed saves retain applied settings and offer Retry save or Close.
Closing a draft discards it; closing after Apply does not undo the committed edit.
This response does not prove persistence across a native client restart.

The editor implementation and catalog are still awaiting maintainer compile,
repack and client acceptance. Use [the release checklist](../TEST_CHECKLIST.md).
