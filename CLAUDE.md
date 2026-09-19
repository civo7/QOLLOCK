# QOLLOCK — AI Onboarding Guide

## Project Overview

QOLLOCK is a Deadlock (Source 2 Panorama engine) mod that customizes the in-game HUD.
It runs in two JavaScript contexts — HUD (in-game panels) and Settings (settings UI) —
and communicates between them via panel attribute bridges.

**Version:** 4.0.0  
**Schema:** 4.0.0 (wire version 2 — unchanged since 2.0.1)  
**Features:** 31/38 FeatureRegistry manifests wired, 5 cut over, 37 old features, 94 presets  
**Branch:** `full-rewrite`  
**Primary File:** `panorama/scripts/ql_core.js` (~14.7K lines after Phase 10 wiring)

## Prerequisites

- **Panorama Knowledge Base:** Clone to `/home/bytenode/Documents/DeadlockModMaking/panorama-knowledge-base/`.
  The KB is a separate repo that documents Source 2 Panorama engine behavior (CSS properties, JS APIs,
  XML panel types). Skills that reference the KB (`audit`, `plan`, `review`, `fix`) use absolute paths
  to this location.
- **Node.js:** Required for the smoke test (`tools/qollock_smoke_test.js`).
- **Git hooks:** Run `bash setup-hooks.sh` once after cloning to install the pre-commit hook
  (bridge checker → import validator → smoke test).

## File Map

