# ql_keyboard

Keyboard/input display; settings use KEYBOARD_OVERLAY_* names.

Source: [manifest.js](../../panorama/scripts/manifests/ql_keyboard/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Starts a 0.2-second managed loop. Configuration uses `KEYBOARD_OVERLAY_*`
keys and the full-layout toggle, not generic `KEYBOARD_SCALE`/position keys.
Native input/class observations are not browser keyboard events. Preserve the
feature's own visibility and teardown behavior when changing the overlay.

## Declared settings

- `ENABLE_KEYBOARD_OVERLAY` (toggle)
- `ENABLE_FULL_KEYBOARD_LAYOUT` (toggle)
- `KEYBOARD_OVERLAY_SCALE` (slider)
- `KEYBOARD_OVERLAY_X_OFFSET` (slider)
- `KEYBOARD_OVERLAY_Y_OFFSET` (slider)
- `KEYBOARD_OVERLAY_WASH_COLOR` (palette)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
