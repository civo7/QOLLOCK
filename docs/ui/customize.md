# HUD customization editor

Customize is a registered settings tab. It edits existing persistent keys; it
does not introduce a second configuration format or a gameplay renderer.

Gameplay section headers also expose Customize for their declared surface. These
entries call the same editor with `start(onStop, {elementId})`. A scoped session
creates only that element's frame and inspector and hides the full catalog.
Ammo opens its family frame plus Current and Max Ammo, with a catalog limited
to those three selections. Its
key whitelist rejects edits and resets belonging to other elements. Unknown IDs
fail before opening or changing HUD state.
AP and Active Items have no empty standalone subsection in the ordinary HUD
settings. They remain separate selections in the full Customize catalog.
The Customize tab provides grouped shortcuts to feature inspectors, including
settings-only and contextual selections. Empty references and inherited details
are omitted from these shortcuts; Ammo and Player Stats open their child selections
through their family editor. Open editor launches the shared canvas catalog of
HUD surfaces with independent frames. That catalog starts with available surfaces
in a gameplay HUD. All elements exposes hidden
or conditional surfaces so zero opacity, state hiding and off-screen placement
can be repaired without a configuration reset. Menu-only sessions show all
surfaces because there is no gameplay layout to filter.
The current selection remains listed when hidden so it can
be re-enabled. Search filters this list, including localized field names. Empty
reference entries, separate-context screens and settings-only children do not
appear in the canvas catalog; their settings section retains its scoped action.
Availability also checks the explicit visibility setting metadata, with its
inversion, before native panel measurements. Retained templates with positive
layout cannot expose frames for disabled features. Disabled selections stay
reachable through All elements; their controls can re-enable the draft.
The inspector uses that same metadata for its visibility switch; captions do
not determine runtime semantics. Independent Ammo digit availability respects
the current/max hide settings.
Scope and locks are
session-only and add no persistent settings or defaults.

Section entry bindings live in `ui/gameplay_tabs.js`; `ui/controls.js` only hosts
the optional action, and `ui/customize/tab.js` owns its launch behavior. The
ordinary gameplay tabs use these actions in place of position, scale, size and
opacity sliders. The inspector pairs sliders with direct numeric entry and
mouse-wheel adjustment; exact values retain the same stored keys and current settings precision. Search indexes the moved field names and keys and
returns the scoped action; section reset includes the action's settings. Native children follow their
parent's movement and existing shared colors retain their established ownership.
Abilities' section reset also retains the AP/Active Items keys through explicit
section reset metadata, independent of whether child Customize buttons exist.

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
normalization against current settings metadata. Historical compact schemas are
import-only; new clipboard exports use [lossless settings codes](../core/settings_codes.md)
while storage keeps the JSON envelope. The catalog includes native
HUD families, overlays, map/shop states and additions in other script contexts.

The shop surface uses `Shop/MainPanel`, while recent purchases use the sibling
`Shop/NavPanel/RecentPurchasesPanel` from the native shop layout. Properties exposes
the feature's existing content modes, filters and notification lifetime/count
alongside appearance and visibility. Quick Buy has a scoped action in Shop as well
as a shortcut in Customize. Its frame measures and moves the compact HUD contents,
including enhanced prices and upcoming items, with an overall scale control;
the open-shop queue and summary retain native docking. Customized Quick Buy
geometry releases overflow clipping on its native root, LowerLeft and
StatsAndModsContainer through the shared root-class projector. Reset or disabling
its presentation owner restores native clipping; queue scrolling remains native.
Minimap Location Text has independent offsets, scale and a
visibility switch. Its native district gate, rotation and content remain intact.
Base minimap exposes its overall
opacity and the Minimalist switch; its background opacity appears only while
that draft mode is enabled, including after history changes.

