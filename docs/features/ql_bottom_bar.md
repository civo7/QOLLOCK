# ql_bottom_bar

Signature/AP/bottom HUD layout and wash palette.

Source: [manifest.js](../../panorama/scripts/manifests/ql_bottom_bar/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Applies the bottom-bar layout on enable and settings changes rather than
starting a recurring loop. Disable resets its signature and owned overrides.
Do not confuse the bottom-bar parent with the inventory container owned by
`ql_items`; changes to a shared ancestor can affect both.

## Declared settings

- `HUD_BOTTOM_BAR_ENABLED` (toggle)
- `BOTTOM_BAR_OPACITY` (slider)
- `BOTTOM_BAR_SCALE` (slider)
- `BOTTOM_BAR_X_OFFSET` (slider)
- `BOTTOM_BAR_Y_OFFSET` (slider)
- `BOTTOM_BAR_WASH_COLOR` (palette)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
