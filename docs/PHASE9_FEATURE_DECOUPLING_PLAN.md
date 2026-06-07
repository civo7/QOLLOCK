# Phase 9 — Feature File Decoupling: Implementation Plan

> Generated 2026-06-07 from deep analysis of ql_core.js (30,610 lines, IIFE).
> Branch: `backend-overhaul-commits`

## Goal

Split `ql_core.js` from a single 30k-line IIFE into a thin core dispatcher (~2k lines) + 35 per-feature files. Each feature file is self-contained: it declares its `update`/`gate`/`Needs*`/`Ensure*` functions and calls `QOL_REGISTER_FEATURE`.

**Non-goal for this phase:** XML override elimination (I14), ES6+ transpilation (I16), build pipeline (I15).

---

## Architecture: Before vs After

```
BEFORE (current):                          AFTER (target):
┌──────────────────────────┐              ┌─ ql_core.js (thin dispatcher) ─┐
│  ql_core.js (30k lines)  │              │  §A  State (all ~600 fields)   │
│  (function() {            │              │  §B  Cache helpers              │
│    State = {...}          │              │  §C  Config I/O                 │
│    GetCachedPanel = ...   │              │  §D  Gate system                │
│    ...200 helper fns...   │              │  §E  Dispatch loop              │
│    ...35 features...      │              │  §F  Bootstrap                  │
│    loop()                 │              └────────────────────────────────┘
│    $.Schedule(...)        │              
│  })()                     │              ┌─ ql_features/ (one per feature) ┐
└──────────────────────────┘              │  ql_feat_rejuv_timers.js        │
                                          │  ql_feat_healthbar.js           │
                                          │  ql_feat_compass.js             │
                                          │  ...33 more...                  │
                                          │  Each: declares update/gate/     │
                                          │  Needs/Ensure fns, calls        │
                                          │  QOL_REGISTER_FEATURE(...)      │
                                          └────────────────────────────────┘
```

## Constraint Summary

| Constraint | Impact |
|------------|--------|
| **ES5 only** in panorama/scripts/ | No `let`/`const`/`=>`/template strings |
| **No module system** | Files loaded via XML `<include>`, all share global scope |
| **IIFE closure** | Currently all functions share closure over `State`, helpers, constants |
| **Shared State** | ~600 fields on one `State` object; features read/write each other's fields |
| **ResolveRuntimeGates** | Monolithic gate computation references State from 20+ features |
| **cachedPanels** | Global panel cache used by all features as `State.cachedPanels.X` |
| **Ensure* cross-calls** | Some features call other features' `Ensure*` panel-creation functions |
| **loop() inline code** | Main loop has feature-specific inline logic (accent color, onDeathArcade, coreRoot signoffs) |

## Feature Coupling Classification

### Tier 1 — Leaf Features (no cross-feature State reads, no Ensure* needed by others)
Can be extracted first with minimal risk. Each only depends on shared bridge.

