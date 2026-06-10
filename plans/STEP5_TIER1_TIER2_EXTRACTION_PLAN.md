# Extraction Plan: Tiers 1 & 2 — ql_core.js Shrink

**Goal:** Extract ~5,600 lines from ql_core.js (18,437 → ~12,800) into 4 feature files.
**Context:** After 32 prior extractions, the remaining code in ql_core.js is a mix of core infrastructure (State, gates, dispatch loop, bridge) and tightly-coupled subsystems. Tiers 1 and 2 target the subsystems with clear boundaries that follow the proven extraction pattern.

---

## Extraction 1: Minecraft Hearts → `ql_feat_mchearts.js` ~1,600 lines ⭐

**Risk: LOW** — cleanest subsystem, zero external callers, all functions share `Mc` prefix.

### What moves (lines from ql_core.js):
- **17 MC_ constants** (lines 1357-1374) — heartbeat timing, geometry, animation
- **26 Mc* functions** (lines 4230-4947):
  - `McResolveHudRoot`, `McResetRuntime`, `McStartHeartsBlink`, `McLowHealthJiggleTick`, `McResetAllHeartsPosition`, `McSetLowHealthJiggleEnabled`, `McHealingWaveTick`, `McSetHealingWaveEnabled`, `McCheckModifierActive`, `McEnsureHeartsCapacity`, `McEnsureBarrierHeartsCapacity`, `McUpdateHearts`, `McUpdateDeferredHearts`, `McUpdateHealingHearts`, `McUpdateBarrierHearts`, `McParseDeferredDamage`, `McParseIncomingHeal`, `McReadHealthValues`, `McComputeHealthState`, `McParseChargesForHunger`, `McUpdateFood`, `McParseSoulsAndLevel`, `McUpdateAnimationState`, `McUpdateTotem`, `McUpdateBulletBarrier`, `UpdateMinecraftHealthbar`
- **State.mc* fields** (lines 729-777) — stay in State object (references become `S.mc*`)

### New feature registration:
```js
QOL.register("minecraftHealthbar", {
    configKeys: ["HEALTHBAR_TYPE"],
    bucket: 1, phase: -1,
    gate: function(cfg) { return Number(cfg.HEALTHBAR_TYPE) === 5; },
    update: function(root, cfg, nowMs) {
        try { UpdateMinecraftHealthbar(root, cfg, nowMs, (Number(cfg.HEALTHBAR_TYPE) === 5)); }
        catch(e) { $.Msg("[QOLLock][ERROR][" + _dk + "] " + ...); throw e; }
    },
    stateKeys: [35 mc* field names]
});
```

### Changes in ql_core.js:
1. Remove 17 `MC_*` constants
2. Remove 26 Mc* functions (lines 4228-4947)
3. Remove `UpdateMinecraftHealthbar` call from `UpdateHealthbarRuntimeHelpers` (line 5343)
4. Remove `State.mcWasEnabled` check from `NeedsHealthbarRuntimeHelperWork` (line 5321)
5. Remove `HEALTHBAR_TYPE_MINECRAFT` check from `NeedsHealthbarRuntimeHelperWork` gate
6. Remove all `mc*` keys from `healthbarRuntimeHelpers` stateKeys
7. Add `"minecraftHealthbar"` to `FEATURE_DISPATCH_ORDER` in main loop

### QOL.import() dependencies:
`state`, `utils`, `getCachedPanel`, `setCachedPanel`, `resolveCachedPanel` (20 panel cache keys)

### Self-test:
Verify `UpdateMinecraftHealthbar` and `McEnsureHeartsCapacity` are functions.

---

## Extraction 2: Compass + Minimap Rotate/Flip → `ql_feat_compass.js` ~1,100 lines

**Risk: MEDIUM** — `compassLoop` dispatches 6 features; we keep the loop, extract the function bodies.

