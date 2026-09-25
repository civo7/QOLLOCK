# `panorama/scripts/core/ql_storage_bridge.js`

## Purpose
Settings persistence through a Chromium Embedded Framework (CEF) `CitadelHTMLPanel` and origin-scoped `localStorage`.
The bridge page is loaded from GitHub Pages over HTTPS. Save/load commands then use the loaded page's local storage; they do not use hero switching or shop builds.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core`)
- `panorama/scripts/ql_config.js` (`QOL_STORAGE_KEY`, `QOL_DEFAULT_CONFIG`, `BuildDefaultConfig`)
- `panorama/scripts/ql_bridge.js` (`STORAGE_KEY`)
- `CitadelHTMLPanel` with ID `QOLStorageBridge` in `hud.xml` / `hud_escape_menu.xml`

## Mechanism & Architecture
1. **CEF Instance**: `init()` creates or reuses a direct child `CitadelHTMLPanel` named `QOLStorageBridge` in its HUD or Escape Menu context, then loads `https://predi-i.github.io/qollock-updates/bridge.html`.
2. **Persistence**: The page uses Chromium `localStorage`, scoped to its origin. The exact Steam profile path, persistence across client updates, and behavior without network access require client verification.
3. **IPC Bridge & Sequential Chunking**:
   - Outbound commands are dispatched using `panel.SetURL("javascript:...")`.
   - **URL Fragment & Character Safety**: All keys, values, and chunks passed via `SetURL` are UTF-8 Base64 encoded. This prevents Chromium URL parsing from treating `#` (e.g. hex colors `#00FF00`) as fragment delimiters, which would otherwise truncate scripts.
   - **FIFO Request Serialization**: Requests and multi-part chunk streams are serialized through an asynchronous FIFO queue (`_requestQueue`), preventing title event coalescing and race conditions during rapid saves or overlapping loads.
   - Inbound results are passed through `document.title = "QOL_RES:" + JSON.stringify(...)`.
   - Panorama catches changes via the native `HTMLTitle` event handler, resolving the corresponding asynchronous request.
   - **Symmetric Chunking**: To bypass the Source 2 C++ engine 4096-character `HTMLTitle` buffer limit and URL length constraints, both reading (`__qolLoad` / `__qolNextChunk`) and writing (`__qolSaveChunk`) operate in sequential 1500-character chunks with acknowledgment handshakes.
4. **Resilience & Security**:
   - Request IDs are strictly validated with `/^qol_\d+_\d+$/`.
   - 30-second TTL timers ensure orphaned save and load buffers are garbage collected.
   - Incoming stream chunks enforce strict sequence ordering (`expectedPart`), rejecting out-of-order chunks to prevent data corruption.
   - Top-level `try/catch` wrappers shield the Panorama UI event loop from unhandled exceptions.
   - **Request Timeout Guard**: Queued requests arm a 5-second timeout, reset on dispatch and chunk progress. A request that expires before dispatch is removed from the queue, so it cannot perform a delayed save or block later requests. Timing out an already-dispatched command does not undo a write CEF may have performed.
   - **20-Second Navigation Watchdog**: A 20-second interval watchdog retries `SetURL(BRIDGE_LOCAL_URL)` if the page does not become ready on cold startup. Autoload errors automatically trigger scheduled retry passes.

## Interface (`QOL.core.storageBridge`)
- `init(targetParent, options)`: Initializes or binds to the `CitadelHTMLPanel` bridge and attaches the `HTMLTitle` event handler.
- `isReady()`: Returns `true` if the CEF bridge is initialized and ready for IPC.
- `save(key, val, callback)`: Saves a raw string key-value pair into CEF `localStorage`. Automatically handles Base64 encoding and chunked saving for large payloads. Returns a Promise.
- `load(key, callback)`: Loads a string value by key from CEF `localStorage`. Handles multi-frame chunked reassembly automatically. Returns a Promise resolving to string or `null`.
- `remove(key, callback)`: Removes a key from CEF `localStorage`. Returns a Promise.
- `saveSettings(configOrRaw, callback)`: Saves the configuration under the CEF key `qollock_settings` and updates the UI attribute `Deadlock_Mod_Settings_v1`. Returns a Promise.
- `loadSettings(callback)`: Loads and validates the QOLLOCK config from CEF `localStorage`. Applies valid settings into active UI panel attributes. Returns a Promise.
- `clearSettings(callback)`: Clears QOLLOCK settings from CEF `localStorage`. Returns a Promise.
- `enableAutoload(enable)`: Controls automatic loading upon readiness. Startup enables it for HUD and disables it for EscapeMenu.

## Invariants & Architectural Notes
- Loading the bridge page can require network access. Once loaded, save/load IPC uses local storage rather than a settings-upload API.
- Zero hero switching, shop opening, or favorites panel manipulation is required.
- Save latency has not been measured here; no 5–15ms completion guarantee.
- Sequential chunking limits individual transfers; it does not remove storage quotas, timeout limits, or all encoded-size limits.
- Strict FIFO queue guarantees serialized execution and prevents title race conditions.
- **Per-Realm Panel Isolation**: Each realm must own its bridge panel and title handler. Recursive lookup from HUD could adopt the nested EscapeMenu bridge; direct-child lookup prevents this. Offline tests cover ownership and event routing, not native CEF dispatch semantics or shared disk-profile behavior.
- **Realm-Aware Autoloading**: Autoloading on startup is enabled for the primary HUD realm (`autoload: true`). The Escape Menu realm initializes its bridge with `autoload: false` to connect for user saves and loads without redundant boot loads.

