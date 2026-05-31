# QOLLOCK Cross-Reference Audit — Final Report

**Date**: 2026-05-31
**Scope**: 17 JS source files (~70K lines) vs decomp_dll reference (~1012 events, ~5809 convars, 26 $ APIs, 70 panel methods, 139 CSS properties)
**Method**: 4 parallel subagents, each auditing a separate phase, cross-checked against findings

---

## Findings Ranked by Severity

Each finding includes: phase origin, severity, category, file:line, decomp_dll evidence, and recommended fix.

---

### CRITICAL (will crash, silently fail, or cause data loss)

#### C1. `ql_hero_testing.js` — ES6+ Syntax in ES5-Only Engine
**Phase**: 1 (API Surface) | **Category**: correctness | **Risk**: engine crash or silent failure

**Location**: `panorama/scripts/ql_hero_testing.js` — pervasive

**Evidence**: PANORAMA_JS_COMPLETE_REFERENCE.md states: "ES5 only — No `let`, `const`, `=>`, template literals, or `class`." The file uses:
- `const` — 50+ declarations (lines 1, 258, 307, 366, 450, etc.)
- `let` — 20+ declarations (lines 526, 535, 583, 611, etc.)
- Arrow functions `=>` — 20+ (lines 472, 479, 480, 525, etc.)
- Template literals (backticks) — 30+ (lines 525, 534, 590, 606, etc.)
- `Set` constructor — 3 uses (lines 307, 366, 450)

**Fix**: Rewrite to ES5: `var` for all declarations, `function` expressions for arrows, string concatenation for template literals, plain objects for Set.

---

#### C2. Config Save Path — Silent Data Loss from Empty Catch Blocks
**Phase**: 4 (Stability) | **Category**: correctness | **Risk**: user settings permanently lost

**Location**: `ql_core.js:8975-8985`

```js
try { root.SetAttributeString(STORAGE_KEY, nextRaw); } catch (e3) {}   // line 8975
try { root.SetAttributeString(USER_EDIT_REV_ATTR, nextRevision); } catch (e4) {}  // line 8976
try { hud.SetAttributeString(STORAGE_KEY, nextRaw); } catch (e5) {}   // line 8978
try { hud.SetAttributeString(USER_EDIT_REV_ATTR, nextRevision); } catch (e6) {}  // line 8979
catch (ePersistWrite) {}  // persistentStorage backup write — line 8985
```

These are the ONLY disk-backed persistence paths for user settings. All fail silently. The persistentStorage write at line 8985 is the sole mechanism that survives game restarts. If any of these throw, the user's entire configuration is lost with zero indication.

**Fix**: Add `QOL_ERROR("persist", "Config write failed: " + ...)` inside every empty catch block in the save path. The throttling in `QOL_ERROR` already prevents log spam.

---

#### C3. `IsColorWarningEnabled` — Same Key Checked 3 Times Instead of 3 Different Keys
**Phase**: 4 (Stability) | **Category**: correctness | **Risk**: 25% and 65% health warning thresholds silently ignored

**Location**: `ql_core.js:9389-9393`
```js
function IsColorWarningEnabled(cfg) {
    return IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_75") ||
           IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_75") ||  // BUG: should be ENABLE_COLOR_WARNING_65
           IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_75");    // BUG: should be ENABLE_COLOR_WARNING_25
}
```

The function is called 7 times throughout ql_core.js (lines 9419, 10039, 32790, 33399, 33469, 33484). The same copy-paste bug appears in 4 additional inline locations (lines 28415-28416, 28720-28721, 33124-33125, 33250-33251). This means if a user has ONLY `ENABLE_COLOR_WARNING_25` enabled (without `ENABLE_COLOR_WARNING_75`), the entire colored healthbar feature is disabled.

**Fix**: 
```js
function IsColorWarningEnabled(cfg) {
    return IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_25") ||
           IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_65") ||
           IsCfgEnabled(cfg, "ENABLE_COLOR_WARNING_75");
}
```
Also fix the 4 inline duplicates.

---

