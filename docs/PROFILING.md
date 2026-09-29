# Frame-cost profiling

Users report FPS drops and bad 1% lows in large teamfights. This is the tooling
for finding out which part of the mod is responsible, and for proving a fix
worked.

For stutters that appear after a match/purchase and persist in hideout, start
with the [transition investigation plan](STUTTER_INVESTIGATION.md). It separates
reproduced source defects from client hypotheses and defines before/after runs.

## Why not just read the code

Because the answers are counter-intuitive. Of the things that looked most
suspicious going in, several turned out to be correctly guarded already, and the
biggest single cost was a feature searching for panels that only exist while the
shop is open. Static reading also cannot rank: two functions that each "walk the
tree sometimes" can differ by a factor of forty.

## The tools

### `node scripts/audit_runtime_lifecycle.js`

Runs repeated event/transition scenarios against production scripts, counting
raw `$.Schedule` chains as well as modeled traversal/style/class/text operations.
Unlike the managed client benchmark, it loads the separate quickbuy context.

```
node scripts/audit_runtime_lifecycle.js --cycles 3
node scripts/audit_runtime_lifecycle.js --cycles 10 --json
node scripts/audit_runtime_lifecycle.js --quickbuy-ref 607b1ef^ --cycles 3
```

The last command is a negative control: it reads only the historical quickbuy
script through `git show`, without changing the checkout. Other scripts/layouts
remain from the working tree. It is not a historical full-build comparison.
The command is expected to fail: the old script accumulates 21/41/61 pending
callbacks after three batches of 20 queue-change events; the fixed script keeps
one. Failure includes callback errors rather than interpreting crashed work as
an optimization. `--cycles` accepts 1 through 10. JSON includes scheduling
origins and top lookup misses. Origins are stack-derived initial allocation
sites (or inherited chain origins), not a native allocation profiler.

Quickbuy scenarios use a reduced fixture with two queue entries, one populated
preview, active/disabled modes, repeated verified queue events, a retained valid
context in hideout, and finally a destroyed context. Preview `SetImage` calls
and requested path changes are counted separately; no asset pipeline is modeled.
The HUD scenario uses the existing profiler tree and default configuration,
repeated match/hideout class changes and the actual scoreboard event bridge.
It does not exercise all settings, perform actual purchases, prove native
panel retention, or simulate native match teardown. HUD growth is reported for
investigation; quickbuy's known single-poll invariant and collected errors fail
the command. A green run says nothing about unexercised branches or frame times.

`installScheduleProbe(sandbox)` in `scripts/simulator/perf/schedules.js` can be
installed before loading any other sandbox context for focused regressions.
Its window reset preserves pending tasks. The profiler's optional `beforeLoad`
hook permits instrumentation before boot; no wrappers are shipped to the game.
Scheduling outside that sandbox's `$.Schedule` API is not counted by the probe.
`tests/runtime_lifecycle_audit.test.js` includes a fault injection that recreates
the quickbuy leak, so a broken observer cannot pass by always reporting zero.

For actual client evidence use [HUD recording](ui/hud_state_recording.md), then
compare frame-time captures separately. Stable task counts can coexist with
expensive work in each callback; inspect operation changes as well as counts.

### `node scripts/audit_panel_ids.js`

Cross-references literal `FindChildTraverse("...")` ids against vanilla layouts,
the mod's layouts and `$.CreatePanel` calls. Missing ids are investigation
candidates, not proof that a panel cannot exist: C++ can create panels and ids
can be generated dynamically.

A repeated lookup miss can be expensive. Check the live debugger and the search
scope before removing a lookup on the strength of this static inventory.

The inventory needs extracted game files; set `QOLLOCK_VANILLA` if they are not
at the default path. It reports missing inputs rather than treating them as an
empty inventory.

```
node scripts/audit_panel_ids.js            # ids absent from scanned sources
node scripts/audit_panel_ids.js --all      # also list the reachable ones
node scripts/audit_panel_ids.js --json
```

### `node scripts/profile_hud.js`

Runs mod JavaScript against an instrumented model and counts the operations it
requests there. It does not measure engine or rendering cost.

```
node scripts/profile_hud.js                      # profile and print
node scripts/profile_hud.js --save baseline      # save a run
node scripts/profile_hud.js --compare baseline   # diff against it
node scripts/profile_hud.js --seconds 30         # longer sample
node scripts/profile_hud.js --players 12         # teamfight size
node scripts/profile_hud.js --healthbar 5        # 5 = minecraft; see below
node scripts/profile_hud.js --json
```