| # | Feature | State Keys | Notes |
|---|---------|------------|-------|
| 1 | `spm` | `spm` | Reads State.spm.wasDisabled (own field). Calls EnsureSpmState (own). |
| 2 | `unspent` | 12 own keys | All State reads are own keys. Unspent phase=-1 (always-run). |
| 3 | `statlocker` | 5 own keys | All self-contained. |
| 4 | `laneWithParty` | 3 own keys | All self-contained. |
| 5 | `nicknames` | 11 own keys | All self-contained. |
| 6 | `zipBoost` | 9 own keys | All self-contained. |
| 7 | `combatStatus` | 4 own keys | All self-contained. |
| 8 | `imagesInChat` | 10 own keys | All self-contained. Uses IMAGES_IN_CHAT_* constants. |
| 9 | `signatureFlash` | 1 own key | All self-contained. |
| 10 | `staminaChargeColorRuntime` | 3 own keys | All self-contained. |
| 11 | `ammo` | 2 own keys | `ammoPanelStyleSig` read in ResolveRuntimeGates for `gates.ammo` sticky — needs gate extraction. |
| 12 | `topBarRuntime` | 2 own keys | Self-contained but `topBarRuntimeStyleSig` checked in gate. |
| 13 | `bottomBarRuntime` | 3 own keys | Self-contained. |
| 14 | `itemsRuntime` | 3 own keys | Self-contained. |
| 15 | `soulsRuntime` | 2 own keys | Self-contained. |
| 16 | `damageImpactRuntime` | 2 own keys | Self-contained. |
| 17 | `gameplayMouseCursor` | 4 own keys | `customMouseCursorPanel` defined at top of State init. |
| 18 | `betterUnsecuredHud` | 3 own keys | Reads `State.unsecuredSouls.hudStyleSig` (cross-feature!) and `GetCachedPanel("betterUnsecuredOverlay")` in gate. |
| 19 | `keyboardRuntime` | 5 own keys | `allBindingsBoxes` initialized at top of State. |
| 20 | `onDeathArcade` | 5 own keys | `onDeathArcadeRuntimeWasActive` written by main loop dispatch side-effect. |
| 21 | `legacyAudioPassive` | 13 own keys | Some keys (`lastTime`, `lastIntervalAlert`, `lastMinimapAlert`, `triggeredOneTimers`) initialized at top of State — used by multiple features? Need verification. |

### Tier 2 — Provider Features (Ensure* functions called by others)
These provide panel-creation functions used by multiple consumers.

| # | Feature | Ensure* Provided | Called By |
|---|---------|------------------|-----------|
| 22 | `panelCache` | `EnsureCoreLoopPanelCaches(root)` → calls all the below Ensure* based on gates | Dispatch loop |
| — | *(panelCache delegates)* | `EnsureMinimapPanelCache` | minimapRuntime, panelCache |
| — | | `EnsurePassiveHudPanelCache` | legacyAudioPassive, panelCache |
| — | | `EnsureGameTimePanelCache` | rejuvTimers, legacyAudioPassive, panelCache |
| — | | `EnsureAbilitiesContainerPanelCache` | itemsRuntime, statBonuses, legacyAudioPassive, panelCache |
| — | | `EnsureCachedPanelByIds` | *(utility, called by all above)* |
| 23 | `minimapRuntime` | `EnsureMinimapOverlayAnchor`, `EnsureMinimapObjectiveTimers`, `EnsureMinimapCrateOverlay`, `EnsureMinimapTunnelOverlay` | rejuvTimers, compass (via shared Ensure*) |
| 24 | `rejuvTimers` | `EnsureRejuvState` | Only self |
| 25 | *(compass)* | `EnsureCompassOverlay` | compass loop |
| 26 | *(compass)* | `EnsureItemMirrorOverlayMulti`, `EnsureItemMirrorSlotMulti` | compass loop |
| 27 | `keyboardRuntime` | `EnsureKeyboardOverlay` | Only self |
| 28 | `zipBoost` | `EnsureZipBoostOverlay` | Only self |
| 29 | `unsecuredSoulsTimer` | `EnsureUnsecuredSoulsOverlay` | Only self |
| 30 | `statBonuses` | `EnsureStatBonusesOverlay` | Only self |
| 31 | `combatStatus` | `EnsureCombatStatusOverlay` | Only self |
| 32 | `gameplayMouseCursor` | `EnsureGameplayMouseCursorPanel` | Only self |
| 33 | `betterUnsecuredHud` | `EnsureBetterUnsecuredOverlay` | Only self |
| 34 | `damageNumbers` | `EnsureIndicatorMetaSmallDamage`, `EnsurePanelClassCache` | Only self |
| 35 | *(legacy)* | `EnsureDl4dCaptionPanel` | Only self |

### Tier 3 — Consumer Features (call other features' Ensure* functions)
These need Provider features extracted first (or Ensure* functions moved to shared bridge).

