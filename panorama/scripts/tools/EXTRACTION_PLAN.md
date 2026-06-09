# Plan: Extract Save/Load/Bridge to Feature Files (Steps 2-5)

## Prerequisites
- Branch: `saving-fixes` or new branch from current HEAD
- Working directory: `panorama/scripts/`
- All changes are to `ql_core.js` (extraction source) and new files in `ql_features/`
- After each step: `node --check` on all changed files, then repack and test in-game

## Architecture After Extraction

```
ql_features/
├── ql_feat_buildbridge.js   # NEW: shared hero switch + storage confirm (~200 lines)
├── ql_feat_buildsave.js     # NEW: save state machine + overlay (~1800 lines)
├── ql_feat_buildload.js     # NEW: load probe + source bootstrap (~2200 lines)
└── ql_feat_buildoverlay.js  # NEW: deduplicated loader overlay rendering (~500 lines)

ql_core.js                   # Remove extracted code, add QOL namespace exports,
                             # keep ProcessBuildRequestCommon + buildRequestLoop
ql_settings.js               # Unchanged (settings-side bridge already separate)
hud.xml                      # Add 4 <include> entries
```

## Step 2: Extract Shared Bridge (`ql_feat_buildbridge.js`)

### Functions to Extract (cut from ql_core.js, paste into new file)

| Function | Line Range | Dependencies |
|----------|-----------|--------------|
| `NormalizeHeroId(heroId)` | 2008-2020 | none |
| `GetConfiguredDefaultHeroId(cfg)` | 2022-2049 | `NormalizeHeroId` |
| `DispatchCitadelConCommand(command)` | 13838-13845 | `$.DispatchEvent` |
| `SelectHeroForBuildSave(heroId, reason)` | 13847-13878 | `DispatchCitadelConCommand`, `State.selectHeroLastTarget`, `State.selectHeroLastMs`, `_TLog` |
| `QueueDelayedHeroRestore(targetHero, contextLabel, delaySec)` | 14207-14216 | `State.buildRequestHeroRestoreTarget`, `State.buildRequestHeroRestoreAtMs` |
| `BeginHeroRestoreWithVerification(targetHero, contextLabel, nowMs)` | 14151-14205 | `SelectHeroForBuildSave`, `State.buildRequestHeroRestoreTarget`, `State.buildRequestHeroRestoreAtMs` |
| `TryAdvanceStorageSwitchStage(root, nowMs, requestToken, options)` | 14428-14455 | `SelectHeroForBuildSave`, State fields via options keys |
| `TryAdvanceStorageSwitchSettleStage(nowMs, options)` | 14457-14468 | State fields via options keys |
| `SetBuildSaveStatus(root, state, message, token)` | 12181-12188 | `BUILD_SAVE_STATE_ATTR`, `BUILD_SAVE_MSG_ATTR`, `BUILD_SAVE_TOKEN_ATTR` |
| `CanReuseLoaderConfirmedAirheartContext(root, nowMs)` | 14115-14149 | `State.buildCategoryPayloadAirheartHeaderConfirmed`, timestamp checks |

### Constants to Move
- `BUILD_SAVE_STORAGE_HERO_ID` (line 1278) = `"hero_airheart"`
- `BUILD_SAVE_RETURN_HERO_ID` (line 1279) = `"hero_werewolf"`
- `BUILD_SAVE_RETURN_DELAY_SEC` (line 1281) = `0.3`
- `BUILD_SAVE_STORAGE_SETTLE_DELAY_MS` (line 1280) = `300`

### State Fields (add to QOL.register stateKeys)
- `selectHeroLastTarget`, `selectHeroLastMs`
- `buildRequestHeroRestoreTarget`, `buildRequestHeroRestoreAtMs`

### Call Sites to Update in ql_core.js
After extracting, every call to these functions must use `QOL.X` namespace:
- `SelectHeroForBuildSave(...)` → `QOL.selectHeroForBuildSave(...)`
- `DispatchCitadelConCommand(...)` → `QOL.dispatchCitadelConCommand(...)`
- `TryAdvanceStorageSwitchStage(...)` → `QOL.tryAdvanceStorageSwitchStage(...)`
- `TryAdvanceStorageSwitchSettleStage(...)` → `QOL.tryAdvanceStorageSwitchSettleStage(...)`
- `SetBuildSaveStatus(...)` → `QOL.setBuildSaveStatus(...)`
- `QueueDelayedHeroRestore(...)` → `QOL.queueDelayedHeroRestore(...)`
- `BeginHeroRestoreWithVerification(...)` → `QOL.beginHeroRestoreWithVerification(...)`
- `CanReuseLoaderConfirmedAirheartContext(...)` → `QOL.canReuseLoaderConfirmedAirheartContext(...)`
- `NormalizeHeroId(...)` → `QOL.normalizeHeroId(...)`
- `GetConfiguredDefaultHeroId(...)` → `QOL.getConfiguredDefaultHeroId(...)`