### Strategy:
**Keep in ql_core.js:** `compassLoop()` (the 20Hz scheduler), gate precomputation, idle degradation logic.
**Extract to feature file:** Compass overlay rendering + minimap rotation/flip functions.
**Register 2 features** that `compassLoop` dispatches to instead of direct function calls.

### What moves (functions from ql_core.js):

**Group A — Compass overlay (5 functions, ~250 lines):**
`EnsureCompassOverlay`, `ResetCompassRuntimeState`, `UpdateCompassOverlay`, `UpdateCompassTicks`, plus helper `ParseRotateTransformDegrees`, `ParsePlainRotateDegrees`

**Group B — Minimap rotation/flip (13 functions, ~600 lines):**
`UpdateMinimapRotateWithPlayer`, `ApplyStaticMinimapRotation`, `FindMinimapRotateTarget`, `FindMinimapFlipClassTarget`, `ResetMinimapRotateTracking`, `CanReuseMinimapHeadingSnapshot`, `StoreMinimapHeadingSnapshot`, `GetLocalPlayerHeadingDegrees`, `FindLocalMinimapMainImage`, `FindLocalMinimapPlayerPanel`, `ReadPanelHeadingDegrees`, `ParsePositionXYPercent`

**15 COMPASS_* + MINIMAP_* constants** (lines 924-963)

**State fields accessed:** `State.compass.*` (19 fields), `State.minimapRotate*` (14 fields), `State.minimapFlipClassCache`, `State.minimapHeading*` (6 fields) — all become `S.*`

### New registrations:
```js
QOL.register("compassOverlay", {
    configKeys: ["ENABLE_COMPASS", "ENABLE_COMPASS_SPEED", "COMPASS_SCALE",
                 "COMPASS_STRETCH_X", "COMPASS_STRETCH_Y", "COMPASS_X_OFFSET", "COMPASS_Y_OFFSET"],
    bucket: 0, phase: -1, // only called from compassLoop, not main loop
    gate: function(cfg) { return IsCfgEnabled(cfg, "ENABLE_COMPASS"); },
    update: function(root, cfg, nowMs, State, hideoutConnected) {
        try { UpdateCompassOverlay(root, nowMs); }
        catch(e) { ...; throw e; }
    },
    stateKeys: ["compass", "compassLayoutSig", ...]
});

QOL.register("minimapRotateFlip", {
    configKeys: ["MINIMAP_ROTATE_WITH_PLAYER", "MINIMAP_FLIP"],
    bucket: 0, phase: -1,
    gate: function(cfg) { return IsCfgEnabled(cfg, "MINIMAP_ROTATE_WITH_PLAYER") || IsCfgEnabled(cfg, "MINIMAP_FLIP"); },
    update: function(root, cfg, nowMs) {
        try { UpdateMinimapRotateWithPlayer(root, cfg, nowMs); }
        catch(e) { ...; throw e; }
    },
    stateKeys: [14 minimapRotate* fields]
});
```

### Changes in ql_core.js:
1. Remove 15 constants
2. Remove 18 functions (~850 lines)
3. In `compassLoop`, replace direct function calls with feature registry dispatch:
   - `if (gates.compassOverlay) ExecuteFeature("compassOverlay", function() { QOL_FEATURE_REGISTRY["compassOverlay"].update(root, cfg, nowMs, State, hideoutConnected); })`
   - Same pattern for `minimapRotateFlip`
4. Remove `gates.compassOverlay` / `gates.compassMinimapRotate` precomputation from `ResolveRuntimeGates` (gates now computed by feature gate functions)
5. Remove config→State sync block for compass (lines 17007-17013) — moved to feature update

### QOL.import() dependencies:
`state`, `utils`, `getCachedPanel`, `setCachedPanel`, `setPanelClassCached`, `isConnectedToHideout`, `isCustomHudContextActive`, `resolveCachedPanel`, `hasClassInHierarchy`

---

