# ql_damage_impact

Native directional damage indicator styling.

Source: [manifest.js](../../panorama/scripts/manifests/ql_damage_impact/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Applies native directional-indicator styles on enable/settings changes,
without starting a recurring loop. The runtime owns a style signature and clears
its native overrides on disable. Scaling/opacity changes here do not create a
new damage-event feed or control floating damage numbers.

## Declared settings

- `ENABLE_DAMAGE_IMPACT` (toggle)
- `DAMAGE_IMPACT_SCALE` (slider)
- `DAMAGE_IMPACT_OPACITY` (slider)
- `DAMAGE_IMPACT_X_OFFSET` (slider)
- `DAMAGE_IMPACT_Y_OFFSET` (slider)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
