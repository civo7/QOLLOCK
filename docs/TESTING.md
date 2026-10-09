# Testing QOLLOCK

The current offline entry point is `npm test` (see `package.json`). It runs HUD
script loading, stylesheet source checks, the Node regression suite in `tests/`, compact-schema validation,
API checks and ESLint. It does not run a separate build-storage fuzz command.
The Node suite limits file concurrency to avoid exhausting memory when multiple
settings/HUD VM environments run on a machine with many CPU cores.

Some tests use the panel simulator. They can verify JavaScript behavior under
that model, but cannot prove real client panel structure, rendering or FPS.

## Layer 1 — static / load checks

```
node panorama/scripts/tools/qollock_smoke_test.js   # actual hud.xml script order
npm run check:styles                               # delimiters and selector-list budget
node scripts/validate_compact_schema.js             # config codec round-trips
npm run check:api                                  # known game API usage
npm run lint                                      # JavaScript static checks
```

The HUD smoke uses `scripts/simulator/layout.js`, includes `core/ql_app.js`, and
fails when an included script is missing. It is not a settings-context smoke or
a runtime behavior test. The schema validator exercises codec round-trips;
load checks alone cannot catch gameplay or lifecycle bugs.

The stylesheet gate scans every shipped CSS source, including native base
imports, for mismatched delimiters, unfinished strings/comments and oversized
selector lists. It does not implement native CSS grammar or compile resources;
the maintainer's compilation and client checks remain required.

## Focused release regressions

Customize regressions exercise draft publication separately from canonical
settings, Apply/Cancel, acknowledged saves, cleanup, measured frame geometry,
drag proxies and corner resizing. Run `node --test tests/ui_customize.test.js
tests/customize_catalog.test.js` for the editor subset. Modeled dimensions and
input events do not establish native rendering or interaction.

`tests/customize_rework.test.js` checks canvas-density conversions, padded AP
targets, magnet candidates and truthful guides, alignment actions, delayed
layout, all three draggable editor windows, actual view toggles and independent
AP/stamina persistence. `tests/item_mirror_runtime.test.js` retains main's
Advanced-mode filter, slot, purchase/sale and shop-transition regression.

`feature_contracts.test.js` and `shared_config_owners.test.js` exercise production
registration, canonical units/defaults, atomic shared-key updates, unchanged-value
suppression, and failed/retired lifecycle generations. Native and overlay owner
regressions verify late sources, still-live replacement, owned-property cleanup,
native animation/content preservation and independent observers. Scaffold tests
run generated source against the production registry. `minimap_fixed_icon_geometry.test.js`
drives Size controls and all corner gestures through Base/Alt/Tab preview and the
scoped renderer geometry; native map click targets/zoom rendering remain client checks.
`manifest_settings_catalog.test.js` observes declarations in the actual HUD include
order and rejects duplicated persistent defaults/bounds, including computed fields
and multitoggle options. The registered schemas still use the current shared catalog.

`healthbar_module_ownership`, `color_warning_owners`, `map_module_lifecycle`,
`information_manifest_lifecycle`, `reload_owner_lifecycle` and `ui_runtime_owners` exercise the current
production owners against living replacement, late discovery, partial native
writes, shared observer updates and shutdown. Budhud's native color comes from
one warning owner; objective timers consume a scalar rejuvenator snapshot.
These checks complement the frozen-main compatibility matrix and do not replace
client validation of native animation, composition, input or timing.

`recent_purchases_owner.test.js` exercises production filters, feed and hero
popups against recycled rows, late purchaser evidence, living native replacement,
shared geometry and partial writes. Native history remains engine-owned;
expired or recycled-row evidence must not replay an earlier purchase.

`profile_rank_owners.test.js` covers HUD rank/Statlocker owners and independent
profile/card isolates: current account bindings, roster replacement, duplicate
names, correlated late callbacks, partial native writes and bounded retries.
Native card context creation/reuse and image loading remain client checks.

`quickbuy_owner_lifecycle.test.js` loads the actual quickbuy XML companion in
its own isolate. It preserves recipe/sale credits and previews while testing
late/replaced native queues, controls, chat bindings, partial writes, retired
handlers and cancelled deferred work. The lifecycle auditor's counterfactual
still rejects a deliberately lost poll handle with the same leaked task counts.

`chat_translation_owner.test.js` checks production account gating and pending
evidence, independent native message selection, bounded cache and lifecycle
cleanup. Native text remains readable through modeled failed helper requests;
localhost image loading and native chat layout require client verification.