Minimap objective timers are available in ordinary settings and Base Minimap's
Content section. Mid Boss, the ordinary buff plate and each bridge plate also
have independent Customize selections for offsets, scale and opacity. Their
geometry remains relative to the minimap viewport; positive vertical offsets
move plates upward. Offsets use x/y over fixed docking insets, so distant
placement cannot consume the plates' layout space. Customized timers can extend
beyond the minimap through scoped overflow classes; the native map renderer
retains its clip. Reset, disable and owner replacement release those classes.
The timer owner applies drafts through its ordinary settings
hook and retains ownership of content, mode-dependent placement and visibility.
Map References exposes marker size, route size and layer
opacity while map-relative coordinates stay attached to the native renderer.
Camp name controls are absent from the ordinary Minimap tab. Crates and routes
follow their toggles throughout the match; retired minute-window values in older
configs no longer suppress them.
Inspector panel descriptions are omitted for every selection.

The settings-only modules in `ui/customize/` separate the session, measured geometry,
inspector, window chrome, overlay and tab. Native HUD owners remain under their original parents.
Each selection frame and resize corner is a native Button with its own
Panorama DragStart/DragEnd handlers. Selection is delivered by that Button's
activation; it never requires a JavaScript coordinate picker or cursor API.
The native XML `draggable` attribute is supplied at creation, without requiring
`SetDraggable`. The left catalog selects Ammo, Current Ammo or Max Ammo. Within
this family only the selected frame accepts pointer input; the other two cannot
select or capture through the active frame. When another element is selected,
the Ammo family frame remains the canvas entry point. Scoped digit editors keep
their single selection interactive.
A temporary input-transparent displayPanel exists only for native capture.
When available at capture, `GameUI.GetCursorPosition()` supplies pointer intent;
otherwise validated compositor window positions supply motion. The first valid
compositor sample establishes the origin. Missing/throwing cursor APIs cannot
block selection or capture. FLT_MAX/pending samples are ignored, and early
visual teardown retains the last valid motion. An owned probe calibrates window
pixels separately from layout/UI density.
Held movement publishes normalized draft coordinates/size through the leased
preview. Production manifests render the HUD; frames and corners follow the
same intent while the capturing Button and corner-host rectangles stay fixed.
The app temporarily uses a faster configuration delivery cadence during a leased gesture and returns to its
ordinary cadence on release, withdrawal or expiry. Stationary pointer samples do
not rewrite inspector fields. A motionless capture cannot activate magnets or
create an edit. All updates in a gesture form one Undo entry; Cancel restores its
starting draft. Same-release activation cannot select a different surface.
Proxies and outlines are deleted on drop, cancellation and exit, including
proxies reparented outside the editor subtree. Capture does not wait for preview
acknowledgments or native layout after selection, input, Reset or history.
Native observation retains its separate acknowledgment checks.

Idle frames are transparent. Hover and selection show an outline without a
content tint. Frames belong to independent movable/resizable surfaces and
explicitly measured standalone selections such as stamina/AP. Settings-only
entries that inherit an owner's geometry (health warnings and top-bar details)
remain in the catalog without a competing hit-test frame. Their native
owners can still be measured for availability. Hover identifies the element by localized
tooltip. Actual content and smaller surfaces have priority within larger family bounds;
editor chrome remains above all frames. Ammo family pointer ownership follows
the catalog selection rather than competing overlapping hit areas.
Small elements receive a padded input area with a separate outline of actual
content. Padding is partitioned at gaps between neighboring surfaces so it
cannot cover their real content. Corner inputs shrink when needed to avoid
overlapping each other and retain a central move target in partitioned small
areas. Input areas are
bounded to the viewport, including when the native content is larger than the
canvas, so all four corners remain reachable. Corners use that area so the
center remains available for moving.
Show frames exposes the outlines together. Hide panels
temporarily collapses the catalog and inspector while retaining the view controls.
These controls update actual panel visibility/outline styles as well as classes.
Catalog, inspector and toolbar have dedicated draggable headers; their positions
are session-only and bounded to the measured viewport. They prefer cursor intent
with a fixed origin at capture; contexts without GameUI retain the validated
compositor fallback. Interactive children do
not act as window drag handles. Viewport and selection changes re-clamp moved
windows without transferring them to the compositor.
Until manually moved, the view toolbar follows the measured bottom of top-bar
content when space permits. It does not use the native full-height TopBar owner
as its obstacle. Sessions opening without measurable content use the ordinary
stylesheet placement.
These view choices are session-only. Missing elements are dimmed in the catalog;
the selected inspector shows their availability without repeating a suffix on
every catalog row.
The overlay consumes missed activation, and EscapeBackground is guarded during an editor
session. Missed clicks preserve the draft instead of resuming gameplay. Explicit
Cancel and Escape discard the draft and return to the still-open settings
window. The overlay's `oncancel`, focused settings window, native escape-menu
root and existing MenuBack binding all route through the same cancellation
guard. Duplicate delivery of one MenuBack cannot also close settings or resume
gameplay; the next separate Escape retains ordinary settings/menu behavior.

