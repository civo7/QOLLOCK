# `panorama/scripts/manifests/ql_ult_cooldowns` (Top Bar Ultimate Cooldowns)

## Description
Enables always-visible numeric ultimate cooldown timers directly on hero portraits across the Deadlock Top Bar. Deadlock tracks ultimate cooldowns in a hidden engine binding (`#UltimateCooldownTextHidden`) inside each player portrait card. This feature mirrors those values in real-time to `#UltimateCooldownTextShown` and gates visibility via the `ult_cooldowns_active` CSS class, allowing players to coordinate ultimate readiness across their team and track enemy cooldowns.

## Files
- Manifest: `panorama/scripts/manifests/ql_ult_cooldowns/manifest.js`
- Styles: `panorama/styles/citadel_hud_top_bar.css` (rules for `.ult_cooldowns_active #StatusRow`, `.UltimateCooldownTextShown`, etc.)

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_ULT_COOLDOWNS` | `toggle` | `false` | Master toggle to display persistent ultimate cooldown countdowns on Top Bar portraits. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Calls `_start()`, applying the `ult_cooldowns_active` CSS class to the HUD root, `#TopBar`, and all child player cards, and initiates a 4Hz (`0.25s` interval) polling loop via `QOL.core.Scheduler.createPollLoop(_tick, 0.25, "ql_ult_cooldowns")`.
- **`onDisable()`**: Calls `_stop()`, terminating the polling loop, removing `ult_cooldowns_active` across all panels, and clearing the cached player slot array.
- **`onSettingsChanged()`**: Synchronously activates or deactivates the subsystem based on the boolean state of `ENABLE_ULT_COOLDOWNS`.
- **`test()`**: Verifies that the native `#TopBar` (or `CitadelHudTopBar`) panel exists.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created; operates on native top bar player panels.
- **Target Containers**:
  - `#TopBar` and context root: Receive CSS class `ult_cooldowns_active`.
  - Player Card Panels (`TopBarPlayer0`..`TopBarPlayer12` or children of `PlayersContainer`).
- **Synchronized Elements**:
  - `Label#UltimateCooldownTextHidden`: Native engine data source.
  - `Label#UltimateCooldownTextShown`: Visible target label displaying the active cooldown number.

### Engine Events & Polling Frequency
- **Polling Frequency**: 4Hz (`0.25s` interval).
- **Engine Events**: None hooked; samples the engine-updated hidden label text.

### Performance Tier & Caveats
- **Performance Tier**: Low (4Hz tick with cached slot arrays and O(1) child count checks).
- **Panel Handle & Container Caching**: Caches `PlayersContainer` panel references in `_playerContainersCache` to avoid traversing the tree every tick. Retains slot references to `{ playerPanel, hidden, shown }` in `_cachedSlots`.
- **Late-Joining & Reconnect Recovery**: Monitors `GetChildCount()` on container handles and detects discrepancies against `_cachedSlots.length` or `_expectedPlayerCount`. Executes an automatic soft resync every ~2s (8 ticks) to guarantee that late-connecting players, hero changes, or delayed label initializations are promptly captured.
- **Text Diffing**: Performs `shown.text !== cdStr` comparison prior to assigning string values to prevent unnecessary C++ layout invalidation passes.
