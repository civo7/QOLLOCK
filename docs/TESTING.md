# Testing QOLLOCK

The current offline entry point is `npm test` (see `package.json`). It runs HUD
script loading, the Node regression suite in `tests/`, build-storage fuzzing,
compact-schema validation, API checks and ESLint.

Some tests use the panel simulator. They can verify JavaScript behavior under
that model, but cannot prove real client panel structure, rendering or FPS.

## Layer 1 — static / load checks

```
node panorama/scripts/tools/qollock_smoke_test.js   # actual hud.xml script order
node scripts/validate_compact_schema.js             # config codec round-trips
npm run check:api                                  # known game API usage
npm run lint                                      # JavaScript static checks
```

The HUD smoke uses `scripts/simulator/layout.js`, includes `core/ql_app.js`, and
fails when an included script is missing. It is not a settings-context smoke or
a runtime behavior test. The schema validator exercises codec round-trips;
load checks alone cannot catch gameplay or lifecycle bugs.

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

A different question: not "did it behave correctly" but "how much work did it ask
the engine to do, and which feature asked".

```
node scripts/profile_hud.js --seconds 20               # per-feature cost report
node scripts/profile_hud.js --seconds 20 --save before # then make a change
node scripts/profile_hud.js --seconds 20 --compare before
node scripts/audit_panel_ids.js                        # candidate ids absent from scanned sources
node scripts/import_tree_dump.js <dump>                # import captured tree data
```

These tools count operations and expose JavaScript exceptions under the supplied
model. They cannot establish which calls the live engine makes or the cost of a
rendered frame. An id absent from XML/JavaScript can still be created by C++.

`import_tree_dump.js` can use captures from `tools/qol_dump_tree.js`. The Dev
button currently captures aggregate counts, not a complete panel hierarchy.
Captures improve the inputs but do not reproduce native methods, dynamic
lifecycle, bindings or rendering. Do not turn a modelled green result into a
claim about the client.

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
