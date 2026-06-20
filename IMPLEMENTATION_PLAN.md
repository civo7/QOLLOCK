# QOLLOCK Implementation Plan — Post-Audit Remediation

**Based on:** `DEEP_AUDIT_2025-06-20.md` (9 critical, 7 high, 12 medium, 8 low findings)  
**Strategy:** Easiest-first, lowest-risk, highest-ROI → hardest, highest-risk, transformational  
**Validation:** 5 specialized agents validated feasibility of specific technical approaches  
**Total estimated effort:** ~25-30 hours across all phases  

---

## Phase 0: Documentation & Tooling (30 min, 0 risk)

*Before touching any code, fix the broken tooling and update docs so the team knows the current state.*

### 0.1: Update CLAUDE.md (15 min)
Fix 7 outdated claims:
- "34 extracted feature files" → 35 (add ql_feat_showrank.js)
- "170 catch patterns convertible to SafeLog" → 677 actual silent catches
- "Bare-global compat block at lines 23710+" → removed in Phase 6/7
- "Schema: 3.1.4" → 3.1.5
- "38/38 features loaded" → 39/39
- "~16K lines after Phase 9" → 16,320 lines, but ~10,900 extractable remain
- Update file map to include showrank feature

### 0.2: Fix broken tooling (15 min)
- Delete `panorama/scripts/tools/check_bridges.sh` (references non-existent check_bridges.py)
- Or create the missing `check_bridges.py` if the intent was to have a working bridge safety check

---

## Phase 1: Dead Code Removal (45 min, near-zero risk)

*Remove confirmed-dead code from ql_core.js. Every deletion validated by agent with grep for callers, exports, and string references.*

### 1.1: Remove 4 duplicate functions (exist in ql_feat_colorwarnings.js) — ~65 lines

| Lines to Delete | Function | Active Copy In |
|-----------------|----------|---------------|
| 2444-2447 | `ResetColoredHealthbarPanelCache` | ql_feat_colorwarnings.js:40 |
| 11397-11410 | `ResolveEnemyColoredHealthTeamColor` | ql_feat_colorwarnings.js:256 |
| 11434-11444 | `EstimateHealthPercentFromBarHeight` | ql_feat_colorwarnings.js:245 |
| 11445-11465 | `RefreshEnemyColoredHealthPanelCache` | ql_feat_colorwarnings.js:152 |

### 1.2: Remove 6 truly dead functions (0 callers anywhere) — ~35 lines

| Lines to Delete | Function | Verification |
|-----------------|----------|-------------|
| 1332-1341 | `BuildComparableStorageConfigObject` | 0 refs beyond definition |
| 11285-11294 | `GetPanelActualOffsetSafe` | 0 refs beyond definition |
| 1306-1309 | `IsPlayableHeroId` | 0 refs beyond definition |
| 5681-5691 | `ParseEnemyV2BridgeBool` | 0 refs beyond definition |
| 3877-3885 | `ParseFgHeroSignalValue` | 0 refs beyond definition |
| 1322-1331 | `TryParseStorageConfigRaw` | 0 refs beyond definition |

### 1.3: Remove 6 duplicate functions (exist in other feature files) — ~75 lines

| Lines to Delete | Function | Active Copy In |
|-----------------|----------|---------------|
| 5342-5344 | `ResolveMinimapCrateOverlayMapKey` | ql_feat_minimapruntime.js:75 |
| 5360-5406 | `EnsureMinimapCrateOverlay` | ql_feat_minimapruntime.js:301 |
| 5408-5412 | `ClearMinimapCrateOverlayMarkers` | ql_feat_minimapruntime.js:296 |
| 6128-6141 | `IsIndicatorSmallDamage` | ql_feat_damagenumbers.js:113 |
| 1734-1761 | `ResolvePresetConfigByName` | ql_settings.js:19957 |
| 6375-6418 | `ScanPanelTreeForAccountId` | ql_profile_statlocker.js:101 |

### 1.4: Remove dead _qolExportDefs entries (lines 16283-16292) — 10 lines

Remove these 10 entries from the `_qolExportDefs` array:
`panelCache`, `getPanel`, `setPanel`, `getList`, `setList`, `getData`, `setData`, `panelCacheSweep`, `panelCacheClear`, `panelCacheResolve`

These are backward-compat aliases from Phase 5 that have zero consumers in any file.

