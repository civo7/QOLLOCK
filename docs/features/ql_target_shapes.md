# `panorama/scripts/manifests/ql_target_shapes` (Target Shapes)

## Description
Customizes the size, opacity, and scale of enemy unit target indicators and lock-on shapes (`.target_shape` and `.qol_hint_target`). It enables players to enlarge lock-on reticles for increased visibility in chaotic teamfights, reduce opacity to avoid obscuring enemy character models, adjust target hint indicators, and synchronize scaling with the Red Diamond targeting system.

## Files
- Manifest: `panorama/scripts/manifests/ql_target_shapes/manifest.js`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_RED_DIAMOND` | `toggle` | `false` | Master toggle to enable high-visibility Red Diamond enemy targeting reticles. |
| `ENABLE_IMPROVED_HINT` | `toggle` | `false` | Enable enhanced lock-on hint targeting styling. |
| `UNIT_TARGET_SIZE` | `slider` | `150` | Size scale percentage for unit target shapes (range: 50% to 300%). |
| `UNIT_TARGET_OPACITY` | `slider` | `1.0` | Opacity multiplier for unit target shapes (range: 0.0 to 1.0). |
| `UNIT_TARGET_HINT_SIZE` | `slider` | `100` | Size scale percentage for unit target hint shapes (range: 50% to 200%). |

*Note: Enabled by default (`enabledByDefault: true`).*

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Registers an adaptive polling loop via `QOL.core.Scheduler.createPollLoop(_tick, 0.2, "ql_target_shapes")`.
- **`onDisable()`**: Halts the poll loop, cancels scheduled tasks, and completely purges cached panel handles and state signatures.
- **`onSettingsChanged()`**: Dispatches root class updates via `QOL.core.hud.applyRootClasses()` to refresh targeting state flags on `#Hud`.
- **`test()`**: Verifies that class traversals for `.target_shape` and `.qol_hint_target` execute cleanly.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created; operates on dynamically spawned engine targeting panels.
- **Target Panels**:
  - `.target_shape`: Unit targeting brackets and reticles. Receives:
    - `style.uiScale`: Formatted from `UNIT_TARGET_SIZE` (e.g. `"150%"`).
    - `style.preTransformScale2d`: Enforced to `"1.00, 1.00"` to maintain sharpness.
    - `style.opacity`: Formatted via `SetPanelOpacitySafe`.
  - `.qol_hint_target`: Target hint containers. Receives `style.uiScale` derived from `UNIT_TARGET_HINT_SIZE`.

### Engine Events & Polling Frequency
- **Adaptive Polling Frequency**:
  - **Active Targets Present**: 5Hz (`0.2s` interval).
  - **Discovery (No Targets Cached)**: 2Hz (`0.5s` interval).
  - **Idle / Factory Defaults**: Throttled to 1Hz (`1.0s` interval).
- **Engine Events**: None hooked; monitors target panel presence and `red_diamond_active` HUD root class.

### Performance Tier & Caveats
- **Performance Tier**: Low-to-Medium (adaptive scheduling).
- **List Caching & Validity**: Cached panel handles (`targetShapesCache` and `hintContainerCache`) are validated via `IsCachedPanelListAlive()`. Full tree scans occur only once every 1000ms (or 500ms when searching for initial handles).
- **Graceful Cleanup Pass**: When reverting to default configuration values, executes a final cleanup pass (`needsCleanupPass`) to restore native engine styles before clearing caches and entering 1Hz idle mode.
