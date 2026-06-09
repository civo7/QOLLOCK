Extract the save/load/bridge systems from ql_core.js into separate feature files following the plan at `panorama/scripts/tools/EXTRACTION_PLAN.md`. Work one step at a time, committing after each step.

## Project Context

You're working on QOLLOCK, a Deadlock (Source 2 Panorama engine) HUD mod. The repo is at `/home/bytenode/Documents/DeadlockModMaking/Reduced_CSDK_12/content/citadel_addons/qollock`. The current branch is `saving-fixes`.

Key files:
- `panorama/scripts/ql_core.js` — main runtime (~21K lines), contains save/load/clear state machines
- `panorama/scripts/ql_shared_presets.js` — `QOL` namespace, `QOL.import()`, `QOL.register()`
- `panorama/scripts/ql_utils.js` — utilities (`_TLog`, `IsPanelValid`, etc.)
- `panorama/layout/hud.xml` — `<include>` entries for all scripts
- `panorama/scripts/ql_features/ql_feat_*.js` — 30 extracted feature files (existing pattern)

## Existing Feature File Pattern

Every feature file follows this exact template:
```js
// ql_feat_X.js — Description
(function() {
    'use strict';
    var _dk = "ql_feat_X";
    var _deps = QOL.import(["state", "utils", ...]);
    var S = _deps.state;
    var U = _deps.utils;
    // ... destructure other deps ...

    // ── Constants ──
    var MY_CONSTANT = ...;

    // ── Private helpers ──
    function myHelper() { ... }

    // ── Registration ──
    QOL.register("featureName", {
        configKeys: [...],
        bucket: N, phase: N,
        gate: function(cfg) { return U.IsCfgEnabled(cfg, "KEY"); },
        update: function(root, cfg, nowMs) {
            try { UpdateX(root, cfg, nowMs); }
            catch(e) { $.Msg("[QOLLock][ERROR][" + _dk + "] " + e.message + "\n" + e.stack); throw e; }
        },
        stateKeys: [...]
    });

    // ── Self-test ──
    try { if (typeof UpdateX !== "function") throw ...; }
    catch(e) { $.Msg("[QOLLock][ERROR][" + _dk + "] self-test: " + e.message); }
})();
```

## QOL Namespace Pattern

Functions exported to other files go on the `QOL` namespace at the bottom of the feature file:
```js
QOL.myFunction = myFunction;
```

Functions imported from other files use `QOL.import()`:
```js
var _deps = QOL.import(["state", "utils", "myFunction"]);
var myFunction = _deps.myFunction;
```

State fields are accessed via `S.` (aliased from `_deps.state`).

## Trace Logging

Use `_TLog(tag, message)` from ql_utils.js. Format: `tag:event key=value ...`
Tags in use: `bridge:`, `save:`, `load:`, `overlay:`

## Commit Author

All commits must use:
```
git -c user.name="bzihnali" commit -am "message"
```

## Verification After Each Step

1. `node --check` on all changed files
2. Game test expectations:
   - Load completes with `load:ProbeState`, `load:PayloadFound`, `load:ParseResult`, `load:ProbeComplete` traces
   - Save completes with `save:AdvanceStage` (×10 stages), `save:ConfirmDone`, `save:TargetLocked`, `save:WriteDone`, `save:VerifyOk`, `save:Finish` traces
   - `bridge:SwitchHero` traces appear for both load and save hero switches
   - Preset cycle: 79 presets, 0 disabled features
   - `QOL_DumpDiagnostics()`: 35+ features loaded, zero auto-disabled
3. Console: no new `[QOLLock][ERROR]` or `[QOLLock][WARN]` messages

## Implementation Order

### Step 2: Shared Bridge (`ql_feat_buildbridge.js`)

Extract these functions from ql_core.js into the new file. Cut them from ql_core.js and paste into the feature file template. Then update all call sites in ql_core.js to use `QOL.functionName`.