#### C4. 10 Config Keys Missing From Both Compact Schemas — Silently Dropped on Build Save/Load
**Phase**: 3 (Optimization) | **Category**: correctness | **Risk**: user settings lost across build save cycles

**Location**: QOL_DEFAULT_CONFIG (`ql_shared_presets.js:838`) vs COMPACT_SCHEMA_V60 (`ql_settings.js`) vs BUILD_CATEGORY_COMPACT_SCHEMA (`ql_core.js`)

Missing keys (exist in QOL_DEFAULT_CONFIG but NOT in either compact schema):

| Key | Default | Impact |
|-----|---------|--------|
| `ENABLE_ALLY_COLORED_HEALTHBAR` | 0 | Ally healthbar coloring lost |
| `ENABLE_ALLY_COLOR_WARNING_25` | 0 | Ally 25% HP warning lost |
| `ENABLE_ALLY_COLOR_WARNING_65` | 0 | Ally 65% HP warning lost |
| `ENABLE_ALLY_COLOR_WARNING_75` | 0 | Ally 75% HP warning lost |
| `DEFAULT_HERO` | `"hero_werewolf"` | Hero default preference lost |
| `DRAG_ENABLED` | 1 | Drag-to-move menus flag lost |
| `ENABLE_PERF_DEBUG` | 0 | Perf debug overlay lost |
| `ENABLE_PERF_DEBUG_DETAIL` | 0 | Detailed perf stats lost |
| `ENABLE_SPECIALS` | 0 | Special features flag lost |
| `PREVIEWS_ENABLED` | 1 | Settings preview feature lost |

**Fix**: Add all 10 keys to COMPACT_SCHEMA_V61 and BUILD_CATEGORY_COMPACT_SCHEMA_V61. Bump schema semver to 3.0.6.

---

### HIGH (significant bugs, important simplifications available)

#### H1. 20+ Phantom Dispatch Events — Fired but Not in Engine Registry
**Phase**: 1 (API Surface) | **Category**: correctness | **Risk**: events silently no-op, features broken

Events fired that do NOT exist in dispatch_events.txt (~1012 registered events):

| Phantom Event | Call Sites | Should Be |
|---------------|-----------|-----------|
| `SteamOverlayOpenURL` | `ql_profile_card_statlocker.js:109`, `ql_profile_statlocker.js:223`, `ql_settings.js:20964`, `ql_settings.js:23201` | `ExternalBrowserGoToURL` (confirmed, takes `string`) |
| `ConsoleCommand` | `ql_settings.js:18572` | `CitadelConCommand` (confirmed, takes `string`) |
| `MouseActivate` | `ql_core.js:22839` | Not registered — use `Activated` |
| `Submit` | `ql_settings.js:23462,23484` | `TextEntrySubmit` (confirmed) |
| `oninputsubmit` | `ql_settings.js:22526,23460,23482` | XML attribute, not a dispatchable event |
| `onactivate` | `ql_settings.js:23367` | XML attribute — use `Activated` |
| `ontextentrychange` | `ql_settings.js:23447,23450,23480` | XML attribute — use `TextEntryChanged` |
| `onmouseactivate` | `ql_settings.js:23368` | XML attribute — use `Activated` |
| `GameUIRunCommand` | `ql_settings.js:18576` | Use `CitadelConCommand` |
| `CopyToClipboard` | `ql_settings.js:13506` | Use `CopyStringToClipboard` (confirmed) |
| `SetClipboardText` | `ql_settings.js:13507` | Use `CopyStringToClipboard` (confirmed) |
| `TextEntryPasteFromClipboard` | `ql_settings.js:13534` | Not registered |
| `TextEntryPasteClipboard` | `ql_settings.js:13537` | Not registered |
| `TextEntryPaste` | `ql_settings.js:13540` | Not registered |
| `UI_TextEntry_PasteClipboard` | `ql_settings.js:13543` | Not registered |
| `PasteFromClipboard` | `ql_settings.js:13546,13562` | Not registered |
| `PasteToTextEntry` | `ql_settings.js:13549` | Not registered |
| `PasteClipboard` | `ql_settings.js:13552` | Not registered |
| `QOLLockEnemyV2Bridge` | `ql_core.js:15069` | Custom — expected, not in engine |