`chat_image_geometry_owners.test.js` checks the independent native geometry and
image owners: both teams, current bottom text bindings, unchanged native text/
input/animation, bounded image cleanup, URL matching, partial writes and living
replacement. Customize cancellation observes both released code styles and
the neutral native offset written before release.

Audio regressions observe actual caption presentation rather than exported
private booleans. They cover new HUD announcement history, stale callbacks and
caption-only disable alongside existing interval/lead-time behavior. Damage
owner regressions release living moved labels and replaced gameplay scopes
without waiting for a full discovery scan or publishing duplicate global caches.

`keyboard_owner_lifecycle.test.js` retains both native action layouts and checks
reactive geometry/palette/custom RGB, Label-type glyph discovery, living owner
replacement, partial style/construction failures, disable and registry cleanup.
Native binding/glyph composition and key press visuals remain client checks.

`item_mirror_ownership.test.js` exercises current HUD/inventory generations,
living source/child replacement, partial writes/construction and pending/active
feedback cancellation. The existing `item_mirror.test.js` still checks discovery,
exceptions, source identity and text backoff, and now covers both radial
directions and native-generation estimator reset. The production runtime test
retains all four filters and purchase/sale/shop behavior.

`presentation_lifecycle.test.js` exercises explicit disable, partial enable
failure, Scheduler auto-disable and shutdown/reboot through the production
registry. It verifies custom-only CSS release, retained config, independent
observers and restored presentation on enable, including Advanced/Basic mode.

`tests/customize_config_compat.test.js` imports frozen legacy compact codes
generated with the main codec/schema recorded in the fixture, then checks
Customize cancellation, Apply and current-format export. It also checks legacy
flat JSON and storage envelopes. Fixtures are deliberately not regenerated by
the current writer during a test.

The frozen `main_customize_configs.json` matrix additionally covers all six
healthbar variants and both minimap scale methods. Changing AP in a scoped
editor and exporting must preserve their healthbar/map settings. Runtime
geometry is checked separately by `healthbar_canvas.test.js` and
`minimap_settings_compat.test.js`.

`tests/customize_scoped.test.js` drives actual gameplay-header entries, verifies
one-surface frames and edits, rejects out-of-scope patches/resets/unlocks, and
checks English/Russian/incomplete-locale copy. It also verifies that the full
Customize tab still permits selecting other elements.

```text
node --test tests/storage_bridge.test.js tests/audio_runtime.test.js
node --test tests/ui_slider_roundtrip.test.js tests/helper_api_contract.test.js
```

The storage tests exercise the production bridge and parser with controlled
responses: late startup versus newer edits, debounced edits, retries, malformed
data, explicit Load, chunking and request failures. They do not establish that
the real client's CEF localStorage survives a full process restart.

The audio tests observe production sound dispatches after config mapping and
export/reload. A Buff Delay of 15 seconds already worked on that path before the
release fixes. The confirmed zero-to-30 fallback was a separate bug; its fix
does not establish the cause of a player's 15-to-30 report.

Slider tests cover accepted UI values through the actual compact codec. The
helper contract test resolves API references from [the helper map](HELPERS.md)
against production exports; it cannot establish native traversal semantics.
These targeted tests complement the [maintainer checklist](TEST_CHECKLIST.md).

## Layer 2 — manifest `test()` hooks (run in the client)

Each FeatureRegistry manifest may declare a read-only `test()` hook. In the
client it observes the real panel tree; in Node it only observes the supplied
model. A successful hook confirms its named checks, not the whole feature.

```
Settings -> Dev -> In-Game Engine Audit -> Run Engine Audit
Settings -> Dev -> Manifest Report -> Copy Manifest Report
```

The engine audit collects all registered hooks once, without enabling features
or changing settings, and copies their individual observations plus a HUD
snapshot and runtime error counters. `OBSERVED` means the hook's named check
succeeded; `FAIL` and `ERROR` preserve failures verbatim. `SKIP` means no hook or
no applicable scenario. `NOT RUN` records a collection deadline or cancellation.
Every requested manifest stays in the total, including unfinished work.
Console output is emitted one line per `$.Msg`, between `BEGIN <token>` and
`END <token>` markers. The client truncated the previous single-message report.
If the end marker is absent, treat the console capture as incomplete; use the
copied report when the console's rolling history has lost earlier lines.

The HUD bridge carries this same report, its timestamp, abort reason and counts
to the Dev UI and diagnostic export. A timeout is not success. A copied report
is not a passed test. Even a run with no failed hooks does not verify rendering,
gameplay transitions, FPS, or disk persistence. FeatureRegistry error counters
are current error streaks, reset by successful ticks, not a session error history.