Ammo, Current Ammo and Max Ammo expose the same existing shared text color.
Editing or resetting that color from any of these selections affects both digit
labels, including the max-ammo separator. Ammo runtime and editor discovery use
the verified crosshair/gun/gun_data owner; absent digits or rings are retried
through that owner without searching unrelated HUD templates.

Colors appear in the inspector with a stock `CitadelColorPicker`, preset swatches,
a HEX entry and native Default action. A single Color palette button with an
embedded preview chip expands the native saturation/value canvas, hue strip and
RGB/HEX controls. The expanded palette lives in a separate non-scrolling,
draggable window beside Properties, so native marker dragging has no scrolling
field ancestor and opening it does not change the Properties height budget. Only one
palette opens at a time; its localized field caption identifies the owner.
The palette window starts to the left of Properties and follows it until the user
drags the palette to a session-only position. Hide panels also hides the palette;
closing it or changing selection hides the window. Hidden pickers are not seeded, and
unchanged text is not rewritten during synchronization. Opening or seeding creates no draft edit;
notifications from a hidden or retired picker are ignored.
Default has an accepted empty HEX entry rather than a pending invalid color.
Numeric wheel adjustments consume their event; HEX entries do not alter the
encoded color on wheel input. Valid RGB updates
use the existing tagged color encoding; a short continuous burst forms one Undo
entry. Numeric and HEX entries also submit on
blur; malformed values remain marked rather than overwriting the accepted draft.
The AP/infinity currency has its own selection frame under AbilitiesContainer.
Its inspector exposes the existing shared bottom-bar color and an independent
overall scale and independent offsets. AP and stamina offsets are applied by
`ql_presentation_scale`; their native parents stay unchanged. They use the
existing settings envelope without changing any published compact schema.

Modern compact stats are measured through the active owner's HudStatBlock;
their scale also applies to the sibling CoreStatFXLayer so native stat effects
follow the compact block within the supported effect scale range. Above that
range the effects have zero opacity; reducing the scale releases that opacity override.
Custom scaling preserves the FX viewport's minimum
dimensions and scales its bottom gap relative to the block's native docking,
including the shop state, while compensating for the block's fixed left margin.
Expanded modifier rows retain their independent scale
and do not enlarge the compact block's hit box. The coexisting legacy owner is
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

Every inspector groups fields into Content, Position & size, Appearance and
Visibility, omitting empty sections. Threshold groups identify their owning health
warning. Top Bar, Abilities and Healthbar include the existing controls of their
inherited details through explicit `inspectorOwner` metadata, without extra frames.
Enum fields use native DropDown panels and current shared setting options, the
same source used by ordinary settings. Programmatic selection synchronization and
retired dropdown callbacks cannot create draft edits. Conditional rows react to
the draft, including Undo/Redo, without rebuilding controls or clearing their values.

Panels, buttons and typography use the shared `QOLUnifiedModal*`, `ModalTitle`,
`ModalInstructions` and `ValueInput` styles. Sliders and `SettingToggleBtn`
switches reuse the settings controls' shared CSS in the sibling overlay.
The active settings theme applies to
the editor through the ordinary theme classes. Customize CSS owns its layout,
selection frames, swatches and invalid-field state; it does not define a separate
button palette or text font. Properties scroll inside the bounded inspector;
history and Save/Cancel stay outside that scroll region. The launch page uses the same shared controls.
Startup/update exceptions are logged and shown as diagnostic text rather than
being described as a requirement to enter a match.

