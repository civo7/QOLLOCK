# QOLLOCK Comprehensive Audit Report

**Date:** 2026-06-09
**Scope:** Full codebase — 18,436-line ql_core.js, 34 feature files, ql_utils.js, ql_shared_presets.js, CSS
**Methodology:** Static analysis, cross-reference analysis, pattern matching, manual review of hot paths

---

## Executive Summary

| Category | CRITICAL | HIGH | MEDIUM | LOW | TOTAL |
|----------|----------|------|--------|-----|-------|
| Dead Code | 0 | 5 | 8 | 5 | 18 |
| Code Smells | 0 | 8 | 12 | 6 | 26 |
| Bridge/Import | 2 | 5 | 3 | 4 | 14 |
| Feature Consistency | 0 | 4 | 10 | 2 | 16 |
| CSS Issues | 0 | 1 | 3 | 4 | 8 |
| Performance | 0 | 4 | 7 | 3 | 14 |
| Robustness | 1 | 5 | 6 | 2 | 14 |

---

## 1. CRITICAL Findings

### C1. `SafeSetAttribute` converts value=0 to empty string
- **File:** `panorama/scripts/ql_utils.js:42`
- **What:** `String(value || "")` — when `value=0`, `0 || ""` evaluates to `""`, so `String("")` = `""` instead of `"0"`. This means setting an attribute to `0` silently writes an empty string.
- **Impact:** Any code path that calls `SafeSetAttribute(panel, attr, 0)` will write `""` instead of `"0"`. Given `SafeSetAttribute` is exported to `QOL_UTILS` and is the recommended safe wrapper, this is a correctness bug that could affect any feature.
- **Fix:** Change to `String(value != null ? value : "")` or `String(value === undefined || value === null ? "" : value)`

### C2. `buildbridge.js` bypasses the module system entirely
- **File:** `panorama/scripts/ql_features/ql_feat_buildbridge.js:1-244`
- **What:** Has NO `QOL.import()` call. Uses bare `State.` (18 instances) and bare `QOL.*` (20 instances). It also directly writes to `QOL.*` namespace properties (lines 204-213), making it both a consumer AND a provider outside the bridge mechanism.
- **Impact:** If `ql_feat_buildbridge.js` loads before `ql_core.js` populates the QOL namespace, `QOL.*` lookups may be `undefined`. If any symbol is missing, there's no diagnostic — no `[BRIDGE] missing N dependency(s)` log.
- **Fix:** Add `QOL.import()` call with all needed symbols, destructure them, or document clearly why the bypass is required.

---

## 2. HIGH Severity Findings

### H1. 5 dead utility functions in ql_utils.js
- **File:** `panorama/scripts/ql_utils.js`
- **What:** `SafeLog` (line 420), `ValidateConfigHealth` (line 141), `PanelHasClass` (line 338), `SafeArray` (line 346), `LogError` (line 100) are NEVER called by any file in the codebase. They are exported to `QOL_UTILS` but have zero consumers.
- **Impact:** Dead code adds maintenance burden and confusion. `SafeLog` is particularly notable because CLAUDE.md documents it as a "NEW" utility.
- **Fix:** Remove from exports or document as public API for external consumers.

### H2. `PerfNowMs` defined 4 times with different implementations
- **Files:** `ql_utils.js:120`, `ql_core.js:2386`, `ql_feat_minimapruntime.js:305`, `ql_feat_damagenumbers.js:61`
- **What:** `ql_utils.js` uses `Date.now()`. `ql_core.js` uses `Game.Time()`. Two feature files define their own copies. Different time origins (`Date.now()` = wall-clock, `Game.Time()` = engine-relative) mean profiling data from different sources are incompatible.
- **Impact:** `TimeFeature()` and `RecordFrameTime()` may receive start times from one clock and measure elapsed with another, producing garbage timing data.
- **Fix:** Standardize on one implementation. Export `PerfNowMs` from `QOL.import()` consistently.