**Functions to extract:**
1. `NormalizeHeroId(heroId)` — line ~2008
2. `GetConfiguredDefaultHeroId(cfg)` — line ~2022
3. `DispatchCitadelConCommand(command)` — line ~13838
4. `SelectHeroForBuildSave(heroId, reason)` — line ~13847
   - Add trace: `_TLog("bridge:SwitchHero", "hero=" + target + " reason=" + (reason||"-") + " ok=" + (ok?"1":"0"))`
5. `QueueDelayedHeroRestore(targetHero, contextLabel, delaySec)` — line ~14207
   - Add trace: `_TLog("bridge:QueueRestore", "hero=" + targetHero + " delayMs=" + delayMs)`
6. `BeginHeroRestoreWithVerification(targetHero, contextLabel, nowMs)` — line ~14151
7. `TryAdvanceStorageSwitchStage(root, nowMs, requestToken, options)` — line ~14428
   - Add trace: `_TLog("bridge:SwitchStage", "switch_to_storage → wait_storage_switch")`
8. `TryAdvanceStorageSwitchSettleStage(nowMs, options)` — line ~14457
   - Add trace: `_TLog("bridge:SwitchSettle", "wait_storage_switch → " + nextStage)`
9. `SetBuildSaveStatus(root, state, message, token)` — line ~12181
10. `CanReuseLoaderConfirmedAirheartContext(root, nowMs)` — line ~14115

**State fields to register:** `selectHeroLastTarget`, `selectHeroLastMs`, `buildRequestHeroRestoreTarget`, `buildRequestHeroRestoreAtMs`

**QOL exports to add:**
```js
QOL.normalizeHeroId = NormalizeHeroId;
QOL.getConfiguredDefaultHeroId = GetConfiguredDefaultHeroId;
QOL.dispatchCitadelConCommand = DispatchCitadelConCommand;
QOL.selectHeroForBuildSave = SelectHeroForBuildSave;
QOL.queueDelayedHeroRestore = QueueDelayedHeroRestore;
QOL.beginHeroRestoreWithVerification = BeginHeroRestoreWithVerification;
QOL.tryAdvanceStorageSwitchStage = TryAdvanceStorageSwitchStage;
QOL.tryAdvanceStorageSwitchSettleStage = TryAdvanceStorageSwitchSettleStage;
QOL.setBuildSaveStatus = SetBuildSaveStatus;
QOL.canReuseLoaderConfirmedAirheartContext = CanReuseLoaderConfirmedAirheartContext;
```

**Call sites to update — run this grep and fix every match:**
```
grep -n "SelectHeroForBuildSave(\|DispatchCitadelConCommand(\|TryAdvanceStorageSwitchStage(\|TryAdvanceStorageSwitchSettleStage(\|SetBuildSaveStatus(\|QueueDelayedHeroRestore(\|BeginHeroRestoreWithVerification(\|CanReuseLoaderConfirmedAirheartContext(\|NormalizeHeroId(\|GetConfiguredDefaultHeroId(" ql_core.js
```
Replace each `FunctionName(...)` with `QOL.functionName(...)`.

**Add to hud.xml** before the `<include>` for ql_core.js.

### Step 3: Save State Machine (`ql_feat_buildsave.js`)

Extract the entire save state machine. The main function is `AdvanceBuildSaveRequestStage` (~250 lines at line ~14774). Also extract all supporting functions.

**Core state machine:**
- `AdvanceBuildSaveRequestStage(root, nowMs, requestToken, payloadText)` — ALL 10 stages
- `TickBuildSaveRequestRuntime(root, nowMs, requestToken, payloadText)` — poll loop wrapper
- `FinishBuildSaveRequest(root, token, state, message)` — cleanup
- `ResetBuildSaveRuntimeState()` — state reset
- `ResetBuildSaveRequestAttributes(root)` — bridge attr clear
- `EnsureBuildSaveRequestToken(root, nowMs)` — token gen
- `ResolveBuildSavePayloadText(root, requestToken)` — payload validation
- `EnsureBuildSaveRequestRuntimeInitialized(root, nowMs, requestToken, ...)` — state init
- `TryFinalizeBuildSaveWhenNotPending(root, nowMs, ...)` — cleanup gate
- `TryHandleBuildSaveUnavailableRoot(root, nowMs)` — root check

