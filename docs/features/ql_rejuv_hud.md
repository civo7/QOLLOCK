# `panorama/scripts/manifests/ql_rejuv_hud` (Rejuv HUD)

## Description
Tracks Mid Boss lifecycle phases, Rejuvenator crystal drop countdowns, active team Rejuvenator buff durations, and the global Bridge Buff cycle. It renders real-time countdown labels and animated status indicators directly onto the HUD and manages the centralized `State.rejuvState` machine, which also supplies live timing data to minimap timers in `ql_minimap_timers`.

## Files
- Manifest: `panorama/scripts/manifests/ql_rejuv_hud/manifest.js`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_REJUV_HUD` | `toggle` | `false` | Display the Mid Boss Rejuvenator phase and countdown timer on the HUD. |
| `ENABLE_BUFF_HUD` | `toggle` | `false` | Display the Bridge Buff 5-minute cycle countdown on the HUD. |
| `ENABLE_MINIMAP_REJUV_TIMER` | `toggle` | `false` | Activates the underlying Rejuv phase engine so that minimap icons receive live countdown data even if HUD elements are hidden. |

*Note: The manifest utilizes multi-key activation (`enableKeys: ["ENABLE_REJUV_HUD", "ENABLE_BUFF_HUD", "ENABLE_MINIMAP_REJUV_TIMER"]`).*

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Registers a cooperative polling task running at ~3.3Hz (`0.3s` interval) via `QOL.core.Scheduler.createPollLoop(_tick, 0.3, "ql_rejuv_hud")`.
- **`onDisable()`**: Halts the poll loop, cancels scheduled timers, resets the state machine via `RejuvResetState()`, and marks `State.rejuvWasDisabled = true`.
- **`onSettingsChanged()`**: Clears cached runtime feature signatures and immediately forces a state machine evaluation tick.
- **`test()`**: Verifies that `#TopBar` (or `CitadelHudTopBar`), `#RejuvHUD`, and `#RejuvImg` are resolvable in the context tree.

### DOM Injection & Target Panels
- **DOM Creation**: Controls pre-existing and mod-declared layout panels.
- **Target Panels**:
  - `Panel#RejuvHUD`, `Label#RejuvTime`, `Label#RejuvTimeHUD`: Displays time remaining until next Rejuvenator phase.
  - `Image#RejuvImg`, `Image#RejuvImgHUD`: Phase icon receiving CSS rotation classes (`rotating`, `buff`, `reverse`, `white`).
  - `Label#RejuvNum`, `Label#RejuvNumHUD`: Displays current Rejuvenator tier index (e.g., 1, 2, 3).
  - `Panel#RejuvBuff`, `Label#RejuvTimeBuff`: 180s team buff active countdown overlay receiving `pop-in` / `pop-out` animations.
  - `Panel#BuffHUD`, `Label#BuffTime`, `Label#BuffTimeHUD`: 300s Bridge Buff cycle timer.
- **Game Object Inspection**:
  - `RejuvenatorCharges` (`RejuvenatorFriendly`, `RejuvenatorEnemy`, `RejuvenatorTimer`): Polled to detect team claim tokens and active charges.
  - `mid_boss.map_button`: Polled for the `midboss_spawned` engine class to track alive/dead state transitions.

### Engine Events & Polling Frequency
- **Polling Frequency**: ~3.3Hz (`0.3s` interval).
- **Adaptive Scanning**:
  - Baseline charge scan interval: `3000ms`.
  - Fast scan interval: `1000ms` when waiting for a spawn or when a buff is actively ticking down.
  - Midboss button lookups: Throttled to every `10000ms`.
  - Top-bar charges hierarchy lookup: Throttled to every `5000ms`.

### Performance Tier & Caveats
- **Performance Tier**: Low-to-Medium.
- **Suppression**:
  - Fully suppressed in Hideout/Sandbox lobby (`isConnectedToHideout`).
  - Fully suppressed in Street Brawl game mode (`IsStreetBrawlModeActive`).
- **Fast-Path Short-Circuiting**: Early-exits without DOM inspection if game second has not advanced, config is unchanged, and no animation timers or scans are due.
- **Flashing Alerts**: Applies alternating `red` and `yellow` classes when timers drop below 20s and 10s.
