# ql_reload_cooldown

Reload countdown estimated from native radial progress; icon/circle hiding settings.

Source: [manifest.js](../../panorama/scripts/manifests/ql_reload_cooldown/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Estimates remaining reload time from native radial progress, rather than
exposing an authoritative weapon reload-duration API. The timer, native reload
icon and circle have separate controls. The loop starts with
`FAST_INTERVAL_SEC`; preserve the source's idle/backoff and invalid-progress
handling. This is not an active-reload timing/bonus feature.

## Declared settings

- `ENABLE_RELOAD_COOLDOWN` (toggle)
- `ENABLE_HIDE_RELOAD_ICON` (toggle)
- `ENABLE_HIDE_RELOAD_CIRCLE` (toggle)
- `RELOAD_COOLDOWN_OPACITY` (slider)
- `RELOAD_COOLDOWN_SIZE` (slider)
- `RELOAD_COOLDOWN_X_OFFSET` (slider)
- `RELOAD_COOLDOWN_Y_OFFSET` (slider)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