```
panorama/
├── layout/hud.xml                          # <include> entries for all scripts
├── styles/                                 # CSS files (citadel_hud_top_bar.css, etc.)
└── scripts/
    ├── ql_utils.js                         # Pure utilities, logging, panel safety wrappers
    ├── ql_shared_presets.js                # QOL namespace, QOL.import(), 79 presets, diagnostics
    ├── ql_bridge.js                        # Typed cross-context channel descriptors, safe read/write (~150 lines)
    ├── ql_state.js                         # State singleton, panel cache accessors (~770 lines)
    ├── ql_panelcache.js                    # Typed panel caches (panels/lists/data), backward-compat dual-write (~170 lines)
    ├── ql_config.js                        # Config merge, normalize, parse, migration (328 lines)
    ├── ql_core.js                          # Main runtime — boot sequence, dispatch loop, non-extracted code
    ├── ql_settings.js                      # Settings UI (not yet using QOL.import())
    ├── ql_perf_overlay.js                  # Performance overlay (not yet using QOL.import())
    ├── ql_hero_testing.js                  # Hero testing tools
    ├── ql_recent_purchases_data.js         # Static data for recent purchases
    ├── ql_minimap_crate_data.js            # Static data for minimap crates
    ├── core/                                  # Phase 1: New infrastructure (8 modules)
    │   ├── ql_namespace.js                   # QOL.core/ui/features/adapters buckets
    │   ├── ql_logger.js                      # Structured logging + ring buffer
    │   ├── ql_event_bus.js                   # Pub/sub with error isolation
    │   ├── ql_scheduler.js                   # createPollLoop with perf tracking
    │   ├── ql_panel_helpers.js               # isPanelAlive, findHud, syncStyles
    │   ├── ql_config_store.js                # Schema-driven typed config
    │   ├── ql_config_adapter.js              # Old flat ↔ new schema bridge
    │   ├── ql_feature_registry.js             # FeatureRegistry.register/boot/shutdown
    │   ├── ql_manifest_tests.js               # Manifest test() runner + diagnostic bridge
    │   └── ql_app.js                         # Boot sequence, config polling bridge
    ├── manifests/                             # Phase 9: New FeatureRegistry manifests
    │   ├── ql_cast_failed_hint/manifest.js   # (wired + tested in-game)
    │   ├── ql_mouse_cursor/manifest.js       # (wired)
    │   ├── ql_statlocker/manifest.js         # (wired)
    │   ├── ql_nicknames/manifest.js          # (wired)
    │   ├── ql_unspent/manifest.js            # (wired)
    │   └── ... (33 more manifest directories)
    ├── features/                             # Old system: 39 QOL.register() feature files
    │   ├── ql_feat_ammo.js
    │   ├── ql_feat_betterunsecuredhud.js
    │   ├── ql_feat_bottombar.js
    │   ├── ql_feat_buildbridge.js          # Build bridge helpers (loads BEFORE ql_core.js)
    │   ├── ql_feat_buildload.js            # Build category payload load (config restore)
    │   ├── ql_feat_buildsave.js            # Build category payload save (config persist)
    │   ├── ql_feat_chatimg.js
    │   ├── ql_feat_colorwarnings.js       # Registers 3 features (colorWarning, enemyColorWarning, allyColorWarning)
    │   ├── ql_feat_combatstatus.js
    │   ├── ql_feat_damageimpact.js
    │   ├── ql_feat_damagenumbers.js
    │   ├── ql_feat_heroshop.js
    │   ├── ql_feat_items.js
    │   ├── ql_feat_keyboard.js
    │   ├── ql_feat_lanewithparty.js
    │   ├── ql_feat_legacyaudiopassive.js  # Announcer buffs, DL4D timers, passive cooldown HUD
    │   ├── ql_feat_minimapruntime.js
    │   ├── ql_feat_mousecursor.js
    │   ├── ql_feat_nicknames.js           # Top bar player nicknames
    │   ├── ql_feat_ondeatharcade.js
    │   ├── ql_feat_panelcache.js          # Panel cache lazy priming (always-gated, on-demand)
    │   ├── ql_feat_recentpurchases.js
    │   ├── ql_feat_rejuvtimers.js         # Rejuvenator/Buff HUD + minimap objective timers (~1400 lines)
    │   ├── ql_feat_showrank.js             # ShowRank HUD — top bar, escape menu, profile (via profile_card.xml)
    │   ├── ql_feat_showrank_card.js         # ShowRank profile card bridge (also loaded by profile_card.xml)
    │   ├── ql_feat_sigflash.js
    │   ├── ql_feat_souls.js
    │   ├── ql_feat_spm.js                 # Souls Per Minute display
    │   ├── ql_feat_stamina.js
    │   ├── ql_feat_statbonuses.js
    │   ├── ql_feat_statlocker.js
    │   ├── ql_feat_targetshapes.js
    │   ├── ql_feat_topbar.js
    │   ├── ql_feat_unsecuredsouls.js
    │   ├── ql_feat_unspent.js             # Unspent souls on player panels
    │   └── ql_feat_zipboost.js
    └── tools/
        ├── AUDIT_PLAN.md                  # Comprehensive audit findings and cleanup plan
        ├── trace_deps.py                  # Recursive dependency tracer for feature extraction
        ├── fix_bare_exports.py            # Adds missing bare-global QOL_* bridge exports
        └── extract_rejuv.py               # One-shot script used for rejuvTimers extraction
```

## Architecture

### Load Order (from hud.xml)
```
ql_utils.js → ql_shared_presets.js → ql_bridge.js → ql_state.js → ql_panelcache.js → ql_config.js →
ql_recent_purchases_data.js → ql_minimap_crate_data.js → ql_perf_overlay.js →
ql_feat_buildbridge.js → ql_core.js → features/*.js (36 files; order-independent)
```

### Context Architecture (Source 2 Panorama)
- **HUD context:** Has access to `$.Msg`, `State`, panel APIs (`FindChildTraverse`, `$.CreatePanel`), `GameUI`, etc.
- **Settings context:** Has access to `$.Msg`, `$.GetContextPanel()`, `$.Schedule()`, panel attribute APIs (`GetAttributeString`/`SetAttributeString`)
- **NOT available in either context:** `GameInterfaceAPI`, `$.persistentStorage` (confirmed absent, 2026-06-11)
- **Cross-context bridge:** Panel attributes (SetAttributeString/GetAttributeString) on the Hud root panel
- **ql_shared_presets.js** runs in BOTH contexts — defines `QOL` namespace, `QOL.import()`, `QOL.register()`, presets, diagnostics
- **ql_config.js** runs in BOTH contexts — config merge, normalize, parse, schema migration (shared by HUD + Settings)