### 1.5: Remove empty batch comments (lines 16059, 16061, 16063) — 3 lines

Remove vestigial "Batch D/E/F" section headers with no registrations between them.

### 1.6: Remove 17 overridden initial-block presets from QOL_PRESETS — ~400 lines

The 17 presets overridden by `QOL_PRESETS["name"] = {...}` blocks (Sneed, Vegas, Piggy, bonclide, Starjadian, Synthronix, Soramikali, Jaundice, 7eventy7, Munfins, Keta, Veradox, k49, ninjabladeJr, FlintSnow, Steqdyy, Seyer) have dead initial-block entries. Remove the initial entries (keep the override blocks).

**Total Phase 1 savings:** ~588 lines removed from ql_core.js + ~400 lines from ql_shared_presets.js = **~988 lines**. Risk: near-zero — every deletion validated.

---

## Phase 2: Feature File Quick Fixes (90 min, minimal risk)

*Isolated fixes to individual feature files. Each file is independently testable.*

### 2.1: Add `requiresRoot: true` to 14 feature files (20 min)

These features access `root` via `root.FindChildTraverse`/`root.SetAttributeString` but don't declare `requiresRoot`, causing transient startup errors that count toward auto-disable streaks.

**Files and exact edit locations (QOL.register call):**

| File | Add after line containing |
|------|--------------------------|
| ql_feat_ammo.js | `bucket: 3, phase: 0,` → add `requiresRoot: true,` |
| ql_feat_chatimg.js | `bucket: 0, phase: -1,` → add `requiresRoot: true,` |
| ql_feat_combatstatus.js | `bucket: 6, phase: 1,` → add `requiresRoot: true,` |
| ql_feat_damagenumbers.js | `bucket: 3, phase: 2,` → add `requiresRoot: true,` |
| ql_feat_heroshop.js | `bucket: 4, phase: 0,` → add `requiresRoot: true,` |
| ql_feat_keyboard.js | `bucket: 4, phase: 1,` → add `requiresRoot: true,` |
| ql_feat_legacyaudiopassive.js | `bucket: 1, phase: 0,` → add `requiresRoot: true,` |
| ql_feat_recentpurchases.js | `bucket: 5, phase: 2,` → add `requiresRoot: true,` |
| ql_feat_sigflash.js | `bucket: 6, phase: -1,` → add `requiresRoot: true,` |
| ql_feat_stamina.js | `bucket: 5, phase: 0,` → add `requiresRoot: true,` |
| ql_feat_statbonuses.js | `bucket: 1, phase: 2,` → add `requiresRoot: true,` |
| ql_feat_targetshapes.js | `bucket: 7, phase: 3,` → add `requiresRoot: true,` |
| ql_feat_unsecuredsouls.js | `bucket: 2, phase: 3,` → add `requiresRoot: true,` |
| ql_feat_zipboost.js | `bucket: 6, phase: 0,` → add `requiresRoot: true,` |

### 2.2: Fix colorwarnings.js dead imports (5 min)

Remove 5 function names from the QOL.import() call at line 8, since they're immediately redefined locally:

```js
// BEFORE:
var _deps = QOL.import(["getCachedPanel","isColorWarningEnabled","state","setCachedPanel","utils"]);
// AFTER:
var _deps = QOL.import(["state","utils"]);
```

Remove corresponding destructuring lines:
```js
// REMOVE THESE 4 LINES:
var GetCachedPanel = _deps.getCachedPanel;
var SetCachedPanel = _deps.setCachedPanel;
var IsColorWarningEnabled = _deps.isColorWarningEnabled;
// (SetWashColorSafe was imported too — remove its destructuring if present)
```

### 2.3: Fix targetshapes.js dead imports (5 min)

Remove `applyTargetShapeStyles` and `resolveUnitTargetStyleTexts` from QOL.import() — both are redefined locally in the file.

### 2.4: Fix undefined globals (10 min)

**chatimg.js:** Add `IMAGES_IN_CHAT_URL_REGEX` definition. If this regex is supposed to match image URLs in chat messages, add:
```js
var IMAGES_IN_CHAT_URL_REGEX = /https?:\/\/\S+\.(png|jpg|jpeg|gif|webp)/i;
```
(Verify the correct regex pattern with the feature owner.)

**targetshapes.js:** Add the missing debug flag:
```js
var TARGET_SHAPE_DEBUG = false;
```