### H3. `buildload.js` imports `state`→`S` but never uses `S.` (351 direct `State.` refs)
- **File:** `panorama/scripts/ql_features/ql_feat_buildload.js`
- **What:** `var S = _deps.state;` (line 22) then `var State = S;` (line 22). All 351 state accesses use bare `State.` instead of `S.`. The import is dead code.
- **Impact:** Confusion — code implies module system usage but doesn't follow pattern. If `QOL.state` were ever removed/changed, this file would silently continue working via the bare `State` global while other files that properly use `S.` would break — creating inconsistent failure modes.
- **Fix:** Either remove the `S` assignment (keep `State` via bare global by design) or convert to `S.` consistently.

### H4. `buildsave.js` same pattern as buildload.js (204 direct `State.` refs)
- **File:** `panorama/scripts/ql_features/ql_feat_buildsave.js`
- **What:** `var S = _deps.state;` then `var State = S;`. All 204 state accesses use bare `State.`.
- **Fix:** Same as H3.

### H5. `targetshapes.js` uses `State.` 31 times, `S.` only 2 times
- **File:** `panorama/scripts/ql_features/ql_feat_targetshapes.js`
- **What:** Imports `state`→`S` but primarily uses bare `State.` (31 refs). Only uses `S.` in 2 places (both for `S.lastResolvedGates`).
- **Fix:** Convert all `State.` refs to `S.` for consistency.

### H6. 14 feature files lack self-tests
- **What:** Phase 2a/2b extractions (ammo, bottombar, damageimpact, items, souls, stamina, topbar, chatimg, combatstatus, keyboard, mousecursor, sigflash, statbonuses, unsecuredsouls) have no self-test section.
- **Impact:** If a function name typo survives extraction, it won't be caught until the feature runs at runtime and crashes.
- **Fix:** Add self-test blocks checking the main update function exists.

### H7. `colorwarnings.js` self-test only checks 1 of 3 update functions
- **File:** `panorama/scripts/ql_features/ql_feat_colorwarnings.js:799-803`
- **What:** Tests `UpdateColoredHealthbarRuntime` but not `UpdateEnemyColoredHealthRuntime` or `UpdateAllyColoredHealthRuntime`.
- **Fix:** Add checks for all 3 update functions.

### H8. `colorwarnings.js` uses hardcoded feature names in error messages
- **File:** `panorama/scripts/ql_features/ql_feat_colorwarnings.js:746,768,790`
- **What:** Error format uses `[QOLLock][ERROR][colorWarning]`, `[enemyColorWarning]`, `[allyColorWarning]` instead of `[_dk]` (`ql_feat_colorwarnings`).
- **Impact:** Errors from this file are attributed to 3 different names, causing confusion in diagnostics.
- **Fix:** Use `_dk` consistently in error messages.

### H9. Diagnostic write to Hud panel swallows errors
- **File:** `panorama/scripts/ql_core.js:18036`
- **What:** `try { ... _diagHud.SetAttributeString("QOL_Diag", JSON.stringify(_diag)); ... } catch(e) {}` — silent catch.
- **Impact:** If diagnostic serialization fails (e.g., circular reference in state), the failure is invisible. Settings UI shows stale diagnostics.
- **Fix:** Log at WARN level with throttling.

---

## 3. MEDIUM Severity Findings

