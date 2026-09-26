# ql_show_build_id

Read and display selected shop build metadata; unrelated to settings storage.

Source: [manifest.js](../../panorama/scripts/manifests/ql_show_build_id/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Starts a 1-second loop and an initial tick. Reads the selected shop build's
metadata for display; it does not implement durable settings storage. Preserve
native label/text-binding semantics and inspect the selected build in the
client rather than teaching a simulated tree which label ought to hold its name.

## Declared settings

- `ENABLE_SHOW_BUILD_ID` (toggle)
- `ENABLE_SHOW_BUILD_ID_TITLE` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