### Module System (new — post-Phase-9)

The old pattern was verbose bridge aliases with `typeof QOL_X !== "undefined"` checks:
```js
// OLD (deprecated):
var S = typeof QOL_STATE !== "undefined" ? QOL_STATE : undefined;
var GC = typeof QOL_GetCachedPanel !== "undefined" ? QOL_GetCachedPanel : undefined;
var IsCfgEnabled = U ? U.IsCfgEnabled : function() { return false; };
// ... 10-15 more lines ...
```

The new pattern uses `QOL.import()` — defined in `ql_shared_presets.js`:
```js
// (all 34 feature files use this):
var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel", ...]);
var State = _deps.state;
var Utils = _deps.utils;
var GetCachedPanel = _deps.getCachedPanel;
var SetCachedPanel = _deps.setCachedPanel;
```

**QOL.import()** resolves named symbols from the `QOL` namespace. If symbols are missing, it logs a single consolidated `[BRIDGE] missing N dependency(s)` message.

**QOL namespace** is populated from multiple sources:
- `ql_state.js` — publishes `getCachedPanel`, `setCachedPanel`, `clearPanelCache`, `sweepStalePanelCache`, `resolveCachedPanel`
- `ql_bridge.js` — publishes 18 bare-global bridge constants, `QOL_BRIDGE_CHANNELS` descriptor map, `QOL.bridge` namespace with `read`/`write`/`readAttr`/`writeAttr`
- `ql_config.js` — publishes `buildDefaultConfig`, `mergeConfig`, `safeParseConfig`, and ~15 normalize helpers
- `ql_core.js` — publishes ~160 HUD-only symbols via a data-driven eager-eval array. Each entry is `[camelCaseKey, function() { return ActualFunction; }]`. The lazy getter defers identifier resolution so a single missing symbol doesn't crash the script.

Key QOL namespace entries:
- `state` → `State` (the global state object)
- `utils` → `QOL_UTILS` (set by `ql_shared_presets.js` from the `QOL_UTILS` global)
- `getCachedPanel` → `GetCachedPanel`
- `setCachedPanel` → `SetCachedPanel`
- `isConnectedToHideout` → `isConnectedToHideout`
- ... and ~80 more shared functions

**QOL.register()** is `QOL_REGISTER_FEATURE` re-homed on the namespace. Feature files call:
```js
QOL.register("featureName", {
    configKeys: [...],
    bucket: 0, phase: 0,
    gate: function(cfg) { ... },
    update: function(root, cfg, nowMs) { ... },
    stateKeys: [...],
    // Optional (Phase 5):
    requiresRoot: true/false,       // skip when root panel is null
    gateKey: "alternateGateName",   // check gates[gateKey] instead of gates[featureName]
    perfLabel: "loop.custom_label", // perf tracking label (default: "loop." + name)
    postUpdate: function(snapshot, State) { ... }  // side-effect hook after update
});
```

**Backward compat:** `QOL_*` bare globals are still exported for consumers that haven't migrated yet (`ql_settings.js`, `ql_perf_overlay.js`). The compat block is at `ql_core.js` lines 23710+.

### Feature File Pattern

