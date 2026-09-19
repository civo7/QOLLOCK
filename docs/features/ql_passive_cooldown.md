# `panorama/scripts/manifests/ql_passive_cooldown` (Passive Cooldown HUD)

## Description
Provides styling, scale adjustments, and mode switching for passive item cooldown indicators. Deadlock's native passive items display cooldown states on the `#hud_passive_items` panel. This feature allows players to customize the position, scale, and opacity of the native passive cooldown HUD ("Basic Mode"), or toggle HUD classes to delegate advanced tracking and mirroring to the item mirror subsystem ("Advanced Mode").

## Files
- Manifest: `panorama/scripts/manifests/ql_passive_cooldown/manifest.js`
- Styles: `panorama/styles/features/ql_feat_passive_cooldown.css`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_PASSIVE_COOLDOWN` | `toggle` | `false` | Master toggle to enable passive item cooldown HUD customization. |
| `ENABLE_OLD_ITEM_COOLDOWNS` | `toggle` | `false` | When enabled, activates "Basic Mode" to style and reposition `#hud_passive_items`. When disabled, activates "Advanced Mode" classes. |
| `PASSIVE_COOLDOWN_SIZE` | `slider` | `40` | Base icon size in pixels (range: 30–60). Controls scale factor calculation. |
| `PASSIVE_COOLDOWN_X` | `slider` | `0` | Horizontal position offset percentage (range: -50% to 50%). |
| `PASSIVE_COOLDOWN_Y` | `slider` | `0` | Vertical position offset percentage (range: -50% to 50%). |
| `PASSIVE_COOLDOWN_OPACITY` | `slider` | `0.5` | Opacity multiplier for the passive cooldown panel (range: 0.0 to 1.0). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Reads configuration and applies corresponding class flags to `#Hud` along with inline styling to `#hud_passive_items`.
- **`onDisable()`**: Strips `passive_cooldown_basic_active` and `passive_cooldown_advanced_active` classes from `#Hud`, clears all inline style overrides on `#hud_passive_items`, and invalidates cached panel references.
- **`onSettingsChanged()`**: Synchronously reapplies classes and recalculates inline style properties (`uiScale`, `x`, `y`, `marginLeft`, `marginTop`, `opacity`).
- **`test()`**: Validates resolution of the native `#Hud` panel.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created. Operates strictly on existing native engine panels.
- **Target Panels**:
  - `#Hud`: Receives mode gating classes `passive_cooldown_basic_active` or `passive_cooldown_advanced_active`.
  - `#hud_passive_items`: Child panel under `#Hud`. In Basic Mode, receives inline style calculations:
    - `uiScale`: Calculated as `clamp(round((size / 40) * 110), 50%, 200%)`
    - `x`: Fixed anchor `"11px"`
    - `y`: Fixed anchor `"30px"`
    - `marginLeft`: Formatted from `PASSIVE_COOLDOWN_X` as percentage
    - `marginTop`: Calculated from `(-6 - PASSIVE_COOLDOWN_Y)` as percentage
    - `opacity`: Clamped opacity string

### Engine Events & Polling Frequency
- **Polling Frequency**: Zero polling (0Hz). Fully event-driven via configuration store changes.
- **Engine Events**: None required; visual updates are triggered on setting modifications.

### Performance Tier & Caveats
- **Performance Tier**: None (`0ms` runtime impact).
- **Panel Caching**: Panel reference to `#hud_passive_items` is cached in `_cachedPassiveHud` and validated with `QOL_UTILS.IsPanelValid`.
- **Clean Reset**: On disabling or switching to Advanced Mode, inline styles are cleanly set to `null` to restore native engine layout and CSS cascading.