| Feature | Calls |
|---------|-------|
| `rejuvTimers` | `EnsureMinimapObjectiveTimers` (minimapRuntime's), `EnsureGameTimePanelCache` (panelCache's), `EnsureRejuvState` (own) |
| `legacyAudioPassive` | `EnsurePassiveHudPanelCache`, `EnsureGameTimePanelCache`, `EnsureAbilitiesContainerPanelCache`, `EnsureDl4dCaptionPanel` |
| `itemsRuntime` | Reads `EnsureAbilitiesContainerPanelCache` results |
| `statBonuses` | Reads `EnsureAbilitiesContainerPanelCache` results |
| `betterUnsecuredHud` | Reads `State.unsecuredSouls.hudStyleSig` (cross-feature) |

### Tier 4 — Heavily Coupled Features

| Feature | Coupling Detail |
|---------|-----------------|
| `coreRoot` | `State.rootClassCache`, `State.coreRootGateSig`, `State.coreRootStaticSig`. Gate uses `State.rootClassCache.panel !== root`. Main loop writes `State.coreRootGateSig`. Referenced by `healthbarRuntimeHelpers` gate. |
| `healthbarRuntimeHelpers` | 35 state keys! Largest feature. References `playerHealthbarAccentColorSig` which is also read by main loop inline code. Gate depends on `coreRoot` being OFF. References `coloredHealthbarBridgeValue`. |
| `colorWarning` / `enemyColorWarning` / `allyColorWarning` | Triplet of features sharing the same pattern. `enemyColorWarning` and `allyColorWarning` gates use `NeedsEnemyColorWarningRuntimeWork`/`NeedsAllyColorWarningRuntimeWork` which reference their own State. |
| `damageNumbers` | Gate references `State.lastIndicatorConfigSig`, `State.accountPresetTestActive`. Update reads `State.lastRawConfig`. |
| `minimapRuntime` | Gate reads `State.lastRawConfig`, `State.minimapRuntimeSig`, `State.accountPresetTestActive`, `State.lastZoomState`. Update reads `State.lastRawConfig`. |
| `targetShapes` | Gate references `State.lastResolvedGates.redDiamondEnabled`. |

### Tier 5 — Loop-Inline Code
Code that lives in the main `loop()` function body, not in any feature's update:

| Code | Lines | Features Affected |
|------|-------|-------------------|
| Healthbar accent color refresh | ~25 lines (~29935-29960) | healthbarRuntimeHelpers, colorWarning |
| `onDeathArcadeRuntimeWasActive` signoff | 1 line | onDeathArcade |
| `coreRootGateSig` signoff | 1 line | coreRoot |
| `gates.sig` in dispatch closure | 1 line | coreRoot |
| `minimapRuntime` raw config arg | special 6-arg dispatch | minimapRuntime |

---

## Implementation Steps

### Step 0 — Prerequisites & Safety

**0a. Verify current state**
```bash
cd /home/bytenode/Documents/DeadlockModMaking/Reduced_CSDK_12/content/citadel_addons/qollock
node --check panorama/scripts/ql_core.js
node --check panorama/scripts/ql_settings.js
node --check panorama/scripts/ql_shared_presets.js
node --check panorama/scripts/ql_utils.js
node scripts/validate_compact_schema.js
git log --oneline -5
```

**0b. Create feature file directory**
```bash
mkdir -p panorama/scripts/ql_features
```

**0c. Create the shared bridge file**
Create `panorama/scripts/ql_bridge.js` — this is a NON-IIFE file that exposes the shared infrastructure all feature files need. It runs AFTER ql_core.js (which will export its internals to a global `QOL_BRIDGE` object).

Actually, the cleanest approach: convert ql_core.js to expose its internals on a global object that feature files access. Like `ql_utils.js` does with `QOL_UTILS`.

---

### Step 1 — Export Bridge from ql_core.js

Transform ql_core.js to attach its shared internals to `window.QOL_BRIDGE` (or just make them global vars accessible to subsequently-loaded feature files).

