# `panorama/scripts/manifests/ql_topbar` (Top Bar HUD)

## Description
Customizes the layout geometry, scale factor, opacity, and visibility of the native Deadlock Top Bar (`#TopBar`). Furthermore, serves as the central configuration hub for top-bar visual augmentations, including the lane Objective Map, missing hero desaturation, per-player objective damage counters, background name blur toggling, ally and enemy low health warnings, and Urn delivery delta indicators.

## Files
- Manifest: `panorama/scripts/manifests/ql_topbar/manifest.js`
- Styles: `panorama/styles/citadel_hud_top_bar.css`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `HUD_TOP_BAR_ENABLED` | `toggle` | `true` | Master toggle to show or hide the Top Bar (`enabledByDefault: true`). |
| `ENABLE_OBJ_MAP` | `toggle` | `false` | Display lane objective status icons (Guardians, Walkers, Base) in the Top Bar. |
| `ENABLE_MISSING_HERO` | `toggle` | `false` | Grey out hero portraits in the Top Bar when heroes are missing from the minimap. |
| `ENABLE_OBJ_DMG` | `toggle` | `false` | Show individual player objective damage readouts under Top Bar portraits. |
| `DISABLE_PLAYER_NAME_BLUR` | `toggle` | `false` | Inverted toggle to remove the world background blur effect behind player names. |
| `ENABLE_TOPBAR_ENEMY_HP_WARNING` | `multitoggle` | — | Colorized border warnings on enemy portraits at health thresholds (25%, 65%, 75%). |
| `ENABLE_TOPBAR_ALLY_HP_WARNING` | `multitoggle` | — | Colorized border warnings on ally portraits at health thresholds (25%, 65%, 75%). |
| `ENABLE_URN_DIFF` | `toggle` | `false` | Display souls difference delta indicators when the Soul Urn is captured. |
| `TOP_BAR_OPACITY` | `slider` | `1.0` | Opacity multiplier for the Top Bar (range: 0.0 to 1.0). |
| `TOP_BAR_SCALE` | `slider` | `1.0` | UI scale multiplier for the Top Bar (range: 0.5x to 1.5x). |
| `TOP_BAR_X_OFFSET` | `slider` | `0` | Horizontal pixel offset (range: -1500px to +1500px). |
| `TOP_BAR_Y_OFFSET` | `slider` | `0` | Vertical pixel offset (range: -500px to +500px). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Evaluates and applies current styling overrides to `#TopBar` and registers a 2Hz (`0.5s` interval) polling loop via `QOL.core.Scheduler.createPollLoop(_tick, 0.5, "ql_topbar")`.
- **`onDisable()`**: Terminates the poll loop, resets `_lastSig`, clears inline style properties (`x`, `y`, `preTransformScale2d`, `uiScale`, `opacity`) via `QOL.utils.ClearStyleSafe`, and removes `qol-hidden`.
- **`onSettingsChanged()`**: Synchronously reapplies layout properties and invokes `QOL.core.hud.applyRootClasses()` to refresh top-bar root flags.
- **`test()`**: Verifies that the native `#TopBar` panel exists in the HUD tree.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panel**:
  - `Panel#TopBar`: Main top bar panel containing team scores, game clock, and player portrait arrays.
  - Receives `style.x`, `style.y` (-oy), `style.uiScale`, `style.opacity`, and `style.preTransformScale2d = "1.00, 1.00"`.
  - Receives `qol-hidden` class if `HUD_TOP_BAR_ENABLED` is turned off.

### Engine Events & Polling Frequency
- **Polling Frequency**: 2Hz (`0.5s` interval).
- **Rationale for Polling**: Re-evaluates spectator mode transitions and replay HUD visibility via `QOL.isHudVisibleForTopBarRuntime()`.
- **Engine Events**: Dispatches root class synchronizations on settings update.

### Performance Tier & Caveats
- **Performance Tier**: Low (2Hz tick).
- **Spectator / Replay Gating**: When the top bar is suppressed by native spectator camera modes, style modifications are bypassed to prevent visual glitches.
- **Composite Signature Diffing**: Writes are guarded by `_lastSig` (`ox|oy|op|sc|enabled|hudVisible|active`), ensuring style properties are touched only when visual state transitions.