Every feature file follows this structure:
```js
// ql_feat_X.js — Description
// Extracted from ql_core.js, Phase 9 Step 2c
(function() {
    'use strict';
    var _featureId = "ql_feat_X";
    var _deps = QOL.import(["state", "utils", ...]);
    var State = _deps.state;
    var Utils = _deps.utils;
    // ... destructure other deps ...

    // ── Constants ──
    var MY_CONSTANT = ...;

    // ── Private helpers ──
    function myHelper() { ... }

    // ── Update ──
    function UpdateX(root, ...) { ... }

    // ── Registration ──
    QOL.register("featureName", {
        configKeys: [...],
        bucket: N, phase: N,
        gate: function(cfg) { return U.IsCfgEnabled(cfg, "KEY"); },
        update: function(root, cfg, nowMs) {
            try { UpdateX(root, ...); }
            catch(e) { $.Msg("[QOLLock][ERROR][" + _featureId + "] " + e.message + "\n" + e.stack); throw e; }
        },
        stateKeys: [...]
    });

    // ── Self-test ──
    try { if (typeof UpdateX !== "function") throw ...; }
    catch(e) { $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test: " + e.message); }
})();
```

**Naming conventions in feature files:**
- `State` = `_deps.state` (via `_deps.state`)
- `GetCachedPanel()` = `_deps.getCachedPanel` (via `_deps.getCachedPanel`)
- `SetCachedPanel()` = `_deps.setCachedPanel` (via `_deps.setCachedPanel`)
- `Utils.` = `_deps.utils` (via `_deps.utils`)

### Feature Dispatch Loop (in ql_core.js)

The main loop runs at ~20Hz. `ResolveRuntimeGates()` computes which features are active.
`populateFeatureBuckets()` iterates `QOL_FEATURE_REGISTRY` directly (registry-driven since Phase 5)
and assigns each active feature to a staggered bucket for intra-frame scheduling.

Features are assigned to buckets and phases via their descriptor:
- `bucket`: time-offset group (0-7, mapped to 0-117ms offsets)
- `phase`: scheduler phase (0-4), or -1 for always-run
- `requiresRoot`: when true, feature is skipped if root panel is null
- `gateKey`: optional override for which `gates[key]` to check (defaults to feature name)
- `perfLabel`: performance tracking label (defaults to `"loop." + name`)
- `postUpdate`: optional callback run after `update()` for side effects

`ExecuteFeature()` runs each feature's update callback in a try/catch, tracks consecutive errors, and auto-disables features after 10 consecutive failures.

### Remaining in ql_core.js (by design)

Only 2 features remain unextracted (both are core infrastructure):

| Feature | Why It Stays |
|---------|-------------|
| `coreRoot` | 350-line `ApplyCoreLoopRootClassesAndState` — manages root panel classes for ALL features, 28 config keys, always-on gate |
| `healthbarRuntimeHelpers` | 20-line dispatcher to 5 large subsystems (Minecraft hearts ~800 lines, Budhud ~300, FG ~200, minimalist ~100, Klutz ~50) — deferred for separate extraction |

### Shared State

`State` is the global singleton state object, accessible via `QOL.state` in feature files.
Key state fields:
- `State.spm.*` — Souls Per Minute tracking
- `State.rejuvState` — Rejuvenator timer state
- `State.cachedPanels.*` — Panel cache (used by all features via GetCachedPanel/SetCachedPanel)
- `State.lastResolvedGates` — Gate resolution from BuildRuntimeFeatureConfigState
- `State.rootClassCache` — Root panel class state
- Per-feature state arrays (topbarNicknamePlayers, unspentPlayerPanels, etc.)

## Key Utilities (ql_utils.js / QOL.utils)

| Function | Purpose |
|----------|---------|
| `IsPanelValid(panel)` | Safe panel validity check |
| `SafeGetAttribute(p, a, d)` | Safe attribute read with fallback |
| `SafeSetAttribute(p, a, v)` | Safe attribute write |
| `SetStyleSafe(panel, prop, value)` | Safe CSS style set |
| `ClearStyleSafe(panel, prop)` | Safe CSS style clear (3-method cascade) |
| `SetPanelOpacitySafe(panel, opacity, fallback)` | Safe opacity set with fallback |
| `SetPanelVisibility(panel, visible)` | Safe visibility set |
| `IsCfgEnabled(cfg, key)` | Config key boolean check (`Number(cfg[key]) === 1`) |
| `DebugLog/InfoLog/WarnLog/ErrorLog(cat, msg)` | Throttled logging |
| `SafeLog(fn, label)` | **NEW** — wraps a function in try/catch, logs at DEBUG level when debug mode is on. Returns fn() result or null. Throttled 5s per label. |
| `IsDebugEnabled()/SetDebugEnabled(bool)` | Debug mode toggle |
| `PerfNowMs()` | High-resolution timestamp |
| `NormalizeOpacityNumber/FormatHudPx/...` | Number normalization helpers |