**Changes to ql_core.js:**
1. Move `State` from `var State` to a global: `window.QOL_STATE = {...}` (or `var QOL_STATE = {...}` at global scope)
2. Move `GetCachedPanel`, `SetCachedPanel`, `ClearPanelCache`, `SweepStalePanelCache`, `ResolveCachedPanel` to global scope
3. Move `IsCfgEnabled` to global scope (or use QOL_UTILS version)
4. Move `ExecuteFeature` to global scope
5. Move `PerfStart`, `PerfEnd` to global scope
6. Move all PANEL_ID_* constants to global scope
7. Keep `QOL_REGISTER_FEATURE` global (it already is, defined in ql_shared_presets.js)
8. The IIFE wrapper stays but now: `(function() { ... all feature code extracted ... })()`

**Commit:** `Step 1: export shared bridge — State, cache helpers, constants to global scope for feature files`

---

### Step 2 — Extract Leaf Features (Batch 1: simplest)

Extract features with NO cross-feature State reads, NO Ensure* functions called by others, NO loop-inline coupling.

**Batch 1a — pure style-runtime features** (simplest: `update(root, cfg)` only):
- `topBarRuntime` → `ql_features/ql_feat_topbar_runtime.js`
- `bottomBarRuntime` → `ql_features/ql_feat_bottombar_runtime.js`
- `itemsRuntime` → `ql_features/ql_feat_items_runtime.js`
- `soulsRuntime` → `ql_features/ql_feat_souls_runtime.js`
- `damageImpactRuntime` → `ql_features/ql_feat_damage_impact_runtime.js`
- `ammo` → `ql_features/ql_feat_ammo.js`
- `staminaChargeColorRuntime` → `ql_features/ql_feat_stamina_charge.js`

**Batch 1b — features with own Ensure* but no cross-calls:**
- `combatStatus` → `ql_features/ql_feat_combat_status.js`
- `zipBoost` → `ql_features/ql_feat_zip_boost.js`
- `unsecuredSoulsTimer` → `ql_features/ql_feat_unsecured_souls_timer.js`
- `statBonuses` → `ql_features/ql_feat_stat_bonuses.js`
- `gameplayMouseCursor` → `ql_features/ql_feat_gameplay_mouse_cursor.js`
- `keyboardRuntime` → `ql_features/ql_feat_keyboard_runtime.js`
- `signatureFlash` → `ql_features/ql_feat_signature_flash.js`
- `imagesInChat` → `ql_features/ql_feat_images_in_chat.js`

**Batch 1c — features with more logic but still leaf:**
- `spm` → `ql_features/ql_feat_spm.js`
- `unspent` → `ql_features/ql_feat_unspent.js`
- `statlocker` → `ql_features/ql_feat_statlocker.js`
- `laneWithParty` → `ql_features/ql_feat_lane_with_party.js`
- `nicknames` → `ql_features/ql_feat_nicknames.js`
- `onDeathArcade` → `ql_features/ql_feat_on_death_arcade.js`

Each extraction:
1. Move `function Update*() {...}`, `function Needs*() {...}`, `function Ensure*() {...}`, and any helper functions only called by that feature
2. Move feature-specific constants (e.g., `IMAGES_IN_CHAT_*` for imagesInChat)
3. Add `QOL_REGISTER_FEATURE(...)` call at bottom of feature file
4. Remove from ql_core.js
5. Add `<include>` to hud.xml
6. `node --check` BOTH ql_core.js AND the new feature file
7. Commit

**Per-file verify script:**
```bash
node --check panorama/scripts/ql_features/ql_feat_*.js
node --check panorama/scripts/ql_core.js
```

---

### Step 3 — Resolve ResolveRuntimeGates

This is the trickiest coupling point. `ResolveRuntimeGates()` (line ~29333) computes all 35+ gate booleans. Many gates reference feature-specific State fields.

**Strategy: Make each feature provide its own gate-computation snippet.**