### 2.5: Remove unconditional debug logs from 6 feature files (10 min)

Remove or gate these behind `Utils.IsDebugEnabled()`:

| File | Line | Current | Fix |
|------|------|---------|-----|
| ql_feat_ammo.js | ~5 | `$.Msg("[QOL DEBUG] Feature loaded: ammo\n")` | Remove or gate |
| ql_feat_bottombar.js | ~5 | Same pattern | Remove or gate |
| ql_feat_damageimpact.js | ~5 | Same pattern | Remove or gate |
| ql_feat_items.js | ~5 | Same pattern | Remove or gate |
| ql_feat_stamina.js | ~5 | Same pattern | Remove or gate |
| ql_feat_topbar.js | ~5 | Same pattern | Remove or gate |

### 2.6: Fix double/redundant imports (15 min)

| File | Issue | Fix |
|------|-------|-----|
| ql_feat_buildload.js | `isConnectedToHideout` imported redundantly at line 103 | Remove the redundant destructuring line |
| ql_feat_combatstatus.js | Full-name imports at lines 18-19 shadow alias imports | Remove the dead full-name destructuring (lines 18-19) |
| ql_feat_statbonuses.js | `GGHP` alias at line 8 never used | Remove `var GGHP = _deps.getGameplayHudPanel;` |
| ql_feat_unsecuredsouls.js | `GGHP` alias at line 8 never used | Remove `var GGHP = _deps.getGameplayHudPanel;` |
| ql_feat_statlocker.js | `GUIR` alias at line 8 never used | Remove `var GUIR = _deps.getUIRoot;` |
| ql_feat_topbar.js | `resolveCachedPanel` imported twice | Delete `var RC = _deps.resolveCachedPanel;` (line 9) — keep line 13's `ResolveCachedPanel` |
| ql_feat_rejuvtimers.js | `resolveCachedPanel` imported 3 times | Delete 2 of the 3 destructuring lines — keep `var ResolveCachedPanel = _deps.resolveCachedPanel;` |

### 2.7: Fix check_bridges.sh (5 min)

Either delete the broken script or create a minimal working version that invokes the existing Python tools:
```bash
#!/bin/bash
# check_bridges.sh — pre-commit safety check for QOLLOCK feature extraction
echo "=== QOLLOCK Bridge Safety Check ==="
python3 tools/trace_deps.py
```

**Total Phase 2:** ~30 edits across 20+ files. Risk: minimal — each edit is isolated and validated.

---

## Phase 3: Schema & Config Fixes (30 min, low risk)

### 3.1: Add missing ULT_COOLDOWN_X_OFFSET and ULT_COOLDOWN_Y_OFFSET to QOL_DEFAULT_CONFIG (5 min)

In `ql_shared_presets.js`, find the existing ULT_COOLDOWN defaults block (~line 2170) and add:
```js
ULT_COOLDOWN_X_OFFSET: 0,
ULT_COOLDOWN_Y_OFFSET: 0,
```

These were added to schema V34 but never got default entries. Used by ninjabladeJr and leah presets.

### 3.2: Remove dead CloneSchemaWithoutFields utility (5 min)

Delete lines 1277-1300 in `ql_shared_presets.js` — defined but never called.

### 3.3: Document schema identity versions (5 min)

Add comments at V12, V25, V41, V45 explaining why they're identity assignments:
```js
// V12 reserved for future expansion, currently identical to V11
var QOL_COMPACT_SCHEMA_V12 = QOL_COMPACT_SCHEMA_V11;
```

### 3.4: Version bump consideration (15 min)

If the ENABLE_COLORED_HEALTHBAR V24 duplicate is to be fixed, it requires a wire version bump (breaking binary compat with existing exports). This is a policy decision — document the plan:
- Option A: Fix it in the next major schema version (e.g., 3.2.0 or 4.0.0) with a migration path
- Option B: Leave it forever, accepting 2 wasted bits per payload

**Total Phase 3:** 4 changes, ~10 lines modified. Risk: low.

---

## Phase 4: ShowRank Feature Normalization (120 min, medium risk)

*Refactor the 908-line showrank feature to follow standard patterns while preserving XML onload handlers.*

### Key constraint: `$.ShowRank_*` handlers cannot be removed

