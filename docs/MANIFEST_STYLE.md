# Manifest implementation pattern

The public lifecycle already has one contract: [FeatureRegistry](core/feature_registry.md).
This guide supplies a current implementation pattern; it does not make different
native features share an invented panel hierarchy. Runtime code uses ES6 in
Panorama script IIFEs, without Node imports or browser APIs.

Use [ql_damage_impact](../panorama/scripts/manifests/ql_damage_impact/manifest.js)
as a small complete reference for settings-driven native styling. Its layout
discovery, derived settings, rendering and cleanup are separate functions.
Preserve the feature's enable policy: a visibility controller may need to remain
alive even while the native indicator is hidden.

## Structure and responsibilities

1. Declare ownership, source evidence, settings and enable policy in the manifest.
   Existing persistent defaults and slider bounds/precision are resolved from the
   shared catalog at registration; feature constants must not redefine their units.
   Persistent declarations contain their key, type and feature-specific metadata,
   without copies of catalog defaults or numeric bounds. Local-only fields still
   declare their own defaults and validation metadata. Native layout baselines and
   live-data limits are separate from persisted setting metadata.
2. Keep instance state inside `create(ctx)`. Creating an instance should not
   mutate panels or install callbacks before `onEnable`.
3. Read `ctx.config.view()` as a live, read-only slice. Derive a settings model
   when settings change when that avoids repeated idle computations. Features
   that read live gameplay values must continue reading those at their cadence.
4. Discover sources through verified direct-child breadcrumbs where possible.
   Use `QOL.panelCache.createIdResolver` with `ownerPath` for native ID owners;
   read its [contract](core/panel_cache.md). XML and actual debugger ancestry are
   evidence. An absent conditional panel is a retry case, never permission to
   delete its implementation. Feature-specific selection and player identity
   stay with the feature.
5. On replacement, release the previous living owner and invalidate all
   panel-dependent signatures. Apply current settings to the new generation.
   A valid handle can still belong to a detached old HUD.
6. Render through helpers with matching semantics. Cache a successful style
   signature, and retry partial writes. Reassert native-owned dynamic values
   where necessary rather than assuming all native properties stay untouched.
7. Use `Scheduler` for necessary polling and current event APIs when verified.
   Missing sources need bounded retries; unexpected errors must remain visible
   to lifecycle/error accounting. Settings changes apply immediately.
8. Disable stops owned work, unsubscribes owned events, clears owned code styles,
   removes owned classes/panels, and resets discovery and signatures. Cleanup
   must also work after partial enable failure.

## Generate a starting point

Run from the repository root, for example (shell quoting varies):

```sh
node panorama/scripts/tools/scaffold.js ql_example "Example" "Native appearance" --type=style-only --panel-id=VERIFIED_NATIVE_ID --owner-path='[{"className":"VERIFIED_OWNER_CLASS"}]' --dry-run
```

`css-only` toggles a class on the context root; `style-only` starts a native-style
controller; `polling` starts a gameplay/content callback. The generated skeleton
uses current manifest/include paths, reactive configuration, managed polling and
replacement invalidation. Existing files are never overwritten. Owner paths must
come from evidence; the tool cannot verify a supplied native ID. Without a known
path, retain bounded discovery and record the precise debugger state needed.

Style-only scaffolds track attempted code properties and release removed styles,
replaced owners and disabled instances automatically. CSS-only context controllers
need no discovery poll. TODOs remain for feature-specific rendering and additional
owned panels/classes. A generated file is not a finished feature. Declare settings through `--settings=JSON` and
optionally `--enable-key=DECLARED_TOGGLE`, but follow the entire
[settings](ADDING_SETTINGS.md) and [localization](LOCALIZATION.md) path before
shipping. Registration does not create a persisted control. New persistent
defaults require the maintainer's decision. Add the printed include before the
HUD app bootstrap, respecting real helper dependencies and XML separator rules.
The scaffold validates known settings with the current runtime catalog and emits
references without duplicated defaults/bounds. New local fields require explicit
metadata; a missing default on an unknown key is rejected.

## Migrate existing features

Rewrite one owner at a time with its settings, conditional states and cleanup
preserved. The change must improve discovery/lifecycle behavior along with
structure. Split a long feature along real responsibilities (source mapping,
content/model, renderer), only when those boundaries are independently useful.
Use the existing namespace and explicit includes; do not leave an active legacy
implementation beside the replacement or introduce a generic controller that
hides all ownership rules.

Validate late source creation, still-live replacement, settings updates and
disable/re-enable using the production lifecycle. Run `npm test` before each
commit. Complete native rendering/gameplay checks after maintainer compilation
and repacking; simulator success does not prove FPS or native timing.

Shared root CSS decisions are projected through `QOL.core.hud.refreshRootClasses(root)`
using the complete current config. A local feature slice cannot describe unrelated
root classes. A native style owner must not also be active in another manifest or
core loop: Basic cooldown layout belongs to `ql_passive_cooldown`, reminder audio
to `ql_legacy_audio_passive`, and damage-report offsets to `ql_damage_report`.
