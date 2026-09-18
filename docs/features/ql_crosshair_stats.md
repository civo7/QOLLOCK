# `panorama/scripts/manifests/ql_crosshair_stats` (Crosshair Stat Readout Overlay)

## Description
Renders a compact, customizable statistical HUD overlay directly adjacent to the crosshair. Displays up to 15 real-time combat stats (such as Bullet Damage, Fire Rate, Bullet Velocity, Cooldown Reduction, Spirit Power, and Resistances) mirrored dynamically from the player stats container, enabling players to evaluate their power spikes without opening character sheets or shops.

## Files
- Manifest: `panorama/scripts/manifests/ql_crosshair_stats/manifest.js`
- Styles: `panorama/styles/features/ql_feat_crosshair_stats.css`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_CROSSHAIR_STATS` | `toggle` | `false` | Master toggle to display the tactical stat readout near the crosshair. |
| `CROSSHAIR_STATS_SCALE` | `slider` | `1.0` | Global scale multiplier for the crosshair stat panel (0.5 to 2.0). |
| `CROSSHAIR_STATS_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting stat panel position. |
| `CROSSHAIR_STATS_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting stat panel position. |
| `CROSSHAIR_STATS_OPACITY` | `slider` | `100` | Opacity percentage for the stat display (0% to 100%). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Injects `QOLCrosshairStatsOverlay` into `gameplay_hud`, generates stat row containers, and registers a cooperative scheduler polling loop at 10Hz (`0.1s` interval).
- **`onDisable()`**: Cancels the scheduler task, safely destroys `_panel`, and invalidates cached stat values.
- **`onSettingsChanged()`**: Synchronously updates panel scale, offsets, opacity, and row visibility.
- **`test()`**: Verifies that `gameplay_hud` and native `#hudPlayerStats` are present in the DOM tree.

### DOM Injection & Target Panels
- **Parent Container**: Injected under `gameplay_hud` (or root `#Hud`).
- **Injected Panels**:
  - `Panel#QOLCrosshairStatsOverlay`: Main container positioned relative to crosshair coordinates.
  - Stat row children: Individual icon and label pairs for Weapon Damage, Fire Rate, Bullet Velocity, Reload Speed, Spirit Power, Cooldown Reduction, etc.
- **Native Read Targets**:
  - Reads values and modifier classes from `#hudPlayerStats`.

### Engine Events & Polling Frequency
- **Polling Frequency**: 10Hz (`0.1s` interval) for timely stat updates following ability upgrades or item purchases.
- **Engine Events**: Monitors root class `gScoreboardOpen` to automatically suppress the overlay while the scoreboard is active.

### Performance Tier & Caveats
- **Performance Tier**: Low (`~0.08ms` per tick).
- **Suppression**: Collapses in Hideout/Sandbox environments.
- **Text Diffing**: Numerical label updates are guarded by string diffing against previous values, preventing redundant layout reflows when hero stats are constant.
