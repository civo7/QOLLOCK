# QOLLOCK — Deadlock Quality-of-Life Mod

Personal project of maintainer (**predi-i**). High-performance modular Quality-of-Life mod for Valve's Deadlock (Source 2 Panorama engine).

---

## 1. Identity, Authority & Git Rules

- **Maintainer:** `predi-i`
- **Git Author & Committer:**
  - `user.name = Predi-i`
  - `user.email = Predi-i@users.noreply.github.com`
- **Commit Rules:**
  - Every commit MUST be authored and committed strictly as `Predi-i <Predi-i@users.noreply.github.com>`.
  - **NEVER** pass `--author` flags that differ from git config (prevents duplicate GitHub avatar attribution).
  - **NEVER** add `Co-authored-by` or secondary author trailers.
  - Make small, meaningful, logical commits after completing discrete steps.
  - **NEVER push without an explicit user request.** Never create Pull Requests.
- **Pre-Commit Verification:**
  - Run and verify `npm test` before every commit.
  - Complete verification checks: 190+ unit tests, schema fuzz tests, smoke tests, `npm run check:api`, and `npm run lint`.

---

## 2. Project Architecture

QOLLOCK operates on a clean, decoupled modular architecture. All monolithic runtime code has been phased out in favor of isolated feature manifests and typed core subsystems.

```
ql_namespace.js
  → ql_logger.js
  → ql_event_bus.js
  → ql_scheduler.js
  → ql_panel_helpers.js
  → ql_hud.js
  → ql_time.js
  → ql_config_store.js
  → ql_config_adapter.js
  → ql_feature_registry.js
  → ql_app.js (boot coordinator & native engine event bridge)
  → 50 Feature Manifests (panorama/scripts/manifests/<feature_id>/manifest.js)
  → Modular UI (panorama/scripts/ui/window.js, layout.js, controls.js, renderer.js, presets.js, theme.js)
```

### Core Subsystems (`panorama/scripts/core/`)

1. **`ql_namespace.js`**:
   Root namespaces: `QOL`, `QOL.core`, `QOL.ui`, `QOL.features`, `QOL.adapters`. Detects environment role (`hud` vs `em`).
2. **`ql_logger.js` (`QOL.core.logger`)**:
   Leveled, throttled diagnostic logging (`log`, `warn`, `error`) with ring-buffer storage and streak protection.
3. **`ql_event_bus.js` (`QOL.core.EventBus`)**:
   Pub/sub event bus with listener error isolation. Bridged to native Deadlock engine events.
4. **`ql_scheduler.js` (`QOL.core.Scheduler`)**:
   Cooperative polling scheduler with execution timing metrics, jitter distribution, and frame spike detection.
5. **`ql_panel_helpers.js` (`QOL.core.panel`)**:
   Low-level panel safety primitives and zero-waste style mutations (`isPanelAlive`, `safeCreatePanel`, `setStyleIfChanged`, `syncStyles`).
6. **`ql_hud.js` (`QOL.core.hud`)**:
   Deadlock `#Hud` resolution, hideout/streetbrawl state checks, and root class sync.
7. **`ql_time.js` (`QOL.core.time`)**:
   Game clock reader and match timer formatting (`getGameTime`, `formatMatchTime`).
8. **`ql_config_store.js` (`QOL.core.ConfigStore`)**:
   Central reactive configuration store with versioning, schema migration, and change dispatching.
9. **`ql_config_adapter.js` (`QOL.adapters.config`)**:
   Bidirectional bridge between flat config keys (`MOD_CONFIG`) and namespaced manifest settings.
10. **`ql_feature_registry.js` (`QOL.core.FeatureRegistry`)**:
    Feature lifecycle coordinator (`register`, `boot`, `enable`, `disable`, `onSettingsChanged`, circuit-breaker).
11. **`ql_app.js` (`QOL.core.App`)**:
    Application boot coordinator, heartbeat monitor, and native engine event bridge.

---

## 3. The Feature Manifest Standard (Canonical Blueprint)

Every feature in QOLLOCK is an isolated manifest located at `panorama/scripts/manifests/<feature_id>/manifest.js`.

### Canonical Manifest Structure