These are required by XML onload bindings in the mod's own layout files:
- `hud_escape_menu.xml:19` → `$.ShowRank_EscapeOpened`
- `citadel_hud_top_bar_player.xml:11` → `$.ShowRank_TopBarLoaded`
- `profile_card.xml:10` → `$.ShowRank_ProfileLoaded`

The showrank script is loaded in TWO contexts:
1. **HUD context** (via hud.xml:60) — full QOL system available
2. **Profile card context** (via profile_card.xml:8) — standalone, minimal deps

### 4.1: Replace inline utilities with QOL.import() (30 min)

Remove these inline functions and import equivalents:
- `IsCfgEnabled()` → `Utils.IsCfgEnabled` (from QOL.import)
- `NowMs()` → `_deps.perfNowMs` or `Utils.PerfNowMs`
- `Valid()` → `Utils.IsPanelValid`
- `ReadAttr()` → `Utils.SafeGetAttribute`
- `SetAttr()` → `Utils.SafeSetAttribute`
- `ReadClass()` → refactor to use `Utils.FindFirstPanelByClass`

Add unconditional QOL.import() at top level:
```js
var _deps = QOL.import(["state", "utils", "isConnectedToHideout", "perfNowMs", "bridge"]);
var State = _deps.state;
var Utils = _deps.utils;
var Bridge = _deps.bridge;
```

### 4.2: Replace _DBG/DBG() with Utils.DebugLog (20 min)

Remove lines 8-9 (`_DBG` flag and `DBG` function). Replace all ~70 `DBG(...)` calls with `Utils.DebugLog("showRank", ...)`.

### 4.3: Convert 64 silent catch blocks (40 min)

Categorized by pattern:
- **12 attr reads** → `Utils.SafeGetAttribute(root, key, fb)`
- **8 attr writes** → `Utils.SafeSetAttribute(root, key, value)`
- **30 panel property ops** → `Utils.SafeLog(function(){...}, "showRank.op")`
- **7 Valid() calls** → `Utils.IsPanelValid(p)` (no try/catch needed)
- **3 outer wrappers** → Keep try/catch but add logged catch with feature name
- **4 other** → `Utils.SafeLog(function(){...}, "showRank.op")`

### 4.4: Fix registration pattern (15 min)

Remove `if (State)` guard around registration. Move `State` check into gate function:
```js
QOL.register("showRank", {
    configKeys: ["SHOW_RANK"],
    bucket: 7, phase: 4,
    requiresRoot: true,
    gate: function(cfg) {
        return IsCfgEnabled(cfg, "SHOW_RANK") && State && State.lastConfig;
    },
    update: function(root, cfg, nowMs) {
        try { ApplyConfigHotReload(root, cfg); ... }
        catch(e) { $.Msg("[QOLLock][ERROR][" + _featureId + "] " + e.message); throw e; }
    },
    stateKeys: ["_showRankEnabled", "showRankEscapeDone"]
});
```

### 4.5: Remove late-init block (5 min)

Lines 882-905 are redundant with `EnsureTopBarPlayersInitialized()` in the update callback. Delete.

### 4.6: Fix self-test (10 min)

Expand to check internal functions (`FillLoop`, `FillRow`, `_InitTopBarPlayer`, `EnsureFillLoopRunning`, `EnsureTopBarPlayersInitialized`) plus the `$.ShowRank_*` globals.

**Total Phase 4:** ~300 lines transformed, ~60 lines removed. Risk: medium — duplicate-loaded in profile card context, needs testing in both contexts.

---

## Phase 5: Per-Tick Optimization (90 min, low-medium risk)

### 5.1: Pre-allocate loop snapshot (20 min)

**Current (ql_core.js ~line 15909):**
```js
var loopSnapshot = {
    root: root, cfg: cfg, nowMs: nowMsLoop, gates: gates, raw: raw,
    hideoutConnected: hideoutConnected, hasConfigSource: hasConfigSource,
    redDiamondEnabled: gates.redDiamondEnabled
};
```

**Optimized:**
```js
// Pre-allocated once at top of loop() scope
var _loopSnapshot = { root: null, cfg: null, nowMs: 0, gates: null, raw: null,
    hideoutConnected: false, hasConfigSource: false, redDiamondEnabled: false };
// In the tick:
_loopSnapshot.root = root;
_loopSnapshot.cfg = cfg;
_loopSnapshot.nowMs = nowMsLoop;
_loopSnapshot.gates = gates;
_loopSnapshot.raw = raw;
_loopSnapshot.hideoutConnected = hideoutConnected;
_loopSnapshot.hasConfigSource = hasConfigSource;
_loopSnapshot.redDiamondEnabled = gates.redDiamondEnabled;
```