The workflow that produced every number in this branch:

```
git stash push -- panorama/      # park your changes, keep the harness
node scripts/profile_hud.js --seconds 20 --save baseline
git stash pop
node scripts/profile_hud.js --seconds 20 --compare baseline
```

## What it measures

Every engine-facing call the mod makes is intercepted and charged to the feature
on the stack at the time — old-system features via their registry `update`, new
manifests via `Scheduler.createPollLoop`, and the mod's own scheduled loops by
callback name. Anything else lands in `<unattributed>`.

The headline metric is **tree nodes visited**, not lookups. A call count hides
the thing that actually hurts, because a miss costs the whole subtree while a hit
can stop early.

Style and class writes are split into **changed** and **identical** in the model.
Repeated identical assignments are optimization candidates; these counters do
not establish whether a particular native setter dirties layout or its cost.

Attribute reads and writes are tracked with **bytes**, which is how the 9.2 KB
config being re-marshalled twice per tick became visible at all.

## What it does not measure

It has no engine timings and cannot produce milliseconds. Do not quote it as such.

- Counts are **exact** for the simulated tree.
- The **tree** is assembled from real layout XML (the mod's patched copies plus the
  vanilla files it does not override, 12 top-bar players, ~3100 panels) but it is
  calibrated, not captured from a live match. C++ decides composition and creates
  much of the content dynamically. `--tree` accepts only a complete per-panel
  hierarchy; it does not reproduce the engine or remove lifecycle and rendering
  caveats.
- The single `cost` column combines ops using **estimated weights**, documented in
  `scripts/simulator/perf/counters.js`. Raw counters are always reported alongside.
  Any conclusion that flips when you nudge a weight is one to draw from the raw
  counters instead.

So: "feature A does 40x the tree walks of feature B" describes this run under
this model and configuration. Neither that ratio nor a weighted cost reduction
establishes an FPS improvement. Verify performance changes in the client.

## How wrong the modelled tree can be

This is not hypothetical, so it is worth stating plainly before you trust a ranking.

On 2026-08-21 the modelled profile put `ql_showrank` third of 28 features at 13.5% of
all mod cost, and `ql_nicknames` at 1%. The in-game perf overlay, on the same build,
measured `ql_showrank` at **1-3ms total over a minute** and `ql_nicknames` at
**152-169ms, 2.4ms average, 9ms peak** — the most expensive feature in the mod by a
wide margin, and a peak worth over half a frame at 60fps.

The ranking was inverted because the cost lived somewhere the model could not see: a
class write re-applied to a real top-bar player subtree (hero badge, ability icons,
item bars, purchased mods) costs far more than the same write in a model with a
fraction of the panels.

A model built from our assumptions cannot falsify those assumptions. Captures
help constrain its inputs; they do not make it an independent game oracle.

## Capturing the real tree

```
1. In game:   Settings → Dev Panel → "Panel Tree Dump"   (in a real match)
2. Save the console log.
3. node scripts/import_tree_dump.js <log> --stats
```

The Dev Panel button produces an **aggregate summary**. It records the real
panel count and depth distribution, but not parent-child links. The repository's
`captured_tree.json` is such a summary; `profile_hud.js --tree` rejects it rather
than silently profiling a one-panel HUD. Whole-HUD profiling with `--tree`
requires a complete per-panel Hud hierarchy; the current rolling game log has
not retained one. Small `QOL.dumpTree` subtree captures remain useful for
targeted hierarchy inspection, not a whole-HUD performance baseline.

**Ground truth, 2026-08-21: a live match HUD is 37,524 panels.** The modelled tree is
3,099 — so it understates the real thing by 12×, and a full-tree miss costs 12× more
than any modelled number suggested.

That measurement also killed the first version of this tool. A per-panel dump of
37,524 panels is ~3MB of `$.Msg`, and the game's console log is a rolling buffer: the
capture arrived with 2,152 of 37,524 lines and the START line had already scrolled
out. The importer refused it rather than reconstruct a wrong tree — which is the
behaviour you want, but it means **the button captures an aggregate**, not every
panel:

- total panels, max depth, and how many panels carry no id
- panels per depth
- panel count per type
- panel count per id (capped, most frequent first)

These counts constrain the size and contents of a model. They do not preserve
ancestry, traversal order or native bindings, so a tree cannot be reconstructed
from them for lookup profiling.

