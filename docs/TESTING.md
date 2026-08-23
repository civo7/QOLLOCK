# Testing QOLLOCK

Nothing here models the game. That is the point.

The behavioural suite that used to live in `tests/` was removed on 2026-08-23 —
see "Why there is no behavioural suite" at the bottom. What remains either checks
the code without claiming anything about the client, or runs inside the real
client.

## Layer 1 — static / load checks

```
node panorama/scripts/tools/qollock_smoke_test.js   # every file loads, in order
bash panorama/scripts/tools/check_bridges.sh        # QOL.import symbols are exported
bash panorama/scripts/tools/validate_imports.sh     # imported symbols exist
bash panorama/scripts/tools/check_manifests.sh      # manifest shape + hud.xml wiring
node scripts/validate_compact_schema.js             # config codec round-trips
```

These prove the code *loads* and that the codec is sound. The schema validator is
the strongest thing in this file: 57 schema versions and ~450 fuzz cases, and it
touches no panels at all, so it cannot be wrong about the client.

They cannot catch a logic bug. The 2026-08 settings-loader failure passed all of
them.

## Layer 2 — manifest `test()` hooks (run in the client)

Each FeatureRegistry manifest may declare a `test()` hook. It executes **in the
game**, against the **real** panel tree, so it is the only automated check that
can honestly answer "does this panel exist".

```
Settings -> Dev panel -> "Manifest Tests"
QOL.core.ManifestTests.runAll()      # from the Panorama console
QOL_DumpDiagnostics()                # includes the last run's results
```

Rules for a `test()` hook, learned the hard way:

- **Read-only.** No `State` writes, no `config.set()`, no `DispatchEvent`.
- **Return `null` to skip** when not applicable (e.g. not in a match).
- **Do not fail on panels that only exist in some contexts.** Report them as an
  observation instead. `ql_build_payload`'s hook used to fail whenever
  `CitadelHudHeroBuilds*` globals were absent — stricter than the code it tested,
  which already falls back to `DispatchEvent`. It cried wolf on a working build.

The smoke test reports hook coverage (`41 manifests: 41 with test()`), which is a
structural check only — it does not run them.

## Layer 3 — frame-cost profiling

A different question: not "did it behave correctly" but "how much work did it ask
the engine to do, and which feature asked".

```
node scripts/profile_hud.js --seconds 20               # per-feature cost report
node scripts/profile_hud.js --seconds 20 --save before # then make a change
node scripts/profile_hud.js --seconds 20 --compare before
node scripts/audit_panel_ids.js                        # lookups that can never hit
node scripts/import_tree_dump.js <dump>                # feed it a REAL tree
```

This catches a class of bug the other layers cannot: code that produces exactly
the right output while doing a hundred times more work than it needs to. It also
surfaces features that throw on a per-tick path, which are invisible in game
because the mod's error boundary swallows them.

**Why this layer survived the cull.** It counts operations — `FindChildTraverse`
calls, style writes — rather than asserting what the client does. And
`import_tree_dump.js` replaces the modelled tree with a capture from
`tools/qol_dump_tree.js`, which is the actual 31.4k-panel tree rather than a 3.1k
guess. Feed it a real tree before quoting any number.

Read `docs/PROFILING.md` first: it cannot produce milliseconds, and the healthbar
variants are only partially covered.

### The pieces it is built on

`scripts/simulator/` remains for the profiler's sake only:

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

Note: the debugger is **read-only**. You can search and inspect the tree; you
cannot type into its JS console.

When vanilla Deadlock updates, re-check panel ids against
`G:\GameTracking-Deadlock` — layout under
`game/citadel/pak01_dir/panorama/layout/`, styles under `.../styles/`.

## Why there is no behavioural suite

`tests/` ran the real mod against a **modelled** panel tree. The model cannot know
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