Saves: 1 object allocation per tick (5 objects/sec).

### 5.2: Pre-allocate and reuse bucket arrays (20 min)

**Current:**
```js
var buckets = [[], [], [], [], [], [], [], []];
```

**Optimized:**
```js
// Pre-allocated once
var _buckets = [[], [], [], [], [], [], [], []];
// In the tick, clear instead of re-allocate:
for (var _bi = 0; _bi < 8; _bi++) _buckets[_bi].length = 0;
```

Saves: 8 array allocations per tick (40 arrays/sec). Risk: near-zero — `.length = 0` is a standard array clear pattern.

### 5.3: Pre-compute feature dispatch thunks (30 min)

**Current (in populateFeatureBuckets):** Every tick creates new closures for each active feature:
```js
buckets[bucketIndex].push((function(fn, entry, label) {
    return function(snapshot) { ExecuteFeature(fn, function() { entry.update(...); }); };
})(featureName, featureEntry, perfLabel));
```

**Optimized:** Pre-compute thunks once when features are registered. Store on the registry entry:
```js
// In QOL_REGISTER_FEATURE (ql_shared_presets.js ~line 2041):
entry._dispatchThunk = function(snapshot) {
    ExecuteFeature(featureName, function() {
        entry.update(snapshot.root, snapshot.cfg, snapshot.nowMs);
    });
};
// In populateFeatureBuckets:
buckets[bucketIndex].push(featureEntry._dispatchThunk);
```

Saves: ~20-30 closure allocations per tick. Risk: medium — the dispatch thunk captures variables by reference that need to be stable across the feature's lifetime. Test carefully with features that are disabled mid-session.

### 5.4: Throttle FindChildrenWithClassTraverse in targetshapes (10 min)

In `ql_feat_targetshapes.js` lines 105-106, add a 500ms throttle:
```js
// Add a last-scan guard:
if (!State.targetShapeLastScanMs || (nowMs - State.targetShapeLastScanMs) > 500) {
    State.targetShapesCache = root.FindChildrenWithClassTraverse("target_shape") || [];
    State.hintContainerCache = root.FindChildrenWithClassTraverse("qol_hint_target") || [];
    State.targetShapeLastScanMs = nowMs;
}
```

**Total Phase 5:** ~80 lines changed. Savings: ~45 objects/sec + ~30 closures/sec eliminated. Risk: low-medium — pre-computed thunks need thorough testing of auto-disable path.

---

## Phase 6: Catch Block Remediation — Automated Pass (120 min, low risk)

*Convert mechanically-convertible silent catches to SafeLog/SafeGetAttribute/SafeSetAttribute.*

### 6.1: Phase 0 prep — ensure SafeLog is accessible everywhere (15 min)

- **ql_core.js:** Add `var SafeLog = QOL_UTILS_LOADED ? QOL_UTILS.SafeLog : function(fn, label) { try { return fn(); } catch(e) { return null; } };` to the utility destructuring block
- **ql_settings.js:** Add the same fallback
- **ql_hero_testing.js:** Define a local `SafeLog` stub
- **Feature files:** Already accessible via `Utils.SafeLog` (all import `utils`)

### 6.2: Mechanical conversion — Pattern D (SetAttribute) across all files (15 min)

Scripted replacement:
```
try { X.SetAttributeString(K, V); } catch(e) {}
→ Utils.SafeSetAttribute(X, K, V);
```
**~30 occurrences** across feature files + ql_core.js. Fully mechanical, zero risk.

### 6.3: Mechanical conversion — Pattern B (attr read with fallback) (15 min)

Scripted replacement:
```
try { val = panel.GetAttributeString(k, d); } catch(e) { val = d; }
→ val = Utils.SafeGetAttribute(panel, k, d);
```
**~25 occurrences.** Fully mechanical, zero risk.

### 6.4: Mechanical conversion — Pattern E (DeleteAsync(0)) (10 min)

Scripted replacement:
```
try { panel.DeleteAsync(0); } catch(e) {}
→ Utils.SafeLog(function() { panel.DeleteAsync(0); }, "file.cleanup.DeleteAsync");
```
**~15 occurrences.** Label communicates expected mid-frame failures.

