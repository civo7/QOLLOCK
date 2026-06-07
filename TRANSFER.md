# QOLLOCK Backend Overhaul — Transfer Document

## Branch
`backend-overhaul-commits` — 31 commits ahead of origin.

## What this is

A multi-phase refactoring of QOLLOCK, a Deadlock Panorama HUD mod. The main
runtime is `ql_core.js` (~31k lines, ES5 IIFE). The settings UI is
`ql_settings.js` (~23k lines). Shared definitions in `ql_shared_presets.js`.

## Key files

| File | Role |
|------|------|
| `panorama/scripts/ql_core.js` | Main runtime — State, loop, gates, dispatch, all 35 features |
| `panorama/scripts/ql_settings.js` | Settings UI — tabs, CreateRow, CreateSliderRow, metadata |
| `panorama/scripts/ql_shared_presets.js` | Shared source of truth — QOL_FEATURE_REGISTRY, schema chain, defaults |
| `panorama/scripts/ql_utils.js` | Utility library — IsPanelValid, logging, perf timing |
| `scripts/validate_compact_schema.js` | Schema validator — run after schema changes |
| `decomp_dll/PANORAMA_JS_COMPLETE_REFERENCE.md` | Panorama JS API reference |
| `decomp_dll/QOLLOCK_STABILITY_IMPROVEMENTS/` | 19 improvement proposals |
| `docs/AUDIT_2026-06-06.md` | Full codebase audit with improvement catalog |

## Panorama constraints

- ES5 only — no `let`/`const`/`=>`/template literals in production code
- Scripts loaded via XML `<include>` tags in `hud.xml`
- No HTTP, no `$.AsyncWebRequest` (explicitly disabled)
- `$.Schedule(seconds, fn)` for timers, `$.Msg()` for console output
- Panel API: `FindChildTraverse`, `BHasClass`, `AddClass`, `style.*`, `IsValid()`
- `"use strict"` at top of ql_settings.js and ql_shared_presets.js
- ql_core.js uses IIFE `(function() { ... })()`

## Completed phases

### Phase 0 — Safety Net
- Documented magic numbers with WHY comments
- Added config parse error logging

### Phase 1 — Shared Foundation
- Extracted 51-version schema chain to ql_shared_presets.js
- Added QOL_FEATURE_REGISTRY / QOL_REGISTER_FEATURE interface
- Consolidated storage constants

### Phase 2 — Feature Modularization
- 35 features registered via QOL_REGISTER_FEATURE
- All dispatch sites use registry lookup: `var _feat = QOL_FEATURE_REGISTRY["name"]; if (_feat) { _feat.update(...); }`
- Removed hardcoded fallback else branches
- Bug fixes: compass visibility gate, rejuv midboss detection, images-in-chat proxy, unspent scheduler

### Phase 3 — Settings Modernization (ql_settings.js)
- Removed dead code: SettingsRuntimeLog, 4 empty normalization wrappers, unreachable guard block, gMissingRuSettingsStrings
- Fixed BHOP row duplication
- Added SLIDER_SHAPES lookup table (36 unique shapes from 99 sliders) + CreateSliderRow helper
- Replaced all 99 inline slider CreateRow calls
- Filled 16 missing SETTING_PERF_IMPACT_TIERS entries
- Documented schema version history in registry
- Fixed search bar bug (search-collect guard on MOG tab DOM creation)

### Phase 4 — Resilience & Error Handling
- Auto-disable visibility: features disabled by error streaks publish to global `QOL_AUTO_DISABLED_FEATURES` array; settings UI shows warning banner
- Cache hardening: 158 IsPanelValid ternary → GetCachedPanel, 272 writes → SetCachedPanel, 76 condition checks → GetCachedPanel, 138 remaining reads → GetCachedPanel
- Final: 354 GetCachedPanel, 274 SetCachedPanel, 23 ResolveCachedPanel. Zero unprotected State.cachedPanels.X reads
- **KEY BUG PATTERN**: `GetCachedPanel`/`SetCachedPanel` call `IsPanelValid()` which returns false for arrays. Panel arrays (compassTicks, minimap, urnTracker labels) must use bare `State.cachedPanels.X = arr`. Three fixes applied for this.
- Config corruption auto-recovery was already done in Phase 0 (SafeParseConfig)

### Phase 5 — Performance
- Disabled BUILD_SAVE_DEBUG (was shipping enabled=true, now false)
- I6 (gate lazy eval) and I8 (wider phase spread) evaluated and deferred — marginal gain for high complexity

### Phase 6 — Structural
- Added table of contents to ql_core.js (17 sections)
- Added constants-by-feature index comment
- Removed dead force-disable constants (FORCE_DISABLE_STAT_BONUSES, FORCE_OLD_ENEMY_ULT_INDICATOR_ALWAYS_ON)
- Full feature file extraction deferred to Phase 9+ (blocked by IIFE)

### Phase 8 (partial) — Build/Test
- Fixed validate_compact_schema.js to run without MIRROR_QOLLOCK directory
- 393 fuzz tests passing (random generate→encode→decode round-trip, edge cases, cross-version migration)

## Remaining phases (from audit)

### Phase 7 — CSS & Assets
- CSS @define variable consolidation (~30-50% reduction)
- VPK size audit (PNG bit depth, unused assets)

### Phase 8 — Build/Test (remaining)
- Cross-platform build pipeline (replace PowerShell with Node.js)
- ES6+ transpilation (Babel/SWC → ES5 for Panorama)

### Phase 9 — XML Override Elimination (highest risk/reward)
- Replace 28 XML file copies with JS panel injection + CSS-only overrides
- This would also unblock per-feature file extraction (Phase 6 full)

## How to verify changes

```bash
# Syntax checks (after every commit)
node --check panorama/scripts/ql_core.js
node --check panorama/scripts/ql_settings.js
node --check panorama/scripts/ql_shared_presets.js

# Schema validation (after schema changes)
node scripts/validate_compact_schema.js

# In-game testing
# Load sandbox mode, enable features, check console for errors
# Search bar: type in settings search, verify results appear
# Compass: enable + minimap visible, verify lines + heading render
# Cache: toggle Minecraft healthbar/compass/keyboard rapidly, no crashes
```

## Key patterns to follow

### Adding a feature registration
```js
QOL_REGISTER_FEATURE("featureName", {
    configKeys: ["ENABLE_FEATURE"],
    bucket: 7, phase: -1,
    gate: function(cfg) { return IsCfgEnabled(cfg, "ENABLE_FEATURE"); },
    update: function(root, cfg, nowMs, State, hideoutConnected) { UpdateFeature(root, cfg); },
    stateKeys: ["featureStateField"]
});
```

### Cache access
```js
// DO: single panels
var panel = GetCachedPanel("key");
SetCachedPanel("key", panel);

// DO NOT: array-typed cache keys (use bare State.cachedPanels)
State.cachedPanels.minimap = panels;  // panel array
State.cachedPanels.compassTicks = ticks;  // panel array
```

### Adding a slider to settings
```js
// Use CreateSliderRow with a shape key from SLIDER_SHAPES
CreateSliderRow(parent, "Label", "CONFIG_KEY", "shape_name");
// Add new shapes to SLIDER_SHAPES if needed
```

### Commit style
- One logical change per commit
- Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
- `node --check` after each commit
