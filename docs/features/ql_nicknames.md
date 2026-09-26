# ql_nicknames

Persistent top-bar nickname visibility through native binding/CSS gates.

Source: [manifest.js](../../panorama/scripts/manifests/ql_nicknames/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Toggles nickname visibility using the native binding/CSS path on enable,
disable and setting changes. It does not create arbitrary custom player names.
There is no recurring loop here. Keep player-portrait identity and the native
name binding separate from styling/visibility.

## Declared settings

- `ENABLE_NICKNAMES` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
