# `panorama/scripts/manifests/ql_perf` (Performance Diagnostics & Overlay)

## Description
Tracks real-time execution timing, CPU frame consumption, and scheduler diagnostics across all QOLLOCK subsystems and feature manifests. It provides a visual HUD overlay displaying active feature performance metrics and periodically flushes top CPU consumers to the developer console, helping developers and players identify performance bottlenecks, frame spikes, and slow polling loops.

## Files
- Manifest: `panorama/scripts/manifests/ql_perf/manifest.js`
- Supporting Scripts: `panorama/scripts/ql_perf_overlay.js` (loaded in `panorama/layout/hud.xml`)

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_PERF_DEBUG` | `toggle` | `false` | Enable periodic console logs showing average execution times of top features. |
| `ENABLE_PERF_DEBUG_DETAIL` | `toggle` | `false` | Enable detailed console statistics including call count, max execution time, and slow frame count. |
| `ENABLE_PERF_OVERLAY` | `toggle` | `false` | Display an on-screen HUD overlay showing live performance statistics. |
| `PERF_OVERLAY_OPACITY` | `slider` | `0.8` | Opacity of the performance HUD overlay (range: 0.1 to 1.0). |

*Note: Feature registration uses multi-key activation (`enableKeys: ["ENABLE_PERF_DEBUG", "ENABLE_PERF_DEBUG_DETAIL", "ENABLE_PERF_OVERLAY"]`), automatically turning on if any of these settings are active.*

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Initiates a cooperative polling loop at 5Hz (`0.2s` interval) via `QOL.core.Scheduler.createPollLoop(_tick, 0.2, "ql_perf")` and triggers an immediate tick.
- **`onDisable()`**: Terminates the poll loop, resets `perfEnabled` and `perfDetailed` flags in `QOL.state`, and invokes `QOL_PERF_OVERLAY.UpdateOverlay()` with `ENABLE_PERF_OVERLAY: 0` to destroy the overlay panel.
- **`onSettingsChanged()`**: Synchronously executes `_tick()` to adapt to changes in overlay opacity or diagnostic modes.
- **`test()`**: Verifies that the global `QOL_PERF_OVERLAY` module is loaded and provides a callable `UpdateOverlay` method.

### DOM Injection & Target Panels
- **DOM Parent**: Injected under `$.GetContextPanel()` via `QOL_PERF_OVERLAY`.
- **Target Panels**: Managed by `ql_perf_overlay.js`, which renders the container and stat table rows displaying feature IDs, execution counts, averages, and peak milliseconds.

### Engine Events & Polling Frequency
- **Polling Frequency**: 5Hz (`0.2s` interval).
- **Console Flush Frequency**: Throttled to every 5000ms (`PERF_FLUSH_INTERVAL_MS`).
- **Engine Events**: None directly hooked. Relies on internal performance accumulator tables recorded by `QOL.core.Scheduler` and feature execution wrappers.

### Performance Tier & Caveats
- **Performance Tier**: Low overhead.
- **Metric Sorting**: Sorts top 8 (`TOP_COUNT`) CPU-consuming features by average runtime before printing console messages.
- **Garbage Minimization**: Reuses internal sample dictionaries in `state.perfStats` to prevent allocation churn.