For a bulk client check, the maintainer repacks first, opens a relevant gameplay
context, and copies the report. Repeat in a different context only where needed
(e.g. shop, death, hideout). This avoids manually inspecting every panel, but
features without meaningful hooks still need targeted scenarios and screenshots.
The collector cannot infer the C++ panel lifecycle or visual correctness.

Rules for a `test()` hook, learned the hard way:

- **Read-only.** No `State` writes, no `config.set()`, no `DispatchEvent`.
- **Return `null` to skip** when not applicable (e.g. not in a match).
- **Do not fail on panels that only exist in some contexts.** Report them as an
  observation instead. `ql_build_payload`'s hook used to fail whenever
  `CitadelHudHeroBuilds*` globals were absent — stricter than the code it tested,
  which already falls back to `DispatchEvent`. It cried wolf on a working build.

The smoke test reports how many registered manifests have `test()` hooks. This
is a structural check only — it does not run them.

## Layer 3 — frame-cost profiling

`node scripts/audit_runtime_lifecycle.js --cycles 3` exercises repeated events
and retained/destroyed quickbuy contexts, plus HUD hideout/scoreboard transitions.
It reports raw schedule accounting and modeled operation counts. The included
fault-injection regression must detect a reintroduced scheduling leak. See
[lifecycle profiling](PROFILING.md) for scope and the historical negative control.

A different question: not "did it behave correctly" but "how much work did it ask
the engine to do, and which feature asked".

### Client callback benchmark

`Dev -> Benchmark (Current Config) -> Run Current (10s)` times callbacks managed
by `Scheduler.createPollLoop` without changing feature settings. It includes
synchronous native calls inside those callbacks, but excludes deferred layout,
rendering, GPU work and code running outside these callbacks. Timing uses
`Date.now()`; printed decimals are not sub-millisecond measurement precision.
The current-config run also attempts a temporary `FindChildTraverse` prototype
hook. Its report counts native lookup calls by managed poll owner and calls made
outside those polls, plus the number of live HUD panels covered by the hook at
sample start. `unavailable` or `partial-tree` means those counts are incomplete;
panels created later may use a previously unseen prototype. Native traversal
steps inside `FindChildTraverse`, other panel-search APIs, and all paths outside
the HUD JavaScript context remain unobservable. The initial panel census and
the temporary hook add overhead, so this run is diagnostic rather than a clean
FPS or frame-time benchmark. The hook is restored on completion or stop.

The expanded-config stress mode temporarily enables additional toggles and
restores the configuration. It does not exercise every feature, gameplay event
or numeric variant and cannot establish worst-case CPU load.

For release performance evidence, compare game frame times with and without the
mod on the same repeatable scene, settings and warmed-up workload. Repeat each
condition to distinguish a regression from normal variation. Keep diagnostic
audits and report printing outside the measured window. Test return-to-menu and
re-entry separately: one clean startup does not cover lifecycle regressions.

### Offline operation counts

```
node scripts/profile_hud.js --seconds 20               # per-feature cost report
node scripts/profile_hud.js --seconds 20 --save before # then make a change
node scripts/profile_hud.js --seconds 20 --compare before
node scripts/audit_panel_ids.js                        # candidate ids absent from scanned sources
node scripts/import_tree_dump.js <dump>                # import a tree summary or full dump
node scripts/trace_feature_hud.js --all --seconds 10   # offline lookup events on a captured hierarchy
node scripts/audit_lookups_vs_capture.js <capture.json> --json # active HUD ID/class dependencies
node --test tests/profiler_trace.test.js tests/capture_tree.test.js # accounting and import regressions
```

These tools count operations and expose JavaScript exceptions under the supplied
model. They cannot establish which calls the live engine makes or the cost of a
rendered frame. An id absent from XML/JavaScript can still be created by C++.

The preferred full hierarchy source is the standalone HUD-Dumper native Debugger
export. See [capture testing](CAPTURE_TESTING.md) for importing its receiver JSON,
scope/fidelity checks and the dependency audit. The audit derives active HUD
scripts from XML and scans syntax, including resolvable aliases and class checks;
dynamic arguments are reported separately. Settings/profile/quickbuy contexts
are not part of that HUD audit.

`scripts/import_tree_dump.js` also supports captures from `panorama/scripts/tools/qol_dump_tree.js`. The Dev
button currently captures aggregate counts, not a complete panel hierarchy.
The aggregate can size a synthetic stress scenario but cannot be passed to
`profile_hud.js --tree`, which requires a full per-panel hierarchy. The historical
large-tree budget test was removed; current profiler regressions use self-contained
fixtures without local run files. They verify accounting and capture import,
not rendering or FPS. Do not turn a modelled green result into a client claim.

