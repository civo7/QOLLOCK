# QOLLOCK Architecture

## Runtime boundaries

QOLLOCK is a Deadlock HUD mod running in Source 2 Panorama. JavaScript is loaded
by XML `<include>` elements, not by an ES-module bundler. Each layout has its own
script context; the HUD and settings contexts communicate through panel
attributes rather than shared JavaScript objects.

The application version is in `package.json`. Config wire formats and migration
schemas are maintained separately in `panorama/scripts/ql_shared_presets.js`.
Do not infer a storage format from the package version.

## Source map

| Location | Responsibility |
|---|---|
| `panorama/layout/hud.xml` | Authoritative HUD script order: core, shared infrastructure, feature manifests, then `core/ql_app.js` |
| `panorama/layout/hud_escape_menu.xml` | Settings context: shared utilities, locales, arcade/previews/persistence, UI modules, then `ql_settings.js` |
| `panorama/scripts/core/` | Namespace, events, scheduling, config store/adapter, feature registry, HUD access, persistence and application boot |
| `panorama/scripts/manifests/<feature>/manifest.js` | Feature configuration metadata and lifecycle implementation |
| `panorama/scripts/manifests/ql_healthbar/` | Healthbar manifest, shared helpers and variant implementations |
| `panorama/scripts/manifests/ql_build_storage/` | Storage manifest, UI driver and read-only 3.1.9 migration reader |
| `panorama/scripts/ui/` | Settings shell, controls, tab renderers, search, drag, modals, themes and cloud sync |
| `panorama/scripts/ql_settings.js` | Settings config state, persistence synchronization and dependency injection |
| `panorama/scripts/ql_settings_previews.js` | Settings preview ownership and dispatch |
| `panorama/scripts/ql_arcade_games.js` | Six arcade games and the on-death bridge; not a second settings implementation |
| `panorama/scripts/ql_utils.js` | Shared utility functions |
| `panorama/scripts/ql_shared_presets.js` | Shared presets, schema/codec data and namespace integration |
| `panorama/scripts/ql_bridge.js` | Cross-context channel descriptors and attribute access |
| `panorama/scripts/ql_state.js`, `ql_panelcache.js` | Shared runtime state and panel caches |
| `panorama/scripts/ql_settings_loc/` | Locale dictionaries |
| `panorama/scripts/features/` | Remaining special-context scripts, including build bridge and profile-card rank |
| `panorama/styles/` | Panorama CSS; `base/` retains game styles used by overrides |
| `scripts/simulator/` | Offline panel model, virtual clock, script contexts and operation profiler |
| `tests/` | Node regression tests; coverage and fidelity vary by subsystem |
| `build_mod/` | Windows compilation and VPK packaging workflow |

Other layouts load their own scripts: hero testing, profile/profile card and
quickbuy are not part of the HUD context's script list. Do not indiscriminately
load every JavaScript file into one context.

## Feature lifecycle

A manifest registers with `QOL.core.FeatureRegistry` and supplies `id`, settings
metadata, enable policy and `create(ctx)`. The instance implements `onEnable`,
optionally `onDisable` and `onSettingsChanged`.

`ctx.config` exposes the feature's config slice. `ctx.events` accesses the event
bus, with emitted events prefixed by feature ID. The registry coordinates
config-driven enable/disable and cancels the feature's Scheduler loops on
disable. Features must still undo their own panel/style changes and clean up
callbacks not owned by Scheduler.

`core/ql_app.js` boots after all manifests. It reads the persisted flat config,
uses ConfigAdapter/ConfigStore to populate feature slices, boots the registry,
and polls cross-context config attributes. The current poll interval is 0.25s.
Do not maintain a second feature list or script load order in tools.

Some older modules still use `QOL.import()`, root `QOL` helpers and explicit
`QOL_*` globals. These coexist with `QOL.core`/`QOL.ui`; this is an outstanding
migration boundary, not evidence that the old `ql_core.js` dispatcher still
exists. It does not. Before replacing a helper, check all layout contexts in
which its consumers are loaded.

## Ownership and performance

- Keep feature-specific state with the feature. Reuse existing panel/config
  helpers rather than copying their implementations into each manifest.
- An extracted subsystem must lose its old implementation and unreachable state
  in the source file. Cross-file name searches alone cannot prove a local IIFE
  function is used: resolve lexical references and exported callbacks.
- Preserve config compatibility for saved user data. A migration reader is not
  dead code merely because new saves use another format.
- Cache stable panel references, validate them before use and reacquire after
  invalidation. A failed full-tree lookup is still a full-tree walk.
- Avoid repeated style writes when the desired state is unchanged. Panorama can
  normalize style values, so use the existing helper suited to that property,
  rather than globally changing style semantics.
- Disabled or hidden features should avoid unnecessary polling. Do not keep
  loops whose callback is a no-op.
- Panel disappearance mid-frame is normal. Do not replace lifecycle guards with
  noisy error logging in hot paths.

## Verification

`npm test` is the current offline entry point. It runs HUD load smoke, Node
regression tests, build-storage fuzzing, compact-schema validation, API checks
and ESLint. See `docs/TESTING.md` for limits.

The HUD smoke reads the actual `hud.xml` order through
`scripts/simulator/layout.js`, includes the app entry point and fails on missing
included scripts. Its manifest-hook report is structural: it does not execute
those hooks against the real client.

Use `scripts/profile_hud.js` to compare operation counts on the same scenario.
Those counts are not FPS or engine timings. A modelled panel tree cannot prove
which panels the C++ client creates. Use a captured tree and the in-game Panorama
debugger when the question depends on real panel structure.

After JS/XML/CSS changes, a fresh VPK is required for in-game validation. The
maintainer builds with `build_mod/build_mod.bat` / `build_mod/build_mod.ps1`.
Offline success does not replace that final game check.