The session holds a draft, selection locks and bounded undo/redo history. Reset
stays beside Undo/Redo outside the scrolling inspector and reads current defaults
for the selected element's visible presentation fields from source. Enable/hide
switches and other toggles retain their current values, including normal/TAB
visibility. Reset also clears pending field text
when the accepted draft already equals defaults, without creating an Undo entry.
Feature modes and content filters marked `reset: false` remain unchanged;
ordinary settings sections retain their full reset metadata. Healthbar type is
available in both settings and Customize; Minecraft health numbers appear only
when the draft selects that variant. Minimap's Minimalist switch is also available beside its dependent
background opacity in Properties. Undo reverses one accepted edit or gesture;
Redo restores the edit reversed by Undo until a new edit replaces that branch.
History actions accept valid pending entries first. Element selection, canvas
gestures and history preserve valid pending edits and restore
incomplete entries to their accepted draft values; malformed input cannot trap
navigation. Save still rejects incomplete input until it is corrected.
Toggle, enum and palette actions accept pending entries in other fields together
with their own change. A full-width outlined Reset sits above the quiet Undo/Redo
row and the separate Save/Cancel footer, outside the scrolling field body.
Alignment and Return to screen buttons are absent; offscreen placement can be
edited numerically or restored to defaults with Reset.
Button captions do not intercept input intended for their button.
The inspector previews valid numeric and HEX input after a short typing pause;
Enter and blur also accept it. Incomplete input stays in its field and does not
overwrite the preview. Accepted typing preserves the caret until blur; history,
reset, selection changes and closing cancel pending callbacks. Opacity and overall scales display percentages from explicit property metadata,
while retaining their original stored units. Labels do not determine semantics.
Horizontal and vertical fields appear directly in Position & size without a
disclosure; color presets can
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

Numeric entries use the shared setting type, role, units, conversion and
precision contract. Out-of-range exact input remains invalid on Enter as well
as during typing; it cannot silently replace the accepted preview.
Numeric entries use current field metadata; supported
color entries use [tagged RGB](../core/custom_colors.md). Missing conditional
panels keep their controls available through All elements or a scoped action.
Children without independent offsets inherit
their parent's placement. Souls, items, stamina, compact stats, speed, AP and damage report have
independent overall scales, applied by `ql_presentation_scale` through `ui-scale`.
It multiplies the verified CSS baseline for the current mode and releases its
override at default, disable or owner replacement; content, rotations and
visibility keep their existing owners.
Compact stats scale the content block rather than its full-screen wrapper.
Souls frames include the level and currency groups scaled by their shared native
owner, without its empty width reserve. A conditional current-souls row does not
define the overall frame.
Frame geometry uses actual native layout measurements, including stamina pip
unions, without multiplying them again by the configured scale.
A panel replacement or hidden owner cancels an active move/resize gesture.
For content unions such as Souls and item cooldowns, captured child identities
also belong to the gesture and its measurement history. Retiring/replacing a
measured child cancels that capture and prevents delayed resize corrections from
moving the new content. A late sample may join an otherwise intact capture;
settling still requires the same complete union that began the resize.
Temporary missing dimensions or pending native coordinates on the same living,
visible owner retain the gesture's captured geometry and native input panels.
They do not cancel a live edit or erase its Undo entry.
Measurements account for menu origin, scroll offsets and native UI scale; the
simulator cannot establish native layout or input behavior.

