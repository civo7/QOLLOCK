# `panorama/scripts/manifests/ql_mouse_cursor` (Custom Gameplay Mouse Cursor)

## Description
Renders a custom gameplay mouse cursor overlay on the HUD when menu or interactive UI contexts are active. The feature tracks cursor coordinates and updates a custom cursor image position while hiding the native cursor or overlaying a styled reticle during shop interaction, scoreboard viewing, ability upgrades, hero details view, or the escape menu.

## Files
- Manifest: `panorama/scripts/manifests/ql_mouse_cursor/manifest.js`
- Styles: `panorama/styles/features/ql_feat_cursor.css`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| *(Feature Enable)* | `boolean` | `false` | Master toggle for the custom gameplay mouse cursor overlay (`enabledByDefault: false`). |

*Note: This feature exposes no sub-keys in its `settings` array; it is controlled entirely via its feature registration toggle.*

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Spawns a dedicated polling loop via `QOL.core.Scheduler.createPollLoop(_tick, 0.05, "ql_mouse_cursor")` running at 20Hz (50ms interval).
- **`onDisable()`**: Stops and destroys the poll loop, strips the `qol_custom_cursor_replace_active` CSS class from HUD root, calls `DeleteAsync(0)` on `_cursorPanel`, and resets internal position cache.
- **`onSettingsChanged()`**: Immediately triggers `_tick()` to refresh cursor positioning and visibility state.
- **`test()`**: Evaluates match context by checking for the `StartupLoader` panel on HUD root.

### DOM Injection & Target Panels
- **Parent Container**: Injected directly under `$.GetContextPanel()` (HUD root).
- **Target Panels**:
  - `Panel#QOLGameplayMouseCursor.QOLGameplayMouseCursor`: Top-level cursor position container. Configured with `hittest = false` and `hittestchildren = false`.
  - `Image#QOLGameplayMouseCursorImage.QOLGameplayMouseCursorImage`: Child image panel displaying the custom cursor graphic (`s2r://panorama/images/hud/abilities/punkgoat/goat_sigilslam_psd.vtex`).
- **CSS Classes**:
  - `qol_custom_cursor_replace_active`: Applied to HUD root when the custom cursor is actively rendered.
  - `qol-hidden`: Applied to `QOLGameplayMouseCursor` when outside interactive UI contexts.

### Engine Events & Polling Frequency
- **Polling Frequency**: 20Hz (`0.05s` / 50ms interval), rate-exempt due to the necessity of smooth mouse tracking.
- **Engine Events**: Does not subscribe to engine events directly. Instead, inspects HUD root state classes:
  - `gShopOpen` (Shop menu open)
  - `gScoreboardOpen` (Scoreboard open)
  - `gAbilityUpgradeMenu` (Ability upgrade screen open)
  - `gDetailView` (Hero detail view open)
  - `EscapeMenu` panel visibility

### Performance Tier & Caveats
- **Performance Tier**: High impact (measures ~1.34ms/tick during active tracking). Disabled by default.
- **Suppression**:
  - Suppressed in the Hideout/Sandbox sandbox lobby via `QOL.core.hud.isInHideout` and class checks (`connectedToHideout`, `InHideout`).
  - Suppressed while `StartupLoader` is active or when no interactive UI context is present.
- **Style Optimization**: Integer-rounded coordinate diffing (`_lastX`, `_lastY`) guards writes to `panel.style.x` and `panel.style.y`, preventing redundant layout invalidation when the mouse is stationary.
