# `panorama/scripts/core/ql_storage_bridge.js`

## Purpose
High-speed, 100% local persistence bridge for QOLLOCK mod settings using Chromium Embedded Framework (CEF) `CitadelHTMLPanel` and local `localStorage`.
Replaces legacy hero build hijacking with instant, robust LevelDB storage that requires zero network requests, zero macros, and zero hero/shop switching.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core`)
- `panorama/scripts/ql_config.js` (`QOL_STORAGE_KEY`, `QOL_DEFAULT_CONFIG`, `BuildDefaultConfig`)
- `panorama/scripts/ql_bridge.js` (`STORAGE_KEY`)
- `CitadelHTMLPanel` with ID `QOLStorageBridge` in `hud.xml` / `hud_escape_menu.xml`

## Mechanism & Architecture
1. **CEF Instance**: An offscreen `<CitadelHTMLPanel id="QOLStorageBridge" class="QOLStorageBridge" ... />` is embedded in the HUD and Escape Menu with origin `file:///C:/`.
2. **Persistence**: Chrome stores `file:///` local storage in Steam's shared LevelDB database under `%LOCALAPPDATA%\Steam\htmlcache\Default\Local Storage\leveldb\`. It persists across game sessions, reboots, and updates.
3. **IPC Bridge**:
   - Outbound commands are dispatched using `panel.SetURL("javascript:...")`.
   - Inbound results are passed through `document.title = "QOL_RES:" + JSON.stringify(...)`.
   - Panorama catches changes via the native `HTMLTitle` event handler, resolving the corresponding asynchronous request.
4. **Resilience**: Features automatic panel discovery, dynamic panel creation fallback, periodic watchdog script injection, request timeouts (5000ms), and queued request dispatching when initializing.

## Interface (`QOL.core.storageBridge`)
- `init(targetParent, options)`: Initializes or binds to the `CitadelHTMLPanel` bridge and attaches the `HTMLTitle` event handler.
- `isReady()`: Returns `true` if the CEF bridge is initialized and ready for IPC.
- `save(key, val, callback)`: Saves a raw string key-value pair into CEF `localStorage`. Returns a Promise.
- `load(key, callback)`: Loads a string value by key from CEF `localStorage`. Returns a Promise resolving to string or `null`.
- `remove(key, callback)`: Removes a key from CEF `localStorage`. Returns a Promise.
- `saveSettings(configOrRaw, callback)`: Saves the current QOLLOCK config to CEF `localStorage` under `Deadlock_Mod_Settings_v1` and updates the root panel bridge attribute. Returns a Promise.
- `loadSettings(callback)`: Loads and validates the QOLLOCK config from CEF `localStorage`. Applies valid settings into active UI panel attributes. Returns a Promise.
- `clearSettings(callback)`: Clears QOLLOCK settings from CEF `localStorage`. Returns a Promise.
- `enableAutoload(enable)`: Toggles automatic loading upon bridge readiness (defaults to `true`).

## Invariants & Architectural Notes
- No network requests, Cloudflare workers, or API quotas are consumed.
- Zero hero switching, shop opening, or favorites panel manipulation is required.
- Saving completes asynchronously within 5–15 milliseconds (down from 20–30 seconds under legacy build storage).