### 6.5: Mechanical conversion — isolated Pattern A (style ops) (20 min)

Single-line style operations:
```
try { panel.style.X = Y; } catch(e) {}
→ Utils.SafeLog(function() { panel.style.X = Y; }, "file.style.X");
```
**~50 occurrences** in feature files only (skip ql_core.js — these already use SetStyleSafe).

### 6.6: Mechanical conversion — Pattern C (FindChildTraverse with null fallback) (20 min)

```
try { panel = root.FindChildTraverse(id); } catch(e) { panel = null; }
→ panel = Utils.SafeLog(function() { return root.FindChildTraverse(id); }, "file.find." + id);
```
**~46 occurrences.** The SafeLog returns null on exception, matching the original fallback.

### 6.7: Mechanical conversion — Pattern A (panel property) (15 min)

```
try { panel.text = val; } catch(e) {}
→ Utils.SafeLog(function() { panel.text = val; }, "file.panel.text");
```
**~25 occurrences.**

### 6.8: What NOT to auto-convert

These patterns MUST be reviewed manually (Phase 7):
- Multi-line try bodies that mix operations
- Batch style blocks (>1 prop per try)
- Catches with non-empty fallback logic
- Catches inside switch/if/for control flow
- Catches in ql_core.js hot path (dispatch loop)

**Total Phase 6:** ~191 auto-conversions across all files. Risk: low — all mechanical replacements preserve original behavior.

---

## Phase 7: Catch Block Remediation — Manual Review (180 min, medium risk)

*Handle the ~312 catches that require human judgment.*

### 7.1: Feature files — Pattern Z review (83 catches, ~45 min)

Each catch needs individual reading. Most fall into:
1. **Fallback assignments** → Wrap try body in SafeLog
2. **Function calls that may throw** → Wrap in SafeLog
3. **Genuinely empty catches** → Assess whether the operation can safely be unguarded (e.g., WasPanelEverValid checks)

Priority order: buildsave.js (19), statlocker.js (15), onDeathArcade (15), showrank (done in Phase 4), unspent (8), mousecursor (7), lanewithparty (5), buildload (5).

### 7.2: ql_core.js — verify hot path immunity (60 min)

Identify catches in the dispatch loop hot path (lines 15700-15990). These should NOT get SafeLog overhead:
- `ExecuteFeature` try/catch (line 1535-1546): **Already logged** — no change needed
- `_scheduleFeatureBucket` try/catch (line 14958-14962): **Already logged** — no change needed
- `loop()` top-level try/catch (line 15866): **Already logged** — no change needed

Convert only cold-path catches (build save/clear, panel tree walking, overlay management).

### 7.3: ql_core.js — Panel tree walking block (lines 8750-10100, ~80 catches) (40 min)

This is the largest concentration of silent catches. These are in `WalkAllElements`, `GetActivatePanelAtCoords`, `ResolveBuildButtonFromSubPanel`. All called on-demand (not per-frame). Convert with consistent labels:
```
"BuildCategory.WalkAllElements.GetChild"
"BuildCategory.WalkAllElements.GetParent"
"BuildCategory.ResolveBuildButton.FindChildTraverse"
```

### 7.4: ql_settings.js manual catches (~96 catches, 35 min)

All in cold settings UI path. Convert with `"settings.<operation>"` labels. The bulk (~40) are in search/dropdown/multi-button/palette/preset sections.

**Total Phase 7:** ~312 manual catch conversions. Risk: medium — human review required but all in cold paths.

---

## Phase 8: Cross-Context Safety (90 min, medium risk)

### 8.1: Harden ql_hero_testing.js (45 min)

This file has the most severe cross-context vulnerabilities:
1. **Wrap in IIFE:** Enclose all 2,169 lines in `(function() { 'use strict'; ... })();`
2. **Add context guard:** At the top of the IIFE:
   ```js
   if (typeof $ === "undefined" || !$.GetContextPanel) {
       // Settings context or unavailable — exit silently
       return;
   }
   ```
3. **Fix hardcoded storage key:** Change line 692 from `"Deadlock_Mod_Settings_v1"` to `QOL_STORAGE_KEY` (available from ql_shared_presets.js which loads before this)
4. **Add SafeLog stub:** Define local error-handling helper
5. **Add try/catch to module-scope operations:** Lines 1782-1838 (12 `Hud.FindChildInLayoutFile` calls) need protection
6. **Fix `CollectLocalPlayerEntityCandidates()`:** Returns empty array — either implement or document as intentional

