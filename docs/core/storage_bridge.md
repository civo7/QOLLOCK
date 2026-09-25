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
1. **CEF Instance**: An offscreen `<CitadelHTMLPanel id="QOLStorageBridge" class="QOLStorageBridge" ... />` is embedded in the HUD and Escape Menu with origin `https://predi-i.github.io/qollock-updates/bridge.html`. (Note: local `file://` schemes are blocked by Steam CEF security policies, while HTTPS is permitted).
2. **Persistence**: Chromium stores `localStorage` per origin in Steam's shared LevelDB database under `%LOCALAPPDATA%\Steam\htmlcache\Default\Local Storage\leveldb\`. It persists across game sessions, reboots, and updates without consuming API quotas or cloud backends.
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
   - **Immediate Request Timeout Guard**: Every queued request immediately arms a 5-second timeout timer, preventing unbounded UI hangs (e.g. infinite "SAVING") even if the bridge is not yet connected.
   - **20-Second Navigation Watchdog**: A 20-second interval watchdog retries `SetURL(BRIDGE_LOCAL_URL)` if the page does not become ready on cold startup. Autoload errors automatically trigger scheduled retry passes.

## Interface (`QOL.core.storageBridge`)
- `init(targetParent, options)`: Initializes or binds to the `CitadelHTMLPanel` bridge and attaches the `HTMLTitle` event handler.
- `isReady()`: Returns `true` if the CEF bridge is initialized and ready for IPC.
- `save(key, val, callback)`: Saves a raw string key-value pair into CEF `localStorage`. Automatically handles Base64 encoding and chunked saving for large payloads. Returns a Promise.
- `load(key, callback)`: Loads a string value by key from CEF `localStorage`. Handles multi-frame chunked reassembly automatically. Returns a Promise resolving to string or `null`.
- `remove(key, callback)`: Removes a key from CEF `localStorage`. Returns a Promise.
- `saveSettings(configOrRaw, callback)`: Saves the current QOLLOCK config to CEF `localStorage` under `Deadlock_Mod_Settings_v1` and updates the root panel bridge attribute. Returns a Promise.
- `loadSettings(callback)`: Loads and validates the QOLLOCK config from CEF `localStorage`. Applies valid settings into active UI panel attributes. Returns a Promise.
- `clearSettings(callback)`: Clears QOLLOCK settings from CEF `localStorage`. Returns a Promise.
- `enableAutoload(enable)`: Toggles automatic loading upon bridge readiness (defaults to `true`).

## Invariants & Architectural Notes
- No network requests, Cloudflare workers, or API quotas are consumed. Internet connection is not required.
- Zero hero switching, shop opening, or favorites panel manipulation is required.
- Saving completes asynchronously within 5–15 milliseconds (down from 20–30 seconds under legacy build storage).
- Sequential chunking guarantees safe transfer of any payload size without hitting the C++ engine 4KB title buffer limitation.
- Strict FIFO queue guarantees serialized execution and prevents title race conditions.
- **Per-Realm Panel Isolation**: Panorama C++ does not dispatch native panel events across distinct layout contexts. `init()` mounts a `CitadelHTMLPanel` scoped to each context's parent (`hud.xml` and `hud_escape_menu.xml`) so each realm's `HTMLTitle` handler reliably receives events. Both panels share the identical origin local storage LevelDB database on disk.
- **Realm-Aware Autoloading**: Autoloading on startup is enabled for the primary HUD realm (`autoload: true`). The Escape Menu realm initializes its bridge with `autoload: false` to connect for user saves and loads without redundant boot loads.