Find all call sites with:
```
grep -n "SelectHeroForBuildSave(\|DispatchCitadelConCommand(\|TryAdvanceStorageSwitchStage(\|TryAdvanceStorageSwitchSettleStage(\|SetBuildSaveStatus(\|QueueDelayedHeroRestore(\|BeginHeroRestoreWithVerification(\|CanReuseLoaderConfirmedAirheartContext(\|NormalizeHeroId(\|GetConfiguredDefaultHeroId(" ql_core.js
```

### Add to hud.xml
```xml
<include src="file://{resources}/layout/panorama/scripts/ql_features/ql_feat_buildbridge.js" />
```

### Verification
- `node --check` passes
- Game test: load completes (uses `SelectHeroForBuildSave` for hero_airheart and return hero)
- Game test: save completes (uses `SelectHeroForBuildSave`, `TryAdvanceStorageSwitchStage`, `QueueDelayedHeroRestore`)
- Console: `bridge:SwitchHero` traces appear

---

## Step 3: Extract Save (`ql_feat_buildsave.js`)

### Functions to Extract (in order)

| Function | Line Range | Notes |
|----------|-----------|-------|
| `ResetBuildSaveRuntimeState()` | 12146-12175 | Resets 23 State.buildSave* fields |
| `SetBuildSaveStatus()` | 12181-12188 | Move to bridge instead (shared with clear) |
| `ResetBuildSaveRequestAttributes(root)` | 3167-3173 | Clears 4 bridge attrs |
| `FinishBuildSaveRequest(root, token, state, message)` | 14218-14244 | Cleanup + hero return |
| `TryFinalizeBuildSaveWhenNotPending(root, nowMs, configuredReturnHero, requestState, requestMessage)` | 15029-15069 | Shared with ProcessBuildRequestCommon |
| `TryHandleBuildSaveUnavailableRoot(root, nowMs)` | 15020-15027 | |
| `EnsureBuildSaveRequestToken(root, nowMs)` | ~15071-15075 | Token generation |
| `ResolveBuildSavePayloadText(root, requestToken)` | ~15076-15100 | Payload validation |
| `EnsureBuildSaveRequestRuntimeInitialized(root, nowMs, requestToken, configuredReturnHero, payloadText)` | ~15101-15111 | State init |
| `TickBuildSaveRequestRuntime(root, nowMs, requestToken, payloadText)` | 15113-15123 | Poll loop |
| `AdvanceBuildSaveRequestStage(root, nowMs, requestToken, payloadText)` | 14774-15018 | THE BIG ONE — all 10 stages |
| `EnsureBuildSaveTargetSelectionLocked(root, nowMs, requestToken, selectedBuild, strictLock)` | 13494-13555 | Target lock |
| `IsBuildSaveMutationStage(stage)` | 14127-14137 | |
| `IsBuildSaveEditModeActive(root)` | ~12244-12251 | |
| `TriggerBuildEditMode(selectedBuild)` | ~14316-14352 | |
| `FocusFirstBuildCategory(selectedBuild)` | ~14354-14426 | |
| `SetBuildCategoryNameText(root, payloadText)` | ~13954-14008 | |
| `CommitCategoryNameEdit(root, selectedBuild, payloadText)` | ~14010-14065 | |
| `TriggerBuildSaveCommit(selectedBuild)` | ~14067-14113 | |
| `CurrentBuildHasPayload(root, payloadText)` | ~14470-14490 | |
| `ConfirmBuildSaveStorageHero(root, nowMs)` | ~14007-14076 | |
| `EnsureBuildSaveStorageContextUi(root, nowMs)` | ~14138-14206 | |
| `GetBuildSaveCategoryNameEntry(root)` | ~13950-13953 | |
| `HasWritableBuildCategoryEntry(root)` | ~13955-13957 | |
| `HasFocusedBuildCategory(selectedBuild)` | ~13958-13961 | |
| `CountBuildCategoryHeaders(selectedBuild)` | ~13962-13966 | |
| `EnsureStorageBuildInitialized(root, nowMs)` | 11157-11311 | Shared with load — keep in bridge? |
| `DefocusBuildSaveCategoryEntry(root, selectedBuild)` | ~13968-13974 | |
| `BuildSaveSettingsLoaderStepStateSignature()` | 8977-9004 | Overlay helper |
| `UpdateSaveSettingsLoaderFromBuildSaveState(stageName, statusMessage)` | 9006-9047 | Stage→overlay mapping |
| All `_saveLoader` overlay functions | ~8937-9300 | Overlay rendering |

