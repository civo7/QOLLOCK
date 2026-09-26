# ql_sigflash

Flash on pressing a signature ability while unavailable; not an ability-ready alert.

Source: [manifest.js](../../panorama/scripts/manifests/ql_sigflash/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Uses `ENABLE_PASSIVE_COOLDOWN`, shared with the cooldown features, and
starts a 0.2-second loop. Flashes when a signature is pressed while unavailable;
it is not an ability-ready notification and has no separate public
`ENABLE_SIGFLASH` toggle. Keep press-state edge detection and cleanup intact.

## Declared settings

- `ENABLE_PASSIVE_COOLDOWN` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
