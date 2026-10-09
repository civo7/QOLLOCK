# Panel configuration persistence

`panorama/scripts/core/ql_persistence.js` provides `QOL.core.persistence`: root/HUD discovery, revision-aware reads, panel-attribute writes, and edit tracking. It does not write to disk; the CEF storage bridge owns disk operations.

## Published configuration

`writeStorageConfigRawToUi(root, raw, options?)` publishes `Deadlock_Mod_Settings_v1`
to the root and resolved HUD. Settings supply their context in `extraPanels`
and their transient revision floor in `minimumRevision`; duplicate hosts are
written once. The new `QOL_USER_EDIT_REV` exceeds every selected host's revision
and the optional floor. The return value retains `raw`, `revision` and attempted
unique-host `count`, and adds `acceptedCount`, `complete` and per-host `failures`.
These describe native panel publication, never a durable CEF save.

Each host's payload must succeed and match native readback before its revision
is written. A rejected revision triggers best-effort restoration of the previous
pair; rejected rollback is reported. Native attributes do not provide an atomic
transaction. Successfully published hosts may coexist with rejected hosts, and
revision precedence selects accepted data. A settings save retries incomplete
publication instead of caching the attempted payload as fully saved. Storage
restore cannot replace live config/state when no pair accepts publication or
the selected native readback differs from the restored payload.

`readStorageConfigRawFromUi(root)` selects available root/HUD data by revision and
caches the result for that root and HUD identity, with a periodic full-read
backstop. Equal revisions on a new living generation do not reuse the old payload.
`getUIRoot()` and `resolveHudPanel(root)` resolve the current context/ancestry rather
than accepting an old handle merely because it remains valid. Publication
invalidates the read cache: rejected native writes must not turn an attempted
payload into apparently accepted data.

## Edits before a debounced write

`markConfigEdited(root)` increments the separate `QOL_CONFIG_EDIT_REV` generation on root and HUD. It records user intent immediately, without publishing a new configuration payload. `MarkConfigDirty()` calls it before scheduling the settings UI's debounced `SaveAndSync()`.

The settings save queue owns one pending native callback. Repeated edits cancel
the previous handle; Flush and direct `SaveAndSync()` retire it before immediate
publication. Monotonic generations guard callbacks whose native cancellation
fails, including zero-valued handles. A delayed or flushed callback may publish
only for its original living settings context/root. Retired-context edits cannot
be published onto a replacement root by an old timer. This queue coordinates
live panel publication, not durable storage acknowledgments.

`getConfigChangeStamp(root)` combines root/HUD published revisions and edit generations. It returns `null` for an invalid root. The storage bridge captures both panel identity and this stamp, then compares them before applying an asynchronous restore. This detects both already-published settings and a slider change that has not reached its debounced write yet.

Settings `SaveAndSync()` may skip an unchanged payload only when the settings
panel, root and resolved HUD already carry that payload. A preset can restore
the last saved values while a newer live configuration remains on the HUD;
the restored values still need a new bridge publication.

Explicit load and clear operations also mark user intent so an older startup restore cannot override them. Revisions are session coordination values, not a durable transaction log or a substitute for a disk acknowledgment.

Both `hud.xml` and `hud_escape_menu.xml` load this module before the storage bridge. The Escape Menu can use it through panel helpers without loading the HUD's FeatureRegistry or core HUD subsystem.
