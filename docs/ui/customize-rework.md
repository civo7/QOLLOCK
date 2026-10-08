# Customize rework and acceptance plan

The editor must use one measured canvas coordinate system. Existing feature
owners keep rendering and persistence; the editor converts gestures into their
declared units. Published compact schemas and release versions stay frozen.

## Implementation sequence

1. Replace gesture geometry with explicit screen/canvas conversions, measured
   viewport bounds, stable resize anchors and usable small-element hit targets.
2. Add magnets for viewport and visible-element edges/centers. Show guides only
   when the acknowledged native bounds actually meet the alignment. Provide
   explicit alignment actions as well as a session-only magnet toggle.
3. Make catalog, inspector and toolbar draggable within the viewport. Separate
   their headers from interactive controls, fix inspector row sizing, and make
   view toggles control their actual panels and outlines.
4. Add independent AP/stamina placement only after approval of persistent
   defaults. Use current settings metadata and the existing JSON envelope for
   fields the published compact schema cannot represent.
5. Verify undo/redo, reset, Cancel, Save, replacement, late preview delivery and
   legacy imports against the production code. Run the complete offline gate
   before each logical commit.

## Maintainer client acceptance

The source rework and offline regressions cover the implementation sequence.
Independent AP/stamina placement uses the approved native-origin defaults.
Stamina rotation remains relative to its native baseline, and ready/drained
colors preserve native feedback. The Advanced item mirror retains main's source
identity and slot/filter fixes while keeping the current gameplay visibility gate.

Frozen fixtures encoded by local main at `6cda714` cover every healthbar variant
combined with both minimap scale methods. Scoped edits and current exports
preserve their imported visual values. Separate runtime regressions exercise
healthbar canvases and Base/Alt/Tab minimap geometry, including fixed-icon mode.
Historical compact fixtures and JSON imports remain part of the offline gate.

The shared runtime now derives registered settings from the current catalog and
updates every subscriber of a persisted key atomically. Native and overlay owners
separate settings models, source discovery, rendering and release; Basic layout
and reminder audio no longer share style ownership. Fixed-icon minimap sizing
uses scoped native renderer proportions. Exact coordinates stay visible, and
obsolete stats docking controls are compatibility-only. See the current
[manifest pattern](../MANIFEST_STYLE.md) for future changes.

Client acceptance below remains outstanding; source and simulator results cannot
establish that native input/layout behaves correctly.

After compiling and repacking, test in sandbox and a normal match at multiple
resolutions/UI densities. Move every independent surface, including very small
AP and stamina, and resize from all four corners. The opposite corner should
remain fixed where independent offsets exist. Check bounds near the viewport
edges, preview delay, panel replacement, and changing healthbar/minimap modes.

Check magnets against screen and neighboring-element edges and centers; a guide
must describe the visible result. Check each explicit alignment action, undo and
redo. Move all three editor windows; headers must remain reachable. Hide/show
editor panels and toggle frames without altering the HUD configuration.

Cancel must restore prior styles; Save must preserve placement through export,
import and a full client restart. Exercise frozen old compact codes and old JSON
configs. Offline tests establish conversion, state and storage behavior under a
model, not native rendering, input hit testing, FPS or restart durability.
