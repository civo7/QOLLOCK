# `panorama/scripts/manifests/ql_combat_status` (Combat Status & Out-of-Combat Timer)

## Description
Renders a clear combat status indicator on the HUD showing whether the player is actively `IN COMBAT`, `RECOVERING`, or `OUT OF COMBAT`. Includes a precise countdown timer displaying the remaining seconds until out-of-combat status is reached, helping players time passive health regeneration, item triggers, or stealth abilities.

## Files
- Manifest: `panorama/scripts/manifests/ql_combat_status/manifest.js`
- Styles: `panorama/styles/features/ql_feat_combat_status.css`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_COMBAT_STATUS` | `toggle` | `false` | Master toggle to render the combat status overlay on the HUD. |
| `COMBAT_STATUS_SCALE` | `slider` | `1.0` | Uniform scale multiplier for the combat status indicator (0.5 to 2.0). |
| `COMBAT_STATUS_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting the combat status display. |
| `COMBAT_STATUS_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting the combat status display. |
| `COMBAT_STATUS_OPACITY` | `slider` | `100` | Opacity percentage applied to the indicator (0% to 100%). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Locates `gameplay_hud`, constructs the `QOLCombatStatusOverlay` panel hierarchy, applies visual styling, and registers a cooperative scheduler task running at 5Hz (`0.2s` interval).
- **`onDisable()`**: Cancels the scheduler task, safely destroys `_panel` via `safeDeletePanel`, and resets internal state caches.
- **`onSettingsChanged()`**: Synchronously updates panel scale, offsets, and opacity without rebuilding the DOM.
- **`test()`**: Verifies that `gameplay_hud` is alive and attached to the active window.

### DOM Injection & Target Panels
- **Parent Container**: Injected under `gameplay_hud` (or root `#Hud`).
- **Injected Panels**:
  - `Panel#QOLCombatStatusOverlay`: Outer container positioned via transform margins.
  - `Label#QOLCombatStatusText`: Displays text status (`IN COMBAT`, `RECOVERING`, `OUT OF COMBAT`).
  - `Label#QOLCombatStatusTimer`: Displays remaining countdown seconds until out-of-combat status.
- **Dynamic State Classes**:
  - `.in_combat` (red highlight)
  - `.recovering` (yellow warning)
  - `.out_of_combat` (green passive state)

### Engine Events & Polling Frequency
- **Polling Frequency**: 5Hz (`0.2s` interval) cooperative polling loop via `QOL.core.Scheduler`.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: Low (`~0.04ms` per tick).
- **Suppression**: Automatically collapses when connected to the Hideout / Sandbox sandbox.
- **Style Optimization**: Text updates and class swaps are guarded by status state comparison to prevent layout churn when status remains unchanged.