## Extraction 3: Five Healthbar Themes → `ql_feat_healthbarthemes.js` ~1,500 lines

**Risk: MEDIUM** — three subsystems extracted as three registrations in one file, plus colored and klutz stay CSS-only.

### Strategy:
Register 3 features: `minimalistHealthbar`, `budhudHealthbar`, `fgHeroImage`.
Colored healthbar (color resolver + bridge) and Klutz (CSS-only) stay in ql_core.js.

### What moves:

**Group A — Minimalist + Player Healthbar Runtime (12 functions, ~500 lines):**
`ResetMinimalistHealthbarOffsetRuntime`, `ResetPlayerHealthbarScaleOpacityRuntime`, `ResetFgPlayerHealthbarOffsetRuntime`, `ResolveFgHeroImagePixelSize`, `ApplyFgPlayerHealthbarRuntimeStyleToPanel`, `ResetMinimalistHealthbarOffsetRuntimeAll`, `BuildPlayerHealthbarRuntimeStyleState`, `ApplyPlayerHealthbarRuntimeStyleToPanel`, `ResetPlayerHealthbarRuntimeStyle`, `ResetPlayerHealthbarAccentColorRuntime`, `PushAccentColorTarget`, `FindPlayerHealthbarAccentColorPanels`, `ApplyPlayerHealthbarAccentColor`, `ReadPanelOpacityMaybe`, `IsPanelSuppressedMaybe`, `IsPanelEffectivelyVisibleMaybe`, `IsHudVisibleForPlayerHealthbarRuntime`, `HasNonDefaultPlayerHealthbarRuntimeConfig`, `UpdateMinimalistHealthbarOffsets`

**Group B — Budhud (4 functions, ~170 lines):**
`ParseBudhudNumericLabelValue`, `ResolveBudhudHealthPanels`, `ResetBudhudHealthbarRuntime`, `UpdateBudhudHealthbar`

**Group C — FG Hero Image (12 functions, ~350 lines):**
`CaptureFgHeroImageOriginalParent`, `RestoreFgHeroImageOriginalOrder`, `ResetFgHeroImageOriginalParentState`, `ResetFgHeroImageSwapCandidateState`, `ApplyFgHeroImageFixedSize`, `FindLiveGoldLevelAmount`, `ReadHeroSignatureFromLevelAmount`, `ParseFgHeroSignalValue`, `TryReadFgHeroSignalFromObject`, `TryReadFgHeroSignalFromLocalApis`, `ResolveFgHeroRefreshSignal`, `SyncFgHeroImageMotionState`

### Changes in ql_core.js:
1. Remove `UpdateHealthbarRuntimeHelpers` entirely — each theme registers its own update via the feature dispatch
2. Remove `NeedsHealthbarRuntimeHelperWork` — gate logic moves into individual feature gates
3. Remove `HEALTHBAR_TYPE_*` checks from the main loop
4. Update `FEATURE_DISPATCH_ORDER` in `loop()`:
   - Replace `"healthbarRuntimeHelpers"` with `"minimalistHealthbar"`, `"fgHeroImage"`, `"budhudHealthbar"`
5. Remove healthbarRuntimeHelpers registration (lines 18150-18182)

### QOL.import() dependencies (aggregate):
`state`, `utils`, `getCachedPanel`, `setCachedPanel`, `resolveCachedPanel`, `setPanelClassCached`, `resolveWashColorFromPalette`, `readPlayerHealthbarAccentColorIndex`, `isHudVisibleForTopBarRuntime`, `isCustomHudContextActive`

### Self-test:
Check `UpdateMinimalistHealthbarOffsets`, `UpdateBudhudHealthbar`, `SyncFgHeroImageMotionState` are functions.

---

## Extraction 4: Three Loader Overlays → `ql_feat_loaderoverlays.js` ~1,500 lines

**Risk: MEDIUM** — heavily coupled to State fields and overlay panel building, but the three overlays share 80% of their structure.

