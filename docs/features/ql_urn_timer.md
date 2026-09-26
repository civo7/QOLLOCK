# ql_urn_timer

Urn/rift state and spawn-window display derived from game clock/minimap signals.

Source: [manifest.js](../../panorama/scripts/manifests/ql_urn_timer/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Starts a 0.5-second loop. Uses game-clock and minimap/native signals to
track urn/rift state and the relevant spawn window. Keep the state transitions
and source identity intact rather than replacing them with a single generic
periodic countdown. Validate carry/return/spawn transitions in the client.

## Declared settings

- `ENABLE_URN_TIMER` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
