# QOLLOCK Deep Architectural Audit — 2026-06-20

**Branch:** `showrank-poc`  
**Schema:** 3.1.5  
**Audit method:** 5 parallel specialized agents across 7 dimensions + independent investigation  
**Total agent tokens consumed:** ~665,000  
**Files analyzed:** ~42 JS files, 1 XML file, totaling ~85,000 lines  

---

## Executive Summary

The QOLLOCK codebase is **structurally sound at its core** — the dispatch loop, feature registry, QOL namespace, and error isolation architecture are well-designed and robust. However, significant architectural drift has accumulated during the aggressive Phase 1-9 extraction effort. The primary issues are:

1. **Error handling is virtually absent in practice** — 677 of 700 catch blocks (96.7%) silently swallow errors
2. **ql_settings.js is an unmodernized 22,824-line monolith** eclipsing ql_core.js in size
3. **The new showrank feature (908 lines) follows none of the established patterns**
4. **~8,100 lines of extractable feature logic remain in ql_core.js** — far more than the 2 documented features
5. **Per-tick GC pressure**: ~100 closures and ~45 objects allocated per second at 5Hz
6. **`const` keyword inconsistency**: ~200 `const` declarations across a `var`-only codebase convention

---

## CRITICAL Findings (9)

### C1. ShowRank feature is architecturally alien — `ql_feat_showrank.js` (908 lines)

This file, added on the `showrank-poc` branch, ignores every established pattern:

| Pattern | Standard Feature Files | showrank.js |
|---------|----------------------|-------------|
| QOL.import() location | Top-level, unconditional | Inside a closure guarded by `if (State)` |
| Registration guard | Unconditional | `if (State) { QOL.register(...) }` — silently skips if State unavailable |
| Error handling | Try/catch with `_featureId` in update callback | 65 catch blocks, 64 silent `catch(e){}` |
| Utility functions | Imported via QOL.import() | Inline duplicates: `IsCfgEnabled`, `Valid()`, `NowMs()`, `ReadAttr()`, `SetAttr()` |
| Panel access | Via `GetCachedPanel`/`SetCachedPanel` | Direct `root.GetAttributeString`/`root.SetAttributeString` pattern |
| Event integration | Dispatch loop `update()` callback | Installs `$.ShowRank_EscapeOpened`, `$.ShowRank_ProfileLoaded`, `$.ShowRank_TopBarLoaded` global handlers |
| External dependencies | None | Hardcoded external API URL (`api.deadlock-api.com`) |
| Config key | In schema + defaults | `SHOW_RANK` exists in schema 3.1.5 and defaults (correct) |

**Recommendation:** Refactor to standard pattern before merge to main:
- Use top-level QOL.import() with proper Settings-context guard
- Replace inline utilities with QOL.import() equivalents (`Utils.IsCfgEnabled`, `Utils.IsPanelValid`, `Utils.PerfNowMs`)
- Wrap all 65 catch blocks with at least WARN-level logging
- Convert `$.ShowRank_*` handlers to dispatch-loop update() calls or document the XML event binding

### C2. 677 of 700 catch blocks silently swallow errors (96.7%)

The CLAUDE.md claims "170 catch patterns are convertible to SafeLog." The actual count is **4× higher**:

| File | Total Catch | Silent | Logged |
|------|------------|--------|--------|
| ql_core.js | 260 | 243 | 17 |
| ql_settings.js | 199 | 194 | 5 |
| 35 feature files | 223 | 222 | 1 |
| ql_hero_testing.js | 14 | 14 | 0 |
| ql_perf_overlay.js | 4 | 4 | 0 |
| **TOTAL** | **700** | **677** | **23** |

Only 3.3% of catch blocks produce any diagnostic output. This means:
- Panel deletion mid-frame crashes are invisible (no log, no stack trace)
- Config parse failures are silently absorbed
- Bridge read/write failures are invisible
- The SafeLog utility (added in Phase 9) has **zero adopters** across all feature files

### C3. ql_hero_testing.js is architecturally disconnected — 2,169 lines

