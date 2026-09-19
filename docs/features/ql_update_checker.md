# `panorama/scripts/ql_update_checker` (Release Update Checker)

## Description
Detects newer public QOLLOCK releases upon opening the Settings Menu. Because Panorama lacks standard browser network APIs (`fetch`, `XMLHttpRequest`), the update checker loads a tiny marker image hosted in GitHub raw content (`qollock-updates/markers/<marker>.png`) and calculates its aspect ratio. A square ratio indicates the release is current, while a wide ratio signals that a newer version is available, rendering a non-intrusive notification popup in the Settings Window.

## Files
- Implementation: `panorama/scripts/ql_update_checker.js`
- Settings UI: `panorama/scripts/ui/config_tab.js`
- Include: `panorama/layout/hud_escape_menu.xml`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_UPDATE_CHECKER` | `toggle` | `true` (1) | Check for new QOLLOCK releases when opening settings. |

*Note: Enabled by default. UI-only setting preserved across presets, build loading, and cloud synchronization.*

## Architecture & Lifecycle

### Update Marker Protocol
- **Marker Constant**: `QOL_UPDATE_MARKER = 3` (incremented for each public release independently of the settings schema semver).
- **Endpoint**: `https://raw.githubusercontent.com/Predi-i/qollock-updates/main/markers/<marker>.png`
- **Probe Panel**: A zero-hit-test, non-zero opacity Image panel (`QOLUpdateMarkerProbe`) loaded on-demand.
- **Ratio Thresholds**:
  - Current: Aspect ratio $\le 1.35$.
  - Outdated: Aspect ratio $\ge 4.0$.
  - Invalid: Non-positive or non-finite dimensions.
- **Cleanup**: Probe panels are safely deleted via `DeleteAsync(0)` immediately upon classification or after an 8.0-second timeout.

### Activation & Lifecycle Hooks
- **`onSettingsOpened()`**: Triggered by the Window Manager when the settings panel becomes visible. If `ENABLE_UPDATE_CHECKER` is enabled, it initiates the probe check once per session and displays the popup if an update was found.
- **`onSettingsChanged()`**: Synchronously updates the popup layer state when the user toggles `ENABLE_UPDATE_CHECKER` in the settings menu:
  - If disabled: Immediately removes the `.UpdateAvailable` class and hides the popup layer.
  - If re-enabled while settings are open: Displays the popup if an update was already detected, or kicks off a probe check if none has run yet.
- **`classifyMarker(width, height)`**: Pure classification function used to determine marker freshness.
- **`isEnabled()`**: Helper checking if `ENABLE_UPDATE_CHECKER` is active in `MOD_CONFIG` or `QOL.defaultConfig`.

### Performance Tier & Impact
- **Performance Tier**: None (`0ms` runtime impact).
- **Execution Profile**: Runs at most once per game session when opening the settings menu, using asynchronous image dimensions inspection with scheduled polling (100ms) capped at 8s timeout.