Option A — **Registry-driven gates**: Each feature's `gate(cfg)` function is called every tick. Currently this IS how it works — `ResolveRuntimeGates` pre-computes gate booleans, but each QOL_REGISTER_FEATURE already has a `gate` function. The dispatch loop already checks `gates[_gateKey]`. So we can:
1. Keep `ResolveRuntimeGates` for the "active" gate booleans (pure config checks: `IsCfgEnabled`)
2. Move sticky-state gate logic INTO each feature's `gate()` function
3. Delete the manual gate override lines in `ResolveRuntimeGates`

Wait — currently the dispatch uses `gates[_gateKey]` (pre-computed), not `_feat.gate(cfg)`. The `gate()` on the registry entry is NOT called at dispatch time; it was registered as metadata.

**Actual approach:** Refactor `ResolveRuntimeGates` to call each feature's `gate()` function, rather than having hardcoded gate logic for each feature. The dispatch loop then checks the feature's gate result.

But the challenge is: `ResolveRuntimeGates` gates use NOT just config but also State fields (sticky cleanup, panel existence checks). These State reads are what create cross-feature coupling.

**Pragmatic approach for Step 3:**
1. Keep `ResolveRuntimeGates` as a centralized function BUT
2. Have it call `QOL_FEATURE_REGISTRY[name].gate(cfg, State, root)` instead of computing gates inline
3. Each feature's `gate()` function uses `State` (now global `QOL_STATE`) to read its own fields
4. Remove hardcoded per-feature gate lines from `ResolveRuntimeGates`

This requires:
- Update all `gate()` functions in QOL_REGISTER_FEATURE to include sticky/cleanup logic currently in ResolveRuntimeGates
- Simplify ResolveRuntimeGates to a loop: `for each feature, gates[name] = feature.gate(cfg, corePhase)`
- Keep `_anyGateActive` hard-gate optimization
- Keep compass-specific precomputed gates

**Commit:** `Step 3: refactor ResolveRuntimeGates to call per-feature gate() functions instead of hardcoded logic`

---

### Step 4 — Extract Provider Features (Ensure* functions)

Features whose `Ensure*` functions are called by others need special handling.

**Strategy: Move shared Ensure* functions to a utilities namespace.**

Create `ql_features/ql_panels.js` containing:
- `EnsureMinimapOverlayAnchor`
- `EnsureMinimapObjectiveTimers`
- `EnsureMinimapCrateOverlay`
- `EnsureMinimapTunnelOverlay`
- `EnsureMinimapPanelCache`
- `EnsurePassiveHudPanelCache`
- `EnsureGameTimePanelCache`
- `EnsureAbilitiesContainerPanelCache`
- `EnsureCachedPanelByIds`
- `EnsureCoreLoopPanelCaches`
- `EnsureCompassOverlay`
- `EnsureItemMirrorOverlayMulti`
- `EnsureItemMirrorSlotMulti`

These are called by the dispatch infrastructure (`panelCache` feature) and by individual features.

Then extract the feature logic:
- `minimapRuntime` → `ql_features/ql_feat_minimap_runtime.js` (update/gate only; Ensure* in ql_panels.js)
- `rejuvTimers` → `ql_features/ql_feat_rejuv_timers.js`
- `legacyAudioPassive` → `ql_features/ql_feat_legacy_audio_passive.js`
- `panelCache` → stays as a thin feature registration calling ql_panels.js functions

**Commit 4a:** `Step 4a: extract shared Ensure* panel functions to ql_panels.js`
**Commit 4b:** `Step 4b: extract minimapRuntime, rejuvTimers, legacyAudioPassive feature files`

---

### Step 5 — Extract Healthbar Features (most complex)

The healthbar system has 4 sub-features + accent color inline code:
- `healthbarRuntimeHelpers` (35 state keys)
- `colorWarning`
- `enemyColorWarning`
- `allyColorWarning`

Plus the accent-color refresh block in the main loop.