Selected surfaces with a declared overall scale or size expose a draggable
handle at each of the four corners. Native corner Buttons live in a sibling host
above selection frames; an overlapping unselected family cannot intercept them.
The family frame is not raised above independently selectable children. During
capture their input rectangles stay fixed while input-transparent marker children
follow live intent. On release the Buttons follow the next measured native layout.
The selected surface exposes
only its declared move/resize capabilities. Corner movement projects onto the
signed starting input-frame diagonal and publishes the existing uniform scale/size
on its current settings grid throughout the gesture. Drop commits one history entry. Controls, selection,
history and a new capture are available immediately after release, even while
native layout is pending. Elements without independent offsets retain native
placement. Geometry controls precede palettes.
Where offsets exist, acknowledged live measurements correct the opposite-corner
anchor; one bounded final correction settles it after
acknowledged native dimensions reflect the requested scale, with percentage/font
rounding tolerance and stable samples. This bounded correction amends the drop's
undo entry through a one-shot session capability. Any intervening edit, Reset,
Undo/Redo, new gesture, expired session or replaced/changed native context cancels
it; waiting never holds a canvas gesture open. The same correction cannot
accumulate over stale native coordinates.
Session-only generations and measured geometry history support observation and
observation across accepted input, Reset and Undo/Redo. Returning to an earlier
geometry key does not establish that its native layout has returned. Offset-only
returns permit content dimensions to change; size returns check the relevant
native dimensions. Max Ammo horizontal offset acknowledgment accounts for
Current Ammo's measured width in native rightward flow, converted through the
parent/canvas densities. These measurement rules do not gate pointer capture.
Shop, reload, item cooldowns and base/Alt/Tab minimap corners reuse their existing
scale/size fields.
Ammo's legacy panel-scale key aliases current-ammo font size, so it remains
accepted by the session but is hidden from the inspector; the current and total
ammo controls remain available. `ql_ammo` applies the separate overall scale and
offsets to the digits and sibling magazine rings, including mirrored ring-only
layouts, without changing those text sizes or the crosshair. Scaling each sibling
retains the native distance between them. Group digits use paired margins over
their native baseline; independent label offsets use compound position over
native flow. Default geometry releases the owned coordinate components and
aggregate override through the shared native-style owner.
The Ammo frame measures the union of these surfaces rather than the gun wrapper.
Native ring rotation and its feature classes use the common native-style owner,
with the extracted standard and mirrored CSS baselines on retirement. Native
overwrite invalidates its cached write, and rejected retirement retries after
disable. Standard rotation zero releases the container transform: the native
crosshair offset already centers the live arc, unlike the static CSS clip.
The magazine toggle dispatches the native `citadel_crosshair_enable_clip_status`
command only on enable/settings transitions; turning it off, disabling the
feature or applying Default restores the vanilla disabled value. It deliberately
controls that game preference rather than preserving a separate prior value.
Native C++ chooses the segmented or continuous renderer and owns shot/reload
fill, bonus, low-ammo and infinite-ammo feedback. There are no custom masks,
per-round panels, capacity thresholds or current-ammo polling. The palette owns
ammo digits only. Mirrored heat layouts retain their native arc presentation.
Digit font retirement explicitly writes its native layout baseline before
releasing the code property. The Tokamak layout uses its own font baseline and
content widths when scaling; it does not acquire the standard layout's fixed
digit widths or separator gap. Default release, rejected cleanup and subsequent
native rendering still require a client check.
Current and Max also have independent digit frames and offsets relative to their
native positions inside Ammo. They retain their existing font-size settings and
inherit the group's shared styling. Max's native label includes the separator;
moving it does not rewrite engine-owned text. Parent movement edits only group
offsets. Digit offsets and font sizes appear in their independent inspectors;
the group inspector retains overall geometry and shared appearance. Reset on
Ammo also resets both digits' offsets and font sizes; Reset on Current or Max
only resets that digit. This applies in both the section entry and full editor.
Independent font controls allow shrinking as well as enlarging. The legacy
font alias and historical compact schemas retain their compatibility path;
current lossless settings codes preserve newly accepted values, while storage
keeps the JSON envelope.
Current/Max font-size layout acknowledgment requires scaled height and a stable
native box. Their content width can change independently when native ammo text
gains or loses a digit, especially in Tokamak's content-sized layout. Pixel
position acknowledgment retains its separate checks; other scale/size surfaces
continue to require both width and height.

Customized Ammo/Reload geometry projects `qol_free_reticle_placement` on the HUD.
CSS opens overflow only on the verified gun, gun-data, ammo and reticle layout
ancestors. It does not change their dimensions, visibility, transforms or the
progress bars' radial clips. Reset and unavailable owners release the class;
one active owner cannot remove the overflow needed by the other. This is a
source-level clipping fix, not proof that native engine culling is absent.
Confirm distant offsets, normal gun and Tokamak layouts in the client.

Feature-created Reload, Zip Boost, Active Stats, Combat Status, Compass/Speed
and unsecured overlays apply offsets through x/y over their fixed baseline.
Offset changes no longer enlarge their margins and consume layout space.
Better Unsecured retains its stored down-positive default-relative adapter;
the editor's displayed Y bounds are symmetric. Current field metadata owns the
expanded pixel ranges, while historical compact fields stay frozen.
Shop and purchase-history movement conditionally opens only the native Shop
and NavPanel layout ancestors; history's scrolling mask remains native.
Check saved nonzero positions against the previous build: Panorama placement
can differ between margin offsets and x/y, and offline geometry is insufficient
to establish pixel-for-pixel native equivalence.

