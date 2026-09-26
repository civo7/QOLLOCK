# `panorama/scripts/core/ql_app.js`

## Purpose
Top-level application boot coordinator and native engine event bridge. Orchestrates the initial discovery of the Deadlock HUD, deserializes saved configuration from panel attributes, triggers `FeatureRegistry.boot()`, synchronizes settings between the HUD and Escape Menu isolates via a 250ms polling bridge, and hooks native C++ engine events.

## Dependencies
- All core subsystems (`ql_namespace.js`, `ql_logger.js`, `ql_event_bus.js`, `ql_scheduler.js`, `ql_panel_helpers.js`, `ql_config_store.js`, `ql_config_adapter.js`, `ql_feature_registry.js`)
- Loaded last in `hud.xml` `<scripts>` block.

## Interface (`QOL.core.App` / `QOL.core.app`)
- `boot()`: Main entry point. Resolves HUD panel, restores configuration from `Deadlock_Mod_Settings_v1` attribute, boots all enabled features, starts cross-isolate config synchronization, and registers native engine event listeners.
- `shutdown()`: Stops timers, saves modified settings back to HUD attributes, and shuts down all active features.
- `isBooted()`: Returns `true` if application initialization succeeded.
- `getHud()`: Returns the cached reference to the Deadlock HUD panel.
- `syncRootClasses(hud)`: Keeps layout state classes synchronized on the HUD root (e.g. `InHideout`, `Streetbrawl`).
- `syncDiagnosticState(hud)`: Synchronizes performance and error telemetry to panel attributes for debugging.
- `writeDiagSnapshot()`: Generates and persists a structured diagnostic state object.
- `buildDiagSnapshot()`: Returns the in-memory diagnostic snapshot dictionary.

## Native Engine Event Bridging
Deadlock C++ engine events are captured using `$.RegisterForUnhandledEvent` and forwarded to `EventBus`:
- `CitadelScoreboardToggle` → `engine:scoreboard_toggle` (refresh notification; no visibility payload)
- `CitadelOpenUpgradeShop` → `engine:shop_opened` (reactive shop opening)
- `CitadelExitUpgradeShop` / `CitadelUserMsg_ForceShopClosed` → `engine:shop_closed` (reactive shop closing)
- `CitadelToggleEscapeMenu` → `engine:escape_menu_toggled` (reactive escape menu state)
- `CitadelGameStateChanged` → `engine:game_state_changed` (reactive match phase transitions)

## Cross-Isolate Config Polling Bridge & Match Lifecycle
Panorama executes settings UI (`EscapeMenu`) and game HUD in separate JavaScript execution contexts. `ql_app.js` maintains a 250ms heartbeat polling the serialized attribute on the HUD panel, allowing settings changed in the pause menu to propagate on a subsequent heartbeat.

When a player leaves a match, the HUD panel is destroyed by the engine while the V8 runtime may persist. If the HUD panel becomes invalid during polling or `CitadelGameStateChanged`, `ql_app.js` triggers `shutdown()` to halt timers, cancel scheduler loops, and release feature listeners. Furthermore, `boot()` detects stale instances with invalid HUD handles and performs a clean reboot, preventing compounding polling overhead and frame jitter across successive matches.

## In-Game Benchmark & Stress Test Harness
`ql_app.js` coordinates live in-game performance benchmarks requested via `QOL_DiagRequest` tokens (prefixed `bm_`):
- **Normal Benchmark (`bm_<dur>_normal_<token>`)**: Measures the CPU overhead and polling execution metrics of the user's active configuration over `<dur>` seconds without altering any settings.
- **Stress Benchmark (`bm_<dur>_stress_<token>`)**:
  - Automatically captures and preserves the player's active configuration (`_benchmarkSavedUserConfig`) and schema revision prior to starting.
  - Generates a maximal configuration via `_buildMaximalConfig()`, enabling all registered features, toggles, multitoggles, and root CSS transformations on screen.
  - Locks config polling (`_benchmarkStressActive = true`) to prevent periodic HUD synchronization passes from reverting root classes (e.g. Centered ESC Menu, Minimap transforms) or clobbering the stress testing state.
  - Buffers any incoming user configuration edits during the benchmark so they are cleanly applied after completion without interfering with the test.
  - Arms a safety timeout fallback timer (`durSec + 3s`) to guarantee player configuration restoration under abnormal terminations or scheduler errors.
  - Upon benchmark completion, error, timeout, or application shutdown, triggers `_restoreStressBenchmark()` to cleanly restore original user settings, reload `ConfigAdapter`, re-sync manifests, and re-apply normal HUD CSS classes.

## HUD state observation bridge

`QOL_DiagRequest` tokens beginning `state_` start the opt-in 60-second recorder
in `ManifestTests.observeHudStates`. Snapshots include `hudStateObservation`;
completion publishes the report through `QOL_Diag`. No configuration is changed.
See [HUD state recording](../ui/hud_state_recording.md). Native bridge registration
alone does not validate every event: the optional force-shop-close compatibility
listener remains subject to the API checker's known warnings.