**Strategy:**
1. Create `ql_features/ql_feat_healthbar.js` containing ALL healthbar functions:
   - `UpdateHealthbarRuntimeHelpers`
   - `UpdateColoredHealthbarRuntime`
   - `UpdateEnemyColoredHealthRuntime`
   - `UpdateAllyColoredHealthRuntime`
   - `UpdateMinimalistHealthbarOffsets`
   - `UpdateBudhudHealthbar`
   - `UpdateMinecraftHealthbar`
   - `ApplyPlayerHealthbarAccentColor`
   - `ApplyFgPlayerHealthbarRuntimeStyleToPanel`
   - `ApplyPlayerHealthbarRuntimeStyleToPanel`
   - All `Needs*` and `Ensure*` helpers
   - All healthbar constants
2. Register 4 features from the same file (or split into sub-features)
3. Move the accent-color refresh block from loop() into a helper function called from the dispatch

**Commit 5a:** `Step 5a: extract healthbar functions to ql_feat_healthbar.js`
**Commit 5b:** `Step 5b: move accent-color refresh from loop() inline to healthbar feature`

---

### Step 6 — Extract Remaining Features

- `coreRoot` → `ql_features/ql_feat_core_root.js`
- `damageNumbers` → `ql_features/ql_feat_damage_numbers.js`
- `targetShapes` → `ql_features/ql_feat_target_shapes.js`
- `heroShop` → `ql_features/ql_feat_hero_shop.js`
- `recentPurchases` → `ql_features/ql_feat_recent_purchases.js`
- `betterUnsecuredHud` → `ql_features/ql_feat_better_unsecured_hud.js`

---

### Step 7 — Refactor Main Loop

After all features extracted, the `loop()` function should be:
1. Config read/parse (stays in ql_core.js)
2. Compute ResolveRuntimeGates (stays in ql_core.js)
3. Dispatch via FEATURE_DISPATCH_ORDER loop (stays in ql_core.js)
4. Bucket staggering (stays in ql_core.js)
5. Settings loader overlays (stays in ql_core.js, or move to own feature)
6. Perf flush (stays in ql_core.js)
7. Next-interval computation (stays in ql_core.js)

**Remove from loop():**
- Healthbar accent color block → now in healthbar feature
- `onDeathArcadeRuntimeWasActive` signoff → now in onDeathArcade feature's update
- `coreRootGateSig` signoff → now in coreRoot feature's update

**Commit:** `Step 7: final loop() cleanup — remove remaining inline feature code`

---

### Step 8 — Update XML Includes

Add to `panorama/layout/hud.xml` (or wherever scripts are included):
```xml
<include src="file://{resources}/scripts/ql_features/ql_panels.js" />
<include src="file://{resources}/scripts/ql_features/ql_feat_healthbar.js" />
<include src="file://{resources}/scripts/ql_features/ql_feat_spm.js" />
<!-- ... all 35 feature files ... -->
```

Load order: `ql_utils.js` → `ql_shared_presets.js` → `ql_core.js` → `ql_panels.js` → all `ql_feat_*.js`

---

### Step 9 — Final Verification

```bash
# Syntax check ALL files
for f in panorama/scripts/ql_features/ql_feat_*.js; do
  node --check "$f" || echo "FAIL: $f"
done
node --check panorama/scripts/ql_core.js
node --check panorama/scripts/ql_settings.js
node --check panorama/scripts/ql_shared_presets.js
node --check panorama/scripts/ql_utils.js

# Schema validation
node scripts/validate_compact_schema.js

# Fuzz tests (if available)
node scripts/fuzz_schema.js

# Check git diff stat
git diff --stat HEAD~10
```

