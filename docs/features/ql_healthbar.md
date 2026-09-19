# `panorama/scripts/manifests/ql_healthbar` (Custom Healthbar Styles & Layout Dispatcher)

## Description
Provides a comprehensive modular healthbar replacement system for the player's primary HP and shield meters. Acts as a theme dispatcher supporting multiple distinct visual styles: **Minimalist** (clean solid flat bars), **budhud** (TF2-inspired bold competitive typography), **Fighting Game** (arcade-style segmented vitality gauge), and **Minecraft** (retro pixel heart containers).

## Files
- Manifest: `panorama/scripts/manifests/ql_healthbar/manifest.js`
- Styles: `panorama/styles/features/ql_feat_healthbar.css`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_HEALTHBAR_OVERLAY` | `toggle` | `false` | Master toggle to enable custom healthbar overlay rendering. |
| `HEALTHBAR_TYPE` | `dropdown` | `"default"` | Theme preset selector (`default`, `minimalist`, `budhud`, `fg`, `minecraft`). |
| `HEALTHBAR_SCALE` | `slider` | `1.0` | Global scale multiplier for the custom healthbar container (0.5 to 2.5). |
| `HEALTHBAR_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting the healthbar display. |
| `HEALTHBAR_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting the healthbar display. |
| `HEALTHBAR_OPACITY` | `slider` | `100` | Opacity percentage for the healthbar container (0% to 100%). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Locates `#health_and_abilities_container`, constructs the `QOLHealthbarRoot` overlay panel tree, applies the active theme class to `#Hud`, and registers a rate-exempt polling task running at 20Hz (`0.05s` interval).
- **`onDisable()`**: Cancels scheduler task, deletes `_panel` via `safeDeletePanel`, strips active theme classes from the HUD, and invalidates cache.
- **`onSettingsChanged()`**: Synchronously switches theme classes, recalculates scale and position offsets, and triggers an immediate tick.
- **`test()`**: Verifies that `#health_and_abilities_container` is present in the DOM.

### DOM Injection & Target Panels
- **Parent Container**: Injected under `Panel#health_and_abilities_container` (or root `#Hud`).
- **Injected Panels**:
  - `Panel#QOLHealthbarRoot`: Main styled wrapper hosting health and shield bars.
  - Sub-elements: `Panel#QOLHealthbarFill`, `Panel#QOLShieldFill`, `Label#QOLHealthText`, or segmented heart containers depending on selected `HEALTHBAR_TYPE`.
- **Root Classes Synchronized**:
  - `ql_healthbar_minimalist`, `ql_healthbar_budhud`, `ql_healthbar_fg`, `ql_healthbar_minecraft`.

### Engine Events & Polling Frequency
- **Polling Frequency**: 20Hz (`0.05s` interval). Rate-exempt to ensure smooth bar interpolation and instant damage reflection during combat.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: Medium (`~0.10ms` per tick during combat).
- **Suppression**: Suppressed when in the Hideout/Sandbox lobby.
- **Interpolation & Diffing**: Fill bar width percentages and numeric labels are diffed against previous frame state; style writes are skipped if health and shield values have not changed.