### Save-Specific State Fields (add to QOL.register stateKeys)
All `State.buildSave*` fields (lines 569-593):
```
buildSaveActiveToken, buildSaveStage, buildSaveStartedMs, buildSaveNextActionMs,
buildSaveRetries, buildSaveDidSwitchToStorageHero, buildSaveCaptureStartedMs,
buildSaveReturnHero, buildSaveStorageHeroConfirmed, buildSaveStorageHeroConfirmedSource,
buildSaveStorageConfirmRetries, buildSaveStorageSwitchRetries,
buildSaveStorageConfirmStartedMs, buildSaveStorageLastSwitchMs,
buildSaveStorageShopReopenNextMs, buildSaveStorageShopReopenAttempts,
buildSaveFavoritesActionNextMs, buildSaveStorageProvisionalHits,
buildSaveMutationClosed, buildSaveTargetBuildPanel, buildSaveTargetBuildSig,
buildSaveTargetBuildTitle, buildSaveTargetStableHits, buildSaveTargetDriftRetries,
buildSaveTargetQuietUntilMs
```

### Constants to Move
All `BUILD_SAVE_*` constants from ql_core.js lines 1262-1310:
- `BUILD_SAVE_REQUEST_ATTR`, `BUILD_SAVE_STATE_ATTR`, `BUILD_SAVE_MSG_ATTR`, `BUILD_SAVE_TOKEN_ATTR`
- `BUILD_SAVE_ACTION_DELAY_MS`, `BUILD_SAVE_AFTER_WRITE_DELAY_MS`, `BUILD_SAVE_VERIFY_DELAY_MS`
- `BUILD_SAVE_TIMEOUT_MS`, `BUILD_SAVE_MAX_RETRIES`
- `BUILD_SAVE_STORAGE_CONFIRM_POLL_MS`, `BUILD_SAVE_STORAGE_CONFIRM_TIMEOUT_MS`
- `BUILD_SAVE_STORAGE_CONFIRM_PROVISIONAL_*` (6 constants)
- `BUILD_SAVE_STORAGE_CONFIRM_REOPEN_*` (3 constants)
- `BUILD_SAVE_TARGET_LOCK_*` (4 constants)
- `BUILD_SAVE_STORAGE_SIGNATURE_*` (arrays at 1297-1310)
- `BUILD_SAVE_CLEAR_REUSE_AIRHEART_MAX_AGE_MS`
- `BUILD_SAVE_PRE_RESTORE_DELAY_SEC`

### Call Sites to Update in ql_core.js
- `ProcessBuildSaveRequest(root, nowMs, cfg)` at line 15125 → keep in ql_core.js as thin wrapper that calls into feature file
- `FinishBuildSaveRequest(...)` → `QOL.finishBuildSaveRequest(...)`
- All other internal save functions become file-private in the feature file

### Add to hud.xml
```xml
<include src="file://{resources}/layout/panorama/scripts/ql_features/ql_feat_buildsave.js" />
```

### Verification
- `node --check` passes
- Game test: save completes, all `save:*` traces appear
- Preset cycle: 79 presets, 0 disabled

---

## Step 4: Extract Load (`ql_feat_buildload.js`)

### Functions to Extract