**In-game smoke test checklist:**
- [ ] All features toggle on/off without errors
- [ ] Healthbar modes cycle (Default, Minimalist, FG, Klutz, BudHud, Minecraft)
- [ ] Compass overlay renders + rotates
- [ ] SPM/unspent display updates
- [ ] Rejuv/buff timers appear on minimap
- [ ] Settings search bar works
- [ ] Build category payload operations work
- [ ] Config export/import round-trips
- [ ] No `$.Msg` errors in console
- [ ] FPS stable (compare before/after with PERF_DEBUG enabled)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| State field not initialized before feature reads it | Medium | High | State init stays in ql_core.js (loaded first); feature files reference existing fields |
| Gate logic divergence during extraction | Medium | High | Each step: node --check + compare gate signatures before/after |
| Load order issues in XML | Low | High | Add features after core; verify load order |
| Increased file count slows game load | Low | Low | 35 tiny files is still < 200KB total; Panorama loads scripts synchronously but fast |
| ES5 syntax violation in feature file | Medium | Medium | node --check catches syntax errors; manual review for let/const |
| Ensure* function not yet extracted when consumer loads | Low | Medium | Extract ql_panels.js FIRST (Step 4), before consumer features |

## Commit Plan

```
Step 0b: create ql_features/ directory + .gitkeep
Step 1:  export shared bridge — State, cache helpers, constants to global scope
Step 2a: extract 7 style-runtime leaf features (topbar, bottombar, items, souls, damageImpact, ammo, stamina)
Step 2b: extract 8 Ensure*-owning leaf features (combat, zip, unsecuredSouls, statBonuses, mouseCursor, keyboard, signatureFlash, imagesInChat)
Step 2c: extract 6 logic-heavy leaf features (spm, unspent, statlocker, laneWithParty, nicknames, onDeathArcade)
Step 3:  refactor ResolveRuntimeGates to call per-feature gate() functions
Step 4a: extract shared Ensure* panel functions to ql_panels.js
Step 4b: extract minimapRuntime, rejuvTimers, legacyAudioPassive features
Step 5a: extract healthbar functions to ql_feat_healthbar.js
Step 5b: move accent-color refresh from loop() to healthbar dispatch
Step 6:  extract remaining features (coreRoot, damageNumbers, targetShapes, heroShop, recentPurchases, betterUnsecuredHud)
Step 7:  final loop() cleanup
Step 8:  update XML includes in hud.xml
Step 9:  final verification + in-game testing notes
```

Total: ~15 commits on `backend-overhaul-commits`.

---

## Feature File Template

Each feature file follows this pattern:

```js
// ql_feat_example.js — QOLLOCK feature: exampleName
// Depends on: QOL_STATE, GetCachedPanel, SetCachedPanel, IsCfgEnabled,
//             PerfStart, PerfEnd, QOL_REGISTER_FEATURE, ExecuteFeature
// Load order: after ql_core.js, before ql_settings.js

// ── Feature-specific constants ──
var EXAMPLE_CONSTANT = 42;

// ── Ensure* panel creation ──
function EnsureExampleOverlay(root) {
    // ... create panels ...
}

// ── Gate helpers ──
function NeedsExampleRuntimeWork(cfg) {
    // ... check config ...
}

// ── Update ──
function UpdateExampleRuntime(root, cfg, nowMs) {
    // ... feature logic ...
}

// ── Registration ──
QOL_REGISTER_FEATURE("exampleName", {
    configKeys: ["ENABLE_EXAMPLE"],
    bucket: 7, phase: -1,
    gate: function(cfg) {
        return IsCfgEnabled(cfg, "ENABLE_EXAMPLE") ||
               !!(QOL_STATE.exampleDisplayMode && QOL_STATE.exampleDisplayMode !== "");
    },
    update: function(root, cfg, nowMs) {
        UpdateExampleRuntime(root, cfg, nowMs);
    },
    stateKeys: ["exampleDisplayMode", "cachedPanels.examplePanel"]
});
```

## Key Principles

1. **One commit per logical change** — never batch unrelated extractions
2. **`node --check` after every commit** — both the extracted file AND ql_core.js
3. **No feature behavior changes** — pure code movement, no refactoring of logic
4. **ES5 only** — verify with `grep -n "let \|const \|=>"` on each new file
5. **State belongs to features** — each feature's `stateKeys` are its contract; don't add new cross-feature State reads
6. **Ensure* functions that are shared go in ql_panels.js** — not duplicated across feature files
7. **Constants stay with their feature** — unless shared by 3+ features, then in ql_core.js