The additional opacity controls are owned by `ql_presentation_scale` using its
existing poll. At the default they own no native opacity override and skip
surface discovery; reset/disable releases attempted styles, including rejected
clears through the shared native-style owner. Ammo opacity reaches its digits
and available sibling rings; Current/Max inherit it once. Player Stats opacity
applies to the compact block, preserving conditional hiding on the outer owner.
These controls never set visibility or replace a feature's content. Custom
opacity overrides the selected panel's opacity; native CSS opacity transitions
on that same panel require client verification, while the default releases them.

Snapping aligns viewport/neighbor edges and centers in canvas units. Top Bar
uses its native owner's horizontal axis for center snapping, so asymmetric
card counts or conditional indicators do not shift its central clock. Its edge
snapping and outline still use measured content bounds. Guides mark
the normalized proposed alignment; native content may briefly trail delivery.
Current/Max Ammo do not magnetize against their own group or each other.
Native observation checks do not gate pointer capture after accepted typing.
Observed geometry history permits Undo/Redo to restore centered scale anchors;
native owner/context changes invalidate these observations. Snapping is
session-only and independent of persistent offsets.

Position values use a shared coordinate sanity domain, independent of screen
size. The policy and its numeric precision rationale live beside the current
settings catalog. Gameplay consumers read that catalog instead of repeating
per-feature limits. Legacy aliases retain their compatibility conversions.

Position-slider travel is derived from measured viewport/content geometry in
the moving owner parent's units. It lets the content center cross the full
viewport and includes both edge alignments for oversized content. Screen-sized
surfaces therefore retain useful travel rather than being limited to their few
remaining pixels of fully contained space. The observed accepted position also
extends the interval, so moving back from a distant drag position does not jump
to a viewport boundary. Exact input may remain outside that travel until native
layout acknowledges it.
Resize/density changes update the thumb range without creating an edit or
rewriting the accepted input. Until the first usable measurement, position
sliders remain disabled while exact editing and Reset are available. Afterward,
missing or pending measurements retain the inspector's last numeric travel
range, keeping the native slider active for recovery. This does not retain or
reuse missing native geometry for frames or gestures. Unchanged range and
enabled values are not reapplied during preview refresh. Reset restores existing defaults,
participates in Undo, and never changes canonical settings until Save.

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
Player Stats has no manual Custom Position switch. Position edits
activate the existing legacy gate within the same accepted draft; Undo and Cancel
restore its previous value. Untouched disabled legacy configurations retain
dormant coordinates, while size and opacity remain independent. Reset restores
native coordinates without activating a previously disabled gate. Hide-only edits
in Customize and the ordinary HUD/UI controls preserve the placement gate and
dormant coordinates.
Better Unsecured Souls presents its vertical offset as up-positive relative to
the configured default; storage and runtime retain the existing raw coordinate.

Shop and Recent Purchases selections use the maintainer-verified
`citadel_open_hero_sheet` toggle through the existing settings console dispatcher.
The shared selection handler covers gameplay-section actions, Customize shortcuts
and the full editor catalog. Reselection does not toggle again. Leaving these
selections or ending the session closes a shop opened by that session; an already
open shop is preserved. A queued open is balanced even before native class delivery,
and an observed shop that closes natively is not reopened by cleanup. Commands are
never transferred to a replacement HUD. Quick Buy edits compact gameplay HUD
content, so selecting, dragging or resizing it does not open the shop. Switching
from a session-opened Shop selection to Quick Buy closes that owned shop first;
an already-open shop remains untouched. Native command execution and ESC/shop
coexistence require client verification after repack.