Unlike every other script in the project, `ql_hero_testing.js`:
- **Has no IIFE wrapper** — all 2,169 lines execute at module scope
- **Has no `"use strict"`** directive
- **Has no context guard** — line 1782 executes `FindAncestorById("Hud")` unconditionally at module scope, which would crash in Settings context
- **Uses `const` at module scope** (violates `var`-only convention)
- **Hardcodes storage key** at line 692: `const key = "Deadlock_Mod_Settings_v1"` instead of `QOL_STORAGE_KEY`
- **Has 14 silent catch blocks** with zero logging
- **Has ~40 unprotected panel operations** (style assignment, text assignment, visibility toggle) without try/catch

This file is the single highest-risk file for cross-context crashes.

### C4. ql_settings.js is a 22,824-line unmodernized monolith

Larger than ql_core.js (16,320 lines) and completely bypassing the QOL.import() system:

- **Does not use QOL.import()** — uses bare-global `typeof QOL_X` checks throughout
- **Uses `const` 149 times** — inconsistent with `var` convention
- **Contains embedded arcade games** (~683 lines referencing Minesweeper, Flappy Bat, Blackjack, Aim Trainer, Whack-a-Rem)
- **Contains ~9,000 lines of localization data** (repeated translations in ~10 languages)
- **194 of 199 catch blocks are silent**
- **Uses inline utility fallbacks** that silently degrade (e.g., `SetPanelOpacitySafe` fallback ignores opacity parameters and always sets "1.00")

**Recommendation:** This is Phase 11+ work. Extract localization data to a separate file. Migrate to QOL.import(). Extract arcade games to feature files.

### C5. colorwarnings.js imports 5 functions it immediately redefines

In `ql_feat_colorwarnings.js`:
```js
var _deps = QOL.import(["getCachedPanel", "isColorWarningEnabled", "state", "setCachedPanel", "utils"]);
// ... then at lines 409-465:
function GetCachedPanel(k) { ... }     // shadows _deps.getCachedPanel (DEAD IMPORT)
function SetCachedPanel(k, p) { ... }   // shadows _deps.setCachedPanel (DEAD IMPORT)
function IsColorWarningEnabled(...) { ... } // shadows _deps.isColorWarningEnabled (DEAD IMPORT)
function SetWashColorSafe(...) { ... }  // imported but redefined (DEAD IMPORT)
function hasClassInHierarchy(...) { ... } // duplicate of Utils.HasClassInHierarchy
```

The 5 functions imported from QOL are **never used** — local redefinitions shadow them completely. This is the most concentrated case of dead QOL.import() entries.

### C6. 446 unprotected panel operations across feature files

Panel operations without try/catch that would throw `ReferenceError` if Panorama asynchronously deletes the panel mid-frame:

| Feature File | Unprotected Ops |
|-------------|----------------|
| ql_feat_rejuvtimers.js | 162 |
| ql_feat_minimapruntime.js | 38 |
| ql_feat_legacyaudiopassive.js | 28 |
| ql_feat_recentpurchases.js | 27 |
| ql_feat_unsecuredsouls.js | 26 |
| (remaining 30 files) | 165 |

These are the "panel deleted mid-frame" crashes that the CLAUDE.md identifies as a known bug pattern, yet they remain unguarded.

### C7. chatimg.js and targetshapes.js reference undefined globals

- **`ql_feat_chatimg.js:54`**: References `IMAGES_IN_CHAT_URL_REGEX` which is **never defined** in the file. If this global isn't set elsewhere, `text.match(IMAGES_IN_CHAT_URL_REGEX)` will throw `ReferenceError`.
- **`ql_feat_targetshapes.js:55-56`**: References `TARGET_SHAPE_DEBUG` which is never defined. Since `var TARGET_SHAPE_DEBUG` is not declared, it evaluates to `undefined` (falsy), which is a silent no-op — but the intent was clearly to have a debug toggle.

### C8. `const` keyword inconsistency across the codebase

The codebase convention is `var` (pre-ES6). However:
- **ql_shared_presets.js**: 27+ `const` declarations (lines 1385-1637, schema field definitions)
- **ql_settings.js**: 149 `const` declarations
- **ql_core.js**: ~10 `const` declarations (lines 92-118, scheduler constants)
- **ql_feat_rejuvtimers.js**: 8 `const` declarations (lines 33-40)
- **ql_feat_showrank.js**: 0 `const` (uses `var`)
- **ql_hero_testing.js**: Uses `const` at module scope