### 8.2: Verify profile_card.xml context for showrank (15 min)

The showrank script loads in two places. Verify that in the profile card context:
- `QOL.state` is available (it should be — ql_state.js loads first in hud.xml)
- Actually, profile_card.xml only includes `ql_profile_card_statlocker.vjs_c` and `ql_feat_showrank.vjs_c` — QOL infrastructure is NOT loaded here!

**This means the current `if (State)` guard in showrank.js is CORRECT for the profile card context.** The Phase 4 refactor must preserve this dual-context compatibility by keeping the State check in the gate function.

### 8.3: Add `const` usage audit to engine compatibility checklist (15 min)

Document whether Source 2 Panorama supports `const`/`let`. If it does:
- Update CLAUDE.md to allow `const` for constants
- No changes needed to existing code

If it doesn't:
- Convert `const` → `var` in: ql_shared_presets.js (27 sites), ql_settings.js (149 sites), ql_core.js (10 sites), ql_feat_rejuvtimers.js (8 sites)

### 8.4: Add `.vjs_c` extension verification (15 min)

Verify that all 35 feature files in `hud.xml` actually exist as `.js` files on disk. The XML uses `.vjs_c` extension (compiled VPK JavaScript), but source files are `.js`. A missing file would be a silent load failure.

**Total Phase 8:** ~70 lines changed in hero_testing.js + documentation updates. Risk: medium for hero_testing.js — wrap-in-IIFE could break if there are implicit dependencies on module-scope variable hoisting.

---

## Phase 9: Settings File Modernization — Initial Pass (180 min, high effort)

*Begin the long-overdue modernization of the 22,824-line settings file.*

### 9.1: Extract localization data to separate file (60 min)

ql_settings.js contains ~9,000 lines of repeated translations in ~10 languages, interleaved throughout row creation functions. Extract to:
- `ql_settings_i18n.js` — translations object keyed by language code

Pattern:
```js
// In ql_settings_i18n.js:
var QOL_SETTINGS_I18N = {
    "russian": { "...": "..." },
    "ukrainian": { "...": "..." },
    // ... all languages
};
```

This immediately reduces ql_settings.js by ~9,000 lines.

### 9.2: Extract arcade games to separate files (60 min)

The settings file contains full implementations of 5 arcade games (Minesweeper, Flappy Bat, Blackjack, Aim Trainer, Whack-a-Rem) — ~683 lines of references. Extract each to:
- `ql_settings_minesweeper.js`
- `ql_settings_flappybat.js`
- `ql_settings_blackjack.js`
- `ql_settings_aimtrainer.js`
- `ql_settings_whackrem.js`

Include these in `hud_escape_menu.xml` to maintain load order.

### 9.3: Convert `const` → `var` in settings file (30 min)

149 `const` declarations need conversion if the engine doesn't support ES6. Use scripted replacement:
```bash
sed -i 's/^\( *\)const /\1var /g' ql_settings.js
```
But review each one — some may be intentionally block-scoped.

### 9.4: Add SafeLog/SafeGetAttribute/SafeSetAttribute usage (30 min)

Add the utility fallback at the top of ql_settings.js:
```js
var QOLUTILS = (typeof QOL_UTILS !== "undefined") ? QOL_UTILS : null;
var SafeLog = QOLUTILS ? QOLUTILS.SafeLog : function(fn, label) { try { return fn(); } catch(e) { return null; } };
var SafeGetAttribute = QOLUTILS ? QOLUTILS.SafeGetAttribute : function(p, a, d) { try { return String((p && p.GetAttributeString) ? p.GetAttributeString(a, d || "") : d || ""); } catch(e) { return d || ""; } };
var SafeSetAttribute = QOLUTILS ? QOLUTILS.SafeSetAttribute : function(p, a, v) { try { if (p && p.SetAttributeString) { p.SetAttributeString(a, String(v != null ? v : "")); return true; } } catch(e) {} return false; };
```

Then convert the 194 silent catch blocks in Phase 10.

**Total Phase 9:** ~10,000 lines moved to separate files. Risk: medium — extraction of localization data is mechanical but voluminous; test Settings UI rendering after each extraction.

---

## Phase 10: Settings Catch Remediation + Deep Extraction (deferred, 300+ min)