**Save helper functions:**
- `EnsureBuildSaveTargetSelectionLocked(root, nowMs, requestToken, selectedBuild, strictLock)`
- `IsBuildSaveMutationStage(stage)`
- `IsBuildSaveEditModeActive(root)`
- `TriggerBuildEditMode(selectedBuild)`
- `FocusFirstBuildCategory(selectedBuild)`
- `SetBuildCategoryNameText(root, payloadText)`
- `CommitCategoryNameEdit(root, selectedBuild, payloadText)`
- `TriggerBuildSaveCommit(selectedBuild)`
- `CurrentBuildHasPayload(root, payloadText)`
- `ConfirmBuildSaveStorageHero(root, nowMs)`
- `EnsureBuildSaveStorageContextUi(root, nowMs)`
- `GetBuildSaveCategoryNameEntry(root)`
- `HasWritableBuildCategoryEntry(root)`
- `HasFocusedBuildCategory(selectedBuild)`
- `CountBuildCategoryHeaders(selectedBuild)`
- `DefocusBuildSaveCategoryEntry(root, selectedBuild)`
- `EnsureStorageBuildInitialized(root, nowMs)` — NOTE: also used by load, keep in bridge

**Save overlay functions:**
- `BuildSaveSettingsLoaderStepStateSignature()`
- `UpdateSaveSettingsLoaderFromBuildSaveState(stageName, statusMessage)`
- All `_saveLoader` overlay functions (search for `_saveLoader` in ql_core.js)