`core/ql_customize_preview.js` carries a leased draft through HUD attributes.
Preset preview shares this transport with its own session owner and an explicit
preset payload kind validated against the current settings catalog. This does
not expand the ordinary editor's presentation-field whitelist. See
[preset behavior](../PRESET_BINDINGS.md).
Selection is transient metadata in this same lease, independent of config and
undo history. Runtime owners may keep a representative sample while selected:
purchase notifications use the production purchase-row tree in their central
or per-hero container; Reload uses its owned countdown label; Basic/Advanced
item cooldowns use owned sample content under their actual geometry owner.
Active Stats retains its ordinary rows across the Escape/scoreboard gate and
uses a neutral row when empty; Unsecured Souls retains an owned sample when
there is no native amount. Keyboard retains its real binding panels across the
shop gate while selected. Visibility settings still apply.
Samples do not inject purchases, items, native cooldowns or engine events.
Real notification history and expiry continue separately. Geometry payloads
awaiting delivery retain the same sample, avoiding a disappearing frame during
dragging. Selection changes, withdrawal, expired leases, owner replacement and
disable retire sample content and restore ordinary gates. Native conditional
surfaces without a supported owner preview still require their actual context;
selection does not fabricate native game events or unknown panel hierarchies.
The existing app config poll validates the session stamp and field whitelist,
then normalizes the draft through the ordinary config merger and applies it to
feature configuration and shared root styles/classes. Derived threshold masters
and legacy ammo-scale aliases therefore follow the normal save semantics.
Canonical `State.lastConfig`,
storage attributes and exports remain unchanged during preview. Cancel, menu
exit, expired leases and conflicting canonical edits restore canonical settings.
Withdrawal expands a sparse canonical snapshot with current defaults before
loading merging feature buckets; missing keys must not retain preview values.
The HUD settings status requires acknowledgment of the current payload, not just
an earlier payload from the same session. Validation stages the layer for reactive
root-class readers; the app commits its ACK only after bucket loading and owner
reconciliation. Rejected delivery or ACK writes remain retryable without stopping
the config poll. This ACK establishes configuration delivery, not native layout or rendering;
unavailable selections show a separate status.
Successful HUD commits and preview resets emit the context-local
`presentation:preview_changed` event after updating sample state. Reactive owners
can refresh selection-only content without a feature polling loop. Staged,
rejected and failed ACK deliveries do not emit it.
Benchmark stress configuration blocks the preview layer; ending that block forces
delivery again even if the leased draft payload is unchanged.

`QOLCustomizeLiveHud` is a leased HUD-owned visibility class, distinct from the
settings editor's lifetime class. It exposes existing combat/healthbar content
and releases on withdrawal, expiry, HUD replacement, shutdown or benchmark blocking.
It does not override feature-owned inline opacity or visibility. Selecting the
healthbar permits its production Budhud/Minecraft renderers in hideout. Minecraft
uses transient sample health only when native values are missing, without writing
native health labels; selection withdrawal/expiry restores ordinary hideout gates.

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
Independent Ammo digits use balanced opposing margins because native sibling
flow ignores `position`. Horizontal movement preserves the native or resized
Max Ammo gap, and neither axis changes the sibling's flow footprint. Retirement
neutralizes and releases owned margins; Reset, Cancel, presets and disable use
this path. AP/stamina offsets retire composite `position`
once neither axis remains customized, preserving any still-customized axis.

Apply commits pending valid input through MarkConfigDirty/FlushPendingSave, then
uses storageBridge.saveSettings. The editor reports success only after the CEF
response. Failed saves retain applied settings and offer Retry save or Close.
Closing a draft discards it; closing after Apply does not undo the committed edit.
This response does not prove persistence across a native client restart.

The editor implementation and catalog are still awaiting maintainer compile,
repack and client acceptance. Use [the release checklist](../TEST_CHECKLIST.md).

Common presentation precision comes from the independent settings catalog:
layout positions and pixel sizes use whole layout units, opacity uses whole
percentage points, and scale conversion explicitly declares stored percent or
multiplier units. Native font/layout rounding remains renderer-specific. Map
whole-surface scaling retains fractional percentages so a one-unit size change
is not quantized back to a whole-percent zoom.

## State visibility

Independent in-match HUD surfaces expose the same normal/TAB suppression pair
in Customize. The current field catalog declares surface membership and runtime
owners; registration derives the two localized controls and manifest declarations
from that data. Both new defaults are disabled. Existing Player Stats flags and
preset values retain their meaning. Minimap states share one suppression pair
while keeping their separate Base/Alt/TAB geometry. Ammo digits inherit the ammo
group; Basic and Advanced cooldown renderers subscribe to the same pair.

