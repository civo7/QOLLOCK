# `panorama/scripts/core/ql_app.js`

## Purpose
Top-level application boot coordinator and native engine event bridge. Orchestrates the initial discovery of the Deadlock HUD, deserializes saved configuration from panel attributes, triggers `FeatureRegistry.boot()`, synchronizes settings between the HUD and Escape Menu isolates via a 500ms polling bridge, and hooks native C++ engine events.

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
- `CitadelScoreboardToggle` → `engine:scoreboard_toggle` (reactive Tab scoreboard open/close)
- `CitadelOpenUpgradeShop` → `engine:shop_opened` (reactive shop opening)
- `CitadelExitUpgradeShop` / `CitadelUserMsg_ForceShopClosed` → `engine:shop_closed` (reactive shop closing)
- `CitadelQuickbuyItemsChanged` → `engine:quickbuy_changed` (reactive quickbuy recalculation)
- `CitadelToggleEscapeMenu` → `engine:escape_menu_toggled` (reactive escape menu state)
- `CitadelGameStateChanged` → `engine:game_state_changed` (reactive match phase transitions)

## Cross-Isolate Config Polling Bridge
Panorama executes settings UI (`EscapeMenu`) and game HUD in separate JavaScript execution contexts. `ql_app.js` maintains a 500ms heartbeat polling the serialized attribute on the HUD panel, allowing settings changed in the pause menu to propagate instantly to running game features.
