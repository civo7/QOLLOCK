# `panorama/scripts/manifests/ql_recent_purchases` (Recent Purchases & Item Buy Notifications)

## Description
Extends Deadlock's shop and HUD with real-time item purchase tracking. It introduces three primary modules:
1. **Shop Recent Purchases Filters & Icons**: Enhances the native shop recent purchases panel with tier filters (T1–T4), team filters (My Team, Enemy Team, Hidden King, Archmother), and vibrant colored item icons.
2. **Centralized Quick Purchase Feed**: A floating HUD notification feed displaying ally and enemy purchases with hero portraits, item icons, and timestamps. Features automatic positioning adjustments to avoid overlapping the Mid Boss Rejuvenator countdown or the scoreboard.
3. **Hero Card Popups**: Individual item purchase popups anchored directly under top-bar hero portraits.

## Files
- Manifest: `panorama/scripts/manifests/ql_recent_purchases/manifest.js`
- Styles: `panorama/styles/citadel_hud_hero_shop.css` (rules for `.shop_recent_purchases_active`, `.PurchaseFilterToggle`, `.filterHidden`, etc.)

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_SHOP_RECENT_PURCHASES` | `toggle` | `false` | Enable enhanced filters, layout, and item icons in the shop's Recent Purchases panel. |
| `ENABLE_SHOP_ITEM_NOTIFICATIONS` | `toggle` | `false` | Enable the centralized floating HUD notification feed for recent item purchases. |
| `ENABLE_HERO_PURCHASE_POPUPS` | `toggle` | `false` | Enable purchase notification popups anchored directly below top-bar hero portraits. |
| `RECENT_PURCHASES_PANEL_X_OFFSET` | `number` | `0` | Horizontal pixel offset for the shop recent purchases panel. |
| `RECENT_PURCHASES_PANEL_Y_OFFSET` | `number` | `0` | Vertical pixel offset for the shop recent purchases panel. |
| `RECENT_PURCHASES_PANEL_OPACITY` | `number` | `1.0` | Opacity multiplier for the shop recent purchases panel (range: 0.0 to 1.0). |
| `RECENT_PURCHASES_PANEL_SCALE` | `number` | `1.0` | Scale multiplier for the shop recent purchases panel. |
| `RECENT_PURCHASES_QUICK_X_OFFSET` | `number` | `0` | Horizontal pixel offset for the floating quick purchase notification feed. |
| `RECENT_PURCHASES_QUICK_Y_OFFSET` | `number` | `0` | Vertical pixel offset for the floating quick purchase notification feed. |
| `RECENT_PURCHASES_QUICK_OPACITY` | `number` | `1.0` | Opacity multiplier for the quick purchase notification feed. |
| `RECENT_PURCHASES_QUICK_SCALE` | `number` | `1.0` | UI scale multiplier for the quick purchase notification feed. |
| `RECENT_PURCHASES_QUICK_MAX` | `number` | `3` | Maximum number of visible cards in the floating quick purchase feed. |
| `RECENT_PURCHASES_QUICK_DISPLAY_SEC`| `number` | `5` | Display duration (in seconds) before a quick purchase card fades out. |
| `RECENT_PURCHASES_QUICK_REJUV` | `toggle` | `false` | Automatically offset notifications when the Mid Boss Rejuvenator timer is visible. |
| `RECENT_PURCHASES_QUICK_SCOREBOARD` | `toggle` | `false` | Automatically reposition or hide notifications when the Scoreboard (Tab) is opened. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **Enable Keys**: Registered with `enableKeys: ["ENABLE_SHOP_RECENT_PURCHASES", "ENABLE_SHOP_ITEM_NOTIFICATIONS", "ENABLE_HERO_PURCHASE_POPUPS"]`.
- **`onEnable()`**: Initiates a 5Hz (`0.2s` interval) polling loop via `QOL.core.Scheduler.createPollLoop(_tick, 0.2, "ql_recent_purchases")`.
- **`onDisable()`**: Stops the polling loop, cancels any pending delayed hideout clear timer (`_hideoutClearTimer`), clears scheduled tasks, deletes `_quickPurchasesPanel` via `DeleteAsync(0)`, executes `_resetHeroPopupState()`, and nullifies all cached panel references.
- **`onSettingsChanged()`**: Clears style and filter signatures (`_lastVisibilitySig = null`, `_lastFilterSig = null`) and invokes `_tick()` immediately.
- **`test()`**: Verifies that the native `CitadelShop` panel exists in the HUD context tree.

### DOM Injection & Target Panels
- **Shop Filter Controls**:
  - Injected inside `CitadelShop` -> `RecentPurchasesPanel`:
    - `ToggleButton#FiltersCollapseToggle.PurchaseFilterToggle`: Collapses/expands filter groups.
    - `Panel#PurchaseFiltersContainer`: Houses filter button groups.
    - `ToggleButton#Tier1Toggle`, `Tier2Toggle`, `Tier3Toggle`, `Tier4Toggle`, `MyTeamToggle`, `EnemyTeamToggle`.
  - Item icons applied as background images on `recentPurchase .mod_icon`.
- **Quick Purchases Floating Feed**:
  - Injected under `#Hud`:
    - `Panel#QOLQuickPurchasesContainer` / `Panel#QuickPurchasesPanel`.
    - Dynamic row panels populated with hero portrait, item icon, tier cost, and purchase timestamp.
- **Top Bar Hero Popups**:
  - Dynamically resolved and attached to top bar player cards under `#TopBar`. Coordinates vertical offsets with `ql_ult_cooldowns` to prevent visual collision.

### Engine Events & Polling Frequency
- **Polling Frequency**: 5Hz (`0.2s` interval).
- **Engine State & Class Sync**:
  - Synchronizes `shop_recent_purchases_active` and `shop_item_notifications_active` CSS classes on `#Hud`.
  - Tracks shop open/closed state and top-bar hero card bindings.

### Performance Tier & Caveats
- **Performance Tier**: Medium overhead due to list inspection and string signature matching.
- **Suppression**: Suppressed when in the Hideout/Sandbox lobby.
- **Signature Optimization**:
  - Uses filter signatures (`_getFilterSigRP`), visibility signatures, and panel style signatures (`_rpPanelStyleSig`, `_quickPanelStyleSig`) to eliminate redundant DOM mutation passes.
  - Items are tracked via composite keys (`heroName + itemName + timeText`) to ensure zero re-processing of already animated cards.
