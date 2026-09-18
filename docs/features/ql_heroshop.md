# `panorama/scripts/manifests/ql_heroshop` (Hero Shop Layout & Simplification)

## Description
Customizes the in-game Hero Shop interface (`CitadelHudHeroShop`). Provides options to scale, reposition, and adjust the transparency of the shop window, as well as toggles to simplify the shop interface by stripping ornate background artwork, condensing item stat cards, and streamlining catalog navigation for quicker shopping during match downtime.

## Files
- Manifest: `panorama/scripts/manifests/ql_heroshop/manifest.js`
- Styles: Dynamic inline style management and class toggles on `CitadelHudHeroShop`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_SHOP_CUSTOMIZATION` | `toggle` | `false` | Master toggle to enable custom shop scale, offsets, and opacity. |
| `SHOP_SCALE` | `slider` | `1.0` | Global scale multiplier for the Hero Shop window (0.5 to 2.0). |
| `SHOP_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting the shop window. |
| `SHOP_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting the shop window. |
| `SHOP_OPACITY` | `slider` | `100` | Opacity percentage for the shop interface (0% to 100%). |
| `ENABLE_SIMPLIFY_SHOP` | `toggle` | `false` | Simplifies shop chrome and background flourishes for faster visual parsing. |
| `ENABLE_SIMPLIFY_STATS` | `toggle` | `false` | Condenses stat comparisons in the shop item details card. |
| `ENABLE_SIMPLIFY_ITEMS` | `toggle` | `false` | Simplifies catalog item cards to emphasize tier and price badges. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Subscribes to engine events `engine:shop_opened` and `engine:shop_closed` via `ctx.events`, registers a 1Hz (`1.0s` interval) fallback scheduler task, and applies styles if the shop is already open.
- **`onDisable()`**: Cancels scheduler task, unhooks event subscriptions, and restores native shop dimensions, margins, and visibility flags.
- **`onSettingsChanged()`**: Synchronously runs `_apply()` to re-evaluate shop layout properties (0ms latency).
- **`test()`**: Verifies that `#CitadelHudHeroShop` is present in the DOM tree.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panels**:
  - `Panel#CitadelHudHeroShop`: Primary shop interface container.
  - Child panel `#MainPanel`: Targets scale transforms and opacity styling.

### Engine Events & Polling Frequency
- **Engine Events**: Subscribes to `engine:shop_opened` and `engine:shop_closed` for zero-latency response the exact instant the player opens or exits the shop.
- **Polling Frequency**: 1Hz (`1.0s` interval) low-frequency fallback scheduler task.

### Performance Tier & Caveats
- **Performance Tier**: Low (`< 0.02ms` per event dispatch).
- **Style Optimization**: Layout writes are guarded with string signature diffing (`ox|oy|op|sc|simp|simpSt|simpIt`), ensuring transforms are only applied when the shop transitions state or settings are updated.