**Risk:** Source 2 Panorama uses an older JavaScript engine. While ES6 `const`/`let` should be supported in engines from the Panorama era, the inconsistency could cause subtle scope bugs. `const` is block-scoped; `var` is function-scoped. In IIFE-wrapped code, this distinction matters.

### C9. 14 feature files lack `requiresRoot` but access `root` on startup

At line 15739 of `ql_core.js`, the `requiresRoot` guard skips features whose `requiresRoot === true` when `GetUIRoot()` returns null. However, 14 extracted features access `root` (via `root.FindChildTraverse`, etc.) **without declaring `requiresRoot: true`**. On early startup ticks before the UI tree is ready, these features throw — caught by `ExecuteFeature`'s try/catch, but the errors count toward the auto-disable streak (10 consecutive failures = feature disabled for the session).

**Affected features:** ammo, chatimg, combatstatus, damagenumbers, heroshop, keyboard, legacyaudiopassive, recentpurchases, sigflash, stamina, statbonuses, targetshapes, unsecuredsouls, zipboost.

---

## HIGH Findings (7)

### H1. `ULT_COOLDOWN_X_OFFSET` and `ULT_COOLDOWN_Y_OFFSET` missing from defaults

These two keys were added to the compact schema in V34 (line 1068-1069) but never received entries in `QOL_DEFAULT_CONFIG`. They are used in 2 presets (ninjabladeJr, leah). Any code path reading these keys without a preset override gets `undefined` instead of the sensible default `0`. This is the only schema→defaults gap among 298 schema keys.

### H2. Per-tick GC pressure: ~100 closures + ~45 objects per second at 5Hz

**`ql_core.js:15909-15919`** — Every main loop tick allocates 9 objects:
```js
var loopSnapshot = { root, cfg, nowMs, gates, raw, hideoutConnected, hasConfigSource, redDiamondEnabled };
var buckets = [[], [], [], [], [], [], [], []];  // 8 arrays, mostly empty
```

**`ql_core.js:15745-15754`** — Every active feature gets a new closure:
```js
buckets[bucketIndex].push((function(fn, entry, label) {
    return function(snapshot) { ExecuteFeature(fn, function() { ... }); };
})(featureName, featureEntry, perfLabel));
```

With ~20 active features at 5Hz: **100 new closure objects/second + 45 array/object allocations/second**.

**Recommendation:** Pre-allocate loopSnapshot once and mutate it. Only create non-empty buckets. Pre-compute dispatch wrappers at registration time.

### H3. ~8,100 lines of unextracted feature logic in ql_core.js

CLAUDE.md documents 2 unextracted features (coreRoot, healthbarRuntimeHelpers). The actual count of extractable logic blocks is **much larger**:

| Block | Lines | Description |
|-------|-------|-------------|
| Healthbar subsystems | ~1,663 | Minecraft hearts, Budhud, minimalist, FG, colored accent |
| Settings loader / Build ops | ~5,500 | UI overlay, payload encode/decode, storage init/save/clear/repair |
| Enemy ult / Colored health | ~876 | Enemy ult indicator, healthbar color warnings |
| Item mirror | ~1,820 | Multi-slot item mirror probe, reconcile, runtime |
| Compass / Minimap | ~836 | Compass overlay, ticks, rotation, minimap rotate/flip |
| Images in chat | ~211 | Find, inject, clear, cache chat images |
| **Total** | **~10,906** | |

Much of this is tightly coupled infrastructure (build save/clear is ~5,500 lines alone), but the healthbar subsystems (~1,663 lines) and compass/minimap (~836 lines) are clear extraction candidates that would reduce ql_core.js to a more manageable size.

### H4. `compassLoop` hard-codes feature names instead of using the registry

`ql_core.js:14244-14469` dispatches 6 features with hard-coded names and direct `ExecuteFeature` calls:
```
compass.overlay, compass.minimap_rotate, compass.item_mirror,
compass.reload_cd, compass.ult_cd, compass.target_shapes_fast
```

These are **not in QOL_FEATURE_REGISTRY** — they bypass the registry-driven dispatch entirely. This is a parallel dispatch system that doesn't benefit from auto-disable, error streak tracking, or diagnostic visibility.