State suppression adds to native appearance conditions. Clearing a flag releases
the extra override; it cannot force conditional content to appear. Optional
features still require their existing enable setting. Native Ammo and Player
Stats can activate suppression independently of their visual/placement options.
Stats hides through the outer wrapper opacity so its native data remains available
to mirrors; its compact child keeps custom opacity. Position offsets move both
coexisting native stats owners together so the legacy compact block and active
modifier effects stay aligned.
Player Stats and Stats List controls are available only in Customize; the HUD
and UI tabs have no duplicate sections.
Stats List exposes additional local position, scale and opacity for the active
owner's detailed resistances/modifiers, independently of compact-block scale.
Its local offsets follow the shared Player Stats group position. Stamina suppresses
through opacity, keeping the dynamic native dash charge tree in layout. The
presentation owner combines state suppression with its independent opacity
control and releases both at their defaults. The maintainer's client captures
showed that clearing a collapse override restored computed visibility without
restoring the drawn stamina pips; computed visibility alone is not a client pass.
Other owners combine hiding
with their own native style retirement or custom overlay visibility.

`core/ql_hud_state.js` supplies the same verified native scoreboard observation
in the HUD and settings realms. Gameplay `core.hud.isScoreboardOpen` delegates
to it. Visibility adapters reuse an owner's settings snapshot and existing update
function, subscribe to the existing scoreboard event and unsubscribe on disable.
They add no poller. A hide edit never activates placement or rewrites coordinates.

World-bound targets and damage numbers, inherited HUD detail groups, diagnostics
and panels in other script contexts do not receive this pair. Their own controls
and native visibility rules remain authoritative. The catalog describes those
capabilities rather than fabricating a screen-level owner.

## Property audit and retained special cases

Relative scales, axis scales and font scales share one editing interval and one
percentage-point step, converted by their explicit display factor. The shared
interval includes the widest range previously accepted by these controls; it is
a product editing policy rather than a verified Panorama limit. Only the current
catalog defines its numeric bounds. Per-owner caps are removed, including native
shop, top/bottom bars and keyboard. Keyboard glyphs follow reductions as well as
enlargements; native pixel fonts and glyph dimensions round to whole units.

Pixel sizes remain distinct from relative scales: minimap dimensions, reload
font size and native HUD font controls keep their declared size contracts.
Cooldown Size is explicitly a dimensionless `referenceSize`: the preserved
setting drives the existing Basic native baseline and Advanced icon ratio. It
is not a measured pixel edge or an independent generic percentage scale. Both
owners preserve the fractional result of that conversion. Historical aliases
remain bounded for old formats while canonical position values retain their
separate validity domain.

The surface audit retains these capability boundaries:

| Surface family | Contract |
| --- | --- |
| Independent HUD surfaces | Declared parent coordinate units, measured slider travel, exact input, reset to defaults and owner-controlled state suppression. |
| Minimap states | Separate geometry, fixed-icon/whole-map mode and special overlays; one shared state-suppression pair. |
| Healthbar variants | Shared placement/scale/opacity and state suppression; variant content and animations stay native or variant-owned. |
| Ammo digits | Independent text geometry; shared group scale, opacity and state suppression. |
| Basic/Advanced cooldowns | Shared reference-size/percentage-position contract, separate native/custom renderers and common suppression flags. |
| Quick Buy | Compact HUD content moves and scales together; the open-shop queue and summary retain native docking. |
| Inherited HUD details | Existing feature/content controls; no invented independent geometry or additional state renderer. |
| World-target indicators and damage numbers | Their actual size, formatting and opacity controls; no screen offsets. |
| Other contexts, fixed visuals and diagnostics | Existing contextual controls and owner lifetimes; no fabricated screen-level capabilities. |

The current metadata audit checks every declared owner against actual manifest
settings, including multi-toggle children. Tests also make legacy schema access
throw while exercising modern save/export/import: current settings do not depend
on historical binary metadata. Legacy fixture validation remains a separate
reader-compatibility check.