**State fields** (add to stateKeys in QOL.register):
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
buildSaveTargetQuietUntilMs, buildSaveLastTraceStage
```

**Constants** (move from ql_core.js lines 1262-1310 to feature file):
All `BUILD_SAVE_*` and `SAVE_SETTINGS_LOADER_*` constants.

**QOL exports:**
```js
QOL.tickBuildSaveRequestRuntime = TickBuildSaveRequestRuntime;
QOL.finishBuildSaveRequest = FinishBuildSaveRequest;
QOL.ensureBuildSaveRequestRuntimeInitialized = EnsureBuildSaveRequestRuntimeInitialized;
// ... etc for all public save functions
```

**What stays in ql_core.js:**
- `ProcessBuildRequestCommon(root, nowMs, cfg, ...)` — the shared dispatch function
- `ProcessBuildSaveRequest(root, nowMs, cfg)` — thin wrapper calling ProcessBuildRequestCommon with save-specific args
- `buildRequestLoop` — the main polling loop

### Step 4: Load Probe (`ql_feat_buildload.js`)

Extract the entire load/startup config probe. The main entry is `ApplyBuildCategoryPayloadOverride` (~470 lines at line ~11675).

**Core load functions:**
- `ShouldRunBuildCategoryPayloadOverride(root, nowMs)` — gate
- `ApplyBuildCategoryPayloadOverride(root, cfg, nowMs, rawCfg)` — main entry
- `PrepareBuildCategoryPayloadHeroProbe(root, accountId, nowMs, cfg)` — hero probe (~510 lines)
- `EnsureStoragePayloadSourceVisibleReadOnly(root, nowMs)` — source bootstrap
- `EnsureStorageBuildInitialized(root, nowMs)` — probe init (shared with save)
- `IsBuildCategoryPayloadSourceReady(root)`
- `TryFindBuildCategoryPayloadText(root)` — payload scan
- `ExtractBuildCategoryPayloadToken(rawText)` — token extraction
- `TryParseBuildCategoryPayloadConfig(rawText)` — parsing
- `GetAccountIdForBuildCategoryPayload(root)` — account resolution
- `CompleteBuildCategoryPayloadHeroProbe(...)` — completion + hero return
- `DeferBuildCategoryPayloadHeroProbe(accountId, nowMs)`
- `TryRearmBuildCategoryPayloadProbeIfDoneLocked(root, accountId, nowMs, cfg)`

**State reset functions:**
- `ResetBuildCategoryPayloadHeroProbeState()`
- `ResetBuildCategoryPayloadReadOnlySourceBootstrapState()`
- `ResetBuildCategoryPayloadProbeInitState()`

**Storage confirmation:**
- `ConfirmBuildCategoryPayloadStorageHero(root, nowMs, allowUiFallback)`
- `TryReadBuildCategoryPayloadStorageHeroFromFavoritesHeader(root)`
- `ConfirmStorageHeroSignatureAbilities(root, nowMs, requiredHits)`

**Utility:**
- `IsBuildCategoryPayloadStorageConflictStrong(signal)`
- `ShouldRunBuildCategoryPayloadUiAction(nowMs, stateField, cooldownMs)`
- `MaybeSuppressBuildCategoryPayloadForActiveMatch(root, nowMs)`
- `ShouldCheckDormantBuildCategoryPayloadWake(nowMs)`
- `SetBuildCategoryPayloadProbeReturnHeroFromConfig(configObj, sourceLabel)`
- `EnsureBuildCategoryPayloadProbeReturnHeroFallback()`
- `SetBuildCategoryPayloadProbeReturnHeroFromPayloadToken(payloadToken)`

**Load overlay functions:**
- `BeginSettingsLoaderSession`, `FinalizeSettingsLoaderSession`, `ResetSettingsLoaderSession`
- All `_loadLoader` overlay functions (search for `_loadLoader` in ql_core.js)

**State fields** — all `State.buildCategoryPayload*` fields (~60 fields, lines 461-534):
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

**Constants:** All `BUILD_CATEGORY_PAYLOAD_*` (lines 1128-1172) and `SETTINGS_LOADER_*` (lines 1173-1227).

### Step 5: Deduplicate Overlay Rendering (`ql_feat_buildoverlay.js`)

The three overlay systems (load, save, clear) share identical structure. After Steps 2-4, they'll be in three separate files. Create a factory pattern to deduplicate them.

The factory takes a config object and returns an overlay manager:
```js
function CreateLoaderOverlay(config) {
    // config: {
    //   steps: [{key, label}, ...],    // step definitions
    //   idPrefix: "QOLSaveSettingsLoader",  // panel ID prefix
    //   cachedPanelKey: "saveSettingsLoader", // State cache key prefix
    //   stateNs: "saveSettingsLoader",  // State field namespace prefix
    //   optionalExtras: {              // per-overlay optional UI
    //       stallHint: true,           // save has stall hint
    //       skipButton: true           // load has skip button
    //   }
    // }
    // Returns: { ensureOverlay, updateFromState, beginSession,
    //            finalizeSession, resetSession, resetStepStates,
    //            ensureStepRows, renderStepRows }
}
```

Each overlay becomes a thin config:
```js
var saveOverlay = CreateLoaderOverlay({
    steps: SAVE_STEPS,  // 9 steps from SAVE_SETTINGS_LOADER_STEPS
    idPrefix: "QOLSaveSettingsLoader",
    cachedPanelKey: "saveSettingsLoader",
    stateNs: "saveSettingsLoader",
    optionalExtras: { stallHint: true }
});
```

## What to Keep in ql_core.js

After all extractions, ql_core.js retains only:
- `ProcessBuildRequestCommon()` — shared dispatch (~30 lines)
- `ProcessBuildSaveRequest()` — thin wrapper calling ProcessBuildRequestCommon with save args
- `ProcessBuildClearRequest()` — thin wrapper for clear
- `buildRequestLoop()` — main poll loop
- `ProcessBuildRequestOrchestration()` — orchestration (~10 lines)
- Corrupt repair functions (they're intertwined with both save and load)
- `QOL` namespace population (the lazy-getter export array at lines ~23598-23702)
- All non-build-payload features