### H5. Staggered dispatch error handling gap

`_scheduleFeatureBucket` (line 14952) wraps all features in a single try/catch. When a feature crashes in the staggered path:
- The error is logged generically (no feature name)
- The error streak is **not incremented** — auto-disable won't trigger for staggered features
- All subsequent features in the same bucket continue running (good)

This means staggered-path features can fail indefinitely without auto-disable protection.

### H6. Staggered disable cleanup modulo mismatch

`ShouldRunStaggeredDisableCleanup` (line 14938) uses `(p % 3) === (s % 3)` but the 5-phase scheduler assigns slot IDs 0-4. Slots 3 and 4 have `(3 % 3) = 0` and `(4 % 3) = 1`, causing them to run cleanup on phases 0 and 1 (more frequently than intended). The intent was likely to spread cleanup across 3 phase groups, but 5 slots mapped to 3 groups produces uneven distribution.

### H7. CLAUDE.md and project documentation out of date

| Claim in CLAUDE.md | Actual | Severity |
|--------------------|--------|----------|
| "34 extracted feature files" | 35 (ql_feat_showrank.js added) | Documentation |
| "~16K lines after Phase 9 extraction" | 16,320 (correct, but 10,906 extractable remain) | Misleading |
| "170 catch patterns convertible to SafeLog" | 677 (4× underestimate) | Misleading |
| "Bare-global compat block at lines 23710+" | Removed in Phase 6/7 (correct, docs stale) | Documentation |
| "18 duplicated bridge constants" | Resolved (correct) | Clean |
| "92 presets available" | 92 (confirmed correct) | Clean |
| "38/38 features loaded" | 39/39 (showrank added) | Documentation |
| "Schema: 3.1.4" in header | Schema is now 3.1.5 | Documentation |
| AUDIT_PLAN.md references tools/check_bridges.py | File doesn't exist (check_bridges.sh references it too) | Broken tooling |

---

## MEDIUM Findings (12)

### M1. ~200 lines of duplicate function definitions in ql_core.js

These functions exist in BOTH `ql_core.js` AND `ql_feat_colorwarnings.js`:
- `ResetColoredHealthbarPanelCache` (ql_core.js:2444, colorwarnings.js:40)
- `EstimateHealthPercentFromBarHeight` (ql_core.js:11434, colorwarnings.js:245)
- `RefreshEnemyColoredHealthPanelCache` (ql_core.js:11445, colorwarnings.js:152)
- `ResolveEnemyColoredHealthTeamColor` (ql_core.js:11397, colorwarnings.js:256)

The ql_core.js copies are dead code — leftover from extraction.

### M2. ~23 truly dead functions in ql_core.js (~400 lines)

Functions with 0 callers anywhere, not exported, not duplicated in feature files:
`BuildComparableStorageConfigObject`, `ClearMinimapCrateOverlayMarkers`, `EnsureBuildClearRequestRuntimeInitialized`, `EnsureBuildClearRequestToken`, `EnsureClearSettingsLoaderStepRows`, `EnsureMinimapCrateOverlay`, `EnsureSaveSettingsLoaderStepRows`, `EnsureSettingsLoaderStepRows`, `GetPanelActualOffsetSafe`, `IsIndicatorSmallDamage`, `IsPlayableHeroId`, `ParseEnemyV2BridgeBool`, `ParseFgHeroSignalValue`, `ResolveMinimapCrateOverlayMapKey`, `ResolvePresetConfigByName`, `ScanPanelTreeForAccountId`, `TickBuildClearRequestRuntime`, `TryFinalizeBuildClearWhenNotPending`, `TryHandleBuildClearCorruptRepairGate`, `TryHandleBuildClearUnavailableRoot`, `TryParseStorageConfigRaw`, `hasAnyClass`, `_MC`

### M3. 17 overridden initial-block presets carry dead data (~400 lines)

The `QOL_PRESETS` initial block defines 79 presets. Then 30 `QOL_PRESETS["name"] = {...}` override blocks follow. Of these, 17 override existing presets — making the initial-block entries dead data. The remaining 13 define new presets. Consolidating the override data into the initial block would eliminate ~400 lines.

### M4. 8 panelCache exports have zero consumers

