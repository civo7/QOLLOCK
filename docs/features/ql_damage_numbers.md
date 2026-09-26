# ql_damage_numbers

Native combat indicator presentation; settings use DAMAGE_NUMBER_OPACITY and HUD_INDICATOR_SIZE.

Source: [manifest.js](../../panorama/scripts/manifests/ql_damage_numbers/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Starts a 0.5-second loop to maintain native combat-indicator presentation.
The actual keys are `DAMAGE_NUMBER_OPACITY` and `HUD_INDICATOR_SIZE`, alongside
the declared visibility/format flags. This is distinct from directional damage
impact and the damage-report panel. Preserve indicator-cache invalidation on
disable and native panel replacement.

## Declared settings

- `DAMAGE_NUMBER_OPACITY` (slider)
- `HUD_INDICATOR_SIZE` (slider)
- `ENABLE_CLEAN_DAMAGE_INDICATORS` (toggle)
- `ENABLE_HIDE_SMALL_NUMBERS` (toggle)
- `ENABLE_HIDE_TROOPER_DAMAGE` (toggle)
- `ENABLE_DAMAGE_FOUNTAIN` (toggle)
- `ENABLE_CUMULATIVE_DMG` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
