# QOLLOCK Comprehensive Audit — ql_core.js Cleanup Plan

## Audit Date: 2026-06-08
## File Analyzed: ql_core.js (~23,000 lines after extraction)

---

## Finding 1: 59 Dead Functions (CRITICAL — 0 callers)

These functions are defined but never called within ql_core.js. Their callers
were moved to feature files but the definitions were left behind. They are
dead code and can be safely removed.

### Category A: Extracted Feature Remnants (obviously dead)
Functions clearly belonging to features now in ql_features/:

| Function | Line | Notes |
|----------|------|-------|
| BuildMinimapCrateOverlay | 7856 | minimapRuntime has its own copy |
| CaptureMinimapOriginalParent | 21183 | minimapRuntime has its own copy |
| CreateIndicatorMeta | 8814 | damageNumbers has its own copy |
| EnsureIndicatorMetaSmallDamage | 8824 | damageNumbers has its own copy |
| EnsureMinimapTunnelOverlay | 7824 | minimapRuntime has its own copy |
| GetCurrentMapDisplayName | 7710 | Dead code, never called |
| GetRecentPurchaseName | 17294 | recentPurchases has its own copy |
| GetRecentPurchaseTime | 17298 | recentPurchases has its own copy |
| HasAncestorClass | 17285 | recentPurchases helper |
| ResetColoredHealthbarRuntimeStyles | 4621 | colorWarnings has its own copy |
| ResetEnemyColoredHealthRuntimeStyles | 18528 | colorWarnings has its own copy |
| ResetAllyColoredHealthRuntimeStyles | 18658 | colorWarnings has its own copy |
| ResolveColoredHealthbarPanels | 4655 | colorWarnings has its own copy |
| ResolveEnemyColoredHealthColor | 18495 | colorWarnings has its own copy |
| ResolveAllyColoredHealthColor | 18637 | colorWarnings has its own copy |
| RefreshAllyColoredHealthPanelCache | 18675 | colorWarnings has its own copy |
| NeedsAmmoRuntimeWork | 22274 | ammo feature gate (moved) |
| NeedsColorWarningRuntimeWork | 22350 | colorWarnings feature gate (moved) |
| NeedsCoreRootDynamicRuntimeWork | 22402 | Only called from removed code |
| NeedsDamageNumbersRuntimeWork | 23751 | damageNumbers feature gate (moved) |
| NeedsKeyboardRuntimeWork | 22369 | keyboard feature gate (moved) |
| IsImagesInChatEnabledNow | 22858 | imagesInChat helper |
| PanelHasAnyToken | 7997 | rejuvTimers helper |
| GetHighestRejuvChargeTokenOnPanel | 8005 | rejuvTimers helper |
| ResolveHudRootForMinimapDraw | 21168 | minimapRuntime helper |
| RestoreMinimapOriginalOrder | 21204 | minimapRuntime helper |
| ApplyAccountPresetOverride | 9243 | Dead config helper |
| OnEnemyV2BridgeEvent | 8317 | Dead event handler |
| ReadEnemyV2AttrBridgeState | 8287 | Dead bridge reader |
| StripConvarStorageProbe | 4035 | Dead storage helper |
| UpdateAccountIdProbe | 9129 | Dead probe updater |

### Category B: Dead Debug Thunks
Small logging wrappers never called:

| Function | Line |
|----------|------|
| HeroDetectDebugLogThrottled | 1527 |
| BottomBarCurrencyDebugLogThrottled | 1589 |

### Category C: Dead Hero Detection / Build System Helpers
| Function | Line |
|----------|------|
| AdvanceStartupDefaultPayloadBootstrap | 11625 |
| AreBuildPayloadSemversWireCompatible | 3914 |
| ConfirmBuildClearStorageHero | 16012 |
| EnsureBuildClearRequestPayload | 16733 |
| EnsurePlayableHeroPersisted | 2318 |
| GetBuildCategoryStorageConfirmRequiredHits | 11709 |
| HasExistingBuildCategorySignal | 14197 |
| IsBrowseBuildsButtonVisible | 14566 |
| IsStorageBuildListLikelyEmptyForCorruptRepair | 15692 |
| IsTrustedLocalHeroSource | 2212 |
| RememberPlayableHero | 2305 |
| ResolvePreferredReturnHero | 3133 |
| ScanPanelTreeForHeroToken | 3144 |
| TrackBuildCategoryStorageConfirmHit | 11718 |
| TriggerBuildAddCategory | 14215 |
| TryCloseSettingsMenuForStartupPrompt | 11566 |
| TryReadHeroFromAbilityHintPanels | 2544 |
| TryReadHeroFromAbilityHudProgressClass | 2723 |
| TryReadHeroFromCaptureAbilityPanels | 3004 |
| TryReadHeroFromCaptureSnapshotPanels | 2918 |
| TryReadHeroFromLogoSpotlightPanels | 2623 |
| TryReadLocalHeroInternalName | 9443 |
| TryReadSelectedHeroFromCommandPanels | 2330 |
| UpdateEnemyUltIndicatorOld | 18378 |
| FindCombatPanelById | 18728 |