`getData`, `getList`, `getPanel`, `panelCache`, `panelCacheClear`, `panelCacheResolve`, `panelCacheSweep`, `setData`, `setList`, `setPanel` are exported via `_qolExportDefs` but are **never imported by any feature** via `QOL.import()`. The `panelCacheSweep` and `panelCacheResolve` are also published directly on `QOL.*` and used in `ql_core.js` line 49-50 as sandbox fallbacks, but no feature file uses them.

### M5. 6 feature files have unconditional debug logs on load

`ql_feat_ammo.js`, `ql_feat_bottombar.js`, `ql_feat_damageimpact.js`, `ql_feat_items.js`, `ql_feat_stamina.js`, `ql_feat_topbar.js` all log `[QOL DEBUG] Feature loaded: X` unconditionally on script load. These should be gated behind `Utils.IsDebugEnabled()`.

### M6. `CloneSchemaWithoutFields` is defined but never called

`QOL_COMPACT_SCHEMA_UTILS.CloneSchemaWithoutFields` (line 1277, ~30 lines) has no callers in the entire codebase. It was likely written for a migration scenario that never materialized.

### M7. check_bridges.sh references non-existent check_bridges.py

`panorama/scripts/tools/check_bridges.sh` invokes `python3 tools/check_bridges.py` which does not exist. This is a broken pre-commit safety check.

### M8. Multiple feature files have dead QOL.import() entries

Beyond colorwarnings.js (C5), several features import functions they never use:

| Feature | Dead Import | Reason |
|---------|------------|--------|
| buildload.js:41-42 | `isConnectedToHideout` imported twice | Line 103 reassigns from _deps again |
| combatstatus.js:8-9 | `GetGameplayHudPanel` as `GGHP` | Only `GGHP` alias used, full-name import at line 18 is dead |
| statbonuses.js:8 | `GetGameplayHudPanel` as `GGHP` | `GGHP` never used, only full-name version used |
| unsecuredsouls.js:8 | `GetGameplayHudPanel` as `GGHP` | `GGHP` never used |
| targetshapes.js:6 | `applyTargetShapeStyles`, `resolveUnitTargetStyleTexts` | Both redefined locally in the same file |
| statlocker.js:8 | `GetUIRoot` as `GUIR` | `GUIR` never used |

### M9. topbar.js and rejuvtimers.js import same symbol twice

- `ql_feat_topbar.js`: Imports `resolveCachedPanel` twice (once as `RC` at line 9, once as `ResolveCachedPanel` at line 13)
- `ql_feat_rejuvtimers.js`: Imports `resolveCachedPanel` three times (lines 9-10)

### M10. minimapruntime.js has 5 bare-global references

References `QOL_MINIMAP_CRATE_DATA`, `QOL_UTILS_LOADED`, `QOL_WASH_COLOR_PALETTE`, and `QOL_PANEL_ID_HUD` directly instead of through QOL.import(). This creates invisible coupling — if these globals change names, the feature silently breaks.

### M11. showrank feature accesses State properties without declaring stateKeys

`ql_feat_showrank.js` reads/writes `State._showRankEnabled` and `State.showRankEscapeDone` but the `QOL.register()` call only declares `stateKeys: ["_showRankEnabled", "showRankEscapeDone"]`. These are synthetic state fields added at runtime — they are NOT in the State literal definition in `ql_state.js`. This means they won't be initialized before first use.

### M12. External API dependency in showrank feature

`ql_feat_showrank.js:46` hardcodes `https://api.deadlock-api.com/v1/players/`. This creates an external runtime dependency. If the API is unavailable, the feature silently degrades (catch blocks swallow fetch errors), but the URL is hardcoded with no configuration option.

---

## LOW Findings (8)

### L1. V24 ENABLE_COLORED_HEALTHBAR schema duplicate

Known and documented (line 1021-1026). Costs 2 bits per compact payload. Not fixed for binary compatibility. Correct decision to leave it, but should be noted in a migration plan for a future wire version bump.

### L2. Auto-disable threshold off-by-one

`ExecuteFeature` at line 1543 checks `streak >= FEATURE_ERROR_STREAK_MAX` (10). The streak starts at 0 on first error, so the feature is disabled on the **11th** consecutive failure, not the 10th as documented. Low impact — 1 extra failed tick is negligible.

