# `panorama/scripts/manifests/ql_zipboost` (Zip Boost Cooldown Overlay)

## Description
Renders a specialized HUD overlay panel (`#QOLZipBoostOverlay`) tracking the status and cooldown of the Zipline Speed Boost ability. It transitions dynamically across three operational states:
1. **READY (`ready_flash`)**: Indicates the speed boost is available; triggers a high-visibility 2000ms pulsing animation when transitioning off cooldown.
2. **ACTIVE (`in_use`)**: Displays a real-time countdown of remaining speed boost duration while riding the zipline.
3. **COOLDOWN (`on_cooldown`)**: Displays remaining cooldown seconds until the boost is available again.

## Files
- Manifest: `panorama/scripts/manifests/ql_zipboost/manifest.js`
- Styles: `panorama/styles/features/ql_feat_zip_boost.css` (rules for `#QOLZipBoostOverlay`, `#QOLZipBoostState`, `.on_cooldown`, `.in_use`, `.ready_flash`)

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_ZIP_BOOST` | `toggle` | `false` | Master toggle to enable the Zipline Speed Boost status overlay. |
| `ZIP_BOOST_SCALE` | `slider` | `100` | UI scale percentage for the overlay panel (range: 50% to 200%). |
| `ZIP_BOOST_X_OFFSET` | `slider` | `0` | Horizontal pixel offset from anchor (range: -2000px to +2000px). |
| `ZIP_BOOST_Y_OFFSET` | `slider` | `0` | Vertical pixel offset upward from the bottom (range: 0px to 1000px). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Triggers an immediate `_tick()` and registers a 2.5Hz (`0.4s` interval) polling loop via `QOL.core.Scheduler.createPollLoop(_tick, 0.4, "ql_zipboost")`.
- **`onDisable()`**: Terminates the scheduler loop, cancels all pending tasks, and calls `_removeOverlay()` (`DeleteAsync(0)`).
- **`onSettingsChanged()`**: Synchronously runs `_tick()` to refresh layout transforms.
- **`test()`**: Verifies that the native `#gameplay_hud` anchor panel is present.

### DOM Injection & Target Panels
- **Parent Container**: Attached to `#gameplay_hud`.
- **Injected Panels**:
  - `Panel#QOLZipBoostOverlay.QOLZipBoostOverlay`: Base panel with `hittest = false` and `hittestchildren = false`.
  - `Panel#QOLZipBoostIcon`: Icon container.
  - `Panel#QOLZipBoostTextContainer`: Container for status labels.
  - `Label#QOLZipBoostLabel`: Ability title label ("Zip Boost").
  - `Label#QOLZipBoostState`: State and timer label (e.g. `"READY"`, `"ACTIVE 28s"`, `"COOLDOWN 45s"`).
- **Classes Toggled on `#QOLZipBoostOverlay`**:
  - `on_cooldown`: Applied during ability cooldown.
  - `in_use`: Applied while the zipline speed boost is active.
  - `ready_flash`: Applied for 2000ms upon cooldown completion.
  - `qol-hidden`: Applied when in hideout or suppressed contexts.
- **Monitored Native Panels & Detection**:
  - Buff indicator `#status_citadel_ability_zipline_boost` scoped strictly under cached `#StatusEffects` container (with 1500ms discovery backoff when container is absent), eliminating full-tree traversals on ticks.
  - Native hint container `.buttonContainer.citadel_ability_zipline_boost` (or `#citadel_ability_zipline_boost`) polled for `.in_use` (boost active) and `.on_cooldown` / `.cooling_down` (cooldown active).
  - Note: `.active` on `.buttonContainer` denotes prompt visibility in Deadlock's engine and is never conflated with boost activation; instead, when `.active` is present without cooldown or in-use flags, it resets any stale cooldown timestamps.
  - Extracts cooldown seconds from `#context_label` HTML (`<span class="Countdown">{s:ability_cooldown}</span>`) and numeric fallbacks with BFS queue capped to 15 nodes.
  - **Cooldown Persistence**: Tracks `_cooldownEndMs` internally (calibrated from live seconds or initialized on boost usage based on `citadel_ability_zipline_boost` 360s cooldown / 32s duration from `abilities.vdata`), preserving accurate countdowns even when the player dismounts the zipline and the native hint is collapsed.

### Engine Events & Polling Frequency
- **Polling Frequency**: 2.5Hz (`0.4s` interval).
- **Source & Status Container Lookup Throttle**: If the native zipline boost panel or `#StatusEffects` container is absent, searches are throttled to every 1500ms (`ZIP_BOOST_SOURCE_SEARCH_MS`), avoiding continuous un-scoped DOM scans.
- **Engine Events**: None hooked; monitors native panel cooldown and active classes.

### Performance Tier & Caveats
- **Performance Tier**: Low (2.5Hz tick).
- **Suppression**:
  - Automatically hidden in Hideout / Sandbox lobbies (`_isInHideout`).
  - Automatically hidden when custom HUDs are suppressed (`CustomHudDisabled`).
- **Layout & Class Diffing**: Guarded by `_lastLayoutSig` (`scale|ox|oy`) and `_lastClassSig` (`isCooldown|isInUse|readyFlashActive`) to eliminate style churn.
- **Text Diffing**: Validates `title !== _lastTitle` and `status !== _lastStatus` before updating label strings.