```javascript
"use strict";

(function() {
    const Q = (typeof globalThis !== "undefined" && globalThis.QOL) ? globalThis.QOL : null;
    if (!Q || !Q.core || !Q.core.FeatureRegistry) return;

    const { panel: PanelHelpers, hud: HudHelper, time: TimeHelper } = Q.core;
    const isAlive = PanelHelpers.isPanelAlive;
    const setStyleIfChanged = PanelHelpers.setStyleIfChanged;

    Q.core.FeatureRegistry.register({
        id: "ql_my_feature",
        metadata: {
            name: "My Feature Name",
            description: "Clear explanation of what this feature does.",
            category: "hud", // hud, minimap, crosshair, healthbar, overlay, audio, ui
            perfTier: "low", // none, low, medium, high
            author: "predi-i",
        },
        settings: {
            MY_FEATURE_ENABLED: { type: "boolean", default: true },
            MY_FEATURE_OPACITY: { type: "number", default: 100, min: 0, max: 100 },
        },
        create: (ctx) => {
            let _panel = null;
            let _pollLoop = null;

            function _applyVisualState() {
                if (!isAlive(_panel)) return;
                const opacity = ctx.config.get("MY_FEATURE_OPACITY", 100);
                setStyleIfChanged(_panel, "opacity", (opacity / 100).toFixed(2));
            }

            function _tick() {
                if (!HudHelper.isInActiveMatch()) return;
                // Periodic tracking logic...
            }

            return {
                onEnable: () => {
                    const hud = HudHelper.findHud();
                    if (!hud) return;

                    _panel = PanelHelpers.safeCreatePanel("Panel", hud, "QOLMyFeatureRoot");
                    _applyVisualState();

                    // Event-driven or low-frequency scheduler (NEVER poll at 60fps)
                    _pollLoop = Q.core.Scheduler.register("ql_my_feature", _tick, 0.5); // 2Hz

                    // Engine event subscriptions via ctx.events
                    ctx.events.on("engine:scoreboard_toggle", (data) => {
                        if (isAlive(_panel)) {
                            _panel.SetHasClass("ScoreboardOpen", !!data?.visible);
                        }
                    });
                },

                onDisable: () => {
                    if (_pollLoop) {
                        Q.core.Scheduler.unregister("ql_my_feature");
                        _pollLoop = null;
                    }
                    if (isAlive(_panel)) {
                        PanelHelpers.safeDeletePanel(_panel);
                        _panel = null;
                    }
                },

                // ZERO-POLLING REACTIVITY: Instantly called when setting changes in UI (0ms latency)
                onSettingsChanged: (key, value) => {
                    if (key === "MY_FEATURE_OPACITY") {
                        _applyVisualState();
                    }
                },

                test: () => {
                    return isAlive(_panel) && _pollLoop !== null;
                },
            };
        },
    });
})();
```

### Manifest Rules

1. **Scoped Context (`ctx`)**:
   - `ctx.config.get(key, fallback)`: Read namespaced setting.
   - `ctx.config.set(key, value)`: Update setting and trigger reactive dispatch.
   - `ctx.events.on(event, handler)`: Scoped event listener automatically cleared on disable.
   - `ctx.events.emit(event, data)`: Dispatches event namespaced as `ql_my_feature:<event>`.
2. **Zero-Polling Reactivity (`onSettingsChanged`)**:
   - Never poll `ctx.config.get()` every scheduler tick.
   - Apply setting changes immediately inside `onSettingsChanged(key, value, allSettings)`.
3. **Scheduler Polling Frequency**:
   - **Idle / Event-Driven:** 0.5s – 1.0s (1–2Hz).
   - **Active Gameplay Tracking:** 0.05s – 0.1s (10–20Hz).
   - **NEVER** register ticks at 60Hz (0.016s) — Deadlock runs at 144–240Hz and excessive polling spikes CPU frame budget.

---

## 4. Native Engine Events (Zero-Polling Reactivity)

Native Deadlock engine events are hooked in `ql_app.js` via `$.RegisterForUnhandledEvent` and bridged to `QOL.core.EventBus`:

| EventBus Event | Native Deadlock Event | Description |
|----------------|-----------------------|-------------|
| `engine:scoreboard_toggle` | `CitadelScoreboardToggle` | Fired when Tab key is pressed/released (`data.visible`) |
| `engine:shop_opened` | `CitadelOpenUpgradeShop` | Fired immediately when player opens the shop (0ms) |
| `engine:shop_closed` | `CitadelExitUpgradeShop` / `CitadelUserMsg_ForceShopClosed` | Fired when player closes the shop |
| `engine:quickbuy_changed` | `CitadelQuickbuyItemsChanged` | Fired when quickbuy queue is modified |
| `engine:escape_menu_toggled`| `CitadelToggleEscapeMenu` | Fired on Escape key menu toggle |
| `engine:game_state_changed`| `CitadelGameStateChanged` | Fired on match state transitions |

**Rule:** Always prefer subscribing to `ctx.events.on("engine:...", handler)` over polling the DOM tree.

---

## 5. Core Helper Functions Reference

### `QOL.core.panel` (`ql_panel_helpers.js`)

- `isPanelAlive(panel)`: Returns `true` if panel is non-null and `panel.IsValid()` is true. Guards against accessing deleted C++ panel pointers.
- `safeCreatePanel(type, parent, id, properties)`: Exception-safe wrapper around `$.CreatePanel`.
- `safeDeletePanel(panel)`: Safely destroys a panel via `DeleteAsync(0)` without throwing if already freed.
- `findHud(preferredRoot)`: Resolves the Deadlock `#Hud` or `CitadelHud` panel with internal cache.
- `findRoot()`: Walks parent nodes up to topmost window root.
- `setStyleIfChanged(panel, property, value)`: **CRITICAL.** Writes `panel.style[property] = value` **only** if value differs from current value. Eliminates redundant C++ layout recalculations.
- `setPanelOpacitySafe(panel, opacity, fallback)`: Writes opacity only on diff.
- `syncStyles(panel, styleMap)`: Batch applies a map of styles, writing only changed attributes.

### `QOL.core.hud` (`ql_hud.js`)

- `findHud()`: Cached lookup for `#Hud`.
- `isInHideout()`: Returns `true` if player is in the Hideout/Sandbox lobby (`connectedToHideout` or `InHideout`).
- `isInStreetBrawl()`: Returns `true` if match mode is Street Brawl (`streetBrawlModeActive`).
- `isInActiveMatch()`: Returns `true` only in live gameplay (not in Hideout, not in main menu).
- `getHudRoot()`: Retrieves root HUD panel.
- `syncRootClass(className, condition)`: Toggles CSS class on HUD root panel.

### `QOL.core.time` (`ql_time.js`)

- `getGameTime()`: Returns current match clock in seconds via `Game.GetGameTime()`.
- `formatMatchTime(seconds)`: Formats seconds into `MM:SS` string.
- `getMatchElapsedSeconds()`: Returns elapsed match time ignoring pre-game countdown.

### `QOL.core.Scheduler` (`ql_scheduler.js`)

- `register(id, callback, intervalSec, jitter)`: Registers a cooperative polling task.
- `unregister(id)`: Removes task.
- `setFrequency(id, intervalSec)`: Dynamically changes polling frequency.

### `QOL.core.ConfigStore` (`ql_config_store.js`)

- `get(key, fallback)`: Read value.
- `set(key, value)`: Write value and broadcast change event.
- `all()`: Get immutable clone of entire config object.

---

## 6. Critical Deadlock Engine Constraints & Gotchas

### 1. Dynamic C++ Panel Generation (The 95% Rule)
- Over 95% of panels in Deadlock are constructed dynamically at runtime by C++ engine code, not declared in XML files.
- XML source files in `pak01_dir/panorama/` show only top-level layout scaffolding.
- **NEVER guess panel IDs or class names.** Always verify element hierarchies using the maintainer's Panorama Debugger tool.

### 2. Zero-Waste Style Engine & Layout Invalidation
- Assigning `panel.style.property = val` every frame forces Source 2 C++ layout recalculation across the entire subtree.
- Always guard style writes using:
  - `setStyleIfChanged(panel, prop, val)`
  - Internal string signature diffing (`_lastStyleSig`)