### Strategy:
Extract the generic overlay infrastructure (factory, helpers, panel builder) plus all 3 specific overlays into one file. Register 3 features that the main loop's dispatch block calls.

### What moves:

**Generic infrastructure (10 functions, ~280 lines):**
`_GetLoaderStepIndex`, `_ResetLoaderStepStates`, `_ResetLoaderSession`, `_BeginLoaderSession`, `_SetLoaderStepState`, `_GetLoaderStepState`, `_BuildLoaderStepStateSignature`, `_EnsureLoaderStepRows`, `_RenderLoaderStepRows`, `_EnsureLoaderOverlaySimple`, `_CreateLoaderOverlay`

**Settings Loader overlay (15 functions, ~630 lines):**
`ResetSettingsLoaderSession`, `BeginSettingsLoaderSession`, `SetSettingsLoaderStepState`, `FinalizeSettingsLoaderSession`, `SkipSettingsLoaderSession`, `GetSettingsLoaderStepState`, `BuildSettingsLoaderStepStateSignature`, `GetSettingsLoaderIconForState`, `SetSettingsLoaderStepRowStateClasses`, `ApplySettingsLoaderStepStateFallback`, `EnsureSettingsLoaderStepRows`, `RenderSettingsLoaderStepRows`, `EnsureSettingsLoaderOverlay`, `UpdateSettingsLoaderOverlay`, `IsSettingsLoaderVisibleNow`, `GetPanelLayoutHeightPx`, `ReadPanelMarginTopPx`

**Save Loader overlay (6 functions, ~300 lines):**
`GetSaveSettingsLoaderStepIndex`, `ResetSaveSettingsLoaderSession`, `BeginSaveSettingsLoaderSession`, `SetSaveSettingsLoaderStepState`, `GetSaveSettingsLoaderStepState`, `FinalizeSaveSettingsLoaderSession`, `BuildSaveSettingsLoaderStepStateSignature`, `GetSaveSettingsLoaderDetailForMessage`, `UpdateSaveSettingsLoaderFromBuildSaveState`, `EnsureSaveSettingsLoaderStepRows`, `RenderSaveSettingsLoaderStepRows`, `EnsureSaveSettingsLoaderOverlay`, `UpdateSaveSettingsLoaderOverlay`

**Clear Loader overlay (6 functions, ~260 lines):**
Same pattern as save loader.

### New registrations:
```js
QOL.register("settingsLoaderOverlay", {
    configKeys: [],
    bucket: 0, phase: -1,
    gate: function() { return State.settingsLoaderSessionActive || State.settingsLoaderSessionCompleted; },
    update: function(root, cfg, nowMs) {
        try { if (ShouldUpdateStartupLoaderOverlay()) UpdateSettingsLoaderOverlay(root, nowMs); }
        catch(e) { ...; throw e; }
    },
    stateKeys: ["settingsLoaderSessionActive", "settingsLoaderSessionCompleted", ...]
});
// Same pattern for saveSettingsLoaderOverlay, clearSettingsLoaderOverlay
```

### Changes in ql_core.js:
1. Remove generic infrastructure + 3 overlay sections (~1,500 lines)
2. Replace dispatch block at lines 18007-18014 with feature registry calls:
   ```js
   var _loaderFeatures = ["settingsLoaderOverlay", "saveSettingsLoaderOverlay", "clearSettingsLoaderOverlay"];
   _loaderFeatures.forEach(function(fname) {
       var feat = QOL_FEATURE_REGISTRY[fname];
       if (feat && feat.gate()) ExecuteFeature(fname, function() {
           feat.update(root, cfg, nowMsLoop, State, hideoutConnected);
       });
   });
   ```
3. Remove `ShouldUpdateStartupLoaderOverlay`, `ShouldUpdateSaveLoaderOverlay`, `ShouldUpdateClearLoaderOverlay`
4. Add 3 loader features to `FEATURE_DISPATCH_ORDER`

