# ql_souls

Native gold/AP container geometry and visibility, not a second economy model.

Source: [manifest.js](../../panorama/scripts/manifests/ql_souls/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Styles native gold/AP container geometry and visibility. Applies immediately
on enable; if its source is not yet available, starts a 1-second retry loop.
The setting-change path can also start a retry. It does not calculate net worth,
pickup statistics or SPM; those descriptions confuse native layout with economy
logic.

## Declared settings

- `HUD_SOULS_ENABLED` (toggle)
- `SOULS_OPACITY` (slider)
- `SOULS_X_OFFSET` (slider)
- `SOULS_Y_OFFSET` (slider)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
