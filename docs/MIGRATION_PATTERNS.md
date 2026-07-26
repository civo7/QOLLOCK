# QOLLOCK Migration Patterns — Old System → FeatureRegistry

## Why This Document Exists

Every issue discovered during Phase 10 (config bridge dead code, no auto-boot,
enableKey gap, runtime toggle silence) was found reactively — by adversarial review
or in-game testing. Without documented patterns, the remaining 33 feature migrations
hit the same traps. This guide documents the patterns that work.

**Read this before migrating any feature from `QOL.register()` to `FeatureRegistry.register()`.**

---

## Permanent Exceptions — Features That Will Never Be Manifests

Two features cannot be migrated to the manifest system:

| Feature | Reason |
|---------|--------|
| `ql_feat_buildbridge.js` | Loads BEFORE `ql_core.js` in hud.xml. Publishes bare globals (`globalThis._TLog`). Cannot use `QOL.import()` because QOL namespace isn't populated yet. Pre-core bridge. |
| `ql_feat_showrank_card.js` | Loaded from BOTH `hud.xml` AND `profile_card.xml`. Runs in cross-context capacity. Installs `$.ShowRankCardLoaded` global callback. Cannot be a manifest unless FeatureRegistry is also loaded in profile_card context. |

**Do not attempt to migrate these.** Document them in CLAUDE.md as permanent exceptions.

---

## Pattern 1: Manifest Registration (applies to ALL features)

Every feature manifest MUST include:

```js
FR.register({
    id: "ql_<name>",               // lowercase, underscores, no hyphens
    enableKey: "ENABLE_<NAME>",    // the legacy toggle that gates this feature
    enabledByDefault: false,       // ALWAYS false during migration
    settings: [ ... ],             // ALL config keys the old feature reads
    create: function(ctx) { ... }  // returns { onEnable, onDisable, onSettingsChanged }
});
```

**Rules:**
- `id` must match `/^[a-z0-9_]+$/` — no hyphens
- `enableKey` must be the EXACT key used in the old feature's `gate()` / `update()` to check enablement. If the feature has no enable key (always-on gate), omit this field
- **Multi-key features**: If a feature gates on 2+ keys (e.g., `ql_color_warnings` has self/enemy/ally, `ql_legacy_audio_passive` has cooldowns/interval/one-time/DL4D), OMIT `enableKey` entirely. The feature won't auto-enable through the legacy bridge. The `_tick()` function gates internally by checking each sub-key independently. These features become configurable only after Step 7 (Settings UI rebuild)
- `enabledByDefault` must be `false` until AFTER cut-over (Step 8). The old system still runs the feature
- `settings` must include every config key the old feature reads via `cfg.X`, not just those in `configKeys`
- `create()` must be a synchronous factory returning `{ onEnable, onDisable, onSettingsChanged }`

---

## Pattern 2: Config Key Audit (applies to ALL features)

Before wiring a manifest, audit the old feature file for ALL `cfg.X` references:

```bash
grep -oP 'cfg\.\w+' features/ql_feat_<name>.js | sort -u
```

Add every key found to the manifest's `settings[]` with correct `type`:

| Old usage | Schema type |
|-----------|-------------|
| `IsCfgEnabled(cfg, "KEY")` or `cfg.KEY === 1` | `{ key: "KEY", type: "toggle", default: false }` |
| `cfg.KEY` as a number with range | `{ key: "KEY", type: "slider", min: X, max: Y, default: Z }` |
| `cfg.KEY` as a palette index | `{ key: "KEY", type: "palette", default: 0 }` |
| `cfg.KEY` as a dropdown/string | `{ key: "KEY", type: "dropdown", options: [...], default: "..." }` |

Also add `tab` and `section` fields for Step 7 (Settings UI):
```js
{ key: "ENABLE_FEATURE", type: "toggle", default: false, tab: "HUD", section: "Feature Name" }
```

---

## Pattern 3: Polling Features (replaces old bucket/phase dispatch)

The old system uses a central dispatch loop with bucket/phase scheduling:

```js
// OLD — DO NOT USE in manifests
QOL.register("featureName", {
    bucket: 5, phase: -1,
    update: function(root, cfg, nowMs, State, hideoutConnected) { ... }
});
```

New manifests use self-scheduled poll loops:

```js
// NEW — polling feature
create: function(ctx) {
    var _loop = null;
    function _tick() {
        try {
            var cfg = ctx.config.all();
            if (!Number(cfg.ENABLE_FEATURE)) return;
            // ... feature logic ...
        } catch(e) {
            $.Msg("[QOLLock][ERROR][ql_feature] tick: " + (e.message || e));
        }
    }
    return {
        onEnable: function() {
            _loop = QOL.core.Scheduler.createPollLoop(_tick, 1.0, "ql_feature");
        },
        onDisable: function() {
            if (_loop) { _loop.stop(); _loop = null; }
        },
        onSettingsChanged: function() {}
    };
}
```