**Estimated savings: ~1,500 lines removed**

---

## Finding 2: 5 Unused Bridge Exports (MEDIUM)

These QOL_* bridges are exported but never imported by any feature file:

| Bridge | Notes |
|--------|-------|
| QOL_ClearPanelCache | No consumer |
| QOL_SweepStalePanelCache | No consumer |
| QOL_ExecuteFeature | No consumer |
| QOL_ReadPlayerHealthbarAccentColorIndex | No consumer |
| QOL_MinimapCrateOverlayDebugLogThrottled | No consumer (added for rejuvTimers but not used) |

**Action:** Remove unused bridge exports (10 lines).

---

## Finding 3: 30 Debug Log Thunks Belong in ql_utils.js (MEDIUM)

ql_core.js has ~30 two-line debug log wrappers:
```
function XxxDebugLog(msg) { if (!XXX_DEBUG) return; $.Msg("[QOLLock]..."); }
function XxxDebugLogThrottled(sig, msg, nowMs) { if (!XXX_DEBUG) return; ... }
```

These are pure utilities with no State access. They should move to ql_utils.js
where they can be conditionally created based on debug flags.

**Categories:**
- AccountProbeLog, ItemMirrorFlashLog, ItemMirrorCooldownDebugLog*,
  ExpressShotLog, ItemMirrorExceptionLog, UrnTrackerLog,
  StatBonusesDebugLog*, HeroDetectDebugLog*, HeroReturnDebugLog*,
  EnemyColoredHealthDebugLog*, MinimapCrateOverlayDebugLog*,
  BottomBarCurrencyDebugLog*, EnemyUltOldDebugLog*,
  SettingsLoaderDebugLog*, SettingsLoaderTraceLog*,
  CombatIndicatorDebugLog*, HealthbarVisibilityDebugLog

**Estimated savings: ~200 lines removed from ql_core.js, ~150 added to ql_utils.js**

---

## Finding 4: 48 Extraction Comments — Consolidate (LOW)

48 lines of `// X extracted to ql_feat_Y.js` cluttering the file. Replace with
a single section comment block at the top documenting what was extracted.

---

## Finding 5: ~30 Single-Consumer Bridges (LOW)

Bridges used by exactly 1 feature file. These could potentially move INTO
that feature file as local definitions, eliminating the global export.
But evaluate case-by-case — some are legitimately shared between core and feature.

Candidates for inlining:
- QOL_SIGNATURE_COOLDOWN_PRESS_SCAN_MS → sigflash.js
- QOL_SIGNATURE_COOLDOWN_PRESS_FLASH_MS → sigflash.js
- QOL_GAMEPLAY_MOUSE_CURSOR_* → mousecursor.js
- QOL_ResetKeyboardOverlayCaches → keyboard.js
- QOL_BuildKeyboardOverlayLayouts → keyboard.js
- QOL_FindChatMessageLabel → chatimg.js
- QOL_InjectTopChatImage → chatimg.js
- QOL_InjectBottomChatImage → chatimg.js
- QOL_PruneImagesInChatMessageCache → chatimg.js
- QOL_GetImagesInChatMessageCache → chatimg.js
- QOL_FindImagesInChatMessageCacheEntry → chatimg.js
- QOL_ClearInjectedChatImagesForMessage → chatimg.js
- QOL_BuildImagesInChatContainerWatermark → chatimg.js
- QOL_FindUnsecuredSoulsSource → unsecuredsouls.js
- QOL_ResetUnsecuredSoulsTracking → unsecuredsouls.js
- QOL_GetUnsecuredSoulsDangerLevel → unsecuredsouls.js
- QOL_EstimateUnsecuredSoulsEtaFallbackSec → unsecuredsouls.js
- QOL_ExtractStatDisplayText → statBonuses.js
- QOL_ResolveStatBonusesSource → statBonuses.js
- QOL_ResolveGoldenStatBonusesValue → statBonuses.js
- QOL_IsStatBonusTokenZero → statBonuses.js
- QOL_HarvestGoldenStatuesTooltipValue → statBonuses.js
- QOL_StatBonusesDebugLogThrottled → statBonuses.js
- QOL_ReadBottomBarWashColorIndex → bottombar.js
- QOL_ReadKeyboardOverlayWashColorIndex → keyboard.js
- QOL_ReadStaminaChargeColorIndex → stamina.js
- QOL_ReadAmmoTextColorIndex → ammo.js
- QOL_NormalizeStaminaChargeAngle → stamina.js
- QOL_NormalizePaletteColorIndex → (used by core only)
- QOL_NormalizeDamageImpactScaleNumber → damageimpact.js
- QOL_IsCombatSignalActive → combatstatus.js
- QOL_IsHudVisibleForTopBarRuntime → topbar.js