Read `docs/PROFILING.md` first: it cannot produce milliseconds, and the healthbar
variants are only partially covered.

### The pieces it is built on

`scripts/simulator/` supports the profiler and offline regression scenarios:

| File | Responsibility |
|---|---|
| `clock.js` | Virtual clock: one source for `Date.now`, `performance.now`, `$.FrameTime`, `$.Schedule`. Bounded `advance()`, so a runaway poll loop fails loudly. |
| `panel.js` | Panel object model + `Document`. DFS pre-order `FindChildTraverse`, `Set`-backed classes, `Map`-backed attributes, `maxchars`-aware `SetText`, duplicate-id detection. |
| `layout.js` | Reads script load order from `hud.xml`, stripping comments so cut-over includes stay out. |
| `sandbox.js` | The `vm` context: `$` API, event dispatch, deterministic `Math.random`. |
| `game/builds.js` | `BuildsModel` — build state and the tree mutations the C++ client is believed to make. **This is the guessing part.** Fine for counting operations; not evidence about the client. |
| `perf/` | Operation counters, in-match tree, profiled-HUD entry point. |

## Ground truth is the Panorama debugger

For anything about panel existence, class names, or whether a label's text is
readable, the answer comes from the in-game debugger, not from a model. Facts
captured that way are cited inline where they are used — e.g.
`manifests/ql_build_storage/manifest.js` documents each class it waits on
(`BuildsLoading`, `Selected`, `gEditingBuilds`) with where it was observed.

The current workflow relies on the maintainer's debugger for tree inspection,
not on an assumed writable JavaScript console or browser automation endpoint.
Run bundled probes through the Dev buttons. Panorama HUD rendering is not CEF
page rendering; browser automation of the storage page would not verify the HUD.

When vanilla Deadlock updates, re-check panel ids against
`G:\GameTracking-Deadlock` — layout under
`game/citadel/pak01_dir/panorama/layout/`, styles under `.../styles/`.

Before updating that extract, preserve a source snapshot with
`node scripts/audit_game_update.js snapshot --vanilla <panorama-dir>`.
Afterward, use `check` with the same path to map changed ID/class evidence to
JavaScript call sites and identify changed overridden XML. See
[game update audit](GAME_UPDATE_AUDIT.md) for commands, report meanings and
coverage limits. Source removal is a review candidate, not proof of native absence.

## Historical warning: the removed behavioural suite

The suite removed in August 2026 ran the real mod against a **modelled** panel tree. The model cannot know
which panels the client actually creates — several are conditional in C++ (a stat
panel appears only once you have that stat) — so its answers about panel existence
and label readability were guesses. Guesses fail in both directions:

- **Green on broken code.** A save-verify regression shipped at 14/14 green
  because the model resolved label text the engine does not resolve.
- **Red on correct code.** A fix matching a debugger capture — `Label.BuildName`
  inside `.HeroBuildListItem` holds the literal build name — failed a test that
  asserted the opposite. The test was defending a state the game never enters.

The second failure mode is the expensive one: it makes the suite an obstacle to
shipping correct code, and every fix has to argue with the model before it can
land.

A suite for the class-gated storage manifest would have been worse still. Its
whole design is "wait for a class the client sets". Testing that requires the
model to decide when those classes appear, then verifying its own decision — a
tautology wearing a green checkmark.

So: verify logic that is genuinely self-contained (the codec — 450 fuzz cases),
verify panels in the client (`test()` hooks), count operations against a captured
tree (the profiler), and check rendering by repacking the VPK and looking.

## Helper contracts and HUD evidence

`node scripts/audit_helper_calls.js` checks statically resolvable helper calls,
including lexical aliases, against loaded HUD exports. It runs through the
helper safety regression in `npm test`. Dynamic names and availability in other
isolates are outside this check. `helper_safety.test.js` covers cache ownership,
partial native failures, listener mutation and Scheduler/lifecycle cleanup;
`hud_state_observation.test.js` covers state ambiguity, transitions and recorder
bounds/cancellation. These tests simulate native behavior.

Use [HUD state recording](ui/hud_state_recording.md) after a fresh client repack
for actual scoreboard/life transitions. See [audit scope](HELPER_AUDIT.md).

That recorder also captures bounded managed-work windows and outstanding task
counts for stutter comparisons. `tests/scheduler_observation.test.js` verifies
delivery-delay versus callback-time accounting, owner bounds, cancellation and
observer replacement; the HUD recorder tests cover report publication and cleanup.
See [Scheduler observation scope](core/scheduler.md#transition-work-observation).