### L3. Empty batch comments in ql_core.js

Lines 16059-16063 contain "Batch D/E/F" comments with no registrations between them — cosmetic leftovers from extraction.

### L4. 30 debug-log throttle state fields are write-only

Fields like `debugLastSig`, `debugNextMs` across many subsystems in `State` are used only for throttled debug logging. They are written and compared against but never read algorithmically. Could be moved to a `_debug` sub-object or excluded from release builds.

### L5. QOL_COMPACT_SCHEMA_V12 = QOL_COMPACT_SCHEMA_V11

Line 968: Identity assignment (V12 is identical to V11). This costs a schema registry entry with no new fields.

### L6. QOL_COMPACT_SCHEMA_V25 = QOL_COMPACT_SCHEMA_V24

Line 1028: Another identity assignment. Same issue as L5.

### L7. QOL_COMPACT_SCHEMA_V41 = QOL_COMPACT_SCHEMA_V40

Line 1098: Another identity assignment.

### L8. QOL_COMPACT_SCHEMA_V45 = QOL_COMPACT_SCHEMA_V44

Line 1114: Another identity assignment.

**Note on L5-L8:** These identity assignments suggest schema versions were reserved but never received unique fields. They bloat the schema registry without providing value.

---

## Architecture Quality Assessment

### What's Working Well

| Component | Assessment |
|-----------|-----------|
| QOL.import() system | Clean, defensive, useful error messages. 34/35 features use it correctly. |
| QOL.register() API | Fully matches documented API. Idempotent, guardrailed inputs. |
| Feature dispatch loop | Robust per-feature try/catch + auto-disable. Top-level try/finally ensures loop never dies. |
| Bridge export system (_qolExportDefs) | 178 symbols, data-driven, lazy-evaluated. No actual missing exports. |
| Panel cache system (PanelCache) | Clean typed API, backward-compat dual-write. Correctly unused by feature files (they use legacy GetCachedPanel). |
| Schema versioning | Incremental concat chain from V2 to V60+. Documented known issues. |
| State object design | ~370 well-organized fields with clear subsystem prefixes. |
| Preset system | 92 presets, all keys valid. 252 unique config keys covered. |

### What Needs Work (Priority Order)

1. **Error handling** — Convert silent catch blocks to SafeLog wrappers. Start with the 222 silent blocks in feature files (lower risk, isolated blast radius).
2. **ShowRank normalization** — Refactor to standard pattern before merge.
3. **ql_hero_testing.js hardening** — Add IIFE, context guard, "use strict", and error logging.
4. **ql_settings.js modernization** — Extract localization data, migrate to QOL.import(), extract arcade games.
5. **ql_core.js continued extraction** — Remove ~600 lines of dead/duplicate code. Extract healthbar subsystems and compass/minimap logic.
6. **Per-tick allocation reduction** — Pre-allocate loopSnapshot, pre-compute feature dispatch wrappers.
7. **CLAUDE.md update** — Fix outdated line counts, feature counts, schema version, and catch block estimates.
8. **`const` → `var` consistency** — Audit whether `const` works correctly in the Panorama engine. If yes, update the convention. If no, convert back to `var`.

---

## Metrics Summary

| Metric | Value |
|--------|-------|
| Total .js files analyzed | 42 |
| Total lines of JS | ~85,000 |
| Feature files | 35 (34 documented + 1 new) |
| Presets | 92 (confirmed) |
| Schema versions | 60+ (V2 → V60+) |
| Schema keys | 298 unique |
| Default config keys | 297 (2 missing) |
| QOL namespace exports | 178 from ql_core.js + ~20 from infra files |
| Total catch blocks | 700 |
| Silent catch blocks | 677 (96.7%) |
| Dead functions in ql_core.js | ~23 (~400 lines) |
| Duplicate functions (core↔feature) | 4 (~200 lines) |
| Dead preset data | ~400 lines (17 overridden entries) |
| Unprotected panel ops in features | 446 |
| Per-second allocations at 5Hz | ~100 closures + ~45 objects |
| `const` declarations (total) | ~200 |
| External API dependency | 1 (api.deadlock-api.com) |
| Broken tooling scripts | 1 (check_bridges.sh → missing .py) |
