# Storage bridge

`panorama/scripts/core/ql_storage_bridge.js` persists settings through a CEF `CitadelHTMLPanel` and origin-scoped `localStorage`. The panel loads `https://predi-i.github.io/qollock-updates/bridge.html`; subsequent save/load commands operate on that page's local storage.

## Dependencies and ownership

The HUD and Escape Menu load `ql_namespace.js`, `ql_utils.js`, panel helpers, and `core/ql_persistence.js` before the bridge. Shared envelope helpers and `QOL.parseStoredConfig` must be available when settings operations run. In the HUD, these parser definitions load later in the same script block, before asynchronous restore completes.

Each realm owns a direct child `CitadelHTMLPanel` named `QOLStorageBridge` and its title handler. HUD startup enables autoload; Escape Menu startup disables it. Direct-child lookup avoids adopting the other realm's nested bridge. The Escape Menu explicitly includes `core/ql_persistence.js` so both realms use the same revision and edit-generation protocol.

## Transport

Commands are serialized through a FIFO queue and sent with `SetURL("javascript:...")`. Responses arrive through `HTMLTitle` as `QOL_RES:` JSON. Keys and outbound values use UTF-8 Base64, including characters such as `#` that otherwise affect URL parsing.

Large transfers use sequential chunks and acknowledgment handshakes. Outbound chunks are at most 1500 UTF-16 code units; boundaries move back one unit when necessary to preserve a surrogate pair. Incoming load chunks enforce the expected part order. CEF-side buffers expire after 30 seconds.

Requests have a five-second timeout, reset on dispatch and chunk progress. A queued request that expires is removed and cannot execute after a later connection. Timing out a command already sent does not undo a write CEF may have performed. A 20-second startup watchdog retries navigation up to the configured five-attempt limit.

## Restore and save behavior

Startup captures the root panel and its configuration change stamp when autoload is enabled, before CEF readiness. The stamp includes published revisions and dirty-edit generations from the root and HUD. Startup restore proceeds only while that original state still matches. Its single scheduled retry retains the original baseline; a retry cannot regain permission to overwrite subsequent edits.

An explicit `loadSettings()` captures a new baseline after marking the request as user intent. It can replace edits that preceded the request, but skips application if another edit, save, clear, or explicit load occurs while waiting. A skipped restore returns `applied: false` and `skipped: "newer-edits"`; it does not claim that disk settings were applied. Missing storage preserves the current session and returns `notFound: true`.

Settings are structurally validated and normalized through the side-effect-free parser before publication. Malformed input rejects without invoking the legacy parser's reset path. Accepted settings are serialized to a canonical envelope for publication, so the later HUD parser receives the same normalized configuration. The HUD revision poll owns ConfigAdapter and feature lifecycle updates.

`saveSettings()` validates and normalizes a snapshot, publishes its canonical envelope to panel attributes, and sends it to CEF. Success requires a CEF acknowledgment; updating live attributes alone is not disk-save success. A failed disk save may leave the chosen settings active for the current session. Clearing disk settings also invalidates older pending restores, but does not itself reset live settings.

## Interface

The API is available as `QOL.core.storageBridge`, `QOL.core.storage`, and `QOLStorageBridge`.

- `init(parent, options)`, `isReady()`, `getPanel()`, `enableAutoload(flag)` manage connection and startup restore.
- `save(key, value, callback)`, `load(key, callback)`, `remove(key, callback)` are low-level key/value transport operations returning Promises.
- `saveSettings(configOrRaw, callback)` writes the validated configuration under `qollock_settings`.
- `loadSettings(callback)` restores settings subject to the captured change stamp.
- `clearSettings(callback)` removes `qollock_settings` from CEF storage.

High-level callbacks use `(error, result)`. Supplying a callback attaches a Promise rejection handler, so callback-only callers do not need to catch an otherwise unused returned Promise. Promise callers can still await the returned operation and receive its rejection. Callback exceptions are logged and do not leave the operation pending.

## Verification limits

Offline tests can verify queue ordering, parser boundaries, stale-response rejection, callback settlement, and execution of embedded bridge JavaScript against a storage model. They do not prove native CEF title delivery, the browser profile's persistence across game updates, or recovery after closing the client. Loading the bridge page may require network access. No latency, quota, or offline-availability guarantee follows from a passing simulation. A freshly repacked in-game restart/save/restore check remains necessary.
