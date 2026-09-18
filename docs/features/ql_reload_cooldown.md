# `panorama/scripts/manifests/ql_reload_cooldown` (Reload Cooldown Numeric Countdown)

## Description
Calculates and renders an on-reticle numeric seconds countdown during weapon reload sequences. By monitoring the radial progress clip angle (`radial(...) deg`) of the native `attack_delayed_progress_bar`, the feature estimates weapon reload speed using an Exponential Moving Average (EMA) and displays a smooth countdown timer in seconds (e.g. `2`, `1`, `0.4`) directly at the crosshair. Additionally provides toggles to hide the native reload crosshair icon and radial circle.

## Files
- Manifest: `panorama/scripts/manifests/ql_reload_cooldown/manifest.js`
- Styles: `panorama/styles/ability_hud_elements/element_gun.css` (defines `#QOLReloadCooldownText` layout rules)

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_RELOAD_COOLDOWN` | `toggle` | `false` | Master toggle to display the numeric reload cooldown timer on the reticle. |
| `ENABLE_HIDE_RELOAD_ICON` | `toggle` | `false` | Inverted toggle to conceal the native reload icon that replaces the crosshair. |
| `ENABLE_HIDE_RELOAD_CIRCLE` | `toggle` | `false` | Inverted toggle to conceal the native radial progress circle around the reticle. |
| `RELOAD_COOLDOWN_OPACITY` | `slider` | `0.6` | Opacity multiplier for the countdown text (range: 0.0 to 1.0). |
| `RELOAD_COOLDOWN_SIZE` | `slider` | `28` | Font size in pixels for the countdown text (range: 16px to 60px). |
| `RELOAD_COOLDOWN_X_OFFSET` | `slider` | `0` | Horizontal pixel offset from the reticle center (range: -75px to +75px). |
| `RELOAD_COOLDOWN_Y_OFFSET` | `slider` | `0` | Vertical pixel offset from the reticle center (range: -75px to +75px). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Initiates an adaptive polling loop via `QOL.core.Scheduler.createPollLoop(_tick, 0.05, "ql_reload_cooldown")`.
- **`onDisable()`**: Terminates the poll loop, resets the EMA estimator, and hides the countdown label (`_hideLabel()`).
- **`onSettingsChanged()`**: Synchronously updates the label position/styling and triggers `QOL.core.hud.applyRootClasses()` to refresh root CSS classes for hiding the reload icon or circle.
- **`test()`**: Verifies manifest context identification.

### DOM Injection & Target Panels
- **Container Target**: `#reticle_status` (located within `#Hud`).
- **Injected Panel**:
  - `Label#QOLReloadCooldownText`: Positioned at the reticle center. Set with `hittest = false` and `hittestchildren = false`.
- **Monitored Native Panel**:
  - `Panel#attack_delayed_progress_bar`: Inspected for classes (`has_active_reload`, `attack_delayed`, `reloading`) and radial clip styling (`style.clip`).

### Engine Events & Polling Frequency
- **Adaptive Polling Frequency**:
  - **Active Reload**: 20Hz (`0.05s` interval) for high-precision progress tracking. Rate-exempt in scheduler.
  - **Idle (Not Reloading)**: Throttled down to 2Hz (`0.50s` interval).
- **Engine Events**: None hooked; relies on radial clip parsing.

### Performance Tier & Caveats
- **Performance Tier**: Low (adaptive throttling keeps idle CPU usage near zero).
- **EMA Rate Estimation**: Calculates angular velocity (`dDeg / dtSec`) smoothed by `(slopeEma * 0.75) + (slope * 0.25)` to eliminate jitter caused by uneven frame pacing.
- **Monotonic Locking**: Employs `_displayLock` to guarantee that displayed countdown values never jitter upward mid-reload.
- **Style Optimization**: Changes to font size, margins, and opacity are guarded by a composite signature (`_styleSig = opacity|size|offX|offY`).
