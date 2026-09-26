# ql_topbar

Top-bar geometry/visibility and shared warning/objective settings.

Source: [manifest.js](../../panorama/scripts/manifests/ql_topbar/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Applies immediately, then starts a 0.5-second loop. Owns top-bar geometry
and selected native presentation classes, not every child overlay. Nicknames,
rank, ultimate text, purchases and health warning logic have separate owners.
Before changing a shared parent or key, check those consumers and disable-state
restoration.

## Declared settings

- `HUD_TOP_BAR_ENABLED` (toggle)
- `ENABLE_OBJ_MAP` (toggle)
- `ENABLE_MISSING_HERO` (toggle)
- `ENABLE_OBJ_DMG` (toggle)
- `DISABLE_PLAYER_NAME_BLUR` (toggle)
- `ENABLE_TOPBAR_ENEMY_HP_WARNING` (multitoggle)
- `ENABLE_TOPBAR_ALLY_HP_WARNING` (multitoggle)
- `ENABLE_URN_DIFF` (toggle)
- `TOP_BAR_OPACITY` (slider)
- `TOP_BAR_SCALE` (slider)
- `TOP_BAR_X_OFFSET` (slider)
- `TOP_BAR_Y_OFFSET` (slider)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
## Geometry and restoration regressions

The manifest tracks the identity of its current TopBar panel as well as the
style signature. A replacement panel receives the current configuration even
when no values changed. Scale is applied with uiScale; the preTransformScale2d
override is released to native CSS rather than pinned to 1. Default values
release x/y, opacity and scaling overrides through the shared native clear path.

Visibility gating uses the TopBar ancestor chain, not its gameplay_hud sibling.
Unset inline opacity is not treated as zero. The Dev walkthrough permits changes
while Escape is open without bypassing hideout or takeover suppression. Outside
the walkthrough, native menu suppression continues to restore native styles;
closing the menu reapplies the user's geometry.

`tests/topbar_runtime.test.js` drives real settings/HUD contexts through the
configuration bridge. Regressions cover Escape-menu walkthrough geometry,
hidden gameplay siblings, unset versus zero ancestor opacity, panel replacement,
and restoration of defaults. These tests do not replace a repacked client check
of scale, opacity, X/Y movement and visibility transitions.