`QOL.dumpTree` still exists for a full per-panel dump of a single subtree, which is
small enough to survive. It is not wired to a button.

`--stats` prints duplicated ids, which is directly useful: duplicate ids are why
`FindChildTraverse` by id is unreliable in this codebase (it returns the first match
in traversal order, not necessarily the live panel — that cost a full debug cycle on
the build-save pipeline).

The importer reports rolled logs, missing END lines, capped id lists and lost
depth lines. Warnings on a full hierarchy are carried into the profile header;
a partial capture is a **floor**, not a baseline.

Captured and modelled runs are **not comparable** — the header and saved JSON record
which one you got, so don't diff across them.

### Known coverage gap

`HEALTHBAR_TYPE` is a numeric enum, not an `ENABLE_*` toggle, so the default
"everything on" config leaves it at 0 and **none of the five healthbar variants
run**. Use `--healthbar 5` for the Minecraft variant, which is the heaviest. Even
then the simulated tree lacks the heart panels, so healthbar work is only
partially covered — changes there need an in-game check. A run saved at one
healthbar setting is not a valid baseline for a run at another.

## Regression guards

The historical `tests/perf_guards.test.js` ceiling suite was removed. The
current `tests/large_tree_profile.test.js` adds anonymous panels to the modelled
HUD until it matches the saved aggregate's panel count. It runs production HUD
callbacks over ten 100 ms virtual windows and checks peak node visits, callback
count and full-tree misses. A negative control deliberately adds a callback
burst and repeated root misses, proving that the guard detects those changes.
The added panels have synthetic ancestry. The thresholds are operation budgets
for this fixed simulator scenario, not FPS or client milliseconds; the test
does not cover every feature configuration. The simulator scans a whole subtree
even after an id hit to detect duplicate ids, so its hit-visit counts are not
measured native `FindChildTraverse` work.

The profiler reports scheduled-callback errors. Inspect them alongside operation
counts: an exception or registry auto-disable can reduce later measured work
without improving the feature. Scheduler error thresholds and cancellation are
described in [scheduler.md](core/scheduler.md); repeated work is not guaranteed
to continue forever after an error.

The modifier/buff entry layout (`hud_modifiers_entry_center.xml`) is loaded from
the vanilla resource directory. QOLLOCK does not ship an override identical to
the game layout. Keep composition entries pointing to vanilla when removing
redundant layout copies, so the modeled subtree is still included.

What is no longer automated is the ceiling itself. Use `--save` / `--compare`
before and after a perf change instead:

```
node scripts/profile_hud.js --seconds 20 --save before
# ...make the change...
node scripts/profile_hud.js --seconds 20 --compare before
```

Compare against a run at the **same** `--players` and healthbar setting; a
baseline from another configuration is not a baseline.

The other lost check was "a config change is still picked up", which guarded
against satisfying a *no re-read* ceiling with a cache that never invalidates. If
you touch the config revision gate, verify that by hand — change a setting in game
and confirm it applies.

## Reading the report

```
feature                    cost/s  share   nodes/s  miss/s  style±  style=
feat:statBonuses            30.3k  18.4%     30.3k     4.1       0       0
```

- `nodes/s` — tree nodes visited. The number to attack first.
- `miss/s` — lookups that found nothing. Each burned a whole subtree.
- `style±` changed writes, `style=` identical rewrites (waste).
- `new` — panels created. The most expensive op per unit; should be ~0 in steady
  state.

The **WASTED TREE WALKS** section lists misses by panel id in the supplied model.
Cross-reference with `audit_panel_ids.js` to prioritize debugger inspection;
absence from both inputs still does not exclude native C++ panel creation.

## Results on this branch

Against the pre-fix baseline, 12-player teamfight, identical tree:

| metric | before | after |
|---|---|---|
| composite cost | 436k units/s | 164k units/s (-62%) |
| tree nodes walked | 209k/s | 114k/s (-45%) |
| redundant style writes | 298/s | 98/s (-67%) |
| config bytes marshalled | 64.6k/s | 23.1k/s (-64%) |

None of it is verified in a running game. Panorama cannot be rendered from a Node
harness and every change needs a VPK repack before it is visible in game.

## Leaf manual hit counter

`QOL_UTILS.SetProfilerEnabled`, `ProfileHit`, and `DumpProfile` expose a separate,
opt-in counter. Dumps report the actual time since enabling/previous dump (at
least 10 seconds), then reset counts. This is not a rolling 60-second window or
an automatic runtime sampler. It measures instrumented call frequency only.