- Redundant style churn causes microstutters and drops FPS in combat.

### 3. Scrolled Containers & Layout Offsets
- In Source 2 Panorama, `panel.actualyoffset` and `panel.actualxoffset` are **static layout offsets** relative to the parent flow container.
- When an `overflow: squish scroll;` container (such as `SettingsList`) scrolls, `actualyoffset` **DOES NOT DECREASE**.
- For scrolled elements:
  - Use `GameUI.GetCursorPosition()` for visual Y when hovering.
  - Or compute visual Y via `actualyoffset - scrollOffset` using `ScrollThumb` position.
  - Never compare unadjusted `actualyoffset` against viewport height.

### 4. V8 Runtime Environment (No Web APIs)
- Deadlock runs modern V8 (ES6+ features like `const`, `let`, arrow functions, template literals, destructuring, `Map`, `Set` work).
- **There are NO DOM or Web APIs:** No `window`, `document`, `fetch`, `XMLHttpRequest`, `setTimeout`, or `setInterval`.
- Use Panorama primitives: `$.Schedule()`, `$.CancelScheduled()`, `$.Msg()`, `$.CreatePanel()`.

### 5. VPK Compilation & Repack Requirement
- Changes made to `.js`, `.css`, or `.xml` source files DO NOT take effect in-game until compiled into `.vjs_c` / `.vcss_c` and repacked into `pak47.vpk`.
- Repacking is executed by the maintainer. Never claim a visual change is verified in-game without a fresh VPK repack.

---

## 7. Modular Settings UI Workflow

The Settings UI (`panorama/scripts/ui/`) is fully decoupled:

| Module | File | Purpose |
|--------|------|---------|
| Window Shell | `panorama/scripts/ui/window.js` | Settings window lifecycle, search, tabs, footer |
| Layout Declarations | `panorama/scripts/ui/layout.js` | Declarative definitions of tabs, sections, and controls |
| Control Builders | `panorama/scripts/ui/controls.js` | Toggle rows, sliders, dropdowns, change badges, reset buttons |
| Render Engine | `panorama/scripts/ui/renderer.js` | DOM creation and two-way value synchronization |
| Presets | `panorama/scripts/ui/presets.js` | Community presets, config import/export |
| Theme & Locales | `panorama/scripts/ui/theme.js` | Dictionaries, Latin transliteration, theme classes |
| Floating Tooltips | `panorama/scripts/ql_settings_tooltips.js` | Exterior floating tooltip placement and cursor Y alignment |

### How to Add a Setting

1. **Declare in Manifest:** Add key, type, and default to `settings` object in `manifest.js`.
2. **Add to Layout:** Declare row in `panorama/scripts/ui/layout.js` under appropriate tab and section:
   ```javascript
   { key: "MY_FEATURE_ENABLED", type: "toggle", label: "#QOL_MyFeature", desc: "#QOL_MyFeature_desc" }
   ```
3. **Add Localization:** Add text keys in `panorama/scripts/ui/theme.js` (English and Russian dictionaries).
4. **Wire Reactivity:** Handle key in manifest's `onSettingsChanged(key, val)`.
5. **Validate:** Run `npm test` to verify schema fuzzer and unit tests pass.

---

## 8. Verification & Tooling

| Command | Purpose |
|---------|---------|
| `npm test` | Complete verification: 190+ unit tests, schema fuzzer, smoke test, API checker, and linter |
| `node --test tests/ui_tooltips.test.js` | Targeted unit test runner for UI tooltips |
| `npm run check:api` | Anti-hallucination validator: checks all ConCommands and Events against DLL dumps |
| `npm run lint` | ESLint static analysis across all scripts |
| `scripts/simulator/fuzz_build_storage.js` | Fuzz test for build storage migration invariants |

---

## 9. Reference Resources

- **Original Game Source:** `G:\GameTracking-Deadlock` (`game/citadel/pak01_dir/panorama/...`).
- **Engine Dumps & Cvars:** `D:\GitHub2\panorama-deadlock-stuff` (Contains `cvarlist.txt`, `client.dll`, `panorama.dll`, and `strings_dump/`).
- **Architecture Reference:** `D:\GitHub2\peer`