| Function | Line Range | Notes |
|----------|-----------|-------|
| `ShouldRunBuildCategoryPayloadOverride(root, nowMs)` | 11595-11632 | Gate function |
| `ApplyBuildCategoryPayloadOverride(root, cfg, nowMs, rawCfg)` | 11675-12143 | Main entry (~470 lines) |
| `PrepareBuildCategoryPayloadHeroProbe(root, accountId, nowMs, cfg)` | 10619-11132 | Hero probe (~510 lines) |
| `EnsureStoragePayloadSourceVisibleReadOnly(root, nowMs)` | 9855-9976 | Source bootstrap (~120 lines) |
| `EnsureStorageBuildInitialized(root, nowMs)` | 11157-11311 | Probe init (~150 lines) — also used by save, consider moving to bridge |
| `IsBuildCategoryPayloadSourceReady(root)` | 11136-11155 | |
| `TryFindBuildCategoryPayloadText(root)` | 11449-11516 | |
| `ExtractBuildCategoryPayloadToken(rawText)` | 11440-11447 | |
| `TryParseBuildCategoryPayloadConfig(rawText)` | 11519-11574 | |
| `GetAccountIdForBuildCategoryPayload(root)` | 7974-8005 | |
| `CompleteBuildCategoryPayloadHeroProbe(accountId, markDone, resultCode, resultDetail, options)` | 10494-10567 | |
| `DeferBuildCategoryPayloadHeroProbe(accountId, nowMs)` | 10569-10579 | |
| `TryRearmBuildCategoryPayloadProbeIfDoneLocked(root, accountId, nowMs, cfg)` | 10582-10617 | |
| `ResetBuildCategoryPayloadHeroProbeState()` | 9561-9599 | |
| `ResetBuildCategoryPayloadReadOnlySourceBootstrapState()` | 9601-9605 | |
| `ResetBuildCategoryPayloadProbeInitState()` | 9607-9708 | |
| `ConfirmBuildCategoryPayloadStorageHero(root, nowMs, allowUiFallback)` | 10336-10492 | |
| `TryReadBuildCategoryPayloadStorageHeroFromFavoritesHeader(root)` | 10283-10334 | |
| `ConfirmStorageHeroSignatureAbilities(root, nowMs, requiredHits)` | 10241-10281 | |
| `IsBuildCategoryPayloadStorageConflictStrong(signal)` | 10021-10025 | |
| `ShouldRunBuildCategoryPayloadUiAction(nowMs, stateField, cooldownMs)` | 9844-9853 | |
| `MaybeSuppressBuildCategoryPayloadForActiveMatch(root, nowMs)` | 11576-11585 | |
| `ShouldCheckDormantBuildCategoryPayloadWake(nowMs)` | 11587-11593 | |
| `SetBuildCategoryPayloadProbeReturnHeroFromConfig(configObj, sourceLabel)` | 2051-2065 | |
| `EnsureBuildCategoryPayloadProbeReturnHeroFallback()` | 2067-2077 | |
| `SetBuildCategoryPayloadProbeReturnHeroFromPayloadToken(payloadToken)` | 2079-2096 | |
| All `_loadLoader` overlay functions | ~8300-8935 | Settings loader overlay |
| `BeginSettingsLoaderSession`, `FinalizeSettingsLoaderSession`, etc. | ~8200-8500 | |

### Load-Specific State Fields (add to QOL.register stateKeys)
All `State.buildCategoryPayload*` fields (lines 461-534) — approximately 60 fields:
```
buildCategoryPayloadNextScanMs, buildCategoryPayloadLastAppliedAccountId,
buildCategoryPayloadLastAppliedText, buildCategoryPayloadLastParseErrorKey,
buildCategoryPayloadHeroProbeStage, buildCategoryPayloadHeroProbeNextMs,
buildCategoryPayloadHeroProbeDidSwitch, buildCategoryPayloadHeroProbeReturnHero,
buildCategoryPayloadHeroProbeReturnHeroSource, buildCategoryPayloadHeroProbeAccountId,
buildCategoryPayloadHeroProbeDoneAccountId, buildCategoryPayloadHeroProbeStartedMs,
buildCategoryPayloadHeroProbeBootstrapStartedMs, buildCategoryPayloadHeroProbeSwitchStartMs,
buildCategoryPayloadHeroProbeSwitchRetries, buildCategoryPayloadHeroProbeScanStartedMs,
buildCategoryPayloadHeroProbeShopProbeTried, buildCategoryPayloadHeroProbeRetryAfterMs,
buildCategoryPayloadHeroProbeMisses, buildCategoryPayloadMissingScanAdvances,
buildCategoryPayloadStorageConfirmSig, buildCategoryPayloadStorageConfirmHits,
buildCategoryPayloadCorruptRepairActive, buildCategoryPayloadCorruptRepairStartedMs,
buildCategoryPayloadCorruptRepairCleared, buildCategoryPayloadCorruptRepairClearRetries,
buildCategoryPayloadCorruptRepairClearNextMs, buildCategoryPayloadCorruptRepairClearEmptyHits,
buildCategoryPayloadCorruptRepairBrowseReady, buildCategoryPayloadCorruptRepairLastDeleteTitle,
buildCategoryPayloadCorruptRepairSameTitleDeleteHits, buildCategoryPayloadCorruptRepairPostClearUntilMs,
buildCategoryPayloadShopOpenActionNextMs, buildCategoryPayloadFavoritesActionNextMs,
buildCategoryPayloadBrowseActionNextMs, buildCategoryPayloadDoneRearmNextMs,
buildCategoryPayloadDoneRearmAttempts, buildCategoryPayloadStartupConsumedAccountId,
buildCategoryPayloadStartupConsumedResult, buildCategoryPayloadStartupSuppressedForSession,
buildCategoryPayloadStartupSuppressedReason, buildCategoryPayloadStartupSuppressedAccountId,
buildCategoryPayloadDormant, buildCategoryPayloadDormantReason,
buildCategoryPayloadDormantWakeCheckNextMs, buildCategoryPayloadLoaderSessionCreateAttempts,
buildCategoryPayloadSourceBootstrapStage, buildCategoryPayloadSourceBootstrapNextMs,
buildCategoryPayloadSourceBootstrapRetries, buildCategoryPayloadSessionSwitchConsumed,
buildCategoryPayloadHeroProbeInitAttempted, buildCategoryPayloadHeroProbeInitStage,
buildCategoryPayloadHeroProbeInitNextMs, buildCategoryPayloadHeroProbeInitRetries,
buildCategoryPayloadHeroProbeInitCreateAttempts, buildCategoryPayloadHeroProbeInitCreateVerifyUntilMs,
buildCategoryPayloadPostSwitchShopPulseDone, buildCategoryPayloadPromptEscClosed,
buildCategoryPayloadDefaultBootstrapPayloadText, buildCategoryPayloadDefaultBootstrapRetries,
buildCategoryPayloadDefaultBootstrapSaveToken, buildCategoryPayloadDefaultBootstrapSaveVerifyHits,
buildCategoryPayloadDefaultBootstrapPostSavePrompt, buildCategoryPayloadPostSavePromptFallbackUsed,
buildCategoryPayloadAirheartHeaderConfirmed, buildCategoryPayloadAirheartHeaderConfirmedMs
```

