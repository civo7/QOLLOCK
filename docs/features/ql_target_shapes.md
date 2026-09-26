# ql_target_shapes

Size/opacity of native target and hint shapes, including default-state cleanup.

Source: [manifest.js](../../panorama/scripts/manifests/ql_target_shapes/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Starts a 0.2-second loop for native target/hint presentation. The feature
is registered enabled by default; this is not a blanket guarantee that every
setting is active. Keep transitions back to default sizing/opacity and owned
runtime-state cleanup distinct from deleting native target panels.

## Declared settings

- `ENABLE_RED_DIAMOND` (toggle)
- `ENABLE_IMPROVED_HINT` (toggle)
- `UNIT_TARGET_SIZE` (slider)
- `UNIT_TARGET_OPACITY` (slider)
- `UNIT_TARGET_HINT_SIZE` (slider)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
