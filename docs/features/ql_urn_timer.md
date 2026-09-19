# `panorama/scripts/manifests/ql_urn_timer` (Urn Timer)

## Description
Tracks the lifecycle, random spawn windows, and active state of the Soul Urn (King of the Hill / Unstable Rift). Renders a compact status display (`#RiftTimer` and `#RiftTimerLabel`) in the Top Bar below `TeamNetworth`. The feature monitors the minimap capture point icon (`.map_button.capture_point`) and dynamically transitions between three operational states:
1. **Idle / Range Window (`rift_idle`)**: Displays the mathematical ±60s random spawn window (e.g. `11:20 - 13:20`).
2. **Early Warning (`rift_warning`)**: Triggers when `koth_warning` appears on the minimap, counting down the final 20 seconds before the urn drops.
3. **Active (`rift_active`)**: Displays `"ACTIVE"` while the Urn is alive on the map and available for pickup or delivery.

## Files
- Manifest: `panorama/scripts/manifests/ql_urn_timer/manifest.js`
- Styles: `panorama/styles/citadel_hud_top_bar.css` (rules for `#RiftTimer`, `#RiftTimerLabel`, `.RiftTimerRiftIcon`, `.rift_warning`, `.rift_idle`, `.rift_active`)

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_URN_TIMER` | `toggle` | `false` | Master toggle to display the Soul Urn spawn countdown in the Top Bar. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Initiates a 2Hz (`0.5s` interval) polling loop via `QOL.core.Scheduler.createPollLoop(_tick, 0.5, "ql_urn_timer")`.
- **`onDisable()`**: Stops the poll loop, conceals the timer panel (`_hideRiftTimerPanel()`), purges all `State.riftTimer*` properties, and clears cached minimap button references.
- **`onSettingsChanged()`**: Clears `State.riftTimerLastText` and evaluates `_tick()` immediately.
- **`test()`**: Verifies that the native `#TopBar` panel exists.

### DOM Injection & Target Panels
- **Parent Container**: Injected under `#TopBar` -> `#TeamNetworth`.
- **Injected Panels**:
  - `Panel#RiftTimer.RiftTimer`: Main container with `hittest = false`.
  - `Panel#RiftTimerRiftIcon.RiftTimerRiftIcon`: Visual icon indicating Urn status.
  - `Label#RiftTimerLabel.RiftTimerLabel`: Countdown text label.
- **State Classes on `#RiftTimer`**:
  - `rift_idle`: Active during the indeterminate countdown range window.
  - `rift_warning`: Active during the 20-second pre-spawn warning phase.
  - `rift_active`: Active while the Urn is physically on the map.
- **Monitored Native Panels**:
  - `.map_button.capture_point` inside minimap containers (`#hud_minimap`, `#minimap_persp`, etc.) polled for classes `koth_warning` and `active`.

### Engine Events & Polling Frequency
- **Polling Frequency**: 2Hz (`0.5s` interval).
- **Minimap Panel Cache**: Caches the native minimap container (`#hud_minimap`) to prevent traversing the full HUD hierarchy on every tick.
- **Dynamic Capture Point Enumeration**: Evaluates live `.map_button` elements under `#hud_minimap` directly during the 500ms poll to ensure instant detection when neutral capture points spawn or despawn without relying on stale handles or blind backoff windows.
- **Game Version Constants (CVar-Aligned)**:
  - Initial Spawn Delay: 740s (`12m + 20s`)
  - Respawn Cycle: 420s (`7m`)
  - Spawn Jitter Window: `±60s`
  - Early Warning Duration: `20s`

### Performance Tier & Caveats
- **Performance Tier**: Low (2Hz tick, near-zero cost between spawn windows).
- **Suppression**: Fully suppressed in Hideout / Sandbox lobbies (`_isConnectedToHideout`).
- **Text Diffing**: Skips DOM updates if displayed text and active mode have not changed (`State.riftTimerLastText === displayText && State.riftTimerLastMode === mode`).