**Rules:**
- ALWAYS use `QOL.core.Scheduler.createPollLoop()` — never raw `$.Schedule()`
- Store the loop handle and call `.stop()` in `onDisable()`
- Read config via `ctx.config.all()` or `ctx.config.get(key)` — NOT from the old flat config
- Use `ctx.config.get(key)` for 1-2 keys per tick (cheap single lookup). Use `ctx.config.all()` for 3+ keys (one bucket read). Never call `all()` inside a tight loop — call once and cache
- Gate internally: if the enable key is false, return early (don't do work)
- **Always wrap `_tick()` body in try/catch.** Uncaught exceptions kill the poll loop silently. Use `QOL.core.Logger.logError()` or `$.Msg()` to log failures

---

## Pattern 4: CSS-only Features (simplest case)

```js
create: function(ctx) {
    return {
        onEnable: function() {
            var h = $.GetContextPanel().FindChildTraverse("Hud");
            if (h) h.AddClass("feature_class_active");
        },
        onDisable: function() {
            var h = $.GetContextPanel().FindChildTraverse("Hud");
            if (h) h.RemoveClass("feature_class_active");
        },
        onSettingsChanged: function() {}
    };
}
```

CSS file must be imported in `styles/hud.css`:
```css
@import url("s2r://panorama/styles/features/ql_feat_<name>.vcss_c");
```

---

## Pattern 5: Style-only Features (no polling, inline styles)

```js
create: function(ctx) {
    var _lastSig = "";
    function _apply(cfg) {
        var sig = cfg.X + "|" + cfg.Y;
        if (sig === _lastSig) return;  // skip redundant writes
        _lastSig = sig;
        var panel = $.GetContextPanel().FindChildTraverse("target_panel");
        if (!panel) return;
        panel.style.x = cfg.X + "px";
        panel.style.y = cfg.Y + "px";
    }
    return {
        onEnable: function() { _apply(ctx.config.all()); },
        onDisable: function() {
            var p = $.GetContextPanel().FindChildTraverse("target_panel");
            if (p) { p.style.x = "0px"; p.style.y = "0px"; }
        },
        onSettingsChanged: function() { _apply(ctx.config.all()); }
    };
}
```

---

## Pattern 6: Wiring a Manifest into hud.xml

Add ONE `<include>` line in the manifests block (after FeatureRegistry, before ql_app):

```xml
<!-- Phase 9: New feature manifests -->
<include src="s2r://panorama/scripts/manifests/ql_feature/manifest.vjs_c" />
```

**Verification checklist before wiring:**
- [ ] `enabledByDefault: false` confirmed
- [ ] `enableKey` set (or omitted for always-on features)
- [ ] All `cfg.X` keys from old file are in `settings[]`
- [ ] Smoke test passes
- [ ] No duplicate includes in hud.xml
- [ ] Manifest `.js` file exists at `manifests/<name>/manifest.js`

---

## How Config Bridge Works (for reference)

### Boot time
```
Old attribute "Deadlock_Mod_Settings_v1"
  → _unwrapEnvelope() strips {schema, data} wrapper
  → ConfigAdapter.loadFromFlat(flatConfig, enableKeyMap)
  → _coerceType converts 0/1 → true/false for toggle keys
  → OLD_TO_NEW maps old feature IDs → new manifest IDs
  → enableKey injection: if ENABLE_X is truthy → bucket["enabled"] = true
  → ConfigStore.load() stores into per-feature buckets
  → ConfigStore.exportAll() → FeatureRegistry.boot(featureConfig)
  → boot() checks config[id].enabled → calls onEnable() if true
```

### Runtime (500ms polling)
```
User toggles ENABLE_X in old settings UI
  → Old system writes to "Deadlock_Mod_Settings_v1"
  → 500ms poll fires
  → _unwrapEnvelope → loadFromFlat(flatConfig, enableKeyMap)
  → enableKey injection updates "enabled" in ConfigStore
  → _syncFeatureEnabledState() checks each feature:
    - enabled: true but was disabled → FeatureRegistry.enable(id)
    - enabled: false but was enabled → FeatureRegistry.disable(id)
  → onEnable/onDisable called → feature toggles at runtime
```

---

## Common Pitfalls

### Never auto-boot with enabledByDefault: true during migration
The old system still runs the feature. Two systems modifying the same panels = flickering, double-creation, race conditions. Only restore `enabledByDefault: true` after cut-over (Step 8).

### Always call boot()
`ql_app.js` should end with `QOL.core.App.boot();`. Without this, the entire new system is dormant — no config load, no polling, no feature activation.

### EnableKey must be in the old feature's configKeys
ConfigAdapter routes keys through `QOL_FEATURE_REGISTRY.configKeys`. If the enableKey isn't listed there, it falls into the `_legacy` bucket and the injection never fires. Verify:
```bash
grep "configKeys" features/ql_feat_<name>.js
```

### ConfigStore.load() is silent
`load()` writes directly to `_values` without emitting `config:changed`. Always call `_syncFeatureEnabledState()` after `loadFromFlat()` in the polling path to detect state changes. The boot path doesn't need this — `FeatureRegistry.boot()` handles it.

### Two systems, one attribute
Both old and new systems read/write `Deadlock_Mod_Settings_v1`. The old system writes on save. The new system reads on poll. No race condition (single-threaded JS), but be aware: the old system also reads the attribute at boot. If the new system wrote to it during shutdown (via `exportToFlat`), the old system would see those values on next boot. Currently, `exportToFlat` only includes keys from `QOL_FEATURE_REGISTRY`, so new-only keys like `"enabled"` are excluded.

### State access in manifests
Manifests can access `QOL.state` (the old shared State) via try/catch for cross-feature data. But prefer closure-local state where possible. New features should NOT write to `QOL.state` — eventually State will be replaced by EventBus + ConfigStore.

---

---

## Pattern 7: Cross-Feature State Access

**During migration:** Manifests can READ from `QOL.state` via try/catch for cross-feature data. `QOL.state` is set by `ql_core.js` (line 14579 in the `_qolExportDefs` array).

```js
function _tick() {
    var spmPanels = null;
    try {
        var State = QOL.state;
        spmPanels = State && State.spm && State.spm.playerPanels;
    } catch(e) {}
    // ... use spmPanels if available ...
}
```

**Rules:**
- **READ ONLY.** Never WRITE to `QOL.state` from a manifest. Both old and new systems share it — writes corrupt both.
- **Prefer closure state.** Per-feature data (style signatures, timing state, cache hashes) should be `var` inside `create()`, not State keys.
- **Cross-feature shared data** (e.g., `State.topbarSoulSnapshot`, `State.rejuvState`) should eventually migrate to EventBus events (`ctx.events.emit()`). Until then, read-only access to `QOL.state` is acceptable during migration.
- `stateKeys` in the healthbar manifest is a **documentation-only field** — FeatureRegistry ignores it. Do NOT add `stateKeys` to other manifests. Track state ownership in comments instead.

---

## Pattern 8: Healthbar Dispatcher + Variants

The healthbar is fundamentally different from other features. Structure:

```
manifests/ql_healthbar/
├── manifest.js       ← thin dispatcher, delegates to variants
├── shared.js         ← shared style helpers (QOL.healthbar.*)
└── variants/
    ├── minimalist.js ← old-style files, NOT manifests
    ├── accent.js
    ├── budhud.js
    ├── fg.js
    └── mc.js
```

- **Variants remain old-style includes** in hud.xml (loaded before the manifest). They publish to `QOL.healthbar.*` namespace.
- **The manifest dispatches** to variants based on `HEALTHBAR_TYPE` config key.
- **Do not attempt to make variants into manifests** — they share 70+ State keys and are loaded as pre-manifest legacy scripts. This is a Phase 12 task.

---

## Pattern 9: Cross-Context Features

Features loaded outside `hud.xml` cannot use FeatureRegistry unless that context also loads the core modules:

| Context | Has core modules? | Can use manifests? |
|---------|------------------|-------------------|
| `hud.xml` | Yes (lines 74-89) | Yes |
| `profile_card.xml` | No | No — use old includes |
| `hud_escape_menu.xml` | No | No — use old includes |

Before cut-over, run `grep -r "ql_feat_" --include="*.xml"` to find ALL contexts loading a feature. Remove includes from every context, not just hud.xml.

---

## Step 7 Dependency — The Settings UI Gap

When a manifest is wired with `enabledByDefault: false`, users have **no way to toggle it** through the new system until Step 7 (Settings UI rebuild).

- Features WITH `enableKey`: can be toggled via the OLD settings UI (legacy `ENABLE_X` key still works there)
- Features WITHOUT `enableKey` (multi-key, always-on): inaccessible until Step 7

This is a known migration gap. The feature works programmatically (onEnable/onDisable fire when enabled state changes) but there is no user-facing toggle in the new UI yet.

---

## Feature CSS for Polling/Style Features

If a polling or style-only feature needs CSS classes, import the vcss file in `styles/hud.css`:

```css
@import url("s2r://panorama/styles/features/ql_feat_<name>.vcss_c");
```

This is the same convention as CSS-only features (Pattern 4). The CSS file is independent of the manifest — the JS works without it, but may look wrong.

---

## Verification Checklist (per feature)

```
[ ] Manifest has correct id, enableKey, settings, enabledByDefault: false
[ ] All cfg.X keys from old file are in settings[]
[ ] tab and section fields on each settings entry (deferred — omit during initial wiring, add in Step 7)
[ ] Smoke test passes (`node panorama/scripts/tools/qollock_smoke_test.js` — validates old system only)
[ ] Import validation passes (`bash panorama/scripts/tools/validate_imports.sh`)
[ ] Manifest wired into hud.xml (single <include>, no duplicates)
[ ] Adversarial review: 2 agents (correctness + side effects)
[ ] In-game: registration message appears at boot
[ ] In-game: feature activates when enableKey is true in settings
[ ] In-game: feature deactivates when enableKey is false in settings
[ ] In-game: 94/94 preset cycle passes
[ ] Git tag before and after
```