**Action:** Move these from ql_core.js bridge section into the respective feature files as local constants/functions. Remove the bridge exports.

**Estimated savings: ~60 bridge export lines removed**

---

## Finding 6: Healthbar Subsystem — 40 Functions, ~1,500 Lines (DEFER)

The `healthbarRuntimeHelpers` feature is a 20-line dispatcher that fans out to
5 subsystems still in ql_core.js:

| Subsystem | Functions | Est. Lines |
|-----------|-----------|------------|
| Minecraft hearts (MC) | 15 | ~800 |
| Budhud healthbar | 6 | ~200 |
| FG healthbar | 4 | ~100 |
| Minimalist healthbar | 5 | ~100 |
| Klutz healthbar | 2 | ~50 |
| Accent color | 5 | ~100 |
| Shared helpers | 3 | ~100 |

Each subsystem is self-contained and could become its own feature file.
This was deferred from Phase 9 due to complexity. Each subsystem has
significant internal state (animations, heart slots, color caches).

**Recommendation:** Create a separate healthbar subdirectory or prefix pattern:
- ql_feat_healthbar_mc.js
- ql_feat_healthbar_budhud.js
- ql_feat_healthbar_fg.js
- ql_feat_healthbar_minimalist.js
- ql_feat_healthbar_klutz.js
- ql_feat_healthbar_accent.js

---

## Finding 7: Pure Utility Functions (MEDIUM)

Functions with no State/cache access that belong in ql_utils.js:

| Function | Line | Description |
|----------|------|-------------|
| BuildPayloadEncodeBase64 | 3927 | Base64 encoding |
| BuildPayloadDecodeBase64 | 3900 | Base64 decoding |
| BuildPayloadFromBase64Url | 3918 | URL-safe Base64 |
| NormalizePaletteColorIndex | 4511 | Color index clamping |
| DeriveGoldenStatuesValueFromSource | 17667 | Value extraction |
| BuildMaxPayloadTokenForConvarStorageProbe | 3984 | Token builder |

**Estimated savings: ~100 lines moved from ql_core.js to ql_utils.js**

---

## Finding 8: Dead Constants (LOW)

| Constant | Refs | Action |
|----------|------|--------|
| ON_DEATH_ARCADE_ACTIVE_ATTR | 0 | Remove |
| ON_DEATH_ARCADE_REQUEST_ATTR | 0 | Check, probably dead |
| ON_DEATH_ARCADE_REQUEST_TOKEN_ATTR | 0 | Check, probably dead |

---

## EXECUTION PLAN (Priority Order)

### Phase 10a: Remove Dead Code (~2 hours)
1. Remove 59 dead functions (Finding 1) — safe, all have 0 callers
2. Remove 5 unused bridge exports (Finding 2)
3. Remove dead constants (Finding 8)
4. Consolidate extraction comments into a single block (Finding 4)
**Impact: ~1,500 lines removed, zero risk**

### Phase 10b: Move Utilities to ql_utils.js (~1 hour)
1. Move 30 debug log thunks to ql_utils.js (Finding 3)
2. Move 6 pure utility functions (Finding 7)
**Impact: ~300 lines reorganized, cleaner separation**

### Phase 10c: Inline Single-Consumer Bridges (~1.5 hours)
1. For each bridge used by only 1 feature file:
   - Move the definition into that feature file as a local
   - Remove the bridge export from ql_core.js
2. Validate each feature file still passes syntax check
**Impact: ~60 bridge export lines removed, cleaner API surface**

### Phase 10d: Catch Sanitation (deferred — separate plan)
Apply SafeLog wrappers to the 170 convertible catch patterns.
This was already planned and can be done independently.

### Phase 10e: Healthbar Extraction (deferred — major effort)
Extract 5 healthbar subsystems into their own feature files.
This is a significant effort (~1,500 lines) best done with the tracer tool.

---

## RISK ASSESSMENT

| Phase | Risk | Mitigation |
|-------|------|------------|
| 10a | Very Low | All 0-caller functions. `node --check` after each batch. |
| 10b | Low | Functions are stateless. Verify with grep that no feature file calls them via bare name. |
| 10c | Medium | Each bridge must be verified to have no other consumers. Test each affected feature. |
| 10d | Low-Medium | Scripted conversion. Validate all files. |
| 10e | High | Complex stateful code. Use tracer tool. Extensive testing needed. |

---

## TOTAL ESTIMATED CLEANUP

| Metric | Current | After | Delta |
|--------|---------|-------|-------|
| ql_core.js lines | ~23,000 | ~21,000 | -2,000 |
| Dead functions | 59 | 0 | -59 |
| Unused bridges | 5 | 0 | -5 |
| Debug thunks in core | 30 | 0 | -30 |
| Extraction comments | 48 | 1 | -47 |
| Bridge exports | ~150 | ~90 | -60 |