### QOL.import() dependencies:
`state`, `utils`, `getCachedPanel`, `setCachedPanel`, `resolveCachedPanel`, `isConnectedToHideout`, `isCustomHudContextActive`, `resolveWashColorFromPalette`, `normalizeHudOffsetNumber`

---

## Execution Order

| Step | Extraction | Lines Saved | Risk | Cumulative |
|------|-----------|-------------|------|------------|
| 1 | Minecraft hearts | ~1,600 | Low | 18,437 → 16,837 |
| 2 | 5 Healthbar themes | ~1,500 | Medium | 16,837 → 15,337 |
| 3 | Compass + minimap rotate/flip | ~1,100 | Medium | 15,337 → 14,237 |
| 4 | 3 Loader overlays | ~1,500 | Medium | 14,237 → 12,737 |

**Total:** ~5,700 lines extracted, ql_core.js shrinks from 18,437 to ~12,700.

Order rationale: Minecraft first (lowest risk, proves the pattern), then healthbar themes (removes `healthbarRuntimeHelpers` registration), then compass (alters `compassLoop` dispatch), then loaders (alters main `loop()` dispatch). Each step builds confidence.

---

## Cross-Cutting Concerns

### State fields stay in ql_core.js
All `State.*` field definitions remain in the State object (lines 97-778). Extracted features access them via `S.*` (the `_deps.state` alias). This is the established pattern — no State field has ever been moved out of ql_core.js.

### Constants move with their functions
Each extraction moves its constants (MC_*, COMPASS_*, MINIMAP_*, HEALTHBAR_TYPE_*) to the feature file. The exception is `HEALTHBAR_TYPE_*` constants which are shared between healthbar themes and the colored-healthbar logic that stays in ql_core.js — these get duplicated or kept in ql_core.js with a comment.

### Bridge exports: add new, remove dead
Each extraction may need new QOL bridge entries for functions that become cross-file calls. After each extraction, unused bridge exports should be removed. The `_qolExportDefs` array in ql_core.js is the source of truth.

### `FEATURE_DISPATCH_ORDER` updates
After each extraction, the new feature names must be added to `FEATURE_DISPATCH_ORDER` in the main loop (line 17860) in the correct position relative to other features. The existing dispatch order is:
```
rejuvTimers → spm/nicknames → unspent/statlocker → panelCache → onDeathArcade →
coreRoot → healthbarRuntimeHelpers → laneWithParty → gameplayMouseCursor →
betterUnsecuredHud → colorWarning/enemyColorWarning/allyColorWarning →
ammo → topBarRuntime → bottomBarRuntime/itemsRuntime/soulsRuntime →
heroShop → recentPurchases → keyboardRuntime/zipBoost/unsecuredSoulsTimer/statBonuses →
combatStatus → signatureFlash → targetShapes → damageImpactRuntime/staminaChargeColorRuntime →
damageNumbers → minimapRuntime → legacyAudioPassive → imagesInChat
```
New features are inserted where the old inline code ran.

---

## Verification

### Per-extraction:
1. **Load test:** Verify all feature files parse without errors (check for missing QOL.import symbols via `[BRIDGE] missing` log)
2. **Self-test:** New self-test blocks must pass
3. **Gate check:** Verify gate functions return correct values for default config and enabled config
4. **State field audit:** Verify stateKeys in registration match all State fields used by the feature's functions

### Full integration:
1. **Diagnostic dump:** Run `QOL_DumpDiagnostics()` — verify all 35+ features loaded, zero auto-disabled
2. **Preset cycle:** Apply all 79 presets sequentially (1.2s delay each) — verify zero crashes
3. **Manual test:** Enable/disable Minecraft healthbar, compass overlay, minimap rotate, each loader — verify visual behavior unchanged
4. **Error isolation:** Force an error in each new feature — verify auto-disable after 10 streaks, other features unaffected