## Architecture Overhaul — Status

### Phase 1–4: ✅ Complete

| Phase | File | Status |
|-------|------|--------|
| 1 | `ql_state.js` | ✅ State singleton, cache accessors (~770 lines) |
| 2 | `ql_config.js` | ✅ Config merge/normalize/parse/migration (328 lines) |
| 3 | `ql_panelcache.js` | ✅ Typed caches (panels/lists/data), dual-write (~170 lines) |
| 4 | `ql_bridge.js` | ✅ Cross-context channel descriptors, safe read/write (~150 lines) |
| 5 | Registry dispatch | ✅ Registry-driven feature bucket population, removed hardcoded dispatch order |

### Previous Phases (9–10)

- **34 features extracted** from ql_core.js into features/
- **~6,400 lines removed** from ql_core.js
- **All 34 feature files migrated** to `QOL.import()` and `QOL.register()` API
- **QOL namespace system** implemented (data-driven bridge exports)
- **Bridge export system** refactored from ~168 individual try/catch blocks to data-driven arrays
- **39/39 features loaded**, zero auto-disabled, 92/92 presets cycle completes
- **SafeLog utility** added to ql_utils.js
- **18 duplicated bridge constants** moved to ql_bridge.js (eliminated from ql_core.js + ql_settings.js)
- **_BDC/_MC recursion bug** fixed (sandbox validator now passes)

### Known Bugs Fixed
1. `CLASS_IS_ZERO_VALUE` missing from statBonuses feature file
2. `SetPanelClassIfChanged` missing bare-global export (broke SPM)
3. `UNSPENT_TIER_COST` wrong values in unspent feature file
4. `persistentStorage` unavailable in settings context (missing guard)
5. SafeSetAttribute fallback not logging degradation
6. 14 silent catch sites now log at WARN level
7. **Toggle coercion bug (Phase 10):** ConfigStore coerces `ENABLE_*`/`DISABLE_*`/etc.
   keys from numeric 0/1 to boolean. Manifests must use `Number(cfg.X) === 1` —
   bare `cfg.X === 1` fails because `true === 1` is false in JS. Fixed in
   `ql_keyboard` and `ql_heroshop`.
8. **Stuck-feature bug (Phase 10):** `_safeEnableFeature()` set `_instances[id]` before
   `onEnable()` — if `onEnable` threw, feature was permanently stuck. Fixed with
   `_enablingInProgress` reentry guard.
9. **`_onConfigChanged` auto-enable bug:** Would enable a feature on ANY config key
   change. Fixed: only auto-enables when `ConfigStore.get(id, "enabled") === true`.

### Manifest Porting Rules (see docs/MIGRATION_PATTERNS.md for full details)
- **Toggle coercion:** Always use `Number(cfg.X) === 1`, never bare `cfg.X === 1`
- **Cut-over timing:** Cut over old include in the SAME commit as wiring manifest
- **State writes:** Write to `State.*` for cross-feature backward compat (override
  of the old "READ ONLY" rule — see MIGRATION_PATTERNS.md Pattern 7)
- **QOL delegates:** Access old-system functions via `typeof QOL !== "undefined" &&
  QOL.fnName` with try/catch (see MIGRATION_PATTERNS.md Pattern 10)
- **Panel cache cleanup:** Clear `SetCachedPanel` entries in `onDisable`
- **Adversarial review:** 2 agents per manifest (correctness + side effects)

