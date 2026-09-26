# ql_heroshop

Shop layout, simplification and quickbuy behavior; quickbuy has a special-context companion.

Source: [manifest.js](../../panorama/scripts/manifests/ql_heroshop/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Subscribes to `engine:shop_opened` and `engine:shop_closed`, starts a
1-second fallback loop and performs an initial tick. Disable removes those
listeners and resets owned native-panel state. Quickbuy also has a separate
`hud_quickbuy.xml` context; inspect its included script before assuming HUD
globals are available there. Recent-purchase settings overlap another owner.

## Declared settings

- `HUD_SHOP_ENABLED` (toggle)
- `ENABLE_HERO_SCENE_PANEL` (toggle)
- `DISABLE_QUICK_BUY` (toggle)
- `ENHANCED_QUICKBUY_COUNT` (slider)
- `ENABLE_QUICKBUY_CLICK_TO_NOTIFY` (toggle)
- `SHOP_OFFSET_X` (slider)
- `SHOP_OFFSET_Y` (slider)
- `SHOP_OPACITY` (slider)
- `SHOP_SCALE` (slider)
- `ENABLE_SIMPLIFY_SHOP` (toggle)
- `ENABLE_SIMPLIFY_ITEMS` (toggle)
- `DISABLE_SHOP_BLUE` (toggle)
- `ENABLE_SHOP_STATS` (toggle)
- `ENABLE_SIMPLIFY_SHOP_STATS` (toggle)
- `ENABLE_SHOP_RECENT_PURCHASES` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
