# ql_cast_failed_hint

Hide the native cast-failed hint; key is ENABLE_HIDE_FAILED_HINT.

Source: [manifest.js](../../panorama/scripts/manifests/ql_cast_failed_hint/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

The feature adds/removes `hide_failed_hint_active` on the HUD. It suppresses
a native hint; it does not add a cast-failure sound or new warning overlay.
There is no recurring Scheduler loop in this manifest.

## Declared settings

- `ENABLE_HIDE_FAILED_HINT` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
