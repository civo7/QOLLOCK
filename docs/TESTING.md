# Testing QOLLOCK

The current offline entry point is `npm test` (see `package.json`). It runs HUD
script loading, stylesheet source checks, the Node regression suite in `tests/`, compact-schema validation,
API checks and ESLint. It does not run a separate build-storage fuzz command.
The Node suite limits file concurrency to avoid exhausting memory when multiple
settings/HUD VM environments run on a machine with many CPU cores.

The optional `scripts/git-hooks/pre-commit` template invokes this same complete
gate for every commit. It does not maintain another manifest/import validator or
skip CSS/XML changes. Installing/updating local hooks remains an explicit local
setup action through `setup-hooks.sh`; source edits do not install them.

CI additionally runs Python `*_automation_test.py` suites, the updater Worker
ESM suite and isolated builder regressions on Windows PowerShell 5.1/PowerShell 7.
See [RELEASING.md](RELEASING.md#offline-checks) for automation checks. The builder
regressions parse source and exercise extracted functions; they do not execute a
build, compiler or VPK packer. These jobs are separate from `npm test`.

Some tests use the panel simulator. They can verify JavaScript behavior under
that model, but cannot prove real client panel structure, rendering or FPS.

## Layer 1 — static / load checks

```
node panorama/scripts/tools/qollock_smoke_test.js   # actual hud.xml script order
npm run check:styles                               # delimiters, selector budget and negation chains
npm run check:origin-css                           # duplicate HUD CSS imports vs live GameTracking master
node scripts/validate_compact_schema.js             # config codec round-trips
npm run check:api                                  # known game API usage
npm run lint                                      # JavaScript static checks
```

The HUD smoke uses `scripts/simulator/layout.js`, includes `core/ql_app.js`, and
fails when an included script is missing. It is not a settings-context smoke or
a runtime behavior test. The schema validator exercises codec round-trips;
load checks alone cannot catch gameplay or lifecycle bugs.

ESLint checks Panorama scripts, CommonJS tooling/tests, Node ESM tests and the
updater Worker with separate script/module contexts. Promise executor, array
callback and other correctness checks are errors; unused declarations remain
warnings. `no-var` and `prefer-const` apply to tooling/tests and the Worker, while
Panorama retains legacy declarations and cross-file globals. Local duplicate
checkouts under `.claude/worktrees/` are excluded. `tests/eslint_config.test.js`
exercises both rejected and accepted examples through the actual config.

These core ESLint rules do not establish that Promises are handled everywhere,
or that Scheduler callbacks and lifecycle hooks are synchronous. Following
aliases, callback return types and asynchronous operation ownership requires
context-aware analysis or behavior tests; the existing lifecycle checks remain
necessary. ESLint parsing also does not establish Panorama engine API support.

The stylesheet gate scans every shipped CSS source, including native base
imports, for mismatched delimiters, unfinished strings/comments, oversized
selector lists and chained `:not()` on the same selector component. The negation
rule prevents recurrence of the keyboard and event-indicator compatibility
regressions; single negations on separate ancestors/descendants or comma-separated
selectors remain allowed. It does not implement native CSS grammar or compile resources;
the maintainer's compilation and client checks remain required.

`node --test tests/style_sources.test.js` covers the stylesheet source inspector's
separate XML/resource routes, import/declaration locations, comment/string false
positives, duplicate paths, source cycles, unavailable native imports and bounded
coverage. Its CLI regression searches the actual shipped style graph. These
checks establish source provenance, not selector applicability or computed CSS;
see [stylesheet source investigations](TOOLS.md#stylesheet-source-investigations).

`check:origin-css` resolves GameTracking's remote `master` SHA, reads the native
HUD layout and its recursive stylesheet imports from that pinned GitHub
revision, then checks imports reachable through QOLLOCK HUD stylesheets for
imports of resources already loaded by the native HUD. It skips the vendored
`styles/base/` snapshots, whose imports come from the copied native stylesheets.
This check requires network access and is kept separate from `npm test` so a
temporary GitHub outage does not block offline verification.

## Focused release regressions

`disabled_abilities.test.js` checks settings and registry exclusion through the
production root projector, absence of a feature observer, native template
decoration and scoped component imports/selectors. Native silence/curse visuals,
hit testing, late/replaced icon instances and exclusion of cosmetic, held, shop,
top-bar and tooltip instances still require a compiled client check.

`settings_save_queue.test.js` loads the actual settings/HUD isolates and verifies
Flush followed by a new edit, one pending callback during repeated changes,
direct-save supersession, zero schedule handles, failed cancellation and living
context replacement. Dirty stamps and serialized root publication remain exercised
through the production save path; these are not durable CEF-storage checks.

`native_style_owner.test.js` covers attempted-property/class ownership, native
readback normalization and overwrite, rejected writes/neutral resets/clears,
destroyed sources, cleanup completion after disposal and immediate re-enable
leases. `inventory_stats_owner_lifetime.test.js` applies that contract to the
production inventory/stats owners: living HUD replacement, loading roots, late
and moved leaves, preserved native opacity, idle settings reads and stopped hooks.
Rejected clears also finish after their presentation loops stop. These checks do
not establish native rendering or input behavior.

`souls_bars_owner_lifetime.test.js` applies the shared native style contract to
souls and top/bottom bars: current HUD replacement, failed style/class retirement,
loading roots, stopped hooks, production-registry rapid re-enable and native
feedback overwrites without redundant idle writes. Currency tint follows late,
moved and recycled-role leaves within its verified containers. Hidden signature
geometry/tint and independently configured active slots remain separate; native
scale baselines and topbar visibility transitions retain their existing regressions.

`stamina_rotation_owner.test.js` checks native-zero degree presentation through
the ordinary control and Customize input/slider/wheel/history/reset while
preserving the published stored field. Native-owner cases cover color-only
no-op rotation, living ring/HUD replacement, rejected writes/restores, native
transform overwrite, loading roots and stopped hooks. Existing native feedback
state tests remain; actual ring orientation/pivot and recharge/drain animations
require client verification after compilation/repacking.

`ui_friends.test.js` exercises the escape-context search owner against late and
living replaced lists, late/changed native names, rejected class writes and
retirement, repeated initialization, retired callbacks, script reload and context
destruction. It checks the actual clear-button CSS gate and preservation of
native visible flags. The model does not establish native friends-panel creation,
input routing or button rendering.

Customize regressions exercise draft publication separately from canonical
settings, Apply/Cancel, acknowledged saves, cleanup, measured frame geometry,
native Button capture, live draft delivery and corner resizing.
`customize_capture.test.js` dispatches Button callbacks with both optional cursor
coordinates and compositor samples. It includes missing/throwing cursor APIs,
all four corners without that API, repeated stamina/Current/Max Ammo grabs,
partitioned padding, invalid coordinates, destroyed visuals and cancellation. These checks
cannot establish native DragStart/DragEnd routing. Run `node --test tests/ui_customize.test.js
tests/customize_catalog.test.js` for the editor subset. Modeled dimensions and
input events do not establish native rendering or interaction.

`tests/customize_rework.test.js` checks canvas-density conversions, padded AP
targets, magnet candidates and truthful guides, undoable Reset of off-screen
elements, delayed
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

`rejuv_phase_sequence.test.js` replays successive native boss/charge signals through
the production registry, clock observer and Scheduler. It checks literal HUD and
minimap readouts through later cooldown phases, delayed/duplicate signals,
expiration boundaries, paused match time and the charge-only fallback. Run it with
`node --test tests/rejuv_phase_sequence.test.js`. This checks the mod's current
phase policy; it does not verify server timings or native signal delivery/layout.

The map lifecycle suite also exercises partial crate/tunnel construction, moved
markers, shrinking coordinate data, queued previous trees, stopped hooks and
still-living HUD replacement. The shared tree suite checks targeted branch
retirement without touching unrelated created branches or native IDs.

The information-owner tests also retire every moved Rift/Crosshair Stats child,
exercise rapid re-enable before asynchronous deletion, and replace a still-live
HUD without inheriting old source/model bindings. Same-HUD topbar replacement
continues the warning deadline; native sources remain alive and unchanged.

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
Quickbuy source checks also retain required global states and blocked-purchase
children while allowing additional native listener classes and native card sizes.
Enhanced cards share left-aligned coordinates with their companion previews.
After a maintainer repack, verify normal/enhanced quickbuy, full/locked item slots,
high unspent souls, shop opening and preview placement at supported aspect ratios.

`chat_translation_owner.test.js` checks production account gating and pending
evidence, independent native message selection, bounded cache and lifecycle
cleanup. Native text remains readable through modeled failed helper requests;
localhost image loading and native chat layout require client verification.

`chat_image_geometry_owners.test.js` checks the independent native geometry and
image owners: both teams, current bottom text bindings, unchanged native text/
input/animation, bounded image cleanup, URL matching, partial writes and living
replacement. Customize cancellation observes both released code styles and
the neutral native offset written before release.

Cursor regressions in `ui_runtime_owners.test.js` use the active lifecycle rather
than constructing UI through stopped hooks. They cover owned-image retirement,
foreign/pending tree deletion, image/coordinate failures, rapid re-enable and
retryable root-class release across living HUD generations. Native pointer
appearance, coordinates and menu interaction remain client checks.

Audio regressions observe actual caption presentation rather than exported
private booleans. They cover new HUD announcement history, stale callbacks and
caption-only disable alongside existing interval/lead-time behavior. Damage
owner regressions release living moved labels and replaced gameplay scopes
without waiting for a full discovery scan or publishing duplicate global caches.

`keyboard_owner_lifecycle.test.js` retains both native action layouts and checks
reactive geometry/palette/custom RGB, Label-type glyph discovery, living owner
replacement, partial style/construction failures, disable and registry cleanup.
Native binding/glyph composition and key press visuals remain client checks.
Keyboard regressions also retire foreign previous roots, exercise re-enable
before asynchronous deletion, retry moved created-child deletion while preserving
moved native glyph content, and keep loading-root lookalikes/partial renders hidden.
The shared tree suite verifies its topology result independently of pending
deletion retries, allowing complete layouts to use one ownership scan.

Native target tests release living moved shapes and recycled native hint scopes
on the render cadence, retain unrelated properties and exercise replacement
through a real `CitadelHud` fixture. They resolve both native duplicate hint IDs,
reject unrelated same-ID containers, retry late branch children and contain
stopped hooks/loading roots without added XML classes. Private caches are not
published to shared State.

`performance_owner_lifecycle.test.js` covers private report/renderer generations,
reactive collection flags/opacity, preserved Scheduler samples, partial writes/
construction, native label replacement, registry cleanup and rolling reports.
They also cover complete moved-child retirement, rapid re-enable without
reviving the previous tree, and loading-root suppression while console
collection remains enabled.
These are callback-data checks, not native frame/rendering performance results.

`urn_tracker_runtime.test.js` drives the private urn-difference lifecycle, including
native/legacy source priority, late/moved/class-recycled sources, living HUD and
readout replacements, partial construction/text writes and registry cleanup.
The same tests exercise prior-instance deletion, complete moved-child retirement
and loading roots with similar native IDs. Pure parsing/display cases retain
native number formats and match-time thresholds.
Native networth binding timing and readout presentation remain client checks.

`map_module_lifecycle.test.js` also exercises the timer owner's complete created
tree, stopped settings hooks, hidden partial construction, immediate re-enable,
loading roots and living HUD/native-clock replacement. Existing geometry tests
retain both minimap scale methods and Base/Alt/Tab bridge placement.
The compass cases also retire every created tick/readout child, contain inactive
hooks, wait for both queued previous trees, recover hidden partial construction,
and reset native rotation/flip/motion bindings across living HUD replacement.

`build_id_owner_lifecycle.test.js` checks existing parsing and native title
fallback, reactive settings, late/live source and parent replacement, current HUD
isolation, partial construction/style/text failures, queued previous trees and
registry cleanup. Preset bridge and hideout regressions retain the current
readout behavior. Native metadata binding and composition remain client checks.

Reload-owner regressions also check queued previous IDs before deletion runs,
stopped hooks, moved labels whose text setter rejects cleanup, and fresh
estimates after living HUD/loading-scope replacement. Existing tests retain
both radial directions and native clip/class preservation.

`shared_panel_cache.test.js` covers shared typed/compatibility storage, public
resolution after living moves, root/ID-scoped discovery misses, equal-revision
configuration across living generations, current UI-root selection and rejected
publication read-back. These checks model panel attributes, not disk durability.
Storage-bridge fixtures load the production namespace/panel helpers used by the
settings context, rather than a partial replacement for their discovery contract.

`game_time_sync.test.js` retains synchronized timer updates and bounded missing
clock searches. It also covers living verified clock/root replacement, upgrading
construction fallbacks, equal-second generation notifications, requested-root
reads and subscription mutation/cancellation.

`core_native_generations.test.js` checks current shop combat evidence, independent
indicator recovery and retired native targets, living root class release, partial
ability-class retries, reload exception source replacement and mode observations.
The status/indicator regression observes visible phases and class state rather
than modifying private history through shared State. Native visuals/timing remain
maintainer client checks.

`combat_status_owner.test.js` exercises the text readout through its lifecycle:
late native gameplay, reactive geometry, living parent/label replacement, retained
same-HUD phase history, reset on a new HUD, partial construction/styles and stopped
hooks. The registry failure case verifies both UI and work cleanup; indicator
independence remains covered by the combined status/indicator regression.

`owned_overlay_trees.test.js` exercises production zip/unsecured/stat owners and
the shared created-tree helper against late native parents, living HUD/scope
replacement, every moved child, partial construction/styles, deletion retry,
stopped hooks and rapid registry re-enable. Existing overlay tests retain timer
sampling, source selection, native content and component/offset behavior.

`hero_evidence_scope.test.js` checks requested-root isolation, late/live pawn
sources, conflicting native classes and contained pregame read failures. FG
portrait regressions retain reveal priority, mapped assets and native healthbar
behavior; frozen compact/envelope tests retain historical config decoding.

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

`tests/settings_autosave.test.js` exercises production settings controls and save
coordination: coalescing, acknowledgment, failures, disable, restored preferences,
stale contexts and manual storage actions. `main_preview_retirement.json` freezes
Preview on/off JSON and compact exports generated from the recorded `origin/main`
commit, so compatibility is checked against the old writer. The bridge suite also
connects actual settings edits to the embedded page and restores the result in a
fresh modeled realm. Retired preview-panel behavior tests were replaced by
removal and compatibility checks; live Customize/preset previews retain their
separate regressions.

The audio tests observe production sound dispatches after config mapping and
export/reload. A Buff Delay of 15 seconds already worked on that path before the
release fixes. The confirmed zero-to-30 fallback was a separate bug; its fix
does not establish the cause of a player's 15-to-30 report.

`node --test tests/audio_event_contract.test.js` additionally connects production
HUD dispatches and rendered Audio preview buttons to the reminder definitions in
`soundevents/world_ambient_emitters.vsndevts`. It exercises every integer volume
from 0 through 100, all selectable voices, each bridge/tier variant, the eleven
distinct DL4D reminders and the minimap reminder. Independent expected event and
resource names catch misrouting as well as missing definitions, wrong WAV paths
and mute/positive-gain errors. Shipped WAV sources must exist; custom announcer
slots are checked for event/path routing only, because their packs are supplied
separately. The reader covers flat QOLLOCK reminder records and rejects unsupported
record shapes; it is not a KV3 compiler. This regression runs in `npm test` and
does not compile or inspect packaged resources, decode audio, measure loudness,
verify native playback or establish that a custom pack is installed. After a
maintainer repack, audible playback and custom-pack loading remain client checks.

Slider tests cover accepted UI values through the production export/import path
using the current settings-code codec. Historical compact import has separate
compatibility regressions. The
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

### In-game feature exclusion investigation

Dev offers the cadence-based FPS investigation for the current configuration;
the former Expanded row is replaced by the native configuration suite below.
Older `fps_expanded` bridge requests remain supported. Start in
a repeatable sandbox scene, close Esc within five seconds and keep the camera,
gameplay and native telemetry settings constant. Opening Esc stops the scan and
produces a partial report. The Stop action is also available in Dev. Completion,
cancellation, HUD retirement and incoming configuration changes restore excluded
owners; both modes lease canonical settings in memory, suspend Customize drafts
and never save test values.

The scan compares all registered enabled owners, then groups, using A/B/B/A
(reference/excluded/excluded/reference). Large groups are partitioned before
testing so individual follow-up does not silently omit a group's tail. Each window settles for one second and
samples for three. It automatically checks up to twelve individual owners in the
strongest repeatable group. Confirmed minimap owners then receive layer follow-up
through their existing active setting gates: static reference groups, crates,
tunnels and applicable appearance modes. Each trial changes only its reported
settings through the App's in-memory lease, with the original leased values
restored between conditions. Settings trials may intentionally change enabled
owner coverage; the expected coverage is derived from the existing enable policy.
The seven-minute deadline still applies, and reports list selected layers that
were not completed. Diagnostic
metadata/percentiles are processed outside sampling; the sampler keeps bounded
numeric intervals and uses the existing Scheduler work observation for callback
context. Reports distinguish insufficient samples, reference drift, inconsistent
repeats and repeatable improvement. Repeatable candidates are investigation
leads, not proof of a feature's engine frame cost. A fixed-size HUD label shows
the trial and phase; it updates outside sampling and disappears on completion.
Wall-clock start/end markers allow alignment with a separate native capture.
Reports list owners not checked individually. Managed callback failures and
observed menu/shop/scoreboard/hideout transitions stop the scan.

The measured intervals are **UI dispatch cadence**, using native `$.Schedule(0)`
and changes in `$.FrameTime()`. The current extracted `async.js` implements
`NextFrame` through zero-delay scheduling, and the post-game progress script uses
frame-clock differences for elapsed animation time. This does not establish a
one-to-one relationship to presented game frames. UI caps, missed dispatches,
scene variation, inactive gameplay paths and interacting features can obscure a
cost. No engine FPS, GPU timing or rendering attribution is claimed. Validate
candidates with native telemetry and a repeated identical scene. The all-excluded
condition retains core code and loaded static stylesheets, so it is not vanilla.

`tests/fps_investigation.test.js` models cadence changes and cancellation; App and
Dev tests cover the actual request/result bridge and configuration restoration.
These simulator checks do not verify native frame cadence or FPS.

### Native Expanded configuration investigation

Use Dev's **Expanded configuration investigation** with the external native
collector to investigate the ten-second Expanded Config stress mode. This is
a longer comparison, not another ten-second callback benchmark. Start
`scripts\capture_game_frames.cmd`, retain the prefilled condition IDs, click
Investigate, close Esc within five seconds, and keep the camera, world scenario
and game focus unchanged until completion. Wait for the external report before
switching windows. Settings are leased in memory and restored without saving.

The default UI request runs only `whole-config`, `benchmark-instrumentation`
and the automatic sham, taking about two minutes. Check this native report for
source/trace/focus quality and reproduction of the reported regression before
spending time on a broad scan. It also lists the captured group and key IDs;
repeat a relevant group directly, or clear the IDs for the full plan. Neither
selected-ID follow-up nor the full plan requires another repack when using the
same compiled controls. The collector remains one-way: this is an explicit
short first capture, not online native-quality feedback to the HUD.

For a short combined-group capture, start the same collector and replace the
condition IDs in Dev's **Expanded configuration investigation** with:

```text
whole-config,revert-minimap-keyboard,revert-other-settings
```

Click **Investigate**, close Esc within five seconds and keep the scene and game
focus unchanged. This selects four comparisons, including the automatic sham:
Expanded versus itself, canonical, Expanded with S restored to canonical, and
Expanded with T restored to canonical. Three repetitions take about 2.5 minutes;
the existing native frame collector writes `captures/native-fps-*/report.txt` and
`native-analysis.json` alongside the raw capture. The new controls require a
maintainer compile/repack once; selecting them afterward needs no file edits.

S contains whole changed-key consumer groups touching `ql_minimap_runtime`,
`ql_minimap_loot`, `ql_minimap_timers` or `ql_keyboard`. A shared group is included
in full, including its other consumers; an unrelated compass/speed-only group
stays in T. T is the exact remaining changed-key complement. The captured plan
and report list the actual keys and original consumer groups, so this partition
does not depend on historical group numbers. Both subsets must contain changed
keys; otherwise the request fails visibly instead of measuring a mislabeled
no-op. Either new ID may also be selected alone for a partial follow-up.

These are conditional comparisons in the same Expanded configuration, not
additive cost shares. A large whole-config effect with inconclusive halves does
not clear either half. Old captures and requests without either new ID retain
their original conditions, order and available refinements; analysis reconstructs
the plan from the saved settings, manifest inventory and selected IDs and rejects
a mismatched ledger.

The declared plan compares Expanded against the canonical settings, then
benchmark accounting on/off, then every changed settings group. Groups have the
same declaring manifest consumers; shared keys list all consumers and keys with
no registered consumer remain separate. Applying through App also projects
root CSS, unlike merely disabling a registry owner. Group IDs and exact keys
are captured with the plan. UI dispatch cadence never selects coverage.
Three separated ABBA/BAAB repetitions and an A/A sham measure conditional effects.
The duration depends on the canonical configuration and can approach the runner
deadline; inspect the runtime progress total. The collector accommodates the
full bounded run. Optional `key-...` condition IDs refine individual settings
using already compiled controls. IDs belong to the captured plan/configuration;
reruns should retain the same canonical settings.

The accounting contrast preserves callback benchmark statistics but suppresses
the legacy benchmark's own startup, heartbeat and final console output.
Feature-owned perf logging and overlays remain enabled when Expanded requests
them and are tested as their own settings group. All windows retain the same
additional Scheduler work observation. No lookup prototype/instance hook or
per-frame UI sampler runs in this investigation.

Before/after proofs check the leased config, stable registered readback, registry
coverage, benchmark flag, monotonic registry error totals and native scene flags,
including the stationary scoreboard listener and Alt/detail evidence. App captures
the error checkpoint before applying Expanded; a failed initial hook or missing
intended owner refuses the baseline and emits an immediate setup-failure report.
Successful callbacks cannot erase earlier failures inside the scan. Scoped feature
events and managed Scheduler callbacks are covered; raw native callbacks and
unscoped EventBus handlers remain outside this error counter. ConfigAdapter's
normalized registered differences are reported, not mistaken for enabled paths.
Settings without a canonical value are explicitly listed as not intervened.
These generic proofs do **not** establish native panel construction, cleanup,
feature-specific render completeness, or that event-driven/gameplay work ran.
When the selected plan includes a keyboard enable/disable contrast, keyboard
root/generation/style evidence is additionally recorded before and after every
window. The enabled side requires an attached visible private root and settled
style readback. The disabled side requires the retired instance's complete
tracked-tree deletion and style release, plus no root in its old gameplay owner.
Missing/partial evidence refuses that window; generation replacement also
invalidates it. The report prints the observed A/B evidence. This applies to
newly instrumented captures, not retroactively to earlier recordings, and does
not establish native glyph rendering or input correctness.

After keyboard owner cost is established, enter `keyboard` in the same condition
ID field for the targeted mechanism investigation (about three minutes). This
requires the compiled keyboard probe implementation; it is not an alias available
in older builds. The ordinary and full configuration plans are unchanged. The
alias uses the existing A/A control alongside the targeted contrasts below.

New captures record the owner's baseline composition policy in their context.
Polling, visibility and hidden-binding contrasts retain that policy; the
composition contrast always explicitly compares `none` with `cache`. Historical
contexts without this field retain their original uncached plan when analyzed.

- Historical captures can include `keyboard-polling`: normal versus paused
  recurring keyboard updates, retaining visible native bindings. The event-driven
  owner has no recurring updates, so current plans omit this contrast and reject
  its ID. Context metadata preserves the historical four-probe reconstruction;
  the current alias has three probes plus the A/A control.
- `keyboard-visibility`: both sides pause updates; collapse only the owned root.
  This measures visibility-dependent native work, including any binding updates
  that the engine stops when hidden, rather than isolating painting alone.
- `keyboard-composition`: both sides pause updates; request an uncached versus
  cached composition layer on the bounded binding box. A creation request does
  not prove a hardware cache hit.
- `keyboard-hidden-bindings`: paused, collapsed bindings versus complete owner
  retirement, including when the canonical configuration enables the keyboard.

Historical warm-up runs normal polling before each sample; the current owner
reacts only to its lifecycle and presentation hooks. Before/after receipts
verify scheduler suspension, unchanged generations and idle update counters, native
visibility, settled style readback and requested composition policy. A bounded
outside-window census reports selected/hidden bindings, unbound glyphs, hold
actions and pressed keys. Visible probes wait for styled native glyph payloads
matching the initial visible workload before pausing. Native-handle epochs and
workload fingerprints must remain unchanged inside each window. Collapsed native
bindings may release their glyphs; hidden probes permit this settled state while
still requiring live bindings and a stable census. Late construction or replacement
cannot count as a cache improvement. Unbound glyphs can carry the native repeating animation;
their presence alone does not attribute frame cost. The report retains these
receipts and managed callback timing. Transient controls and pauses are restored
on completion, cancellation and owner replacement without saving settings.
Missing sources, quiet gameplay paths and features in other contexts can hide
costs. A negative or inconclusive result never clears a feature. A speedup can
reflect the intended visual workload and does not prove redundant code.

The external analyzer checks the declared plan, proof chunks, native frame/focus
coverage, within/between-block drift and three valid repetitions before labeling
an effect. Exploratory bounds use block-level t95 dispersion plus worst sham
noise, not independent-frame statistics or familywise confidence. Effects can
overlap and must not be summed. Missing/invalid blocks remain in the report.
Per-block output includes each side's paired-mean drift percentage, so a rejected
comparison is distinguishable from a lost packet or unexecuted condition without
loosening the existing drift gate.
The self-contained report includes tested/canonical settings, source/loaded
function identity, source paths, normalized readbacks and restoration. Full
assets/CSS and installed compiled resources are not proven by function hashes.
The canonical condition retains QOLLOCK; it is not a vanilla comparison.

`config_investigation`, `config_native_analysis`, App, Scheduler and Dev tests
exercise production configuration delivery, frozen UI clocks, cancellation,
native report parsing, missing/corrupt evidence, noise and clipboard ownership.
They do not establish client rendering or FPS.

### Complete native minimap investigation

Dev's **Complete minimap investigation** replaces the separate polling and static
visibility buttons with one native-first declared plan. Start the external collector,
choose a stationary Midtown scene, leave condition IDs blank, click Investigate,
and close Esc within five seconds. Keep the game focused, camera and view unchanged
until the indicator disappears, then wait three seconds before switching windows.
This is a long diagnostic run, not a ten-second benchmark; the UI estimates its duration.
Do not use it during active gameplay.

The plan in `core/ql_minimap_plan.js` independently repeats every selected contrast
in separated ABBA/BAAB blocks. It covers whole owners, polling bodies, ownership
sweeps, retained roots and individual reference groups, native presentation groups,
interactions/retention, and composition policies together and per owner. UI cadence
never selects its coverage. Geometry roles that can break a coherent size/scale
chain are shipped as selectable refinements, with a presentation-confound warning.
Inactive native targets have evidence-backed skips; they are not zero-cost findings.

Feature-owned leases apply controls without changing persistent settings. Before
sampling, both complete counts and native-style reconciliation/readbacks must pass.
Disabled-owner evidence includes actual tree/style retirement, not merely registry
state. Every successful reconciliation receives a full warming interval; the final
proof is read-only and cannot rebuild a tree at sampling start. Failed baseline
setup stops early. Completed windows carry before/after proofs, actual stage counts
and UTC bounds. Both state payloads are transported after the measured window;
the collector defers bulk proof decoding until ETW has stopped. Polling probes
require execution in the running state and no body
execution in the paused state. Events, one-shots, other owners and native game
rendering remain active. These exclusions do not isolate JavaScript from native calls.

App leases an explicit expanded configuration, including populated location names;
the full tested and canonical configurations accompany the plan. Completion, stop,
replacement, errors and deadlines release interventions/poll pauses and restore the
App configuration lease. Retiring contexts cannot enable a new generation's owners.
Final transport follows App restoration; a successor-owned configuration is explicitly
unverified for the old request. Immediate reconstruction evidence does not prove
native layout/paint has completed.

`report.txt` is designed to be pasted into a new chat without conversation history:
source/game/capture identity, configuration, vectors, source functions, observed state,
per-block native effects and uncertainty, interactions, missing/invalid/unexercised
coverage and restoration. Raw proofs and a structured analysis remain in the capture.
Noise comes from sham A/A blocks and repetition-level dispersion, not thousands of
frames treated as independent experiments. Bounds are exploratory, not familywise
confidence or proof that world/camera state was identical. A small bounded effect
never means zero cost. Geometry/decorations alter appearance and visible workload;
a speedup does not justify removing a necessary override or accepting broken visuals.

The collector is one-way; it does not feed native quality back into the running HUD.
For invalid/inconclusive conditions, start another capture and enter the report's
comma-separated IDs in the same Dev row. A fresh sham is included automatically.
This uses the already compiled controls, without another repack or game restart.
The default full run executes per-owner cache variants; remaining geometry refinements
and their source mapping are listed in the report.
The Dev completion status directs the user to the external capture window. It
does not copy the internal completion stub over an already produced native
report; the collector owns copying `report.txt` to the clipboard.

`minimap_full_investigation`, `minimap_diagnostic_owners`, `minimap_native_analysis`
and App/Dev regressions exercise the production request, lease, transport, validation
and restoration paths. Simulator checks do not establish native visuals or FPS.

### Native game frame capture

For game frame evidence, run the external collector before starting the same Dev
investigation. Recompile/repack the source first: the App now emits one compact
`[QOLLOCK:NativeFPS]` marker per completed window, outside sampling. Full minimap
context/proofs use bounded checksummed packet chunks on the same transport. The previous
large text report can be truncated by the native console and is not used as the
collector's transport. No in-game API for presented-frame timing is assumed.

```text
scripts\capture_game_frames.cmd
```

The collector requires Windows, PowerShell 7, Node and one running Deadlock
process. It downloads the pinned official portable PresentMon executable into
the user's local application-data cache and verifies its SHA-256 before use;
it does not install a service. `-PresentMonPath` accepts an already downloaded
copy of that exact executable. `-GameProcessId`, `-GameLog` and `-OutputDirectory`
override discovery. The CMD launcher locates PowerShell 7 and opens a persistent
window, including a bundled desktop runtime when `pwsh` is absent from PATH.
Start Dev's Expanded configuration investigation, Complete minimap investigation
or generic Current Config feature scan within one minute,
close Esc and keep the game focused. Completion/stop ends only this collector's
unique ETW session. Launcher and runner deadlines bound unattended runs; `-MaxSeconds`
overrides collection duration. The collector waits for the full minimap plan's end.

PresentMon records the selected game's native graphics Present events. Each CSV
row supplies its QPC timestamp, Present interval and available display/CPU/GPU
metrics. Periodic Windows QPC/UTC anchors align these events to window boundaries
using piecewise interpolation; local formatted dates are not used. The analyzer rejects clock jumps,
uncertain anchors, trace errors and ambiguous substantial swap chains. Foreground
PID is sampled every half second: observed focus changes or missing coverage
invalidate affected comparisons; briefer unobserved transitions remain possible.

Results under `captures/native-fps-*/` include `frames.csv`, `capture.json`,
`source.json`, `native-analysis.json`, PresentMon diagnostics and `report.txt`.
Source identity records local JS/CSS/XML hashes, selected loaded function hashes,
Git state and available game binary identities. It does not prove all installed
compiled resources or assets match local source. The independent report ranks the actual
tested conditions by native Present intervals, not by their UI score. Mean FPS
is the reciprocal of mean interval, not an average of instantaneous FPS. Display
cadence is reported separately when available; CPU/GPU busy values are context,
not attribution to a JavaScript owner. Driver/frame-generation behavior can
separate application submissions from displayed frames. PresentMon documents
additional GPU-timing limitations with hardware-accelerated GPU scheduling.

The separate generic feature scan still chooses deeper follow-up by UI cadence;
the complete minimap suite has its own fixed native-first coverage ledger. Neither
attributes individual native
draw calls. All conditions retain the same diagnostic instrumentation; its
overhead is not a vanilla baseline. Scene stability and repeated comparisons
remain necessary. Cancellation/deadline preserves valid completed minimap blocks
and lists every missing planned condition. Missing/corrupt proof chunks invalidate
their blocks; a missing full-suite context refuses legacy fallback. Native trace
acquisition errors/losses still reject attribution. Reanalysis needs the matching
source/verifier revision recorded in the capture.

To reanalyze a preserved capture:

```text
node scripts/analyze_game_frames.js captures/<run>/frames.csv captures/<run>/capture.json
```

Use `-SwapChain <address>` only after identifying the game's intended render
surface when multiple substantial swap chains are reported. `-ProbeSeconds 5`
tests native capture without starting a mod scan; it cannot establish a feature's
FPS cost. The parser/comparison regressions are in
`tests/game_frame_analysis.test.js`. Collector availability has to be checked on
the actual Windows client, independently of simulator tests.

Sources: [PresentMon 2.6 console interface](https://github.com/GameTechDev/PresentMon/blob/v2.6.0/README-ConsoleApplication.md),
[CSV timestamp/metric writer](https://github.com/GameTechDev/PresentMon/blob/v2.6.0/PresentMon/CsvOutput.cpp).

### Offline operation counts

```
node scripts/profile_hud.js --seconds 20               # per-feature cost report
node scripts/profile_hud.js --seconds 20 --save before # then make a change
node scripts/profile_hud.js --seconds 20 --compare before
node scripts/import_tree_dump.js <dump>                # import a tree summary or full dump
node scripts/trace_feature_hud.js --all --seconds 10   # offline lookup events on a captured hierarchy
node scripts/audit_lookups_vs_capture.js <capture.json> --json # active HUD ID/class dependencies
node --test tests/profiler_trace.test.js tests/capture_tree.test.js # accounting and import regressions
```

These tools count operations and expose JavaScript exceptions under the supplied
model. They cannot establish which calls the live engine makes or the cost of a
rendered frame. An id absent from XML/JavaScript can still be created by C++.

The profiler, tracer and Git-ref comparator default to the tracked October 3
native Debugger capture. They do not compose an XML HUD or inject synthetic
native panels. Regression fixtures still exercise controlled logical states;
the default-command regressions also verify selection of the tracked capture.

The preferred full hierarchy source is the standalone HUD-Dumper native Debugger
export. See [capture testing](CAPTURE_TESTING.md) for importing its receiver JSON,
scope/fidelity checks and the dependency audit. The audit derives active HUD
scripts from XML and scans syntax, including resolvable aliases and class checks;
dynamic arguments are reported separately. Settings/profile/quickbuy contexts
are not part of that HUD audit.

`scripts/import_tree_dump.js` also supports captures from `panorama/scripts/tools/qol_dump_tree.js`. The Dev
button currently captures aggregate counts, not a complete panel hierarchy.
The aggregate supports ID inventory but cannot be passed to `profile_hud.js --tree`,
which requires a full per-panel hierarchy. The historical
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
| `panel.js`, `search.js` | Panel object model + `Document`; shared search rules check each parent's direct children before recursing, following the recorded native probe. Classes, attributes and `maxchars`-aware `SetText` remain modeled behavior. |
| `layout.js` | Reads script load order from `hud.xml`, stripping comments so cut-over includes stay out. |
| `sandbox.js` | The `vm` context: `$` API, event dispatch, deterministic `Math.random`. |
| `index.js` | Boots the production HUD include graph without a native game model. Each regression supplies its own required panels and API responses. |
| `perf/` | Operation counters, in-match tree, profiled-HUD entry point. |

## Ground truth is the Panorama debugger

For anything about panel existence, class names, or whether a label's text is
readable, the answer comes from the in-game debugger, not from a model. Facts
captured that way are cited inline where they are used. The former hero-build
storage model is removed; CEF persistence regressions live in
`tests/storage_bridge.test.js` and execute the embedded page fixture in a separate
realm. They model transport and storage failures, not the actual CEF process or
native restart durability. Shop presentation and build-ID regressions still cover
their active production owners independently of persistence.

The current workflow relies on the maintainer's debugger for tree inspection,
not on an assumed writable JavaScript console or browser automation endpoint.
Run bundled probes through the Dev buttons. Panorama HUD rendering is not CEF
page rendering; browser automation of the storage page would not verify the HUD.

When vanilla Deadlock updates, re-check panel IDs against an up-to-date game
resource checkout. GameTracking keeps layouts under
`game/citadel/pak01_dir/panorama/layout/` and styles under the sibling `styles/`.

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

Use codec and production-path regressions for JavaScript logic, including
controlled source loss and replacement. A fixture must state which native
behavior it assumes; it cannot validate that assumption itself. Observe native
panels through client hooks and debugger evidence, count modeled operations
against labeled captures, and check rendering after maintainer compile/repack.

## Helper contracts and HUD evidence

`node scripts/audit_helper_calls.js` checks statically resolvable helper calls,
including lexical aliases, against loaded HUD exports. It runs through the
helper safety regression in `npm test`. Dynamic names and availability in other
isolates are outside this check. `helper_safety.test.js` covers cache ownership,
partial native failures, listener mutation and Scheduler/lifecycle cleanup;
`hud_state_observation.test.js` covers state ambiguity, transitions and recorder
bounds/cancellation. These tests simulate native behavior.

`native_style_owner.test.js` exercises component leases for native position,
CSS-name aliases, readback and cleanup after controller disposal. Module
lifecycle regressions cover native overwrite, rejected retirement, HUD/source
replacement and stopped hooks. `customize_preview_delivery.test.js` injects a
failed config delivery, benchmark suppression and partial acknowledgement writes;
an editor acknowledgement follows delivery and does not prove native relayout.
Editor regressions retain measured geometry across accepted input, resize,
Undo/Redo and context changes. They do not simulate compositor hit testing or
clipping. Physical digit Reset, overlapping corners and minimum Stamina scale
require client checks after repack.

Use [HUD state recording](ui/hud_state_recording.md) after a fresh client repack
for actual scoreboard/life transitions.

That recorder also captures bounded managed-work windows and outstanding task
counts for stutter comparisons. `tests/scheduler_observation.test.js` verifies
delivery-delay versus callback-time accounting, owner bounds, cancellation and
observer replacement; the HUD recorder tests cover report publication and cleanup.
See [Scheduler observation scope](core/scheduler.md#transition-work-observation).
