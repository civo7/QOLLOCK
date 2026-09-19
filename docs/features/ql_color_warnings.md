# `panorama/scripts/manifests/ql_color_warnings` (Dynamic Health Threshold Color Warnings)

## Description
Applies dynamic visual color warnings and pulse alerts across health bars and top-bar hero portraits when health drops below critical percentages. Enables players to instantly identify execute thresholds, critical teammate distress, or their own low-health danger states without reading exact numerical health values.

## Files
- Manifest: `panorama/scripts/manifests/ql_color_warnings/manifest.js`
- Styles: Dynamic wash colors and threshold CSS classes applied to health containers and Top Bar portraits

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_HEALTH_CRITICAL_WARNING_SELF_25` | `toggle` | `false` | Flashes self healthbar when below 25% HP. |
| `ENABLE_HEALTH_CRITICAL_WARNING_SELF_65` | `toggle` | `false` | Visual alert on self healthbar when below 65% HP. |
| `ENABLE_HEALTH_CRITICAL_WARNING_SELF_75` | `toggle` | `false` | Visual alert on self healthbar when below 75% HP. |
| `ENABLE_HEALTH_CRITICAL_WARNING_ALLY_25` | `toggle` | `false` | Highlights ally Top Bar portraits when teammate drops below 25% HP. |
| `ENABLE_HEALTH_CRITICAL_WARNING_ALLY_65` | `toggle` | `false` | Highlights ally Top Bar portraits when teammate drops below 65% HP. |
| `ENABLE_HEALTH_CRITICAL_WARNING_ALLY_75` | `toggle` | `false` | Highlights ally Top Bar portraits when teammate drops below 75% HP. |
| `ENABLE_HEALTH_CRITICAL_WARNING_ENEMY_25` | `toggle` | `false` | Highlights enemy Top Bar portraits when opponent drops below 25% HP (killable). |
| `ENABLE_HEALTH_CRITICAL_WARNING_ENEMY_65` | `toggle` | `false` | Highlights enemy Top Bar portraits when opponent drops below 65% HP. |
| `ENABLE_HEALTH_CRITICAL_WARNING_ENEMY_75` | `toggle` | `false` | Highlights enemy Top Bar portraits when opponent drops below 75% HP. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Registers a cooperative polling task via `QOL.core.Scheduler` running at ~6Hz (`0.16s` interval) to evaluate health percentages.
- **`onDisable()`**: Cancels the scheduler loop, resets wash colors and warning classes from the player's health container and all Top Bar portraits.
- **`onSettingsChanged()`**: Synchronously runs an immediate evaluation tick to adjust to updated threshold configurations.
- **`test()`**: Verifies that `#health_and_abilities_container` and `#TopBar` can be resolved.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panels**:
  - `Panel#health_and_abilities_container`: The player's main HUD health bar container.
  - Top Bar portraits: Child portrait panels within `#TopBar` for both allied and enemy teams.
- **Applied Classes**:
  - `hp_warning_25`, `hp_warning_65`, `hp_warning_75` for styled CSS coloring and animated pulsing.

### Engine Events & Polling Frequency
- **Polling Frequency**: ~6Hz (`0.16s` interval), balancing responsive health tracking with minimal CPU consumption.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: Low (`~0.06ms` per evaluation tick).
- **Suppression**: Suppressed in Hideout/Sandbox when no active match or combat target exists.
- **Style Optimization**: State changes are cached per hero index; panel style mutations occur only when a player crosses an enabled threshold boundary, preventing per-frame layout recalculations.
