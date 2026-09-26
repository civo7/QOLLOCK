# ql_compass

Compass tape, speed display, minimap rotation/flip and player-heading discovery.

Source: [manifest.js](../../panorama/scripts/manifests/ql_compass/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Owns heading discovery, compass tape, the speed readout and minimap
rotation/flip integration. It can be active for minimap settings even when the
visible compass is off. Its bounded, ordered panel/heading selection is more
specific than a generic class search. Preserve heading normalization, source
backoff and cleanup when no valid player source exists. `COMPASS_INTERVAL_SEC`
and the runtime's rescheduling paths define its cadence.

## Declared settings

- `ENABLE_COMPASS` (toggle)
- `ENABLE_SIMPLIFY_COMPASS` (toggle)
- `ENABLE_COMPASS_SPEED` (toggle)
- `COMPASS_SCALE` (slider)
- `COMPASS_STRETCH_X` (slider)
- `COMPASS_STRETCH_Y` (slider)
- `COMPASS_X_OFFSET` (slider)
- `COMPASS_Y_OFFSET` (slider)
- `COMPASS_SPEED_X_OFFSET` (slider)
- `COMPASS_SPEED_Y_OFFSET` (slider)
- `MINIMAP_FLIP` (toggle)
- `MINIMAP_ROTATE_WITH_PLAYER` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