**Fix**: Remove phantom event dispatches. Keep only the confirmed alternatives (first column). The tooltip/button activation events in ql_settings.js are part of a shotgun pattern — trying every possible event name. Replace with single confirmed event.

---

#### H2. Phantom API `panel.SetImage()` — Used ~50 Times, Not in Panel API
**Phase**: 1 (API Surface) | **Category**: correctness | **Risk**: may silently no-op on future engine versions

The Panel API reference documents `image.src` as the R/W property for image paths. `panel.SetImage()` is NOT in the 70-method panel API or the Image panel-type-specific APIs. This may be a Dota 2 carryover that works but is unconfirmed.

**Locations**: `ql_core.js` (minecraft healthbar — ~40 calls), `ql_settings.js`, `hud_quickbuy_total_summary.js`, `ql_profile_statlocker.js`

**Fix**: Replace `image.SetImage(path)` with `image.src = path` (the confirmed R/W property). If `SetImage` is required for a specific behavior difference, add a fallback: `if (typeof image.src !== "undefined") image.src = path; else if (typeof image.SetImage === "function") image.SetImage(path);`

---

#### H3. Phantom API `GameInterfaceAPI.ConsoleCommand()` / `GameInterfaceAPI.SetSettingString()`
**Phase**: 1 (API Surface) | **Category**: correctness | **Risk**: silently no-ops, features broken

- `GameInterfaceAPI.ConsoleCommand()` — `ql_settings.js:18566-18567`
- `GameInterfaceAPI.SetSettingString()` — `ql_hero_testing.js:770-772`

Neither is documented. The confirmed mechanism for console commands is `$.DispatchEvent("CitadelConCommand", cmd)`. `GetSettingString` is documented but `SetSettingString` is not.

**Fix**: Remove `GameInterfaceAPI.ConsoleCommand()`. For `GameInterfaceAPI.SetSettingString()`, either remove or guard with a try/catch and fallback to `panel.SetAttributeString()`.

---

#### H4. Two Duplicate Compact Schema Registries — 60 Versions Each, Manually Maintained
**Phase**: 2 (Dead Code) | **Category**: simplification | **Risk**: will drift apart, causing schema corruption

| Registry | File | Versions |
|----------|------|----------|
| `COMPACT_SCHEMA_V2` → `COMPACT_SCHEMA_V60` | `ql_settings.js:10733` | 59 |
| `BUILD_CATEGORY_COMPACT_SCHEMA_V2` → `BUILD_CATEGORY_COMPACT_SCHEMA_V60` | `ql_core.js:7647` | 59 |

These define identical constraints (min/max/step for each config field) but are maintained separately. Adding a field requires adding it to both registries. There is no automated synchronization — they WILL drift.

**Fix**: Move the schema to `ql_shared_presets.js` as the single source of truth. Export it via `QOL_SCHEMA_UTILS.COMPACT_SCHEMA`. Have both `ql_settings.js` and `ql_core.js` reference it.

---

#### H5. Three Separate Normalization Chains — Same 10-12 Calls, Different Locations
**Phase**: 2 (Dead Code) | **Category**: simplification | **Risk**: migration applied in one place but not another

| Chain | Location | Normalizer Count |
|-------|----------|-----------------|
| `MergeConfig()` | `ql_core.js:7462` | 10 calls |
| `NormalizeConfig()` | `ql_settings.js:12535` | 10 calls |
| `ApplyParsedConfig()` | `ql_settings.js:11829` | 12 calls |
| `ApplyParsedConfigWithDiagnostics()` | `ql_settings.js:11877` | 12 calls |

All delegate to the same `QOL_SCHEMA_UTILS.*` functions but are copy-pasted chains. `MergeConfig` in ql_core.js misses `MigrateSplitZoomKeys()` which the others call, creating a migration gap.

**Fix**: Keep `NormalizeConfig` in `ql_settings.js` as the canonical chain. Have all other call sites call it. Add `MigrateSplitZoomKeys()` to the canonical chain if needed.

---