### M1. 37+ dead QOL bridge exports
- **File:** `panorama/scripts/ql_core.js` (`_qolExportDefs` array)
- **What:** Exports in the QOL namespace with zero consumers (no `QOL.import()` or direct `QOL.X()` usage): `createLoaderOverlay`, `queueBuildSaveRequestFromLoader`, `resetBuildClearRequestAttributes`, `resetBuildClearRuntimeState`, `resetBuildLoaderForTempDisable`, `saveSettingsLoaderEnabled`, `setStartupCorruptRepairPending`, `settingsLoaderBuildProbeSnapshot`, `settingsLoaderDebugLog`, `settingsLoaderTraceLogThrottled`, `statBonusesAbilityCooldownIds`, `stepCorruptRepairClearStorageBuilds`, `suppressStartupLoaderForSession`, `traceSettingsLoaderProbeHeartbeat`, `tryCloseBrowseBuildsPopupForLoader`, `tryDismissBuildDeletePopup`, `tryReadAccountIdFromKnownPartyPath`, `tryReadBuildSaveStorageHeroFromSettings`, `tryReadSelectedHeroIncludingStorageFromCommandPanels`, `trySelectFirstStorageBuildEntry`, `trySelectNextStorageBuildEntry`, `writeStorageConfigRawToUi`, and ~15 more loader-domain functions.
- **Impact:** 172 bridge entries exist, but only ~94 are imported via `QOL.import()`. The remaining ~78 are either used via direct `QOL.X()` access or are dead. The bridge is 45% larger than needed.
- **Fix:** Remove truly dead exports. Consider a separate internal namespace for loader-domain functions.

### M2. `SetPanelVisibility` does not validate panel
- **File:** `panorama/scripts/ql_utils.js:354`
- **What:** Checks `!panel || !panel.style` but not `IsPanelValid(panel)`. A stale panel handle with truthy `.style` could pass validation and crash on `.style.visibility =`.
- **Fix:** Add `IsPanelValid(panel)` check.

### M3. `SetStyleSafe`, `ClearStyleSafe`, `SetPanelOpacitySafe` same pattern
- **File:** `panorama/scripts/ql_utils.js:252,263,275`
- **What:** All check `!panel || !panel.style` but not `IsPanelValid`. Same stale-handle risk as M2.
- **Fix:** Consider adding `IsPanelValid` check or document why it's intentionally omitted (performance).

### M4. 8 feature files have leftover `$.Msg("[QOL DEBUG] ...")` calls
- **Files:** ammo, bottombar, damageimpact, items, souls, stamina, topbar, colorwarnings
- **What:** Debug `$.Msg` calls from Phase 2 extraction were never removed. They fire on EVERY tick when debug mode is off.
- **Impact:** Mild console spam. The `$.Msg` calls are throttled by the engine, but they still add unnecessary overhead.
- **Fix:** Remove the debug `$.Msg` calls.

### M5. `FEATURE_DISPATCH_ORDER` and related maps re-allocated every tick
- **File:** `panorama/scripts/ql_core.js:17860-17907`
- **What:** `FEATURE_DISPATCH_ORDER` (31-element array), `FEATURE_PERF_MAP` (9-entry object), `FEATURE_GATE_MAP` (1-entry object), `FEATURE_REQUIRES_ROOT` (2-entry object) are created inside `loop()` and re-created every 200ms (5Hz).
- **Impact:** ~44 allocations per tick = ~220 allocations/sec. On a ~16ms frame budget this is negligible, but it's unnecessary GC pressure.
- **Fix:** Move these to module scope (outside `loop()`).

### M6. `_buckets` array (8 empty sub-arrays) re-created every tick
- **File:** `panorama/scripts/ql_core.js:17855`
- **What:** `var _buckets = [[], [], [], [], [], [], [], []];` allocated every 200ms.
- **Fix:** Pre-allocate at module scope and `.length = 0` each tick.

### M7. Silent catch blocks that should log
- **Files:** `ql_core.js:18036` (diagnostic write), `ql_core.js:5904,5987,12068,15044` (panel style operations), `ql_feat_buildbridge.js:56` (QOL namespace population)
- **What:** Several `catch(e) {}` blocks swallow errors completely. While some are intentional (panel deleted mid-frame), others should at least DEBUG-log.
- **Fix:** Add `QOL_DEBUG` logging for non-performance-critical catch sites.

### M8. `ProfileHit` / `DumpProfile` comments claim 60s rolling window but implement 10s reset
- **File:** `panorama/scripts/ql_utils.js:480-529`
- **What:** Comment says "rolling 60s window" but `DumpProfile` resets `_profilerHits = {}` every 10s. No timestamps on counter entries.
- **Fix:** Either implement rolling window or update comments.

