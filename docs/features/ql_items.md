# `panorama/scripts/manifests/ql_items` (Native Items Inventory HUD Customization)

## Description
Adjusts the positioning, scale, opacity, and color tinting of the native HUD items inventory container (`ModsContainer` within `StatsAndModsContainer`). Gives players complete freedom to reposition their active and passive item slots to fit ultra-wide monitors, multi-monitor setups, or custom HUD layouts.

## Files
- Manifest: `panorama/scripts/manifests/ql_items/manifest.js`
- Styles: Dynamic inline style management on `ModsContainer`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `HUD_ITEMS_ENABLED` | `toggle` | `false` | Master toggle to enable native item inventory modifications. |
| `ITEMS_OPACITY` | `slider` | `100` | Opacity percentage for the item inventory container (0% to 100%). |
| `ITEMS_SCALE` | `slider` | `1.0` | Global scale multiplier for the item slots container (0.5 to 2.0). |
| `ITEMS_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting item inventory position. |
| `ITEMS_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting item inventory position. |
| `ITEMS_WASH_COLOR` | `dropdown` | `"none"` | Color tint applied across the item container background (`none`, `gold`, `green`, `purple`, `orange`, `blue`). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Traverses from `#Hud` to find `#ModsContainer` inside `#StatsAndModsContainer`. If the container is dynamically unmounted, schedules a low-frequency 1Hz retry until acquired, then applies styles via `_apply()`.
- **`onDisable()`**: Reverts `#ModsContainer` transforms, margins, opacity, and wash color to default values.
- **`onSettingsChanged()`**: Synchronously runs `_apply()` to update layout properties (0ms latency).
- **`test()`**: Verifies that `#ModsContainer` is mounted in the HUD DOM.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panels**:
  - `Panel#ModsContainer`: Native container hosting active and passive item slots.
  - `Panel#StatsAndModsContainer`: Parent HUD container.

### Engine Events & Polling Frequency
- **Polling Frequency**: Zero polling (0Hz) during normal operation; 1Hz low-frequency retry loop strictly during initial HUD mounting if `ModsContainer` is delayed.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: Low (`< 0.02ms` on configuration change).
- **Suppression**: Validates panel existence before applying style mutations.
- **Style Optimization**: Style writes are guarded with composite string signatures (`ox|oy|op|sc|wc`), eliminating redundant layout recalculations.
