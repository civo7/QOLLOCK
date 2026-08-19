# Frame-cost profiling

Users report FPS drops and bad 1% lows in large teamfights. This is the tooling
for finding out which part of the mod is responsible, and for proving a fix
worked.

## Why not just read the code

Because the answers are counter-intuitive. Of the things that looked most
suspicious going in, several turned out to be correctly guarded already, and the
biggest single cost was a feature searching for panels that only exist while the
shop is open. Static reading also cannot rank: two functions that each "walk the
tree sometimes" can differ by a factor of forty.

## The tools

### `node scripts/audit_panel_ids.js`

Cross-references every literal `FindChildTraverse("...")` id in the mod against
vanilla layouts, the mod's own layouts, and `$.CreatePanel` calls. Reports the
ids nothing can ever create.

This matters because a `FindChildTraverse` miss is not a cheap null — it is a
depth-first walk of the entire subtree that returns null only after visiting
every descendant. An id that exists nowhere is a guaranteed full-tree walk, and
in a poll loop that is a full-tree walk several times a second for the whole
match.

It found 58 unreachable ids across 86 call sites. Not all are hot, but the hot
ones are pure waste.

Independent of the simulator, so its answers do not depend on tree fidelity.
Needs the extracted game files; set `QOLLOCK_VANILLA` if they are not at the
default path. It says so loudly rather than reporting false positives if they are
missing.

```
node scripts/audit_panel_ids.js            # unreachable ids
node scripts/audit_panel_ids.js --all      # also list the reachable ones
node scripts/audit_panel_ids.js --json
```

### `node scripts/profile_hud.js`

Runs the real mod against an instrumented HUD tree and reports which feature
asked the engine to do how much work per second.

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

Style and class writes are split into **changed** and **identical**. Panorama does
not compare before acting on a style assignment: writing the value a panel already
holds still marks it dirty and queues a re-layout. So a rewritten-identical value
costs about the same as a real change, and the "identical" column is pure waste.

Attribute reads and writes are tracked with **bytes**, which is how the 9.2 KB
config being re-marshalled twice per tick became visible at all.

## What it does not measure

It has no engine timings and cannot produce milliseconds. Do not quote it as such.

- Counts are **exact** for the simulated tree.
- The **tree** is assembled from real layout XML (the mod's patched copies plus the
  vanilla files it does not override, 12 top-bar players, ~3100 panels) but it is
  calibrated, not captured from a live match. In-engine, C++ decides composition
  and creates much of the content dynamically.
- The single `cost` column combines ops using **estimated weights**, documented in
  `scripts/simulator/perf/counters.js`. Raw counters are always reported alongside.
  Any conclusion that flips when you nudge a weight is one to draw from the raw
  counters instead.

So: "feature A does 40x the tree walks of feature B" is a fact. "This change cut
total cost 46%" is a fact about the same tree. "This saves 3ms a frame" is not
something this tool can tell you — verify wins in-game with the perf overlay.

### Known coverage gap

`HEALTHBAR_TYPE` is a numeric enum, not an `ENABLE_*` toggle, so the default
"everything on" config leaves it at 0 and **none of the five healthbar variants
run**. Use `--healthbar 5` for the Minecraft variant, which is the heaviest. Even
then the simulated tree lacks the heart panels, so healthbar work is only
partially covered — changes there need an in-game check. A run saved at one
healthbar setting is not a valid baseline for a run at another.

## `tests/perf_guards.test.js`

Locks in the fixes whose entire value is "this expensive thing stopped happening".
No behavioral test can see them: the output is identical either way, only the
amount of work differs.

Assertions are ceilings, not exact counts. An exact count would fail on any
unrelated change to the tree fixture and get deleted in irritation; a generous
ceiling still catches a reverted fix, because these regressions are
order-of-magnitude.

Two of the tests are not about cost at all and are the most valuable ones:

- **no scheduled callback throws** — a feature that throws every tick is invisible
  in game, because the mod's error boundary catches it, but the work leading up to
  the throw repeats forever. This is how the `betterUnsecuredHud` ReferenceError
  was found.
- **a config change is still picked up** — the revision gate on the config read is
  only safe if a real edit gets through. Without this test, the "does not re-read
  the config" ceiling could be satisfied by a cache that never invalidates.

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

The **WASTED TREE WALKS** section lists misses by panel id. Cross-reference against
`audit_panel_ids.js`: if an id appears in both, the lookup can never succeed and
the whole walk is dead work.

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
