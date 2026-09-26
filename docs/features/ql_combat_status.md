# ql_combat_status

Combat status/timer and combat indicator settings.

Source: [manifest.js](../../panorama/scripts/manifests/ql_combat_status/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Starts a 0.2-second loop and removes its overlay on disable. The timer and
combat indicator use the same feature configuration but are separate controls.
Do not replace native combat observations with elapsed time since a guessed
event, or add another polling owner for the same state.

## Declared settings

- `ENABLE_COMBAT_STATUS` (toggle)
- `ENABLE_COMBAT_INDICATOR` (toggle)
- `COMBAT_STATUS_SCALE` (slider)
- `COMBAT_STATUS_X_OFFSET` (slider)
- `COMBAT_STATUS_Y_OFFSET` (slider)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