### Remaining: Phase 10 Cleanup (see plans/AUDIT_PLAN.md)

| Phase | Work | Impact |
|-------|------|--------|
| 10a | Remove 59 dead functions (0 callers) | -1,500 lines, zero risk |
| 10b | Move 30 debug thunks + 6 utilities to ql_utils.js | -300 lines reorganized |
| 10c | Inline ~30 single-consumer bridges into feature files | -60 bridge lines |
| 10d | Convert 170 convertible catch patterns to SafeLog wrappers | Plan exists, not started |
| 10e | Extract 5 healthbar subsystems | Deferred, ~1,500 lines |

## Common Bug Patterns

1. **Missing bridge export:** Feature file calls a function that's not in QOL.import() → `ReferenceError: X is not defined`. Fix: add the symbol to `_qolExportDefs` array in ql_core.js, then add it to the feature file's QOL.import() list.

2. **State. vs S.:** Feature files use `State.` for State access. ql_core.js uses `State.`. Converting between them is a common error during extraction.

3. **GC()/SC() vs GetCachedPanel()/SetCachedPanel():** Same pattern — feature files and core both use full names (GetCachedPanel/SetCachedPanel).

4. **Bare-global vs window property:** Feature files check `typeof QOL_X !== "undefined"` (bare global), but exports may only set `window.QOL_X`. Both are needed.

5. **Panel deleted mid-frame:** Panorama destroys panels asynchronously. `try { panel.style.x = "0px"; } catch(e) {}` is the correct defensive pattern — don't log these.

6. **QOL.import() missing deps:** If a feature file's QOL.import() list is missing a dependency, the destructured variable will be `undefined`. The self-test or error boundary will catch this at load time.

## Testing

### In-Game

- **Diagnostic:** Run `QOL_DumpDiagnostics()` in the Panorama console. Shows loaded features,
  auto-disabled features, new FeatureRegistry manifests (enabled/disabled + error counts),
  manifest test results (from last run), and captured console logs.
- **Manifest Tests:** Settings → Dev panel → "Manifest Tests" button. Triggers HUD-side
  `QOL.core.ManifestTests.runAll()` via force-sync token. Polls for results with 6s timeout.
  Each enabled manifest's optional `test()` hook verifies panel existence and basic functionality.
  Results also appear in `QOL_DumpDiagnostics()`.
- **Preset Cycle:** Settings → Dev panel → "Preset Cycle" button. Applies all presets
  sequentially with 1.2s delay. Verifies no old-system features auto-disable. Checks
  `diag.newErrors` for manifest error counts.
- **Console:** `QOL.core.ManifestTests.runAll()` — run all manifest tests from Panorama console.
  `QOL.core.ManifestTests.getResults()` — read results from last run.
- **Runtime error tracking:** Manifest poll loops that throw are tracked by FeatureRegistry.
  After 10 consecutive poll loop errors (without an intervening success), the feature
  auto-disables and shows in diagnostics with error count.
- **Repack:** Changes to .js files require repacking the VPK before testing in-game.

### Manifest `test()` Hook (optional, on FeatureRegistry manifest descriptor)

```js
FR.register({
    id: "ql_example",
    create: function(ctx) { ... },
    test: function(ctx) {
        // OPTIONAL — static, called from HUD context only.
        // Must be read-only: no State writes, no config.set(), no DispatchEvent.
        // Return null to skip (not applicable, e.g. not in a match).
        var root = $.GetContextPanel();
        var panel = root.FindChildTraverse("expected_panel");
        return {
            passed: !!panel,
            name: "Expected panel exists",
            message: panel ? "" : "panel not found in HUD tree",
            assertions: [                          // OPTIONAL drill-down
                { passed: !!panel, name: "panel exists" }
            ]
        };
    }
});
```

### Node.js Smoke Test