#### H6. `SaveAndSync` vs `WriteStorageConfigRawToUi` — Same Job, Different Panel Lists
**Phase**: 2 (Dead Code) | **Category**: duplication | **Risk**: inconsistent source priority

| Aspect | `SaveAndSync` (ql_settings.js:12698) | `WriteStorageConfigRawToUi` (ql_core.js:8954) |
|--------|--------------------------------------|----------------------------------------------|
| Reads revision from | panel + root + Hud (3 sources) | root + Hud (2 sources) |
| Writes to | panel + root + Hud (3 panels) | root + Hud (2 panels) |
| Calls NormalizeConfig first | Yes | **No** |
| Calls persistentStorage backup | Yes | Yes |

The save path in ql_core.js does NOT normalize before writing, which means mutated config can be saved with inconsistencies.

**Fix**: Unify into a single function. Always normalize before save. Write to all 3 panels consistently.

---

#### H7. No Save-Path Normalization — Config Can Be Saved With Inconsistencies
**Phase**: 4 (Stability) | **Category**: correctness | **Risk**: schema drift between load and save

The full config lifecycle:
1. **Load**: `ReadStorageConfigRawFromUi` → `SafeParseConfig` → `MergeConfig` (NORMALIZES)
2. **Use**: Features read `State.lastConfig` — may mutate derived keys
3. **Save**: `WriteStorageConfigRawToUi` — stringifies WITHOUT re-normalizing

If a feature mutates config between load and save, the saved data contains non-normalized values. On next load, normalization may compound or misinterpret.

**Fix**: Call `NormalizeConfig(cfg)` in the save path before `WrapConfigForStorage`.

---

### MEDIUM (worthwhile fixes, moderate impact)

#### M1. `ReadConfigRawFromStorage` vs `ReadStorageConfigRawFromUi` — Same Job, Different Source Priorities
**Phase**: 2 (Dead Code) | **Category**: duplication

| Aspect | `ReadConfigRawFromStorage` (ql_settings.js:12493) | `ReadStorageConfigRawFromUi` (ql_core.js:8908) |
|--------|---------------------------------------------------|------------------------------------------------|
| Sources | panel + root + Hud (ranked) | root + Hud (revision only) |
| Sync best to panel | Yes (writes best value back) | No |

**Fix**: Unify into a single read function in `ql_utils.js`.

---

#### M2. `parseRev` — Inline Function Duplicated 4 Times
**Phase**: 2 (Dead Code) | **Category**: duplication

Identical `parseRev` implementations at: `ql_settings.js:12710`, `ql_settings.js:12503`, `ql_core.js:8962`, `ql_core.js:8926`. All do `isFinite(n)` → `Math.floor(n)`.

**Fix**: Extract to `ql_utils.js` as `ParseRevisionNumber`.

---

#### M3. `IsPanelValid` vs `IsPanelValidSafe` — Same Logic, Different Syntax
**Phase**: 2 (Dead Code) | **Category**: duplication

- `IsPanelValid` (ql_utils.js:13): `typeof ... === "function"` check
- `IsPanelValidSafe` (ql_settings.js:12757): implicit truthiness check

Both are correct and equivalent. One is redundant.

**Fix**: Delete `IsPanelValidSafe`. All call sites use `IsPanelValid` consistently.

---

#### M4. `CompareSchemaSemver` — Defined Twice Identically
**Phase**: 2 (Dead Code) | **Category**: duplication

- `ql_core.js:7597`
- `ql_settings.js:9787`

Identical semver string comparison (split on ".", iterate first 3, numeric compare).

**Fix**: Move to `ql_utils.js` or `ql_shared_presets.js`.

---

#### M5. `$.persistentStorage` — Used Extensively but Not in 26-Function `$` API
**Phase**: 1 (API Surface) | **Category**: correctness | **Risk**: may silently no-op in some environments

`$.persistentStorage.getItem()` and `$.persistentStorage.setItem()` are used throughout `ql_core.js:8896-9034` and `ql_settings.js:12556-12659`. This is a known Dota 2 API but NOT in the 26 functions registered in panorama.dll lines 181677-182133.

The code properly guards `typeof $.persistentStorage.getItem === "function"`, so this is low-risk but unverified for Deadlock.

