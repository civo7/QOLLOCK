# `panorama/scripts/manifests/ql_unsecured_souls_timer` (Unsecured Souls Timer Overlay)

## Description
Renders a specialized floating countdown timer widget (`#QOLUnsecuredSoulsOverlay`) near the player's economy readout, calculating the estimated time (ETA in seconds) required for currently held unsecured/death-penalty souls to convert into permanent net worth. It employs an Exponential Moving Average (EMA) rate estimator combined with game-time fallback heuristics, dynamically color-coding the countdown according to four danger tiers (`danger_1` through `danger_4`) based on souls at risk.

## Files
- Manifest: `panorama/scripts/manifests/ql_unsecured_souls_timer/manifest.js`
- Styles: `panorama/styles/features/ql_feat_unsecured_souls.css` (rules for `#QOLUnsecuredSoulsOverlay`, `#QOLUnsecuredSoulsState`, danger levels)

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_UNSECURED_SOUL_TIMER` | `toggle` | `false` | Master toggle to display the unsecured souls countdown timer. |
| `UNSECURED_SOUL_TIMER_X_OFFSET` | `slider` | `0` | Horizontal pixel offset from anchor (range: -1500px to +1500px). |
| `UNSECURED_SOUL_TIMER_Y_OFFSET` | `slider` | `0` | Vertical pixel offset from anchor (range: -100px to +1000px). |
| `UNSECURED_SOUL_TIMER_SCALE` | `slider` | `100` | UI scale percentage for the overlay panel (range: 50% to 200%). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Initiates a 5Hz (`0.2s` interval) polling loop via `QOL.core.Scheduler.createPollLoop(_tick, 0.2, "ql_unsecured_souls_timer")`.
- **`onDisable()`**: Halts the polling loop, clears scheduled tasks, and completely deletes `#QOLUnsecuredSoulsOverlay` via `DeleteAsync(0)`.
- **`onSettingsChanged()`**: Clears `_timer.lastLayoutSig` and triggers `_tick()` immediately to refresh scale and positioning.
- **`test()`**: Verifies that the native `#gameplay_hud` anchor panel exists.

### DOM Injection & Target Panels
- **Parent Container**: Attached to `#gameplay_hud`.
- **Injected Panels**:
  - `Panel#QOLUnsecuredSoulsOverlay.QOLUnsecuredSoulsOverlay`: Container with `hittest = false` and `hittestchildren = false`.
  - `Label#QOLUnsecuredSoulsState`: Label displaying the remaining seconds countdown (e.g. `"14s"`).
- **Classes Toggled on Overlay**:
  - `danger_1`, `danger_2`, `danger_3`, `danger_4`: Color tiers based on souls value and parent container classes.
  - `has_souls`: Active when unsecured souls > 0.
  - `is_safe`: Active when all souls are secured.
  - `is_syncing`: Active when values are unresolved or synchronizing.
- **Data Sources Polled**:
  - `#HudUnsecuredLabel` or `#hudDealthGoldLabel` (children of `gold_and_ap_container` or `hudDeathGoldContainer`).

### Engine Events & Polling Frequency
- **Polling Frequency**: 5Hz (`0.2s` interval).
- **EMA Decay Estimation**:
  - Samples soul reduction rates across 250ms minimum sample windows (`UNSECURED_SOULS_MIN_SAMPLE_MS`).
  - Smoothes conversion rate using EMA alpha `0.35` (`UNSECURED_SOULS_RATE_EMA_ALPHA`).
  - Fallback formula when rate is stale: `rate = (remaining * 0.02) + (15 * (1 + matchMinutes * 0.05))`.

### Performance Tier & Caveats
- **Performance Tier**: Low-to-Medium.
- **Suppression**:
  - Fully suppressed in Hideout / Sandbox lobbies (`_isConnectedToHideout`).
  - Fully suppressed in Hero Testing mode (`_isHeroTesting`).
- **State Isolation**: Operates using an independent, private state machine (`_timer`) to guarantee zero interference with `ql_better_unsecured_hud`.
- **Signature Optimization**: Inline styles and danger classes are guarded by `lastLayoutSig` and `lastClassSig`.