- `node tools/qollock_smoke_test.js` — loads all JS files (infrastructure + features + manifests)
  in dependency order with mock Panorama globals. Catches syntax errors, reference errors.
  Reports manifest test hook coverage (structural check). 104+/104+ PASS expected.

## Key Files to Read First

1. `panorama/scripts/ql_shared_presets.js` — QOL namespace, QOL.import(), QOL.register(), 79 presets, diagnostics
2. `panorama/scripts/ql_core.js` lines 23585-23702 — QOL namespace population (the bridge)
3. `panorama/scripts/ql_core.js` lines 24500-24750 — Feature registration and dispatch loop
4. Any `features/ql_feat_*.js` — Example of the current feature file pattern
5. `plans/AUDIT_PLAN.md` — Full audit findings and cleanup roadmap

## Panorama CSS Gotchas (Phase D + F)

These are engine-specific behaviors confirmed via decompiled DLL cross-reference
(`/home/bytenode/Documents/DeadlockModMaking/panorama-knowledge-base/`).

### Valid `overflow` values
Panorama supports ONLY: `squish` (default), `clip`, `scroll`, `noclip`.
Do NOT use `hidden` or `visible` — these are standard CSS values that
Panorama ignores, falling back to `squish`.

### Unsupported CSS features
- Adjacent sibling (`A + B`) and general sibling (`A ~ B`) combinators
- Pseudo-elements (`::before`, `::after`, `::placeholder`)
- At-rules: `@media` and `@font-face` are NOT supported
- `@define`, `@keyframes`, `@import` ARE supported
- `!important` is NOT supported (use higher-specificity selectors instead)
- `visibility` only supports: `visible` (default) and `collapse` (not `hidden`)

### Deprecated CSS
- `align` property is legacy. Prefer `horizontal-align` / `vertical-align`.

### Verified-by-usage APIs (not in decompiled DLL method registration block)
- `panel.IsValid()` — 337 call sites. Works via prototype inheritance.
- `panel.SetPanelEvent()` — ~130 call sites. Works empirically.
- `panel.SetImage()` — 47 call sites. Confirmed Image type-specific method.

### QOL.import() gotchas
- `QOL.import("isCfgEnabled")` returns undefined — use `Utils.IsCfgEnabled`
- `QOL.import("isPanelValid")` returns undefined — use `Utils.IsPanelValid`
- `QOL.import("setStyleSafe")` returns undefined — use `Utils.SetStyleSafe`
- Rule: anything from `ql_utils.js` is on `Utils.*`, not `QOL.*`
- Run `tools/validate_imports.sh` before committing to catch mismatches.

## Testing Tools

- `setup-hooks.sh` — run once after cloning to install the git pre-commit hook (bridge checker + import validator + smoke test)
- `scripts/git-hooks/pre-commit` — version-controlled hook template (installed by setup-hooks.sh)
- `tools/check_bridges.sh` — verifies QOL.import() symbols are exported
- `tools/validate_imports.sh` — verifies QOL.import() symbols exist on QOL namespace
- `tools/qollock_smoke_test.js` — loads all files in dependency order (Node.js)

## Claude Code Skills (slash commands)

- `/audit-qollock` — Fan out agents to audit the codebase against Panorama KB
- `/validate-qollock` — Run smoke test + bridge checker + import validator
- `/review-qollock` — Spawn 2 adversarial reviewers, revise, loop up to 3×
- `/plan-qollock` — Full plan creation with 4-agent adversarial review
- `/extract-qollock` — Extract code to a standalone feature file
- `/fix-qollock` — Fix a bug with adversarial review
- `/diff-qollock` — Semantic diff old feature → new manifest (5-agent: constants, calls, CSS, control flow, State)

## Saved Prompts

See `.claude/saved-prompts.md` for reusable prompt templates:
- Deep audit with fan-out
- Plan + adversarial review loop
- Implement phase with subphase review
- Debug runtime error tracing
- Deep save/load review
- CSS/XML Panorama compliance audit
