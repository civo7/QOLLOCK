# ql_damage_report

Damage-report visibility/offsets; no DAMAGE_REPORT_SCALE schema field.

Source: [manifest.js](../../panorama/scripts/manifests/ql_damage_report/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Applies the hide class and X/Y offsets on enable and settings changes;
there is no recurring loop in this manifest. `DISABLE_DAMAGE_REPORT` is the
registered enable key, so inspect activation as well as offset handling when
changing behavior. There is no `DAMAGE_REPORT_SCALE` field in its schema.

## Declared settings

- `DISABLE_DAMAGE_REPORT` (toggle)
- `DAMAGE_REPORT_X_OFFSET` (slider)
- `DAMAGE_REPORT_Y_OFFSET` (slider)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
