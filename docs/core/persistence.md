# Panel configuration persistence

`panorama/scripts/core/ql_persistence.js` provides `QOL.core.persistence`: root/HUD discovery, revision-aware reads, panel-attribute writes, and edit tracking. It does not write to disk; the CEF storage bridge owns disk operations.

## Published configuration

`writeStorageConfigRawToUi(root, raw)` publishes `Deadlock_Mod_Settings_v1` to the root and resolved HUD, with a `QOL_USER_EDIT_REV` one greater than their current maximum. The return value describes the attempted publication; native attribute errors are logged. It is not confirmation of a CEF save.

`readStorageConfigRawFromUi(root)` selects available root/HUD data by revision and caches the result, with a periodic full-read backstop. `getUIRoot()` and `resolveHudPanel(root)` reuse live cached panels and resolve replacements when cached panels are no longer valid.

## Edits before a debounced write

`markConfigEdited(root)` increments the separate `QOL_CONFIG_EDIT_REV` generation on root and HUD. It records user intent immediately, without publishing a new configuration payload. `MarkConfigDirty()` calls it before scheduling the settings UI's debounced `SaveAndSync()`.

`getConfigChangeStamp(root)` combines root/HUD published revisions and edit generations. It returns `null` for an invalid root. The storage bridge captures both panel identity and this stamp, then compares them before applying an asynchronous restore. This detects both already-published settings and a slider change that has not reached its debounced write yet.

Explicit load and clear operations also mark user intent so an older startup restore cannot override them. Revisions are session coordination values, not a durable transaction log or a substitute for a disk acknowledgment.

Both `hud.xml` and `hud_escape_menu.xml` load this module before the storage bridge. The Escape Menu can use it through panel helpers without loading the HUD's FeatureRegistry or core HUD subsystem.