### M9. `NormalizeDegrees360` has dead code
- **File:** `panorama/scripts/ql_utils.js:216-225`
- **What:** After `out = rawDeg % 360`, the result is always in `[0, 360)`. The `if (out >= 360) out -= 360;` guard can never trigger for finite inputs.
- **Fix:** Remove the dead guard, or keep with comment explaining it catches NaN/Infinity edge cases.

### M10. `_log` throttle key includes `"undefined"` when category is omitted
- **File:** `panorama/scripts/ql_utils.js:369`
- **What:** `var key = level + "_" + category;` — if `category` is `undefined`, key becomes `"INFO_undefined"`, merging throttles for all calls missing category.
- **Fix:** Default category to `"general"` or similar.

### M11. `minimapruntime.js` and `damagenumbers.js` use `QOL_UTILS` directly
- **Files:** `ql_feat_minimapruntime.js:290`, `ql_feat_damagenumbers.js:49`
- **What:** Feature files bypass the `U.` alias and call `QOL_UTILS.IsPanelListValid()` directly. This is inconsistent with the rest of the codebase.
- **Fix:** Use `U.IsPanelListValid()` through the existing `U` alias.

### M12. `minimapruntime.js` and `colorwarnings.js` use `GetCachedPanel()`/`SetCachedPanel()` instead of `GC()`/`SC()`
- **Files:** `ql_feat_minimapruntime.js` (4x each), `ql_feat_colorwarnings.js`, `ql_feat_buildload.js` (2x each)
- **What:** These files imported `getCachedPanel`/`setCachedPanel` and assigned to `GC`/`SC` but sometimes use the full names directly.
- **Fix:** Use `GC()` and `SC()` consistently.

### M13. `buildload.js` gate returns `true` always (empty update)
- **File:** `panorama/scripts/ql_features/ql_feat_buildload.js` (QOL.register call)
- **What:** `gate: function(cfg) { return true; }` with `configKeys: []` and an empty update function body. This feature runs EVERY tick just to return immediately.
- **Impact:** Dispatch overhead every tick for a no-op feature.
- **Fix:** Either remove from `FEATURE_DISPATCH_ORDER` or give it a proper gate.

---

## 4. LOW Severity Findings

### L1. Self-test error format inconsistency (3 variants)
- **What:** `buildbridge`, `buildload`, `buildsave` use `"self-test: " + e.message`. The other 18 files with self-tests use `"self-test failed: " + (e && e.message ? e.message : String(e))`.
- **Fix:** Standardize on one format.

### L2. `FEATURE_REQUIRES_ROOT` only has 2 entries
- **File:** `panorama/scripts/ql_core.js:17904-17907`
- **What:** This map is created every tick with just `coreRoot` and `healthbarRuntimeHelpers`. The overhead is trivial, but the pattern is inconsistent — the check could be on the feature descriptor.
- **Fix:** Move to feature descriptor or inline the check.

### L3. Multiple style property overwrites in CSS
- **What:** `klutz_healthbar_active .bars_container` (line ~1394) has `padding`, `width`, and `horizontal-align` declared 2-3 times each with different values.
- **Fix:** Clean up redundant property declarations.

### L4. `_TLog` trace function defined but only used in a few places
- **File:** `panorama/scripts/ql_core.js:25-27`
- **What:** Bare global `_TLog` wraps `$.Msg` in try/catch. Only referenced in a few old code paths.
- **Fix:** Consider removing if unused.

### L5. `FEATURE_GATE_MAP` only has 1 entry
- **File:** `panorama/scripts/ql_core.js:17899-17901`
- **What:** Single entry mapping `unsecuredSoulsTimer` → `unsecuredSouls`. Could be handled differently.
- **Fix:** Consider renaming the feature or the gate to avoid the need for the map.