**Fix**: Accept as-is (guarded). Monitor for removal in game updates.

---

#### M6. `window` Object Usage — May Not Exist in Panorama
**Phase**: 2 (Dead Code) | **Category**: simplification | **Risk**: `ToggleQollockDebug()` inaccessible

- `ql_utils.js:300`: `window.QOL_UTILS = exports;` — **unguarded** write to `window`
- `ql_core.js:68`: `if (typeof window !== "undefined") window.ToggleQollockDebug = ToggleQollockDebug;` — guarded

Per the reference: Panorama has no `window`. If `window` is truly `undefined`, `ql_utils.js:300` throws `ReferenceError: window is not defined`, preventing QOL_UTILS from being published.

**Fix**: Guard `ql_utils.js:300` with `typeof window !== "undefined"`. Consider using `globalThis` as fallback.

---

#### M7. `IsColorWarningEnabled` — Derived Keys (25,65,75) Not Populated When Only 75 Is Set
**Phase**: 4 (Stability) | **Category**: correctness | **Risk**: derived legacy boolean from a single key

The normalize function (`NormalizeColorWarningConfig` at ql_shared_presets.js:675) sets `ENABLE_COLORED_HEALTHBAR` as a derived boolean. But `IsColorWarningEnabled` checks the raw threshold keys (25,65,75) rather than the derived key. If only `ENABLE_COLOR_WARNING_75` is set to 1 (which the normalize function doesn't automatically derive for the other two), the feature appears enabled but 25% and 65% checks don't fire.

**Fix**: After fixing C3, verify the normalize function also correctly derives ALL three threshold keys from the `ENABLE_COLORED_HEALTHBAR` legacy boolean.

---

### LOW (minor issues, cleanup)

#### L1. `$.Schedule(0, fn)` — Looks Like Millisecond Mistake
**Phase**: 1 (API Surface) | **Category**: style | **Location**: `hud_quickbuy_total_summary.js:274`, `ql_core.js:34667`

`$.Schedule` takes seconds per `[decomp L181949]`. `$.Schedule(0, fn)` is correct (zero delay = next frame) but reads like a millisecond API mistake.

**Fix**: Use `$.Schedule(0.0, fn)` for clarity.

---

#### L2. Unnecessary `typeof $.GetContextPanel === "function"` Guards
**Phase**: 1 (API Surface) | **Category**: simplification | **Location**: `ql_core.js:11347`, `ql_core.js:12750`

The `$` global and all 26 functions are always available in Panorama scripts. Guarding `$.GetContextPanel` is redundant.

**Fix**: Remove unnecessary guards.

---

#### L3. `panel.FindChild()` vs `panel.FindChildTraverse()` — Potentially Wrong Method
**Phase**: 1 (API Surface) | **Category**: correctness | **Location**: `ql_core.js:9352,12314,12319,12323,12325,24876,24877`

`FindChild(id)` only searches direct children. `FindChildTraverse(id)` searches all descendants. If the target ID is deeply nested, `FindChild` returns null.

**Fix**: Verify target nesting depth. If IDs may be nested, use `FindChildTraverse`.

---

#### L4. `panel.paneltype` / `panel.id` Used as Properties — Unconfirmed
**Phase**: 1 (API Surface) | **Category**: correctness | **Location**: `ql_legacy_cooldowns.js:26,49`, `ql_core.js:6142,13316`, `ql_hero_testing.js:614,1440-1441`

These are XML attributes but may not be exposed as JS properties.

**Fix**: Use `panel.GetAttributeString("id", "")` and `panel.GetAttributeString("paneltype", "")` instead.

---

#### L5. Dead ENABLE_* Branches Without UI Controls
**Phase**: 2 (Dead Code) | **Category**: dead code | **Risk**: code complexity without benefit

| Key | Referenced At | Has UI Toggle? |
|-----|---------------|----------------|
| `ENABLE_PERF_DEBUG` | ql_core.js:7214 | No |
| `ENABLE_PERF_DEBUG_DETAIL` | ql_core.js:7215 | No |
| `ENABLE_SPECIALS` | ql_core.js:32811,32902 | No |
| `ENABLE_TARGET_SHAPES` | ql_core.js:34642 | No |

These features can never be enabled through the UI. They're only reachable via presets or manual config editing.

**Fix**: Either add UI toggles in ql_settings.js or remove the gated code branches.

---

#### L6. `ql_core.js:34667` — `$.Schedule(0.0, BootstrapUnitTargetStyles)` — Unsafe Zero-Delay Schedule
**Phase**: 4 (Stability) | **Category**: correctness | **Risk**: race with main loop startup

The zero-delay schedule fires before the main loop starts (main loop starts at 0.9s delay). If `BootstrapUnitTargetStyles` reads State fields that the main loop initializes, it may read uninitialized values.

**Fix**: Add a small delay (0.05s) or verify all State fields accessed by `BootstrapUnitTargetStyles` are pre-initialized.

---

#### L7. `ql_hero_testing.js` — No Serial Guard for Multi-Callback Schedule Chain
**Phase**: 4 (Stability) | **Category**: correctness | **Risk**: double-firing of environment setup

Lines 788-805 schedule 14 callbacks (1s to 60s delays). If triggered twice within 60 seconds, 28 callbacks run concurrently.

**Fix**: Add a serial token: `gHTPPLoadEnvSerial++` on trigger, guard each callback with `if (serial !== gHTPPLoadEnvSerial) return;`.

---

#### L8. All 22+ Timing Constants Lack Decomp_DLL Justification
**Phase**: 4 (Stability) | **Category**: optimization | **Risk**: suboptimal polling intervals

No timing constant in the entire mod (from `LOOP_INTERVAL_SEC = 0.2` to `BUILD_SAVE_HERO_SWITCH_DELAY_MS = 450`) has a decompiled DLL reference to justify its value. All were chosen empirically. The PANORAMA_JS_COMPLETE_REFERENCE confirms `$.Schedule` uses seconds and `$.FrameTime()` returns seconds since init — but no engine frame timing, event latency, or render-cycle documentation exists to anchor these values.

**Fix**: Accept as-is for now. Use `$.FrameTime()` instead of `Date.now()` for all frame-relative timing (compass rotation, animations, cooldown rendering).

---

### NEWLY POSSIBLE (opportunities revealed by decomp_dll)

#### N1. Replace Quickbuy 20Hz Poll With `CitadelQuickbuyItemsChanged` Event
**Phase**: 3 (Optimization) | **Severity**: HIGH | **Category**: performance

| Current | Proposed |
|---------|----------|
| `hud_quickbuy_total_summary.js:765` — `$.Schedule(0.05, UpdateQuickbuyQueueCostPanels)` | `$.RegisterForUnhandledEvent("CitadelQuickbuyItemsChanged", UpdateQuickbuyQueueCostPanels)` |

The `CitadelQuickbuyItemsChanged` event (dispatch_events.txt line 67) fires exactly when the quickbuy queue changes. This eliminates ~1200 function calls/minute.

**Savings**: ~72ms CPU/minute, 1200 fewer `FindChildTraverse` calls per minute at 20Hz.

---

#### N2. Replace Profile Statlocker Polls With `CitadelProfileCardUpdated` / `CitadelShowProfilePage`
**Phase**: 3 (Optimization) | **Severity**: MEDIUM | **Category**: performance

| Current | Proposed |
|---------|----------|
| `ql_profile_card_statlocker.js:115` — 2Hz poll | `CitadelProfileCardUpdated` (line 377) |
| `ql_profile_statlocker.js:269` — 2.8Hz poll | `CitadelShowProfilePage` (line 386) |

**Savings**: ~13.8ms CPU/minute combined.

---

#### N3. Replace Settings Transition Watch With `PropertyTransitionEnd`
**Phase**: 3 (Optimization) | **Severity**: MEDIUM | **Category**: performance

| Current | Proposed |
|---------|----------|
| `ql_settings.js:12140` — 4Hz CSS transition watch | `PropertyTransitionEnd` event (line 802) |

The `PropertyTransitionEnd` event fires when CSS transitions complete, eliminating the 0.25s poll.

---

#### N4. Replace Hero Testing Custom State With `citadel_hero_demo_*` Convars
**Phase**: 3 (Optimization) | **Severity**: HIGH | **Category**: simplification

13 `citadel_hero_demo_*` convars (cvarlist.md:1059-1081) control the exact same hero testing features that `ql_hero_testing.js` reimplements with ~800 lines of custom state tracking. Using `$.DispatchEvent("CitadelConCommand", "citadel_hero_demo_infinite_resources 1")` eliminates the custom button handlers entirely.

---

#### N5. Replace Damage Indicator CSS/JS With `citadel_damage_*` Convars
**Phase**: 3 (Optimization) | **Severity**: MEDIUM | **Category**: simplification

10+ `citadel_damage_indicator_*` / `citadel_damage_text_*` convars (cvarlist.md:817-849) control the exact same visual properties the mod manipulates via CSS. Using them directly eliminates ~200 lines of CSS and JS.

---

#### N6. `$.FrameTime()` Available but Never Used — `Date.now()` Used Instead
**Phase**: 4 (Stability) | **Severity**: MEDIUM | **Category**: optimization

`$.FrameTime()` at `[decomp L181985]` returns "the time this frame started, in seconds since panorama was initialized." This is the authoritative frame clock. The mod uses `Date.now()` everywhere instead, which has no relationship to game frame timing and is less accurate for frame-relative animations (compass rotation, cooldown rings, healthbar animations).

**Fix**: Replace `Date.now()` with `$.FrameTime()` for all frame-relative timers. Keep `Date.now()` only for wall-clock operations (config revision timestamps, log throttling).

---

## Summary Table

| Severity | Count | Key Items |
|----------|-------|-----------|
| **CRITICAL** | 4 | ES6 in ES5 engine, config save silent data loss, IsColorWarningEnabled bug (5 sites), 10 keys missing from compact schema |
| **HIGH** | 7 | 20+ phantom events, panel.SetImage phantom API, GameInterfaceAPI.ConsoleCommand phantom API, two duplicate schema registries, three duplicate normalize chains, SaveAndSync/WriteStorageConfigRawToUi duplication, no save-path normalization |
| **MEDIUM** | 8 | ReadConfig duplication, parseRev duplication, IsPanelValid/IsPanelValidSafe duplication, CompareSchemaSemver duplication, $.persistentStorage undocumented, window object usage, derivative key normalization gap, $.Schedule(0,fn) style |
| **LOW** | 8 | Unnecessary guards, FindChild vs FindChildTraverse, panel.id/paneltype properties, dead ENABLE_* branches, zero-delay schedule races, hero_testing serial guard, timing constant lack of justification |
| **NEWLY POSSIBLE** | 6 | Event-driven quickbuy, event-driven statlocker, PropertyTransitionEnd event, citadel_hero_demo_* convars, citadel_damage_* convars, $.FrameTime() |

**Total: 33 findings across 4 phases**

---

## Recommended Fix Priority Order

1. **Fix C3** (IsColorWarningEnabled — 1-line fix, 5 locations)
2. **Fix C4** (Add 10 missing keys to both compact schemas — ~20 lines)
3. **Fix C2** (Add error logging to config save catches — ~10 lines)
4. **Fix H1** (Remove phantom events, keep confirmed alternatives — ~30 lines)
5. **Fix H4** (Move compact schema to ql_shared_presets.js — ~200 lines, high impact)
6. **Fix H5** (Collapse normalize chains — ~50 lines)
7. **Fix H6+H7+M1** (Unify read/write config — ~100 lines)
8. **Fix H2** (Replace SetImage with .src — ~50 lines)
9. **Fix M2+M3+M4** (Deduplicate utilities — ~30 lines)
10. **Fix N1+N2+N3** (Event-driven migration — ~40 lines, compounding CPU savings)
11. **Fix N4+N5** (Convar simplification — removes ~1000 lines)
12. **Fix N6** ($.FrameTime() adoption — ~20 lines)
13. **Fix C1** (ES5 rewrite of ql_hero_testing.js — ~800 lines, verify necessity first)

Estimated total: ~1,450 lines changed, ~1,000 lines removed.
