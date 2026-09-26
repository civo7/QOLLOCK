# ql_mouse_cursor

Custom cursor overlay; no declared user-setting keys; disabled registration default.

Source: [manifest.js](../../panorama/scripts/manifests/ql_mouse_cursor/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Registers disabled by default and declares no user-setting keys. When
activated, starts a 0.05-second loop and only shows the cursor in supported
interactive match contexts. The hide path removes
`qol_custom_cursor_replace_active`, restoring the native cursor, and resets
cached coordinates. This is why Scheduler must not globally skip all hideout
callbacks. Disable also deletes the owned cursor panel and invalidates handles.

## Declared settings

No user-setting entries are declared by this manifest.

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
