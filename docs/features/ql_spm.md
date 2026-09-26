# ql_spm

Intentionally inactive souls-per-minute compatibility manifest.

Source: [manifest.js](../../panorama/scripts/manifests/ql_spm/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Intentionally inactive compatibility manifest: lifecycle hooks are empty
and there is no live SPM calculation/poller here. `ENABLE_MIN_SOULS` remains in
the schema, which is not evidence of an active feature. Do not restore old
behavior or add a replacement loop as documentation cleanup.

## Declared settings

- `ENABLE_MIN_SOULS` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
