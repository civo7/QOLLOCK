# ql_rejuv_hud

Rejuvenator/bridge-buff state and HUD; publishes state consumed by minimap timers.

Source: [manifest.js](../../panorama/scripts/manifests/ql_rejuv_hud/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Starts a 0.3-second loop. This owner publishes `State.rejuvState`, which
`ql_minimap_timers` consumes. It can be needed for minimap Rejuvenator timers
even when the main HUD display is off. Preserve state resets on lifecycle
transitions and do not create a second phase engine in an overlay consumer.

## Declared settings

- `ENABLE_REJUV_HUD` (toggle)
- `ENABLE_BUFF_HUD` (toggle)
- `ENABLE_MINIMAP_REJUV_TIMER` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
