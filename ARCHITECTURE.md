# QOLLOCK Architecture

Version 3.1.4 — Schema 3.1.4 — 38 features — 0 auto-disabled

## Overview

QOLLOCK is a Deadlock HUD mod running in Source 2's Panorama engine. It operates across two JavaScript contexts — HUD (in-game panels) and Settings (settings UI) — which share no variables and communicate exclusively through panel attribute strings.

The mod follows a **feature plugin architecture**: a thin core runtime dispatches 38 self-contained feature files, each declaring its own config keys, state ownership, dependencies, and update logic through a uniform registration interface.

```
┌──────────────────────────────────────────┐
│           Settings Context               │
│  ql_settings.js                          │
│  (Settings UI, config persistence,       │
│   preset browser, schema utilities)      │
├──────────────────────────────────────────┤
│       ═══ Panel Attributes ═══           │  ← Cross-context bridge
├──────────────────────────────────────────┤
│           HUD Context                    │
│  ┌────────────────────────────────────┐  │
│  │  ql_core.js — Main Runtime         │  │
│  │  Boot → Config Load → Gate Resolve │  │
│  │  → Bucket Dispatch → Feature Exec  │  │
│  └──────────┬─────────────────────────┘  │
│             │                             │
│  ┌──────────┴─────────────────────────┐  │
│  │  ql_features/*.js (35 files)       │  │
│  │  QOL.import() → QOL.register()     │  │
│  │  Each: gate → update → cleanup     │  │
│  └────────────────────────────────────┘  │
│             │                             │
│  ┌──────────┴─────────────────────────┐  │
│  │  Shared Infrastructure             │  │
│  │  ql_utils.js — panel safety, log   │  │
│  │  ql_bridge.js — cross-context      │  │
│  │    channel descriptors, read/write │  │
│  │  ql_state.js — State singleton,    │  │
│  │    panel cache accessors           │  │
│  │  ql_config.js — config merge,      │  │
│  │    normalize, parse, migration     │  │
│  │  ql_shared_presets.js — QOL ns,    │  │
│  │    QOL.import(), QOL.register(),    │  │
│  │    presets, diagnostics, schema     │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

---

## Architectural Principles

Every design decision is governed by these rules. Violations are bugs.

### 1. No Silent Failures

**Degraded or wrong data is a WARN. Unexpected types are a WARN. Throwing is for truly unrecoverable states. Silent is never acceptable.**

| Situation | Behavior |
|-----------|----------|
| Panel cache called with non-panel value | WARN + store null |
| Config key out of range | WARN + clamp to valid range |
| Config key unknown (not in schema) | WARN + pass through (forward compat) |
| Bridge read returns corrupt JSON | WARN + return null |
| Feature gate throws | ERROR + gate returns false |
| QOL.import() missing dependency | ERROR at load time |
| Feature update throws | ERROR + auto-disable after 10 consecutive |
| State key accessed but never declared | WARN |
| Panel deleted mid-frame (style access) | **Silent** — normal Panorama lifecycle, not a bug |

### 2. Single Source of Truth

Every fact about the system lives in exactly one place.

| Fact | Authoritative Source | NOT |
|------|---------------------|-----|
| Config key type, default, range | `CONFIG_SCHEMA` | Inline literals, Normalize functions |
| What features exist | `QOL_FEATURE_REGISTRY` | `FEATURE_DISPATCH_ORDER` |
| Feature execution order | Registry entry (bucket + phase) | Hardcoded array |
| What State keys a feature owns | Feature's `stateKeys` declaration | State initializer |
| Cross-context channel contract | `BRIDGE_CHANNELS` | Ad-hoc `SetAttributeString` calls |

### 3. Features Own Their State, Read Others'

Every State key has exactly one writer — the feature that declares it in `stateKeys`. Other features may read it, never write it. Infrastructure state (e.g., `State.lastConfig`, `State.cachedPanels`) is owned by the core runtime. When a State key has an unexpected value, the owning feature or subsystem is unambiguously responsible.

### 4. Features Don't Know About Features

No feature name appears in another feature's code. No feature name appears as a special case in the dispatch loop. Features interact only through shared config (`cfg.KEY_NAME`), shared State (read-only), and the uniform feature registry. The dispatch loop treats every feature identically.

### 5. Explicit Dependencies

Every external symbol a feature uses must appear in its `QOL.import()` call. No bare global access — no `typeof QOL_UTILS`, no direct `State.` without importing `state`. The import list IS the dependency declaration. If a symbol isn't imported, the feature doesn't use it.

### 6. Panel Access Through the Cache

Features never call `root.FindChildTraverse()` directly in update paths. They use `GetCachedPanel()` or `ResolveCachedPanel()` which caches the result and validates the panel on every access. Direct traversal means repeated DOM walks and stale panel references.

### 7. One File, One Feature

A feature file registers exactly one feature. Exception: trivial variants of the same logic (e.g., `colorWarning` / `enemyColorWarning` / `allyColorWarning`) may coexist in one file as family registrations. Max 3 per file; if a 4th variant is needed, parameterize.

### 8. Config Keys Are Deprecated, Never Removed

User configs in the wild contain old keys. Removing a key from the schema silently drops the user's setting. Instead: mark `deprecated: true`, keep in schema for parsing, stop reading in feature code, migrate value to replacement key.

### 9. Phases Are Atomic

Every architecture change produces a complete, working, testable build. No partial states that depend on a future phase. Each commit survives game launch, zero errors, and full preset cycle.

---

## File Layout

```
panorama/
├── layout/
│   ├── hud.xml                    ← HUD context script includes
│   └── hud_escape_menu.xml       ← Settings context script includes
├── styles/                        ← CSS files
└── scripts/
    ├── ql_utils.js                ← Pure utilities (panel safety, logging, timing, config helpers)
    ├── ql_shared_presets.js       ← QOL namespace, QOL.import(), QOL.register(),
    │                                  presets, diagnostics, shared constants
    ├── ql_bridge.js               ← Typed cross-context channel descriptors (~150 lines)
    ├── ql_state.js                ← State singleton, panel cache accessors
    ├── ql_panelcache.js           ← Typed panel caches (panels/lists/data)
    ├── ql_config.js               ← Config merge, normalize, parse, schema migration
    ├── ql_recent_purchases_data.js ← Static data: recent purchases
    ├── ql_minimap_crate_data.js   ← Static data: minimap crates
    ├── ql_perf_overlay.js         ← Performance overlay (HUD-only)
    ├── ql_core.js                 ← Main runtime: boot, dispatch, bridge exports
    ├── ql_settings.js             ← Settings UI (Settings context only)
    ├── ql_hero_testing.js         ← Hero testing tools (HUD-only)
    ├── ql_features/               ← 34 extracted feature files
    │   ├── ql_feat_ammo.js
    │   ├── ql_feat_betterunsecuredhud.js
    │   ├── ql_feat_bottombar.js
    │   ├── ql_feat_buildbridge.js    ← Loads BEFORE ql_core.js
    │   ├── ql_feat_buildload.js
    │   ├── ql_feat_buildsave.js
    │   ├── ql_feat_chatimg.js
    │   ├── ql_feat_colorwarnings.js  ← 3 features in 1 file
    │   ├── ql_feat_combatstatus.js
    │   ├── ql_feat_damageimpact.js
    │   ├── ql_feat_damagenumbers.js
    │   ├── ql_feat_heroshop.js
    │   ├── ql_feat_items.js
    │   ├── ql_feat_keyboard.js
    │   ├── ql_feat_lanewithparty.js
    │   ├── ql_feat_legacyaudiopassive.js
    │   ├── ql_feat_minimapruntime.js
    │   ├── ql_feat_mousecursor.js
    │   ├── ql_feat_nicknames.js
    │   ├── ql_feat_ondeatharcade.js
    │   ├── ql_feat_panelcache.js
    │   ├── ql_feat_recentpurchases.js
    │   ├── ql_feat_rejuvtimers.js
    │   ├── ql_feat_sigflash.js
    │   ├── ql_feat_souls.js
    │   ├── ql_feat_spm.js
    │   ├── ql_feat_stamina.js
    │   ├── ql_feat_statbonuses.js
    │   ├── ql_feat_statlocker.js
    │   ├── ql_feat_targetshapes.js
    │   ├── ql_feat_topbar.js
    │   ├── ql_feat_unsecuredsouls.js
    │   ├── ql_feat_unspent.js
    │   └── ql_feat_zipboost.js
    └── tools/
        ├── AUDIT_PLAN.md
        ├── trace_deps.py
        ├── fix_bare_exports.py
        └── extract_rejuv.py
