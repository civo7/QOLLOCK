# QOLLOCK Architecture and AI Contributor Guide

This is the consolidated technical entry point for working on QOLLOCK. Read it
before changing runtime code, settings or visible text. It describes the current
source architecture, not a proposed rewrite. Detailed subsystem documents remain
linked below; old migration plans and audit snapshots are not current API specs.

Reconciled with source on **2026-09-26**. Paths are relative to this repository
unless explicitly absolute. Source files and active XML includes settle questions
about implementation; the maintainer's Panorama Debugger settles questions about
the native panel tree. Neither this guide nor a green simulator run proves
in-game behavior.

## Contents

1. [Rules that prevent recurring mistakes](#1-rules-that-prevent-recurring-mistakes)
2. [Runtime contexts and loading](#2-runtime-contexts-and-loading)
3. [Source ownership map](#3-source-ownership-map)
4. [Reuse these helpers](#4-reuse-these-helpers)
5. [Feature lifecycle and scheduling](#5-feature-lifecycle-and-scheduling)
6. [Configuration and adding settings](#6-configuration-and-adding-settings)
7. [Localization is part of every UI change](#7-localization-is-part-of-every-ui-change)
8. [Persistence and cross-context communication](#8-persistence-and-cross-context-communication)
9. [Settings UI controls and previews](#9-settings-ui-controls-and-previews)
10. [Panorama styles assets and native evidence](#10-panorama-styles-assets-and-native-evidence)
11. [Feature ownership and boundaries](#11-feature-ownership-and-boundaries)
12. [Verification and tooling](#12-verification-and-tooling)
13. [Task completion checklists](#13-task-completion-checklists)
14. [Documentation map and historical traps](#14-documentation-map-and-historical-traps)

## 1. Rules that prevent recurring mistakes

- **Follow applicable contributor instructions and the task's authorization.**
  This guide describes technical contracts and does not grant permission for
  operational actions.
- **Search for a helper before implementing one.** Start with section 4 and
  [HELPERS.md](docs/HELPERS.md), then read the implementation and a real caller.
  Similar names do not imply identical traversal, caching or style semantics.
- **Localize all user-facing copy, including Dev/debug UI.** Settings text uses
  the English-key catalogs and `LocalizeSettingsText`; Valve `#tokens` are a
  separate mechanism. Do not add inline Russian/English branches or untranslated
  dynamic labels. See section 7 for the actual API and exceptions.
- **Identify the script context before choosing an API.** HUD, escape-menu,
  profile, quickbuy and hero-testing scripts do not all share globals. A helper
  existing on disk does not make it available in every layout.
- **A setting is a cross-layer contract.** Defaults, metadata, UI, feature routing,
  normalization, wire format and presets must agree. Adding a control alone is
  insufficient. Ask the maintainer for new defaults; do not invent them.
- **Do not guess game commands, event signatures, IDs or panel ancestry.** Use
  existing verified examples, game extracts and debugger evidence. An identifier
  appearing in a DLL or passing the API checker does not prove its call contract.
- **Own cleanup.** Disable, destroyed/replaced panels, hideout, shop, respawn and
  match transitions are normal. Cancel owned work, undo owned styles/classes,
  remove owned UI and reset panel-dependent caches/signatures.
- **Preserve user data.** Reuse parsers, revision checks and existing storage
  paths. Invalid input or a late restore must not overwrite newer valid settings.
  Never change an old compact schema in place to fit a new control.
- **Measure the relevant thing.** Offline tests establish modeled JS behavior;
  profiler counters are not frame times. Rendering, C++ panel lifecycle and
  restart durability need an actual client scenario.
- **Builds belong to the maintainer.** Never execute `build_mod` scripts or
  `resourcecompiler.exe`, touch game `addons`, or create/modify VPK files. Source
  edits are invisible in game until the maintainer compiles and repacks.
- **Keep a clean cutover.** Do not leave a second implementation, fallback copy,
  duplicate watcher or old active include beside the replacement. Existing
  compatibility readers and intentionally disabled functionality require their
  own evidence before removal or activation.

## 2. Runtime contexts and loading

QOLLOCK runs in Deadlock's Source 2 Panorama: XML layouts, Panorama CSS and
JavaScript. Runtime files use script globals/IIFEs and namespace registration,
not Node `require`, an ES-module bundler or a browser application framework.
Node/npm are development tools, not the in-game runtime.

| Context | Authoritative entry | What belongs there |
| --- | --- | --- |
| In-match HUD | [hud.xml](panorama/layout/hud.xml) | Core services, shared infrastructure/data, feature manifests, application boot |
| Escape-menu settings | [hud_escape_menu.xml](panorama/layout/hud_escape_menu.xml) | Shared utilities/parser/storage, locale dictionaries, UI modules, settings bootstrap |
| Profile page | [citadel_db_page_profile.xml](panorama/layout/citadel_db_page_profile.xml) | Profile-specific callbacks and statlocker behavior |
| Profile card | [profile_card.xml](panorama/layout/profile_card.xml) | Card-specific rank/statlocker scripts and callbacks |
| Quickbuy | [hud_quickbuy.xml](panorama/layout/hud_quickbuy.xml) | Quickbuy total-summary script and local panel lifecycle |
| Hero testing | [hud_hero_testing.xml](panorama/layout/hud_hero_testing.xml) | Sandbox/hero-testing controls and their context-specific APIs |

The HUD and settings have separate JavaScript contexts. Their `QOL` objects,
config objects and event buses are not shared memory. Cross-context communication
uses native panel attributes/bridge channels. The embedded HTML storage page is
yet another execution environment; its browser APIs are not Panorama APIs.

**HUD order:** namespace and utilities -> core services -> shared presets/bridge,
state, cache and config -> shared data -> feature manifests -> `core/ql_app.js`.
Healthbar shared code and variants load before their dispatcher manifest. Respect
real dependency ordering even where an XML comment says manifests are independent.

**Settings order:** namespace/utilities/panel helpers/shared presets/bridge/config
-> locale catalogs -> arcade/previews/tooltips/persistence/update checker -> UI
metadata/renderer/modules -> `ql_settings.js`. The settings context deliberately
has no gameplay FeatureRegistry or feature manifests. Shared low-level core
helpers being present does not mean all HUD services exist there.

Use [scripts/simulator/layout.js](scripts/simulator/layout.js) when tools need the
load graph: `hudScripts()`, `settingsScripts()` and `parseLayoutScripts(layoutPath)`
read actual includes and ignore XML comments. Do not maintain a second hardcoded
script/feature list. Likewise, stale comments saying “disabled” do not disable an
active include.

Panorama provides `$.CreatePanel`, `$.Schedule`, native panel methods and event
APIs. Do not assume DOM `window`/`document`, `fetch`, `XMLHttpRequest`, WebSockets,
`setTimeout` or `setInterval`. Defensive `typeof window` checks in shared files
are compatibility guards, not evidence that browser APIs are available in HUD.

## 3. Source ownership map

| Path | Responsibility / editing boundary |
| --- | --- |
| `panorama/layout/` | Native layout overrides, script/style includes and XML callbacks |
| `panorama/scripts/core/ql_namespace.js` | Base `QOL`, `QOL.core`, `QOL.ui`, `QOL.features` namespaces |
| `panorama/scripts/core/ql_app.js` | HUD boot, flat-config synchronization, feature enable-state reconciliation and client bridges |
| `panorama/scripts/core/ql_feature_registry.js` | Manifest registration, scoped feature contexts and lifecycle |
| `panorama/scripts/core/ql_config_store.js`, `ql_config_adapter.js` | Feature config buckets and flat/bucket conversion |
| `panorama/scripts/ql_config.js` | Canonical input parsing, normalization and config constants shared with settings |
| `panorama/scripts/ql_shared_presets.js` | Default values, presets, compact schemas/codecs, shared constants and compatibility exports |
| `panorama/scripts/core/ql_persistence.js` | Live config publication, revisions/edit stamps and root selection |
| `panorama/scripts/core/ql_storage_bridge.js` | Embedded HTML/localStorage protocol and asynchronous save/load coordination |
| `panorama/scripts/ql_bridge.js` | Named cross-context channel descriptors and panel-attribute access |
| `panorama/scripts/ql_utils.js` | Leaf utilities: validity, numbers, time, styles, attributes, palette and traversal |
| `panorama/scripts/core/ql_panel_helpers.js` | Shared panel creation, lookup, styling and cleanup APIs |
| `panorama/scripts/core/ql_hud.js`, `ql_hero_probe.js` | HUD/player discovery and current-player/hero evidence |
| `panorama/scripts/ql_state.js`, `ql_panelcache.js` | Existing shared runtime state and typed caches; not persistent user settings |
| `panorama/scripts/manifests/<id>/manifest.js` | Gameplay feature config declaration and lifecycle implementation |
| `panorama/scripts/manifests/ql_healthbar/` | One dispatcher plus shared code and five variant implementations |
| `panorama/scripts/ql_settings.js` | Mutable settings-side `MOD_CONFIG`, module dependency injection and bootstrap |
| `panorama/scripts/ql_settings_persistence.js` | Settings-side normalization, publication, import/export and update glue |
| `panorama/scripts/ui/` | Settings shell, metadata, controls, registered tab renderers, search, drag, modals, themes and storage UI |
| `panorama/scripts/ql_settings_previews.js` | Preview ownership, positioning and update dispatch |
| `panorama/scripts/ql_settings_tooltips.js` | Shared tooltip creation, text and scroll/position tracking |
| `panorama/scripts/ql_settings_loc/` | Shipped runtime locale dictionaries; the UI text source of truth |
| `panorama/scripts/ql_arcade_games.js` | Six arcade games and settings-side on-death bridge; not another settings implementation |
| `panorama/scripts/features/ql_feat_showrank_card.js` | Special-context profile-card rank callback; not a HUD manifest |
| `panorama/scripts/ql_recent_purchases_data.js`, `ql_minimap_crate_data.js` | Feature data tables, not generic utility containers |
| `panorama/styles/`, `panorama/images/`, `panorama/fonts/` | Styles and visual resources |
| `sounds/`, `soundevents/` | Audio resources/event definitions; coordinate with runtime audio dispatch |
| `scripts/` | Node/Python validation, profiling, translation and development tools |
| `scripts/simulator/`, `tests/` | Offline runtime model, fixtures and regression scenarios |
| `translations/` | CSV/JSON translation exchange files, not the dictionaries loaded by XML |
| `tools/local_chat_translation/` | Separate optional Python translation/image helper |
| `build_mod/` | Maintainer-owned compilation/packaging data and scripts; not agent-run tooling |

In rows with a second abbreviated filename, it is in the same directory as the
first. The feature atlas in section 11 identifies individual gameplay owners.

## 4. Reuse these helpers

Read [HELPERS.md](docs/HELPERS.md) and the implementation before copying a utility.
`QOL_UTILS` is the leaf utility object; `QOL.utils` exposes the same object through
the shared bridge. Names and capitalization matter. Private implementation names
are not exported APIs.

| Need | Existing API | Important boundary |
| --- | --- | --- |
| Live panel check | `QOL_UTILS.IsPanelValid(panel)`; `QOL.core.panel.isAlive(panel)` | Rejects missing, stale and throwing handles; does not establish ownership/visibility |
| Live panel list | `QOL_UTILS.IsPanelListValid(list)` | An empty list is false, not a cached successful lookup |
| Safe attributes | `QOL_UTILS.SafeGetAttribute(panel, key, fallback)` / `SafeSetAttribute(panel, key, value)` | Generic string access, not revision-aware config publication |
| Direct child / descendant | `QOL.core.panel.findChild(parent, id)` / `findTraverse(root, id)` | Different search scopes; use the narrowest authoritative root |
| Class descendants | `QOL_UTILS.FindPanelsByClass(root, className)` / `FindFirstPanelByClass(root, className)` | Native class traversal; not a player-identity selector |
| Ancestor class | `QOL_UTILS.FindAncestorWithClass(panel, className)` / `HasClassInHierarchy(panel, className)` | Includes starting panel; no depth cap, unlike some feature-local searches |
| Root / HUD | `QOL.core.panel.findRoot(panel?)` / `findHud(preferredRoot)` | Root fallback is possible; existence alone is not proof of gameplay |
| Create / delete | `QOL.core.panel.create(type, parent, id, properties)` / `delete(panel)` | Creation can return null; deletion is asynchronous |
| Read text | `QOL.core.panel.readText(panel)` / `readTextDeep(panel, maxDepth)` | Deep read returns first nonempty text, not necessarily the desired stat |
| One style, conditional | `QOL_UTILS.SetStyleIfChanged(panel, property, value)` | Use only where native read-back comparison is appropriate |
| One style, unconditional | `QOL_UTILS.SetStyleSafe(panel, property, value)` | Preserve deliberate reassertion; do not silently make this conditional |
| Opacity | `QOL_UTILS.SetPanelOpacitySafe(panel, value, fallback)` | Normalizes to 0–1 and formats; not percentage input |
| Clear an override | `QOL.core.panel.clearStyleProperty(panel, property)` | Uses native ClearPropertyFromCode; also used by leaf ClearStyleSafe before its legacy fallbacks |
| Style map | `QOL.core.panel.syncStyles(panel, styleMap, lastSig)` | Returns `{changed, sig}`; caller retains and invalidates the signature |
| Class / visibility | `QOL.core.panel.setClass(panel, className, active)` / `setVisible(panel, visible)` | Class setter compares first; visible setter does not |
| Palette | `QOL.core.panel.normalizePaletteIndex(value)` / `resolvePaletteColor(value)` | Reuse palette indices/options; do not introduce unrelated color encodings |
| Panel / list cache | `QOL.panelCache.getPanel/setPanel`, `getList/setList` | Typed getters validate; keys share a context-wide namespace |
| Cached descendant | `QOL.panelCache.resolve(parent, cacheKey, traverseId)` | Validates parent/ID and live ancestry before reusing the cached panel |
| Non-panel cache | `QOL.panelCache.getData/setData` | No handle validation; do not store arbitrary data in a panel slot |
| Config enabled test | `QOL_UTILS.IsCfgEnabled(cfg, key)` | `Number(value) === 1`, not generic JavaScript truthiness |
| Bounded numeric value | `QOL_UTILS.ClampConfigNumber(value, fallback, min, max, shouldRound)` | Optional rounding before clamp; not schema-step snapping |
| Offset / pixel string | `QOL_UTILS.NormalizeHudOffsetNumber(value, fallback)` / `FormatHudPx(value, fallback)` | Integer pixel offsets, not percentages |
| Opacity / HUD scale | `QOL_UTILS.NormalizeOpacityNumber(value, fallback)` / `NormalizeHudScaleNumber(value, fallback)` | Scale helper clamps to 0.5–1.5; unsuitable for every feature's range |
| Angle math | `QOL_UTILS.NormalizeDegrees360`, `NormalizeDegrees180`, `ShortestDegreesDelta` | Reuse existing wrap/delta semantics; validate non-finite inputs separately |
| Geometry | `QOL_UTILS.ReadSafePanelLayoutOffset(value)` / `GetPanelPositionRelativeToAncestor(panel, ancestor)` | Rejects unusable offsets; ancestor walk is bounded; not a universal DPI conversion |
| Match clock | `QOL.core.time.readGameTime(topBar)` / `parseClockSeconds(text)` / `formatSeconds(seconds)` | Missing/unparseable clock returns 0, indistinguishable from match start |
| Current time | `QOL_UTILS.PerfNowMs()` | Date-based milliseconds, not a high-resolution performance clock |
| Account ID text | `QOL_UTILS.ParseAccountId(value)` | Reuse parser; preserve the caller's authoritative identity source |
| Runtime errors | `QOL.core.Logger.logError(featureId, message)` / `logWarn`, `logInfo`, `logDebug` | Throttled logger has a bounded report buffer; format expensive debug text only when enabled |

For mode/class detection use [core HUD helpers](docs/core/hud.md), not another
handwritten collection of guessed hideout classes. For hero evidence use
[heroProbe](docs/core/hero_probe.md). A hero probe can return no result while
panels are loading; it is not a direct game-state API.

**Cache invariants:** live does not mean current player/match/root. Clear only
owned keys on transitions. Reset signatures when replacing a panel, or the same
settings can suppress the first write to its replacement. Missing-result backoff
must eventually retry. Generic `resolve` supplies neither backoff nor lifecycle
cleanup. Keep bounded, ordered, identity-sensitive searches local where needed.

## 5. Feature lifecycle and scheduling

Active gameplay implementations register in
`panorama/scripts/manifests/<id>/manifest.js`. Read an analogous existing manifest
and [FeatureRegistry](docs/core/feature_registry.md) before adding one. Registration
metadata and the `create(ctx)` factory are separate from the returned instance's
`onEnable`, `onDisable`, `onSettingsChanged` and optional read-only `test` hooks.

The registry registers settings and a synthetic `enabled` key in ConfigStore.
Enable policy can use `isEnabled(cfg)`, `enableKey`, OR-combined `enableKeys`, or
default/always-on behavior. Custom predicates take precedence; an `enableKey`
name alone does not describe a manifest with an additional predicate. Numeric
modes need explicit predicates rather than truthiness. Registration default is
not automatically a persisted setting or an exposed control.

`ctx` contains:

- `id`: feature ID.
- `config.get(key)`, `getBool(key)`, `set(key, value)`, `all()`, `view()`.
  `all()` allocates a shallow copy; `view()` is live and read-only by convention.
- `events.on(fullEventName, handler)`, `off(fullEventName, handler)` and
  `emit(localEventName, payload)`. Only emission adds the feature-ID prefix.

`onSettingsChanged` takes **one payload**, including
`{featureId, key, value, changes: {[key]: value}}`. It does not take
`(key, value, allSettings)`. Read current values through `ctx.config`. React to
configuration in the hook; poll only observations that require polling. A HUD
hook is downstream of cross-context publication/polling, not a zero-latency path.

Use `QOL.core.Scheduler.createPollLoop(callback, seconds, ctx.id)` for recurring
feature work. It returns `{stop(), reschedule(seconds)}`. `Scheduler.schedule`
is an alias for a recurring loop, **not** a one-shot timer. The first tick is
staggered; `reschedule` affects subsequent scheduling without restarting the
pending tick. `cancelAllForFeature(id)` only owns managed loops for that ID.
See [scheduler](docs/core/scheduler.md) for error/timing behavior.

On disable, undo owned classes/styles/panels, unregister your event handlers,
cancel raw scheduled callbacks and clear owned caches. The registry cancels
managed loops after cleanup, but does not automatically unsubscribe `ctx.events`
listeners or cancel unrelated `$.Schedule` handles. Zero can be a valid native
schedule handle: use explicit null-state tracking where you own cancellation.
Token-guard delayed callbacks when cancellation alone cannot prevent stale work.

Scheduler stops a loop when its captured native context is invalid. Ten
consecutive observed poll errors cause registry auto-disable; a successful tick
after errors resets the streak. Do not hide unexpected exceptions inside a
blanket catch and thereby bypass observation. Handle expected stale panels
without log spam. Lifecycle exceptions and poll exceptions have different paths.

`core/ql_app.js` boots last, loads flat configuration, populates feature buckets,
boots the registry and polls the config bridge every 0.25 seconds. It forwards
native shop, scoreboard, escape-menu and game-state signals to `engine:*` events.
Those events are notifications, not guaranteed final native layout snapshots.
The optional ForceShopClosed listener is a compatibility probe, not proof that
arbitrary native event names are dispatchable.

## 6. Configuration and adding settings

There are several related representations, not one interchangeable object:

| Representation | Owner / purpose |
| --- | --- |
| `QOL_DEFAULT_CONFIG` | Flat defaults in `ql_shared_presets.js`; known-key set for settings and persistence |
| `MOD_CONFIG` | Mutable escape-menu settings object; obtain it at use time via `QOL.getSettingsConfig()` |
| ConfigStore feature buckets | HUD-side schema-validated slices consumed by manifests |
| `State.lastConfig` | Existing HUD flat runtime snapshot; not the settings realm's object |
| Versioned envelope / compact code | Storage and sharing formats; independent of package/release version |
| `QOL_PRESETS` | Named preset values layered over defaults by the preset application flow |

[ConfigAdapter](docs/core/config_adapter.md) builds key ownership from registered
manifest settings, including multitoggle options. Shared keys can belong to
multiple features; imports must reach every owner. Do not assume a single
key-to-feature mapping or add an obsolete `ql_core.js` dispatcher entry.

[ConfigStore](docs/core/config_store.md) validates registered bucket keys. Flat
0/1 toggles become booleans; exports convert booleans back to 0/1. Dropdown values
are not universally numeric. Slider validation/rounding is not the compact
codec's step grid. Adding a manifest field does **not** add it to flat defaults,
settings controls or serialized schemas.

### Required setting change path

1. Ask the maintainer for the new default. Define units, range, precision,
   dependent settings, persistence/sharing needs and intended UI location.
2. Add the flat key/default to `ql_shared_presets.js`. Extend the owning
   manifest(s) with a matching schema. Preserve intentional numeric/boolean
   representation differences; do not confuse multiplier `1` with percent `100`.
3. Change the real registered settings tab renderer and reuse existing controls.
   `ui/layout.js` orders navigation/declares fallback sections; editing it alone
   does not add a row to a tab with a custom renderer. See section 9.
4. Localize label, description, options, tooltip, feedback and preview copy.
   Add metadata in `ui/ql_settings_metadata.js` where the existing control path
   uses descriptions, names, section overrides or performance tiers.
5. Handle changes in every owning runtime and dependent feature. Preserve
   disable/reset behavior and root-class ownership. Do not add a second poller
   for configuration that already arrives through `onSettingsChanged`.
6. If the value is shareable, extend the current versioned compact schema using
   existing schema utilities; preserve old field order, bounds, steps and
   historical defaults. Update relevant normalizers/migrations and export/import
   paths. Do not edit a historical schema in place or silently lose precision.
7. Check reset, preset application, settings -> HUD propagation and a complete
   export/import round-trip, including boundaries and invalid input. Retain
   existing regression coverage that exercises the affected contract.

Procedural sliders in `ui/controls.js` commit on the existing compact field's
step grid within the intersection of UI/schema bounds, anchored at schema min.
Invalid typed text preserves the previous value. New UI precision cannot exceed
what the wire format preserves. Other renderers/number consumers are not
necessarily identical; inspect the actual path instead of generalizing this rule.

Use `QOL.parseStoredConfig` for side-effect-free asynchronous restore validation.
It rejects invalid structures and normalizes recognized primitive settings.
`QOL.safeParseConfig` is the older recovery path and can reset corrupt live
attributes. They are not interchangeable. Neither generic JSON parsing nor a
ConfigStore schema alone proves every saved value is valid for every consumer.

Presets are owned by `ql_shared_presets.js` and `ui/presets.js`; the current
`QOL_ACCOUNT_PRESET_BINDINGS` map is empty. Do not invent account bindings from
historical names. Application resets default keys, overlays the preset's own
keys and preserves specific UI preferences. It is not an unknown-key validator;
see [preset maintenance](docs/PRESET_BINDINGS.md).

## 7. Localization is part of every UI change

The runtime source is `panorama/scripts/ql_settings_loc/ql_settings_loc_<lang>.js`,
registered under `globalThis.SETTINGS_LOCALE_TEXT`. **English phrases are keys**;
the English catalog is an identity map. This is not a `#QOL_*` token catalog.
`ui/theme.js` provides `LocalizeSettingsText(text, force)`; UI control factories
route captions through it. `force` is a boolean bypass for the Presets-tab
localization exemption, not a language argument.

```javascript
// Existing English source key; dynamic settings copy uses forced localization.
label.text = LocalizeSettingsText("Settings", true);
```

The active dictionary's exact key is used; missing translations fall back to the
original English phrase. There is no Russian fallback and no `QOL.ui.locales`
service. `LocalizeSettingsText` does not call `$.Localize`. Native Valve `#tokens`
use the separate game localization mechanism; use only tokens verified in game
resources. Renderer fallback code for missing settings localization is not a
reason to pass invented `#QOL_*` keys in the normal settings context.

For new text:

- Reuse an existing English key if its meaning is unchanged. Otherwise add its
  identity entry to English and a Russian translation to Russian. Add reviewed
  translations elsewhere when available; do not fill gaps with copied English
  to report complete coverage.
- Localize dynamic labels, dropdown options, status/empty/error/success messages,
  modal titles, preview captions and Dev tools, not just static setting names.
  Existing hardcoded strings are migration debt, not the pattern to copy.
- Keep whole sentences translatable. Do not concatenate grammatical fragments or
  use inline `isRussian ? ... : ...` branches. Follow a proven placeholder
  convention when values must be inserted; do not invent a formatting API.
- The English literal passed as a lookup key is valid. Assigning it directly to
  visible text is not equivalent. Technical IDs, player names and external
  content are different from authored UI sentences.
- Verify English, Russian and an incomplete locale on the actual surface when
  changing visible UI. A dictionary load/count check is not a hardcoded-text audit.

Current runtime codes and exported catalog codes differ in two places:
Brazilian Portuguese is `pt-br` at runtime, `pt_br` in filenames, `pt-BR` in JSON;
Belarusian is `by` at runtime and `be` in JSON. Use `scripts/locales_helper.js`
rather than constructing names. A website-only locale is not a shipped locale.

### Translation workflow

- QOLLOCK owns shipped JS dictionaries.
- `Predi-i/QOLLOCK-translations` stores exchange JSON under
  `locales/<code>/translation.json`.
- `Predi-i/qollock-translate` is the translator website, not a runtime dependency.
- `.github/workflows/sync-translations.yml` exports on its configured triggers;
  it needs a token with write access to the catalog repository. Local unpushed
  edits do not trigger it.

```text
npm run translations:export
npm run translations:json:export
npm run translations:missing
npm run translations:labels
node scripts/import_locales_json.js D:/GitHub2/QOLLOCK-translations/locales
```

Plain JSON export defaults to `translations/locales`; CSV to `translations`.
The `.bat` wrappers have additional sibling-directory behavior. The normal JSON
export merge preserves community translations and orphan entries; `--replace`
discards that protection. Export does not import community changes. Reverse sync
is reviewed/manual, and does not compile/repack the mod. Missing-string tools
have limited coverage; neither proves that all dynamic copy is localized.
See [LOCALIZATION.md](docs/LOCALIZATION.md) and the translation READMEs.

## 8. Persistence and cross-context communication

There are two distinct boundaries:

1. **Live settings publication:** `core/ql_persistence.js`, settings `SaveAndSync`,
   `ql_bridge.js` and HUD `core/ql_app.js` exchange serialized config/attributes.
2. **Durable save/load:** `core/ql_storage_bridge.js` uses a CEF `CitadelHTMLPanel`
   and origin-scoped browser `localStorage`. Panel attributes are not disk storage.

`QOL.core.persistence` resolves root/HUD panels, reads by revision and publishes
config under `Deadlock_Mod_Settings_v1`. `QOL_USER_EDIT_REV` tracks published
revisions. `QOL_CONFIG_EDIT_REV` tracks dirty intent before publication.
`MarkConfigDirty()` advances intent immediately, then debounces `SaveAndSync()`
for 0.3 seconds. This distinction prevents a pending restore from overwriting a
slider edit made before its save flush. `getConfigChangeStamp(root)` combines
root/HUD published and dirty generations.

The storage API is exposed as `QOL.core.storageBridge`, `QOL.core.storage` and
`QOLStorageBridge`. Use `saveSettings`, `loadSettings`, `clearSettings` for
configuration; low-level `save/load/remove` are generic key/value transport.
High-level callbacks take `(error, result)`; Promise use is also supported.

The CEF page loads from
`https://predi-i.github.io/qollock-updates/bridge.html`. Each realm owns its own
direct-child `QOLStorageBridge` panel; HUD autoload is enabled, settings autoload
is disabled. Commands are queued, encoded and chunked; results arrive through
`HTMLTitle`. Do not adopt another realm's nested bridge or send a second command
outside the existing FIFO protocol.

Startup restore captures panel identity/change stamp **before readiness**. Its
retry retains that baseline. Explicit Load captures a fresh baseline after
recording user intent. Later edits/saves/clears/loads invalidate an older restore;
a skipped result reports `applied: false`, `skipped: "newer-edits"`. Missing disk
data preserves live settings. Invalid input rejects without invoking the legacy
parser's destructive recovery path.

Save success requires the CEF acknowledgment, not merely writing attributes.
A failed disk save may leave the selected config active for the current session.
A timed-out dispatched command is not necessarily rolled back. Clearing disk
settings does not itself reset the live configuration. Origin storage may depend
on network bootstrap/profile lifetime; no offline/durability guarantee follows
from passing simulated CEF tests.

`ql_bridge.js` also owns named channels used by non-storage subsystems; inspect
its descriptors before adding attributes. Attribute bridges, in-process EventBus
and CEF title transport solve different problems and are not interchangeable.
The removed build-storage implementation is not the current persistence path;
leftover names/comments or hero-signature helpers do not restore that backend.
See [persistence](docs/core/persistence.md), [storage bridge](docs/core/storage_bridge.md)
and [configuration parsing](docs/core/config_parsing.md).

## 9. Settings UI controls and previews

`ui/layout.js` declares sidebar order/groups and fallback feature sections.
`ui/ql_settings_tabs.js` derives navigation metadata. `ui/window.js` owns the
shell, active tab, list caching, row synchronization and transitions. Registered
renderers take precedence over declarative fallback. The settings XML does not
load the HUD FeatureRegistry: a new manifest alone cannot render settings there.

| Content | Owner |
| --- | --- |
| Gameplay tabs | `ui/gameplay_tabs.js` |
| General Settings / Config | `ui/config_tab.js` |
| Presets | `ui/presets.js` |
| Support | `ui/support.js` |
| Audio | `ui/audio.js` |
| Console / Arcade | `ui/console_tab.js`, `ui/arcade_tab.js` |
| Developer tools / walkthrough | `ui/dev_tab.js`, `ui/visual_check.js` |
| Search / drag / modals / theme | `ui/search.js`, `ui/drag.js`, `ui/modal.js`, `ui/theme.js` |

Use `QOL.ui.window.registerTabRenderer(tabId, renderFn)` for the existing custom
renderer route. `QOL.ui.controls` contains procedural `createRow`, `createSliderRow`,
section/enum/toggle factories, row reset-key tracking, changed-state comparison
and reset helpers. `QOL.ui.renderer` contains declarative `createControl` and
control-specific factories. These APIs have different signatures; read a caller
from the same path, rather than copying a factory name from another renderer.
Legacy globals such as `CreateRow` delegate to extracted modules; they are not
independent implementations to edit in `ql_settings.js`.

Reuse the controls' save, search-collection, tooltip, reset, changed-state,
row-sync and preview behavior. A hand-built slider can look correct while losing
wire precision, reset keys or search results. Cached rows need synchronization
when settings change outside that row; do not leave stale captured `MOD_CONFIG`
references after config replacement. Read current config through the accessor.

`QOL.preview.showForConfigId(configId)` dispatches supported previews;
`hideAll()` and `wirePreviewToggleButton(buttonPanel)` manage visibility/master
control. Feature-specific detection helpers live in `ql_settings_previews.js`.
Previews are settings-owned, not the gameplay overlay. They can remain useful
where gameplay features are suppressed. Their host scaling/live-anchor fallback
logic does not prove pixel-perfect alignment at every resolution.

`QOL.tooltip` owns tooltip reuse, deferred hide and row tooltip behavior.
Preserve scroll suppression and coordinate conversion. Closing QOLLOCK settings
is not the same as resuming Deadlock; the shell's close path preserves the native
escape menu. The manual visual walkthrough has temporary-setting restoration and
cleanup integrated with close/resume paths. Do not replace it with an automated
claim of native rendering correctness.

See [tabs/layout](docs/ui/tabs_and_layout.md), [controls](docs/ui/controls.md),
[previews](docs/ui/previews.md) and [visual walkthrough](docs/ui/visual_check.md).

## 10. Panorama styles assets and native evidence

### CSS and resource loading

- [panorama/styles/hud.css](panorama/styles/hud.css) is an import manifest: game
  base HUD styles, shared QOLLOCK rules and feature CSS. Shared rules/keyframes
  live in `panorama/styles/qollock_global.css`; settings styling lives in
  `panorama/styles/ql_settings.css` and the escape-menu style chain.
- `panorama/styles/features/ql_feat_*.css` names remain valid even though runtime
  JS has moved to `manifests/`. Do not infer a matching old JS filename from CSS.
- `panorama/styles/base/` retains game styles used by overrides. Compare a
  proposed override with the extracted game source before changing broad rules.
  Avoid affecting unrelated HUD or native menu panels with an unscoped selector.
- This is Panorama CSS, not browser CSS. Reuse syntax supported by game styles
  and this project; a browser screenshot cannot validate Panorama layout.
- XML references compiled `s2r://panorama/scripts/...vjs_c` and
  `s2r://panorama/styles/...vcss_c` resources; edit the corresponding `.js` and
  `.css` sources. Image references use engine resource URIs such as `.vsvg` and
  `.vtex`; do not substitute browser URL/import conventions.
- Check both XML includes and CSS imports. Not every feature has a separate
  stylesheet; some use global/inline styles, and special layouts load their own
  style chains. Asset compilation and packaging remain maintainer-only.

### Geometry and panel lifetime

`actualxoffset`, `actualyoffset`, layout dimensions and cursor positions are not
interchangeable with CSS design coordinates. Existing tooltip/drag/preview code
accounts for UI scale; writing physical-pixel coordinates directly into inline
styles can double-scale them on higher-resolution displays. Read that code
before adding another conversion.

Scrolling also matters: a child's static layout offset does not by itself tell
you its visible position in `overflow: squish scroll` containers. Preserve the
existing tooltip scroll tracking, suppression and geometry logic rather than
replacing it with a single offset comparison.

A live handle is not necessarily the right player's panel, the current match's
panel or a visible panel. A root fallback is not proof that gameplay is active.
Duplicate IDs require a narrow authoritative subtree. Native panel removal can
race a scheduled callback, and asynchronous deletion is not instantaneous.

### Where to find engine evidence

| Question | Evidence source |
| --- | --- |
| Native layouts, classes, CSS syntax and script examples | `G:\GameTracking-Deadlock\game\citadel\pak01_dir\panorama\` |
| Native localized game strings | `G:\GameTracking-Deadlock\game\citadel\resource\localization\` |
| Console command/ConVar names | `D:\GitHub2\panorama-deadlock-stuff\cvarlist.txt` |
| Native strings/functions as investigation leads | `D:\GitHub2\panorama-deadlock-stuff\strings_dump\` and its DLL directories |
| Checked-in API name evidence used by CI | `scripts/data/game_api_registry.json` |
| Actual panel ancestry, identity, class state and readable labels | Maintainer's in-game Panorama Debugger |

Much of the live tree is C++-generated. Failure to find an ID in XML or in
`scripts/audit_panel_ids.js` is **not proof of absence**. When blocked, ask for a
specific debugger capture: scenario, target panel, parent chain, relevant child
IDs/classes and values. Do not assume the maintainer has a writable JS console
or that a browser automation endpoint exists.

## 11. Feature ownership and boundaries

The [feature catalog](docs/features/README.md) links active implementations and
selected notes on stable cross-file contracts. Use the active XML includes and
source to confirm loading, current settings and enable predicates; a catalog entry
is navigation, not evidence of tested gameplay behavior.

### Cross-feature boundaries worth checking first

- **Healthbar:** `manifests/ql_healthbar/shared.js` and `variants/` load before the
  dispatcher. `HEALTHBAR_TYPE` is numeric 0–5, not string theme names. Shared
  accent/position cleanup can run even when a specific replacement style is off.
  Never profile only the default style and generalize the result to Minecraft.
- **Passive cooldowns:** Basic native-panel styling, legacy audio/layout work,
  Advanced item mirrors and signature press flashes share some keys but have
  different responsibilities. Preserve category/exception matching and source
  identity; do not replace them with one generic class search.
- **Minimap/objectives:** base geometry/zoom, compass-driven rotation, objective
  overlays and Rejuvenator state have separate owners. Reuse the existing
  `State.rejuvState` contract rather than running another timer state machine.
- **Native HUD styling:** changing a shared parent affects other features.
  Restore only owned overrides and reset per-panel signatures on replacement.
- **External resources:** rank, chat images, translation and update checks use
  their specific transport paths. Do not introduce browser fetch into Panorama
  or promise that a proxy prevents all resource/security failures.
- **Restricted/experimental code:** `ql_spm` and `ql_unspent` intentionally retain
  inactive compatibility hooks. Chat translation is account-gated. Do not make
  them generally available as part of a refactor or infer UI settings that are
  absent from their manifests/defaults.
- **Update checker:** `ql_update_checker.js` is settings-side, not a registered
  HUD manifest. Public update markers are independent of package/settings
  versions. Follow the release procedure in [README.md](README.md); ordinary
  code or documentation work does not authorize publishing a marker.

Treat source-declared settings as schema metadata; flat defaults and wire ranges
still need their own checks when changing a setting.

## 12. Verification and tooling

### Supported offline commands

Run from the repository root. [package.json](package.json) is authoritative for
npm commands; [TESTING.md](docs/TESTING.md) explains their evidence limits.
CI uses Node 24 and `npm ci`, followed by `npm test`.

```text
npm test
node panorama/scripts/tools/qollock_smoke_test.js
node scripts/validate_compact_schema.js
npm run check:api
npm run lint
npm run lint:all
```

`npm test` currently runs HUD loading smoke, `node --test tests/*.test.js`,
compact-schema validation, API checking and ESLint, in that order. There is no
separate build-storage fuzz command in that pipeline. Do not copy obsolete
pipeline names or past test counts into a new check.

| Check | What it establishes | What it does not establish |
| --- | --- | --- |
| HUD smoke | Scripts from active `hud.xml` includes load; missing includes fail; manifests register | Settings rendering, hook execution or live gameplay |
| Node regressions | Assertions on production JS under the test's stated fixtures/model | Native bindings, visual layout, universal feature coverage |
| Compact-schema validator | Codec transformations and compatibility cases it exercises | Every value accepted by every UI control |
| API checker | Known static command/event names; unknown names/parse errors fail | Native signature, dispatchability, availability or dynamic expressions |
| ESLint | Configured correctness rules and shipped-script operator line breaks | Engine API availability or native CSS correctness |
| Offline profiler | Operation counts under the selected tree/configuration | FPS, deferred layout/rendering/GPU cost or client milliseconds |
| Client manifest audit | Named read-only observations in the current scenario | Full correctness, all transitions, durability or visual quality |

Useful focused regressions already exist:

```text
node --test tests/storage_bridge.test.js tests/audio_runtime.test.js
node --test tests/ui_slider_roundtrip.test.js tests/helper_api_contract.test.js
node --test tests/game_api_validator.test.js tests/locale_export.test.js
```

Choose tests by the changed contract, not by whichever subset is green. For a
settings/HUD interaction use `tests/load_settings_environment.js`: it loads the
real two XML script lists into separate JS isolates sharing modeled panel
attributes. `tests/load_ui_helpers.js` loads production UI helpers instead of
reimplementing them in fixtures. Check collected load, event and clock errors;
absence of a synchronous throw is not sufficient.

For new behavior, exercise the actual affected path. Keep regression tests for
plausible failures such as stale restores, malformed input, accepted-value
round-trips, disable/re-enable and panel replacement. Do not assert a guessed
native tree against a simulator you taught that same guess.

### API and lint boundaries

[VALIDATION.md](docs/VALIDATION.md) documents `scripts/validate_game_api_usage.js`.
Dynamic calls are unverified warnings, not successful validation. XML handlers,
arbitrary aliases and direct native function signatures are not comprehensively
checked. The existing optional `CitadelUserMsg_ForceShopClosed` listener is a
scoped compatibility probe, not a license to invent `Citadel*` events. Registry
extraction is maintainer tooling; CI consumes the checked-in registry.

[eslint.config.js](eslint.config.js) distinguishes Panorama, settings and Node
globals. Shipped JS is parsed as script code, not ES modules. Keep continuation
operators at the end of the preceding line: the project enforces this for Valve
minifier/ASI compatibility. `npm run lint` hides warnings; `lint:all` shows them.
Do not add a name to the globals list merely to silence a missing dependency.

`scripts/git-hooks/pre-commit` is an additional local check for staged JS, not a
replacement for the full npm gate. `setup-hooks.sh` installs it; do not silently
install/replace hooks as part of an unrelated code/documentation change.

### Performance and live-client evidence

```text
node scripts/profile_hud.js --seconds 20 --save before
node scripts/profile_hud.js --seconds 20 --compare before
node scripts/profile_hud.js --seconds 20 --healthbar 5
node scripts/audit_panel_ids.js
```

Compare identical trees, player counts, feature configuration and warm-up
conditions. Default profiling does not exercise every healthbar variant;
`--healthbar 5` selects Minecraft but does not remove model fidelity limits.
A full-tree miss can cost more than a hit. Avoid repeated unsuccessful probes,
unchanged style writes, allocation-heavy polling and duplicate state watchers.
Backoff must still recover when the native source appears again.

Use `onSettingsChanged` for settings reaction and existing shared state/probes
for shared observations. Do not globally suppress Scheduler callbacks in
hideout: a feature may need a callback to remove its overlay or restore native
UI. Disable expensive work while preserving transition cleanup.

In the client, **Dev -> In-Game Engine Audit** collects read-only manifest hooks;
**Manifest Report** copies their results. `OBSERVED`, `FAIL`, `ERROR`, `SKIP` and
`NOT RUN` mean different things. A timeout or copied report is not a pass. Console
captures need their ending marker; rolling logs can truncate large reports.
The Dev tree-dump button captures aggregates, not a complete hierarchy.

The current-config benchmark measures Scheduler callbacks, including synchronous
native work inside them, but excludes deferred rendering and work outside those
callbacks. Its `Date.now()` timing is not sub-millisecond precision or an FPS
benchmark. Report frame-time improvements only after comparable client runs.

After a maintainer repack, test the affected feature in realistic transitions:
match entry, shop/settings open-close, death/respawn, hideout/menu return, another
match, and disable/re-enable. For persistence, fully exit and restart the client.
For visible changes, inspect the requested resolutions/languages in Panorama.
Record untested cases honestly. See [TEST_CHECKLIST.md](docs/TEST_CHECKLIST.md).

## 13. Task completion checklists

### Existing feature change

1. Identify every layout/context, manifest, UI control, style and data table that
   participates. Read the current source, not only the feature's old Markdown.
2. Choose existing helpers with matching semantics and verify they load in that
   context. Keep domain selection rules local where a generic helper is wrong.
3. Preserve settings ownership, normalization, accepted values and saved data.
   Ask about new defaults rather than borrowing an unrelated feature's value.
4. Handle off/on, hidden/visible, destroyed/replaced source and match transitions.
   Reset style signatures on panel replacement; leave no delayed resurrection.
5. Localize any new/changed copy. Reuse controls, preview dispatch and tooltip
   infrastructure; update the relevant catalogs/metadata, not just the caption.
6. Exercise the affected path and existing regressions. For performance changes,
   compare the same scenario and report raw counters separately from game timing.
7. Update documentation if the change invalidates a documented contract.
   Remove temporary probes and report exactly which client checks still require
   the maintainer's repacked build.

### New helper or shared extraction

1. Prove that existing APIs do not already supply the required contract.
2. Compare callers' root ownership, ordering, depth bounds, value normalization,
   exception behavior and invalidation needs. Do not merge distinct semantics.
3. Put a genuinely shared leaf operation in the existing helper layer; do not
   turn `ql_shared_presets.js` into a destination for unrelated feature logic.
4. Update every relevant context include/import/export, remove obsolete copies
   and migrate callers together. Account for XML and callback exports as well
   as lexical JS references.
5. Document the callable API in [HELPERS.md](docs/HELPERS.md) and this guide where
   appropriate. Prove the behavior that motivated the extraction, not merely
   that two functions have the same name.

### Storage or import change

- Export a recovery configuration before manual client experiments.
- Use the canonical parser/normalizer and publication APIs; preserve invalid or
  unsupported input as an error, not a successful reset to defaults.
- Exercise late readiness/replies, edits before debounce, retries, explicit Load,
  malformed/truncated/wrong-shape payloads and missing storage.
- Preserve historical decode schemas and their original defaults. Verify accepted
  UI values survive settings -> HUD -> export -> import.
- Separate modeled storage protocol tests from actual full-client restart
  durability. Never claim automatic migration from removed build-based storage
  without a supported implementation and evidence.

### Documentation-only change

Check local links, source paths, actual exports and commands rather than running
unrelated gameplay tests to give prose a green badge. Do not present historical
measurements, fixes or pending work as current facts. Keep version numbers in
canonical source rather than copying them into many documents.

## 14. Documentation map and historical traps

| Reference | Use it for |
| --- | --- |
| [HELPERS.md](docs/HELPERS.md) | Callable helper selection and lifetime semantics |
| [LOCALIZATION.md](docs/LOCALIZATION.md) | Runtime dictionaries, translation workflow, coverage limits |
| [ADDING_SETTINGS.md](docs/ADDING_SETTINGS.md) | End-to-end setting changes |
| [PRESET_BINDINGS.md](docs/PRESET_BINDINGS.md) | Preset source ownership and current binding status |
| [core/](docs/core/) | Individual service exports, errors, state ownership and protocol details |
| [ui/](docs/ui/) | Registered renderers, controls, previews and manual walkthrough |
| [features/](docs/features/) | Ownership index and selected cross-file contracts; source remains authoritative |
| [KNOWN_GOTCHAS.md](docs/KNOWN_GOTCHAS.md) | Native panel, CSS, scrolling, matching and lifecycle pitfalls |
| [PERF_GUARDRAILS.md](docs/PERF_GUARDRAILS.md) | Polling, cache, style and debug cost constraints |
| [PROFILING.md](docs/PROFILING.md) | Operation profiling, captured trees and measurement limits |
| [TESTING.md](docs/TESTING.md), [VALIDATION.md](docs/VALIDATION.md) | Offline tools, API name gate and fidelity boundaries |
| [TEST_CHECKLIST.md](docs/TEST_CHECKLIST.md) | Maintainer-run client/release scenarios |
| [FALLOW_SKILL.md](docs/FALLOW_SKILL.md) | Dead-code/clone-tool limitations in script-global Panorama code |
| [translations/README.md](translations/README.md), [locales README](translations/locales/README.md) | CSV/JSON exchange workflows |
| [Preset tools](panorama/scripts/tools/presets/README.md) | Historical preset editing utilities; check current script availability |
| [Local translation helper](tools/local_chat_translation/README.md) | Optional external Python image/translation service |

`MIGRATION_PATTERNS.md`, `docs/design/phase0-canonical-type-mapping.md`, release
audits and recorded profiler results describe specific migrations/snapshots.
They are not current API specs or proof that all recorded checks still pass.
Historical `legacy/ql_config_defaults.js`, `ql_core.js`, old feature paths,
build-storage instructions and callback signatures must not be copied into new
code. Current active XML, actual exports, shared defaults and codec definitions
settle those questions.

When a change invalidates a contract, update its focused reference and this
entry point where needed. Do not add a correction paragraph while leaving a
contradictory runnable example above it. Avoid copying volatile version numbers,
all preset values, test counts or measured timings into multiple documents.