### L6. Minor comment inaccuracies
- **What:** `ql_core.js:2` says "~31k lines" but file is 18,436 lines.
- **Fix:** Update line count comment.

### L7. CLAUDE.md says 30 feature files but there are 34
- **Fix:** Update CLAUDE.md count.

### L8. 2 `QLegacyCooldowns` files in `panorama/scripts/` root
- **What:** `ql_legacy_cooldowns.js` exists in `panorama/scripts/` (not `ql_features/`). Contains 3 silent catches.
- **Fix:** Either extract to feature file or remove if dead.

---

## 5. CSS Findings (from 98-file audit)

### CSS1. `hud_health.css` has 5 near-identical copies of healthbar theme CSS
- **File:** `panorama/styles/hud_health.css` (1906 lines)
- **What:** The colored, minimalist, budhud, FG, and klutz healthbar themes have near-identical rule blocks replicated 5 times. Any change must be made in 5 places.
- **Fix:** Consider CSS @define tokens or a preprocessor to reduce duplication.

### CSS2. 3 pairs of conflicting `visibility: visible; visibility: collapse;` in same rule
- **File:** `panorama/styles/hud_health.css:200-203`, `:1334-1337`, `panorama/styles/hud_quickbuy.css:841-843`
- **What:** Same selector declares `visibility: visible` then immediately overrides with `visibility: collapse`. The `visible` declaration is dead code.
- **Fix:** Remove the dead `visibility: visible` line.