```

---

## Load Order and Context Separation

### HUD Context (hud.xml)

```
ql_utils.js                          ← Must be first (IsPanelValid, SafeGetAttribute, logging)
ql_shared_presets.js                 ← QOL namespace, import/register, presets, defaults
ql_bridge.js                         ← Cross-context channel descriptors, safe read/write
ql_state.js                          ← State singleton, panel cache accessors
ql_panelcache.js                     ← Typed panel caches (panels/lists/data)
ql_config.js                         ← Config merge, normalize, parse, migration
ql_recent_purchases_data.js          ← Static data
ql_minimap_crate_data.js             ← Static data
ql_perf_overlay.js                   ← Perf overlay (uses QOL_UTILS directly)
ql_features/ql_feat_buildbridge.js   ← BEFORE core — exports bridge helpers onto QOL.*
ql_core.js                           ← Main runtime
ql_features/*.js (33 files)          ← After core — register via QOL.register()
```

### Settings Context (hud_escape_menu.xml)

```
ql_shared_presets.js                 ← QOL namespace, presets, defaults, diagnostics
ql_bridge.js                         ← Cross-context channel descriptors (shared with HUD)
ql_config.js                         ← Config merge, normalize, parse (shared with HUD)
ql_custom_announcer_slot*_pack_meta  ← Announcer pack metadata (5 files)
ql_settings.js                       ← Settings UI
```

**Critical:** `ql_utils.js` is NOT available in the Settings context. Settings code uses `typeof QOL_UTILS !== "undefined"` guards with inline fallbacks. `ql_config.js` provides its own inline fallbacks for normalize functions when `QOL_SCHEMA_UTILS` is absent.

### Cross-Context Communication

The two contexts share NO JavaScript variables. Communication is exclusively through panel attribute strings on shared panel nodes:

| Channel | Attribute | Direction | Purpose |
|---------|-----------|-----------|---------|
| Config storage | `Deadlock_Mod_Settings_v1` | Settings→HUD | User config persistence |
| Config revision | `QOL_USER_EDIT_REV` | Settings→HUD | Prevents stale config |
| Diagnostics | `QOL_Diag` | HUD→Settings | Feature status, errors, logs |
| Build save request | `QOL_BUILD_SAVE_REQUEST` | Settings→HUD | Build save pipeline trigger |
| Build save state | `QOL_BUILD_SAVE_STATE` | HUD→Settings | Pipeline stage tracking |
| Color bridges (×6) | `QOL_*_COLOR` | HUD→Settings | CSS-reactive style values |

---

## Feature System

### Registration

Every feature calls `QOL.register(name, descriptor)` at load time:

```js
QOL.register("featureName", {
    configKeys: ["CFG_KEY_A", "CFG_KEY_B"],   // Config keys this feature reads
    bucket: 0,                                  // 0–7: intra-tick stagger bucket
    phase: -1,                                  // -1=always, 0–4=phase-scheduler slot
    gate: function(cfg, raw) { return bool; },  // Should this feature run this tick?
    update: function(root, cfg, nowMs, State, hideoutConnected, raw) { },
    cleanup: function(root, cfg, State) { },    // Optional: revert on gate false
    stateKeys: ["key1", "key2"]                 // State keys this feature OWNS
});
```

- Registration is **idempotent** — calling `QOL.register()` with the same name twice is a no-op.
- All fields have safe defaults (bucket=0, phase=-1, gate returns true, etc.).

### Dispatch Loop

The main loop runs at ~5–20Hz (dynamic interval based on UI idle state):

1. **Config load** — Read `Deadlock_Mod_Settings_v1` attribute from root + Hud panels, revision comparison
2. **Parse & merge** — Unwrap JSON envelope, merge user values onto defaults, validate
3. **Gate resolution** — Call each feature's `gate()` function, cache result until config changes
4. **Bucket population** — Active features sorted into 8 buckets by their `bucket` field
5. **Staggered dispatch** — Buckets fire at 0ms, 17ms, 33ms, 50ms, 67ms, 83ms, 100ms, 117ms offsets
6. **Phase scheduler** — Features with `phase >= 0` only run on their assigned tick (0–4 of 5-phase cycle)
7. **Feature execution** — Each feature's `update()` runs inside `ExecuteFeature()` which wraps in try/catch with error streak tracking

### Error Isolation

- Each feature tracks consecutive errors in `State.featureErrorStreaks[name]`
- After 10 consecutive errors, the feature is auto-disabled: `State.featureAutoDisabled[name] = true`
- Auto-disabled features are skipped until game restart
- A single successful execution resets the streak to 0

### Gate Pattern

Gates should be pure functions — no side effects, no panel access. They check:
- Config state: `Utils.IsCfgEnabled(cfg, "KEY")` for booleans, or value comparisons
- Sticky runtime state: `!!State.featureWasEnabled` to allow cleanup after disable
- Connected state: `hideoutConnected` to gate features that need match context

```js
function gate(cfg) {
    // Keep running if config is non-default OR we have state to clean up
    return Utils.IsCfgEnabled(cfg, "ENABLE_FEATURE") ||
           !!(State.featureStyleSig && State.featureStyleSig.length > 0) ||
           GetCachedPanel("featurePanel");
}
```

---

## State Management

### State Object

`State` is a global singleton defined in `ql_state.js` and populated at boot in `ql_core.js`. Panel cache accessors (`GetCachedPanel`, `SetCachedPanel`, `ClearPanelCache`, `SweepStalePanelCache`, `ResolveCachedPanel`) are also defined in `ql_state.js` and published to the `QOL` namespace. Key categories:

| Category | Examples | Owner |
|----------|----------|-------|
| Core loop | `lastConfig`, `lastRawConfig`, `lastResolvedGates`, `allFeaturesDisabled` | Core runtime |
| Error tracking | `featureErrorStreaks`, `featureAutoDisabled`, `_missingFeatureLogged` | Core runtime |
| Panel cache | `cachedPanels` — `{ [key]: Panel \| Panel[] }` | Panel cache subsystem |
| Per-feature | `spm.*`, `rejuvState.*`, `combatStatus.*`, `itemMirror.*`, `compass.*`, etc. | Respective features |
| Style sigs | `*StyleSig` — concatenated style strings for debouncing | Respective features |
| Timestamps | `*NextMs`, `*LastMs`, `*NextSearchMs` — throttling caches | Respective features |

### State Key Rules

1. Every key is declared in a feature's `stateKeys` or owned by core infrastructure
2. Only the declaring feature writes to its keys
3. Other features may read any key but must not write
4. State keys are initialized lazily — first access, not during boot
5. The `cleanup` callback should reset owned state when a feature is fully disabled

### Style-Signature Debouncing

The dominant performance pattern. Instead of writing panel styles every tick:

```js
var newSig = cfg.OPACITY + "|" + cfg.SCALE + "|" + cfg.X_OFFSET + "|" + cfg.Y_OFFSET;
if (State.featureStyleSig === newSig) return;  // Nothing changed, skip
State.featureStyleSig = newSig;
// ... apply style changes ...
```

---

## Panel Cache

### Architecture

`State.cachedPanels` is a flat dictionary of `{ [key]: Panel | Panel[] }`. Keys are categorized by stored type:

| Type | Examples | Validated by |
|------|----------|-------------|
| Single Panel | `healthContainer`, `topBarPanel`, `gameplayHud`, `compassRoot`, ~22 others | `IsPanelValid()` |
| Panel Array | `itemMirrorSlots`, `urnTrackerFriendlyGoldLabels`, `urnTrackerEnemyGoldLabels`, `compassTicks`, `minimap` | `IsPanelListValid()` |

### Accessors

```js
// Single panel — validates on every get, nulls stale entries
var panel = GetCachedPanel("key");        // Returns Panel or null
SetCachedPanel("key", panel);             // Validates before storing

// Panel lists — validated element-by-element
var list = State.cachedPanels.listKey;    // Direct access with || [] guard

// Resolution (traverse + cache)
var panel = ResolveCachedPanel(root, "cacheKey", "DOM_ID");
```

### Lifecycle

- **Get**: `IsPanelValid()` check — returns null and nulls cache if panel was destroyed
- **Set**: `IsPanelValid()` check — stores null if panel is already invalid
- **Sweep**: Once per real-time second, `SweepStalePanelCache()` nulls all dead entries
- **Clear**: `ClearPanelCache()` resets entire dictionary to `{}`
- **Priming**: `EnsureCachedPanelByIds()` and friends pre-populate cache on first access

### Gotchas

- `SetCachedPanel("key", [])` silently stores `null` because `IsPanelValid([])` returns false. Always use direct `State.cachedPanels.listKey = []` for array keys.
- `GetCachedPanel` with an array key returns `null`. Array keys must be accessed directly.
- Panel deletion is asynchronous — a valid panel at the top of a function may be invalid by the bottom.

---

## Config System

Config functions live in `ql_config.js` — shared between HUD and Settings contexts. This includes `BuildDefaultConfig`, `MergeConfig`, `SafeParseConfig`, and the full normalize chain (~15 functions). All functions are published to the `QOL` namespace for feature files via `QOL.import()`.

### Storage Flow

```
Settings UI (ql_settings.js)
  → MarkConfigDirty()        [0.3s debounce]
    → SaveAndSync()
      → WrapConfigForStorage()
      → SetAttributeString("Deadlock_Mod_Settings_v1", json)     [root + Hud panels]
      → SetAttributeString("QOL_USER_EDIT_REV", rev)             [monotonic counter]

HUD Loop (ql_core.js)
  → ReadStorageConfigRawFromUi(root)
    → GetAttributeString from root + Hud panels
    → Highest revision wins (Hud wins tie)
  → SafeParseConfig(raw)
    → UnwrapConfigFromStorage()    [handles enveloped + legacy flat JSON]
    → MergeConfig(unwrapped)       [overlay onto defaults]
    → Normalize* chain             [migrate old schema values]
  → State.lastConfig = cfg
```

### Key Patterns

- **Defaults**: `BuildDefaultConfig()` returns a fresh copy of all default values. Never mutate it.
- **Merge**: User values overlay defaults. Missing keys get defaults, unknown keys pass through.
- **IsCfgEnabled**: `Number(cfg[key]) === 1` — the standard boolean check.
- **Normalize functions**: ~15 functions handle schema migration (e.g., splitting old compound keys into new granular ones).

---

## The QOL Namespace and Dependency Injection

### QOL.import()

```js
// ql_shared_presets.js — available in BOTH contexts
QOL.import = function(names) {
    var out = {}, missing = [];
    for (var i = 0; i < names.length; i++) {
        var val = QOL[names[i]];
        if (val !== undefined) { out[names[i]] = val; }
        else { out[names[i]] = undefined; missing.push(names[i]); }
    }
    if (missing.length > 0) {
        $.Msg("[QOLLock][BRIDGE] missing " + missing.length + " dependency(s): " + missing.join(", "));
    }
    return out;
};
```

Resolution is a simple property lookup on the global `QOL` object. Missing dependencies log an error but don't throw — the caller gets `undefined` and must handle it (typically caught by the self-test).

### QOL Namespace Population

`ql_core.js` exports ~170 symbols to the `QOL` namespace via a data-driven lazy-getter array:

```js
var _qolExportDefs = [
    ["state", function() { return State; }],
    ["getCachedPanel", function() { return GetCachedPanel; }],
    ["setCachedPanel", function() { return SetCachedPanel; }],
    // ... ~170 more entries ...
];
```

Lazy getters defer identifier resolution so a single missing symbol doesn't crash the export loop.

---

## Feature File Template

Every feature file follows this structure exactly:

```js
// ql_feat_example.js — Brief description
// Extracted from ql_core.js, Phase 9 Step N
(function() {
    'use strict';
    var _featureId = "ql_feat_example";
    var _deps = QOL.import(["state", "utils", "getCachedPanel", "setCachedPanel"]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var GetCachedPanel = _deps.getCachedPanel;
    var SetCachedPanel = _deps.setCachedPanel;

    // ── Constants ──
    var MY_CONSTANT = 100;

    // ── Gate ──
    function gate(cfg) {
        return Utils.IsCfgEnabled(cfg, "ENABLE_EXAMPLE") ||
               !!(State.exampleStyleSig && State.exampleStyleSig.length > 0);
    }

    // ── Update ──
    function UpdateExample(root, cfg) {
        // Compute style signature
        var newSig = cfg.EXAMPLE_OPACITY + "|" + cfg.EXAMPLE_SCALE;
        if (State.exampleStyleSig === newSig) return;
        State.exampleStyleSig = newSig;

        // Access panels through cache
        var panel = GetCachedPanel("examplePanel");
        if (!panel && root && root.FindChildTraverse) {
            panel = root.FindChildTraverse("ExamplePanel");
            SetCachedPanel("examplePanel", panel);
        }
        if (!Utils.IsPanelValid(panel)) return;

        // Apply changes
        Utils.SetPanelOpacitySafe(panel, cfg.EXAMPLE_OPACITY);
        Utils.SetStyleSafe(panel, "transform", "scaleX(" + cfg.EXAMPLE_SCALE + ")");
    }

    // ── Registration ──
    QOL.register("example", {
        configKeys: ["ENABLE_EXAMPLE", "EXAMPLE_OPACITY", "EXAMPLE_SCALE"],
        bucket: 4, phase: -1,
        gate: gate,
        update: function(root, cfg) {
            try { UpdateExample(root, cfg); }
            catch(e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] " + e.message + "\n" + e.stack);
                throw e;
            }
        },
        stateKeys: ["exampleStyleSig"]
    });

    // ── Self-test ──
    try {
        if (typeof UpdateExample !== "function") throw new Error("UpdateExample is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " +
              (e && e.message ? e.message : String(e)));
    }
})();
```

### Naming Conventions

| Convention | Example |
|-----------|---------|
| Feature file | `ql_feat_example.js` |
| Feature ID | `"exampleFeature"` |
| Main update function | `UpdateExample()` or `UpdateExampleRuntime()` |
| Gate function | `gate()` |
| State style sig | `State.exampleStyleSig` |
| Panel cache key | `"examplePanel"` |
| State sub-object | `State.example.*` |

---

## Phase Scheduler

A 5-phase scheduler spreads expensive features across ticks to prevent frame drops:

| Phase | Index | Features |
|-------|-------|----------|
| SPM + Statlocker | 0 | `spm`, `statlocker` |
| Rejuv + Nicknames | 1 | `rejuvTimers`, `nicknames` |
| Unspent + Lane | 2 | `unspent`, `laneWithParty` |
| Unsecured Souls | 3 | `unsecuredSoulsTimer` |
| Stat Bonuses | 4 | `statBonuses` |

Features with `phase: -1` (the majority) run every tick. Features with `phase: 0–4` only run when the scheduler reaches their phase. This is separate from the **bucket system** (8 intra-tick offsets at 0–117ms).

---

## Common Patterns

### Adding a New Feature

1. Create `ql_feat_newname.js` following the template above
2. Add `<include src="ql_features/ql_feat_newname.vjs_c" />` to `hud.xml` (after ql_core.js)
3. Add config keys to `QOL_DEFAULT_CONFIG` in `ql_shared_presets.js` (with defaults)
4. Add the feature name to `FEATURE_DISPATCH_ORDER` in `ql_core.js`
5. Repack VPK, launch game, verify feature loads and preset cycle passes

### Adding a Config Key

1. Add entry to `QOL_DEFAULT_CONFIG` with sensible default
2. Add any normalization logic if the key replaces/extends an older key
3. Add UI row in `ql_settings.js` (tab render function)
4. Feature code reads `cfg.NEW_KEY` — no other changes needed

### Debugging a Feature

1. Check `QOL_DumpDiagnostics()` output — shows loaded features, auto-disabled, error streaks
2. Run preset cycle from Settings → Dev panel — tests all 92 presets sequentially
3. Check Panorama console for `[QOLLock][ERROR]` and `[QOLLock][WARN]` messages
4. Enable perf overlay to see per-feature timing

---

## Anti-Patterns and Gotchas

### DO NOT

- **Store non-panel values via SetCachedPanel** — it calls IsPanelValid() which returns false for arrays/objects. Use direct State.cachedPanels assignment for arrays and plain data.
- **Access State directly without importing it** — use `_deps.state` via QOL.import().
- **Call FindChildTraverse in update loops** — use GetCachedPanel/ResolveCachedPanel instead.
- **Hardcode feature names in dispatch** — features declare their needs in QOL.register().
- **Remove config keys from the schema** — mark deprecated instead.
- **Add bare QOL_X global references in feature files** — use QOL.import().
- **Log in hot paths without a guard** — use throttled logging or debug flags.
- **Catch exceptions silently** — every catch must log at minimum, unless it's a panel lifecycle guard.

### Panel Lifecycle

- Panels are destroyed asynchronously by Panorama. A panel valid at the top of a function may be invalid by the bottom.
- `try { panel.style.x = "0px"; } catch(e) {}` with NO log is correct for panel lifecycle guards.
- `IsPanelValid()` is the authoritative check: `panel != null && typeof panel.IsValid === "function" && panel.IsValid()`.
- Always check `IsPanelValid()` before accessing `.style`, `.text`, `.id`, `.FindChildTraverse()`, etc.

### Performance

- Features that are OFF should do zero work. Gates should return false fast.
- Style-signature debouncing is the primary optimization: compare a concatenated string, skip all DOM work if unchanged.
- Panel cache avoids repeated DOM tree walks. A cache miss triggers one FindChildTraverse; a hit costs one IsPanelValid() call.
- Stagger buckets (0–7) spread feature execution across ~117ms within each tick to prevent frame spikes.
- Phase scheduler (0–4) spreads expensive features across 5 ticks.

### Testing

- Every change requires VPK repack + game launch. No hot-reload.
- Preset cycle (92 presets, 1.2s each) verifies no feature crashes across all config combinations.
- Diagnostic output shows: features loaded, auto-disabled, error streaks, console log buffer.
- Perf overlay shows per-feature timing — useful for catching regressions in update functions.

---

## Future Architecture (Planned)

The architecture is evolving toward a cleaner separation under the `architecture-overhaul` branch:

1. **~~ql_state.js~~** — ✅ Done. State object and cache accessors extracted from ql_core.js (757 lines).
2. **~~ql_config.js~~** — ✅ Done. Config merge/normalize/parse/migration extracted (328 lines).
3. **~~ql_panelcache.js~~** — ✅ Done. Three typed caches (panels/lists/data) with backward-compat dual-write (~170 lines).
4. **~~ql_bridge.js~~** — ✅ Done. 18 duplicated constants unified, typed channel descriptor map, safe read/write helpers (~150 lines).
5. **Registry-driven dispatch** — Replace hardcoded FEATURE_DISPATCH_ORDER
6. **Extract remaining inline features** — coreRoot (~350 lines) and healthbarRuntimeHelpers (~1,200 lines)
7. **Schema-driven settings UI** — Reduce ql_settings.js from 23K to ~10K lines

See `/home/bytenode/.claude/plans/melodic-riding-map.md` for the full plan.
