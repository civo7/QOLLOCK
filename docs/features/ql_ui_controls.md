# ql_ui_controls

Global layout/support classes and UI settings metadata; not the control factory module.

Source: [manifest.js](../../panorama/scripts/manifests/ql_ui_controls/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Applies global support/layout classes on enable and settings changes with
no recurring loop of its own. This manifest's name does not make it the UI
factory service: actual controls are in `panorama/scripts/ui/controls.js` and
`renderer.js`. It declares `ENABLE_UPDATE_CHECKER` metadata, while the checker
itself runs in the settings context.

## Declared settings

- `SUPPORT_16_10` (toggle)
- `SUPPORT_4_3` (toggle)
- `ENABLE_HUD_SHIFT` (toggle)
- `ENABLE_CENTER_ESC` (toggle)
- `ENABLE_CENTER_FRIENDS_LIST` (toggle)
- `ENABLE_FORCE_TESTING_TOOLS` (toggle)
- `ENABLE_HIDE_TESTING_TOOLS` (toggle)
- `ENABLE_HIDE_BEHAVIOR_SUMMARY` (toggle)
- `ENABLE_LEGACY_COOLDOWNS` (toggle)
- `ENABLE_UPDATE_CHECKER` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