### CSS3. 33 unreferenced @keyframes animations
- **Files:** Various CSS files
- **What:** 33 keyframe animations defined but never referenced by any `animation-name` in the codebase. 18 are in `qol_damage_fountain_full.css` (deliberate alias pattern but still dead concrete variants).
- **Fix:** Remove truly unreferenced keyframes (~15 that aren't part of the fountain alias pattern).

### CSS4. `hud_health.css` has back-to-back conflicting properties (e.g., `background-color` set 3 times)
- **File:** `panorama/styles/hud_health.css:568-572`
- **What:** `#health_bar .ProgressBarLeft` sets `background-color: colorLocalHealthbar`, then `#00FF99`, then `#FFEFD7`. Only the last one takes effect.
- **Fix:** Remove dead intermediate values.

### CSS5. `text-overflow: shrink` used without `white-space: nowrap` in ~15 locations
- **Files:** `citadel_hud_top_bar.css`, `hero_testing_menu.css`, `hud_ability_icon_active.css`
- **What:** `text-overflow: shrink` requires `white-space: nowrap` to function. Without it, text wraps normally and shrink never engages.
- **Fix:** Add `white-space: nowrap` or remove `text-overflow: shrink`.

### CSS6. Many hardcoded hex colors where QOL tokens should be used
- **File:** `panorama/styles/hud_health.css` (many locations)
- **What:** Hardcoded `#cc340a`, `#f6805f`, `#00D37F`, `#fa6969`, `#FFE3DB` etc. used instead of `QOL_HEALTHBAR_LOW_BRIGHT` and other tokens.
- **Fix:** Replace with QOL design tokens from `qollock_defines.css`.

### CSS7. `qol_damage_fountain_full.css` is 6,880 lines with only 6 comment lines
- **Fix:** Add section headers. Consider splitting by damage category.

## 6. Performance Hot Path Findings

### P1. Gate signature string recomputed every tick when inputs change
- **File:** `panorama/scripts/ql_core.js:17370-17458`
- **What:** `BuildRuntimeGateSignature` joins ~90 config values with `|`. When config changes, this runs every 200ms.
- **Impact:** ~90 `cfg.X` reads + string concat. Each read is a property lookup. The resulting string is used for cache comparison. Acceptable for 5Hz.
- **Verdict:** Not a bottleneck, but could be optimized with a simpler hash.

### P2. Only 2 of 34 features use `PerfStart`/`PerfEnd` instrumentation
- **What:** `damagenumbers.js` and `combatstatus.js` are the only feature files with performance instrumentation.
- **Impact:** Hot-path profiling is blind to 32 of 34 features. If a feature becomes slow, there's no per-feature timing data.
- **Fix:** Add `PerfStart`/`PerfEnd` to top-10 most expensive features (rejuvTimers, minimapRuntime, colorwarnings, etc.).

### P3. `colorwarnings.js` is 805 lines — largest single feature file
- **What:** Contains 3 features (colorWarning, enemyColorWarning, allyColorWarning) in one file. The main update functions do `FindChildrenWithClassTraverse` on every tick.
- **Fix:** Consider splitting into separate files. Add PerfStart/PerfEnd instrumentation.

### P4. `FindChildTraverse` used without caching in several hot paths
- **Files:** `ql_feat_betterunsecuredhud.js` (8+ calls per tick), `ql_feat_spm.js`, `ql_feat_mousecursor.js`
- **What:** Tree traversal without result caching on every tick. Some results are cached via `GC()`/`SC()` but not all.
- **Impact:** `FindChildTraverse` walks the full panel tree — expensive at 5Hz.
- **Fix:** Add caching for stable panel lookups.

### P5. `ReadStorageConfigRawFromUi` calls `FindChildTraverse(PANEL_ID_HUD)` every tick uncached
- **File:** `panorama/scripts/ql_core.js:3226`
- **What:** The HUD panel lookup for config reading is NOT cached via `GetCachedPanel`/`ResolveCachedPanel`. It runs every tick at the start of `loop()`.
- **Impact:** One full tree walk per tick. The HUD panel is stable — should be cached.
- **Fix:** Use `ResolveCachedPanel(root, "cachedHudConfigPanel", PANEL_ID_HUD)`.

### P6. `Game.GetMapInfo()` called every tick in `isConnectedToHideout`
- **File:** `panorama/scripts/ql_core.js:5901`
- **What:** `Game.GetMapInfo().map_display_name` is queried every 200ms via try/catch. The map name never changes during a session. This crosses the JS→C++ boundary.
- **Fix:** Cache the result once per session.

### P7. `"loop." + _fname` string concatenation for perf labels 25×/tick
- **File:** `panorama/scripts/ql_core.js:17932`
- **What:** For the 25 features not in `FEATURE_PERF_MAP`, `_perfName` is computed as `"loop." + _fname` every tick.
- **Fix:** Pre-compute `_perfName` into `QOL_FEATURE_REGISTRY[_fname].perfName` at registration time.

### P8. `NeedsCoreRootDynamicRuntimeWorkFromState` re-evaluates ~10 State properties every tick
- **File:** `panorama/scripts/ql_core.js:17332-17367`
- **What:** Reads ~10 `State.*` properties even when none have changed.
- **Fix:** Consolidate into a single cached boolean updated on state transitions.

### P9. `RuntimeSchedulerGetStore()` re-validates `typeof store !== "object"` every call
- **File:** `panorama/scripts/ql_core.js:2340`
- **What:** After first initialization, the store is always an object. The typeof check is wasted work.
- **Fix:** Cache a direct reference after first initialization.

---

## 6. Robustness Findings

### R1. Panel `.style.` assignments without try/catch in feature files
- **Files:** `ql_feat_betterunsecuredhud.js` (lines 212-299, 10+ direct `.style.` assignments), `ql_feat_souls.js`, `ql_feat_damageimpact.js`, `ql_feat_mousecursor.js`, `ql_feat_statbonuses.js`
- **What:** Direct `panel.style.x = ...` without try/catch inside the feature update function. The outer `ExecuteFeature` catches the error, but a single bad panel reference will increment the error streak counter toward auto-disable.
- **Fix:** Wrap in try/catch or use `SetStyleSafe`.

### R2. `buildsave.js` has unguarded `root.SetAttributeString()` calls
- **File:** `panorama/scripts/ql_features/ql_feat_buildsave.js:91-94`
- **What:** 4 direct `root.SetAttributeString(...)` calls without try/catch and without using `SafeSetAttribute`.
- **Fix:** Use `SafeSetAttribute` or wrap in try/catch.

### R3. No null check on `root` before `FindChildTraverse` in `loop()` hard-gate path
- **File:** `panorama/scripts/ql_core.js:17813-17824`
- **What:** The hard-gate shortcut (all features disabled) checks `root` as part of `isConnectedToHideout(root)` but the gate comparison checks `raw === State.lastRawConfig` — if `raw` came from a null `root`, this could be `undefined === ""` which is false, causing unnecessary gate computation.
- **Fix:** Add explicit null root check before early return.

### R4. `State.cachedPanels` can grow unbounded
- **File:** `panorama/scripts/ql_core.js`
- **What:** `SetCachedPanel` sets entries in `State.cachedPanels` but `SweepStalePanelCache` only nulls invalid entries (doesn't delete them). Over long sessions, the cache keys accumulate.
- **Fix:** Delete stale keys instead of setting to null, or add periodic key cleanup.

### R5. `State.allFeaturesDisabled` hard-gate doesn't check all pending work
- **File:** `panorama/scripts/ql_core.js:17813-17824`
- **What:** Checks `raw === State.lastRawConfig` but misses other state changes that might need work (e.g., `State.customMouseCursor*`, `State.fgHeroImage*`).
- **Impact:** Some features may fail to run when needed if all config-gated features are disabled.
- **Fix:** Review hard-gate conditions for completeness.

### R6. `isConnectedToHideout` try/catch on `Game.GetMapInfo()` per tick
- **File:** `panorama/scripts/ql_core.js:5901`
- **What:** `Game.GetMapInfo()` wrapped in try/catch unconditionally every tick. The try/catch itself has overhead even when the C++ call succeeds.
- **Fix:** Cache result once and skip try/catch on subsequent calls.

---

## 7. Prioritized Execution Plan

### Phase A: Immediate Fixes (0.5 day, zero risk)

| # | Issue | Effort | Risk |
|---|-------|--------|------|
| A1 | Fix `SafeSetAttribute` value=0 bug (C1) | 5 min | None |
| A2 | Remove leftover debug `$.Msg` calls from 8 feature files (M4) | 15 min | None |
| A3 | Remove `_TLog` bare global or make it DEBUG-only (L4) | 5 min | None |
| A4 | Fix `NormalizeDegrees360` dead code comment (M9) | 5 min | None |
| A5 | Fix `_log` undefined category key (M10) | 5 min | None |
| A6 | Update CLAUDE.md line count and feature file count (L6, L7) | 5 min | None |

### Phase B: Code Quality Cleanup (1 day, low risk)

| # | Issue | Effort | Risk |
|---|-------|--------|------|
| B1 | Remove 5 dead utility functions from ql_utils.js exports (H1) | 15 min | Low |
| B2 | Remove 37+ dead QOL bridge exports (M1) | 30 min | Low — verify zero consumers |
| B3 | Standardize `PerfNowMs` to single implementation (H2) | 1 hr | Medium — test timing |
| B4 | Fix silent catch blocks — add DEBUG logging to 6+ sites (M7) | 30 min | None |
| B5 | Add `IsPanelValid` to `SetPanelVisibility` and style setters (M2, M3) | 15 min | Low |
| B6 | Move `FEATURE_DISPATCH_ORDER` etc. to module scope (M5, M6) | 20 min | Low |
| B7 | Fix feature files using `QOL_UTILS` directly (M11) | 10 min | None |
| B8 | Fix `GetCachedPanel`/`SetCachedPanel` direct usage in feature files (M12) | 15 min | None |
| B9 | Cache HUD panel in `ReadStorageConfigRawFromUi` (P5) | 10 min | Low |
| B10 | Cache `Game.GetMapInfo()` result per session (P6, R6) | 10 min | Low |
| B11 | Pre-compute `_perfName` into feature registry (P7) | 15 min | Low |
| B12 | Cache `RuntimeSchedulerGetStore()` reference (P9) | 5 min | None |

### Phase C: Feature File Consistency (1-2 days, low-medium risk)

| # | Issue | Effort | Risk |
|---|-------|--------|------|
| C1 | Add self-tests to 14 Phase 2a/2b feature files (H6) | 2 hr | None |
| C2 | Add missing update function checks to colorwarnings self-test (H7) | 10 min | None |
| C3 | Fix colorwarnings error format to use `_dk` (H8) | 10 min | None |
| C4 | Standardize self-test format to one pattern (L1) | 30 min | None |
| C5 | Fix `targetshapes.js` `State.` → `S.` migration (H5) | 20 min | Low — verify behavior |
| C6 | Fix `buildload.js` and `buildsave.js` `State.` → `S.` or document exemption (H3, H4) | 1 hr | Medium — large files |
| C7 | Add `QOL.import()` to `buildbridge.js` or document exemption (C2) | 30 min | Medium — load order sensitive |
| C8 | Add `PerfStart`/`PerfEnd` to top-10 heaviest features (P2) | 1 hr | None |
| C9 | Add panel lookup caching in hot paths (P4) | 1 hr | Low |

### Phase D: Robustness Hardening (1 day, medium risk)

| # | Issue | Effort | Risk |
|---|-------|--------|------|
| D1 | Wrap unguarded `.style.` assignments in try/catch or use wrappers (R1) | 1 hr | Low |
| D2 | Use `SafeSetAttribute` in `buildsave.js` (R2) | 15 min | None |
| D3 | Fix hard-gate null root check (R3) | 10 min | Low |
| D4 | Fix `State.cachedPanels` unbounded growth (R4) | 15 min | Low |
| D5 | Review hard-gate completeness (R5) | 1 hr | Medium |
| D6 | Clean up klutz CSS duplicate properties (L3) | 30 min | Low |
| D7 | Audit `ql_legacy_cooldowns.js` — extract or remove (L8) | 30 min | Low |

### Phase E: Architectural Improvements (2-3 days, higher risk)

| # | Issue | Effort | Risk |
|---|-------|--------|------|
| E1 | Split `colorwarnings.js` into 3 separate feature files (P3) | 2 hr | High — 3 features tightly coupled |
| E2 | Create internal loader-domain namespace for 37+ bridge functions (M1 follow-up) | 3 hr | Medium |
| E3 | Convert `buildload`/`buildsave`/`buildbridge` to consistent `S.` pattern (C6, C7 follow-up) | 3 hr | High — heavy testing needed |
| E4 | Extract `ql_legacy_cooldowns.js` to feature file | 1 hr | Medium |
| E5 | Fix `ProfileHit` rolling window or update comments (M8) | 30 min | None |

---

## 8. Estimated Totals

| Phase | Issues | Est. Effort | Risk |
|-------|--------|-------------|------|
| A: Immediate | 6 | 0.5 day | Zero |
| B: Quality | 12 | 1 day | Low |
| C: Consistency | 9 | 1-2 days | Low-Medium |
| D: Robustness | 8 | 1 day | Medium |
| E: Architectural | 5 | 2-3 days | Higher |
| **TOTAL** | **40** | **5-8 days** | |

---

## 9. What's Working Well

- **Feature dispatch loop** is well-structured with caching, idle degradation, and staggered execution
- **ExecuteFeature** error isolation with 10-streak auto-disable is robust
- **QOL.import()** module system is sound and used by 33/34 feature files
- **Gate signature caching** (`ShouldReuseRuntimeGateSignature`) avoids expensive recomputation
- **Diagnostic bridge** (`QOL_Diag` attribute) enables cross-context debugging
- **All 34 feature files** have `'use strict'` and `_dk` diagnostic keys
- **Hard-gate optimization** (`State.allFeaturesDisabled`) correctly skips work when nothing is active
- **Throttled logging** prevents console spam in hot paths
