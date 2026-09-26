# `panorama/scripts/manifests/ql_items` (Native Items Inventory HUD Customization)

## Description
Adjusts the positioning, opacity, color tint, and visibility of the native HUD items inventory (`.ModsContainer` within `#StatsAndModsContainer`).

## Files
- Manifest: `panorama/scripts/manifests/ql_items/manifest.js`
- Styles: Dynamic inline style management on `ModsContainer`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `HUD_ITEMS_ENABLED` | `toggle` | `true` | Show the native item inventory. |
| `ITEMS_OPACITY` | `slider` | `1.0` | Opacity of inventory icons and the item bar graph (0 to 1). |
| `ITEMS_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting item inventory position. |
| `ITEMS_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting item inventory position. |
| `ITEMS_WASH_COLOR` | `palette` | `0` | Palette wash index (0 = native color). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Finds `.ModsContainer` inside `#StatsAndModsContainer`, applies styles, and starts a 1Hz loop to handle late or recreated panels.
- **`onDisable()`**: Stops the loop and restores native layout, tint, and child opacity; the visibility setting still controls whether the inventory is hidden.
- **`onSettingsChanged()`**: Runs `_apply()` with the current settings.
- **`test()`**: Checks for the inventory anchor, not visual correctness.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panels**:
  - `Panel.ModsContainer`: Native container hosting active and passive item slots.
  - `Panel#StatsAndModsContainer`: Parent HUD container.

### Engine Events & Polling Frequency
- **Polling Frequency**: 1Hz while the feature is enabled. Checks both settings and panel identities, including new item icons.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Style Optimization**: Skips writes only when settings, the inventory container, and affected child panels are unchanged. A replacement container receives the current tint even if the palette index is unchanged.
- **Verification**: Offline regressions cover late icon opacity, default-preset reset, and replacement inventory layout/tint. In-game rendering remains a client check.
