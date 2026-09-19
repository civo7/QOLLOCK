# `panorama/scripts/manifests/ql_compass` (Compass Tape, Speedometer & Rotating Minimap)

## Description
Renders an intuitive tactical compass tape (featuring 360-degree markings and cardinal heading indicators N, NE, E, SE, S, SW, W, NW) and a real-time hero velocity speedometer on the HUD. Additionally, provides an option to synchronize player yaw with the minimap for a rotating minimap experience.

## Files
- Manifest: `panorama/scripts/manifests/ql_compass/manifest.js`
- Styles: `panorama/styles/features/ql_feat_compass.css`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_COMPASS` | `toggle` | `false` | Master toggle to display the directional compass tape on the HUD. |
| `COMPASS_SCALE` | `slider` | `1.0` | Scale multiplier for the compass tape overlay (0.5 to 2.0). |
| `COMPASS_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting compass position. |
| `COMPASS_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting compass position. |
| `COMPASS_OPACITY` | `slider` | `100` | Opacity percentage for the compass display (0% to 100%). |
| `ENABLE_SPEEDOMETER` | `toggle` | `false` | Master toggle to display real-time hero movement speed (units/sec). |
| `SPEEDOMETER_SCALE` | `slider` | `1.0` | Scale multiplier for the speedometer display (0.5 to 2.0). |
| `SPEEDOMETER_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting speedometer position. |
| `SPEEDOMETER_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting speedometer position. |
| `ENABLE_ROTATING_MINIMAP` | `toggle` | `false` | Continuously rotates the minimap perspective to align with player heading. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Injects `QOLCompassRoot` and `QOLSpeedRoot` into `gameplay_hud`, initializes cardinal indicators, and registers a rate-exempt polling task running adaptively at 20Hz (`0.05s`) in motion and 2Hz (`0.5s`) while idle.
- **`onDisable()`**: Cancels scheduler loops, safely deletes injected panels, and resets any rotation transform applied to `#hud_minimap` or `#minimap_persp`.
- **`onSettingsChanged()`**: Synchronously reapplies scale, position coordinates, and opacity.
- **`test()`**: Verifies that `gameplay_hud` is mounted in the current window.

### DOM Injection & Target Panels
- **Parent Container**: Injected under `gameplay_hud` (or root `#Hud`).
- **Injected Panels**:
  - `Panel#QOLCompassRoot`: Hosts the sliding heading tape and cardinal tick markers.
  - `Panel#QOLSpeedRoot`: Hosts the movement speed value and unit labels (`Label#QOLSpeedValue`).
- **Manipulated Engine Panels**:
  - `Panel#hud_minimap` and `Panel#minimap_persp`: Receives dynamic `rotateZ` transforms when rotating minimap is active.

### Engine Events & Polling Frequency
- **Polling Frequency**: Adaptive polling—runs at 20Hz (`0.05s` / 50ms) during hero movement to ensure fluid compass animation; throttles down to 2Hz (`0.5s`) when stationary.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: Medium (~0.12ms/tick during high-speed rotation, near-zero when stationary).
- **Suppression**: Suppressed when connected to Hideout or Sandbox environments.
- **Transform & Deadzone Caching**: Heading angles are filtered with a 0.15° deadband threshold in `_updateCompassTicks` to skip recalculating tick positions and mutating child styles when viewing angle is stationary.
- **Layout Invalidation Guards**: `BHasClass` guards prevent redundant `SetHasClass("qol_minimap_flip_active")` calls on `#hud_minimap`, avoiding excessive C++ layout recalculations.
