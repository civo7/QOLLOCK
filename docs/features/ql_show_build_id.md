# `panorama/scripts/manifests/ql_show_build_id` (Show Build ID)

## Description
Renders an on-screen HUD label displaying the currently equipped hero build ID and optional build title in the lower-left area of the screen. Designed primarily for streamers, content creators, and competitive players, it automatically parses build metadata from the hero shop (`SelectedBuildInfoTitle` and `SelectedBuildName`) and displays a persistent badge (e.g., `Public Build: 458921 - Hyper Carry`), allowing viewers to identify the active build without requiring the player to open the shop menu.

## Files
- Manifest: `panorama/scripts/manifests/ql_show_build_id/manifest.js`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_SHOW_BUILD_ID` | `toggle` | `false` | Master toggle to display the current build ID on the HUD. |
| `ENABLE_SHOW_BUILD_ID_TITLE` | `toggle` | `false` | Append the build's custom name/title to the displayed ID. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Initiates a 1Hz (`1.0s` interval) polling loop via `QOL.core.Scheduler.createPollLoop(_tick, 1.0, "ql_show_build_id")` and triggers an initial evaluation.
- **`onDisable()`**: Terminates the poll loop and collapses the HUD panel via `_collapse()`.
- **`onSettingsChanged()`**: Synchronously evaluates `_tick()` to refresh layout and title formatting.
- **`test()`**: Verifies the presence of the native `#LowerLeft` HUD container.

### DOM Injection & Target Panels
- **Parent Container**: `#LowerLeft` on HUD root.
- **Injected Panels**:
  - `Panel#selected_build_info`: Fixed height (`24px`), horizontal flow (`flowChildren: right`), styled at `marginLeft: 26px`, `verticalAlign: bottom`, `zIndex: 5`.
  - `Label#build_info`: Displays formatted text (font: `oracle, blocky, sans-serif`, color: `#FFEFD7`, with text drop shadow).
- **Data Source Panels**:
  - `SelectedBuildInfoTitle`: Polled and parsed using regex for build ID, name, and version.
  - `SelectedBuildOuter` / `SelectedBuildName`: Secondary source for build title if absent from title panel.

### Engine Events & Polling Frequency
- **Polling Frequency**: 1Hz (`1.0s` interval).
- **Source Search Throttle**: If `SelectedBuildInfoTitle` cannot be located, subsequent searches are throttled to a 3-second retry interval (`_nextSourceSearchMs`).
- **Engine Events**: None hooked; relies on polling the parsed shop build labels.

### Performance Tier & Caveats
- **Performance Tier**: Low (1Hz tick).
- **Signature Optimization**: The formatted display string and configuration state are hashed into `_lastSig` (`displayText|showTitle`). Style and text writes are bypassed when signature matches.
- **Auto-Collapse**: Automatically hides the panel (`visibility = "collapse"`) and clears the signature if no valid build is equipped or if build ID resolves to `"0"`.