*This phase is the largest remaining work item and should be scheduled separately.*

### 10.1: Convert 194 settings silent catches

Follow the same pattern as Phase 7 but for the Settings UI context. All cold path — safe to convert.

### 10.2: Extract healthbar subsystems from ql_core.js (~1,663 lines)

Minecraft hearts, Budhud, minimalist, FG healthbar — these are the most clearly extractable large blocks.

### 10.3: Extract compass/minimap from ql_core.js (~836 lines)

Includes refactoring `compassLoop` to use the feature registry instead of hard-coded feature names.

### 10.4: Extract images-in-chat from ql_core.js (~211 lines)

Relatively small, well-isolated feature.

---

## Risk Assessment Matrix

| Phase | Files Touched | Lines Changed | Risk Level | Rollback Strategy |
|-------|--------------|---------------|------------|-------------------|
| 0: Docs & Tools | 2 | ~50 | None | N/A |
| 1: Dead Code | ql_core.js, ql_shared_presets.js | ~988 removed | Near-zero | git revert |
| 2: Feature Quick Fixes | 20+ feature files | ~30 additions | Minimal | per-file git checkout |
| 3: Schema Fixes | ql_shared_presets.js | ~10 additions | Low | git revert |
| 4: ShowRank Refactor | ql_feat_showrank.js | ~300 changed, ~60 removed | Medium | Keep backup of original |
| 5: Per-Tick Optimize | ql_core.js, ql_shared_presets.js, ql_feat_targetshapes.js | ~80 | Low-Medium | git revert + test 5Hz loop |
| 6: Auto Catch Convert | 20+ files | ~191 conversions | Low | git revert |
| 7: Manual Catch Convert | ql_core.js, ql_settings.js, features | ~312 conversions | Medium | Per-file git checkout |
| 8: Cross-Context Safety | ql_hero_testing.js, showrank.js | ~100 | Medium | Keep backup of hero_testing.js |
| 9: Settings Extract | ql_settings.js + new files | ~10,000 moved | Medium-High | git revert + verify UI renders |
| 10: Deep Extraction | ql_core.js, ql_settings.js | ~3,000 moved | High | Deferred; plan separately |

---

## Verification Strategy

After each phase, run these checks before proceeding:

1. **Load test:** Repack VPK, launch game, verify all 39 features load (check `QOL_DumpDiagnostics()` for auto-disabled features)
2. **Preset cycle:** Run all 92 presets with 1.2s delay, verify no crashes
3. **Feature toggle:** Enable/disable each feature individually
4. **Settings UI:** Open settings, verify all rows render, verify export/import works
5. **Cross-context:** Test settings → HUD bridge (change a setting, verify it takes effect in-game)

---

## Total Effort Estimate

| Phase | Description | Est. Time | Cumulative |
|-------|-------------|-----------|------------|
| 0 | Documentation & Tooling | 30 min | 30 min |
| 1 | Dead Code Removal | 45 min | 1.25 hr |
| 2 | Feature File Quick Fixes | 90 min | 2.75 hr |
| 3 | Schema & Config Fixes | 30 min | 3.25 hr |
| 4 | ShowRank Refactor | 120 min | 5.25 hr |
| 5 | Per-Tick Optimization | 90 min | 6.75 hr |
| 6 | Auto Catch Conversion | 120 min | 8.75 hr |
| 7 | Manual Catch Review | 180 min | 11.75 hr |
| 8 | Cross-Context Safety | 90 min | 13.25 hr |
| 9 | Settings Modernization | 180 min | 16.25 hr |
| 10 | Deep Extraction (deferred) | 300+ min | 21+ hr |

**Recommended sprint plan:**
- Sprint 1 (Phases 0-3): ~3.25 hours — quick wins, immediate ROI
- Sprint 2 (Phases 4-6): ~5.5 hours — showrank normalization + optimization + auto catch conversion
- Sprint 3 (Phases 7-8): ~4.5 hours — manual catch review + cross-context safety
- Sprint 4 (Phase 9): ~3 hours — settings modernization initial pass
- Sprint 5 (Phase 10): ~5+ hours — deep extraction (deferred, plan separately)

**After Phase 3, ql_core.js will be reduced by ~988 lines with zero risk.**  
**After Phase 6, 191 of 677 silent catches will be converted to logged operations.**  
**After Phase 8, the codebase will be cross-context safe and architecturally consistent.**