### Constants to Move
All `BUILD_CATEGORY_PAYLOAD_*` constants (lines 1128-1172) and `SETTINGS_LOADER_*` constants (lines 1173-1227).

### Add to hud.xml
```xml
<include src="file://{resources}/layout/panorama/scripts/ql_features/ql_feat_buildload.js" />
```

---

## Step 5: Deduplicate Overlay Rendering (`ql_feat_buildoverlay.js`)

The three overlay systems (load ~780 lines, save ~489 lines, clear ~461 lines) are near-identical triplicates. Each has:

| Overlay | Functions | Lines |
|---------|-----------|-------|
| Load (settings loader) | `Begin/Finalize/ResetSettingsLoaderSession`, `Ensure/RenderSettingsLoader*`, step defs | ~780 |
| Save | `Begin/Finalize/ResetSaveSettingsLoader*`, `Ensure/RenderSaveSettingsLoader*`, step defs | ~489 |
| Clear | `Begin/Finalize/ResetClearSettingsLoader*`, `Ensure/RenderClearSettingsLoader*`, step defs | ~461 |

### Approach: Factory Pattern

Create a single `CreateLoaderOverlay(config)` that takes:
```js
{
    steps: [...],           // {key, label} step definitions
    idPrefix: "QOLSave",    // panel ID prefix
    cachedPanelKey: "saveSettingsLoader", // State field key prefix
    optionalExtras: {       // per-overlay optional UI
        stallHint: true,    // save has stall hint
        skipButton: true    // load has skip button
    }
}
```

Returns an object with: `ensureOverlay`, `updateFromState`, `beginSession`, `finalizeSession`, `resetSession`.

Each existing overlay becomes a thin config wrapper:
```js
var saveOverlay = QOL.createLoaderOverlay({ steps: SAVE_STEPS, idPrefix: "QOLSaveSettingsLoader", ... });
```

### Estimated Savings
- ~1,730 lines → ~640 lines = **~1,090 lines removed**

---

## Verification (All Steps)

After each step:
1. `node --check ql_core.js ql_features/ql_feat_*.js` — all syntax clean
2. Game launch: load completes with `load:*` traces
3. Settings → save: save completes with `save:*` traces
4. Settings → preset cycle: 79 presets, 0 disabled
5. Console: `QOL_DumpDiagnostics()` shows 35+ features loaded, zero auto-disabled
6. Console: no new `[QOLLock][ERROR]` or `[QOLLock][WARN]` messages

## Files Modified

| File | Change |
|------|--------|
| `ql_core.js` | Remove ~6,000 lines, add QOL namespace exports for extracted functions, keep ProcessBuildRequestCommon + buildRequestLoop + corrupt repair |
| `ql_features/ql_feat_buildbridge.js` | NEW (~200 lines) |
| `ql_features/ql_feat_buildsave.js` | NEW (~1,800 lines) |
| `ql_features/ql_feat_buildload.js` | NEW (~2,200 lines) |
| `ql_features/ql_feat_buildoverlay.js` | NEW (~640 lines) |
| `layout/hud.xml` | Add 4 `<include>` entries |
