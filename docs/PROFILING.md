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
  and creates much of the content dynamically. Use `--tree` (below) to remove this
  caveat entirely.
- The single `cost` column combines ops using **estimated weights**, documented in
  `scripts/simulator/perf/counters.js`. Raw counters are always reported alongside.
  Any conclusion that flips when you nudge a weight is one to draw from the raw
  counters instead.

So: "feature A does 40x the tree walks of feature B" is a fact. "This change cut
total cost 46%" is a fact about the same tree. "This saves 3ms a frame" is not
something this tool can tell you — verify wins in-game with the perf overlay.

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

A model built from our assumptions cannot falsify those assumptions. Which is what
`--tree` is for.

## Capturing the real tree (`--tree`)

```
1. In game:   Settings → Dev Panel → "Panel Tree Dump"   (in a real match)
2. Save the console log.
3. node scripts/import_tree_dump.js <log> --stats
4. node scripts/profile_hud.js --tree scripts/simulator/perf/runs/captured_tree.json
```

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

That is what decides lookup cost — a `FindChildTraverse` hit stops at its target
while a miss visits every node, so what matters is the tree's size and whether an id
exists at all, not the identity of each panel. And it fits in a log.

`QOL.dumpTree` still exists for a full per-panel dump of a single subtree, which is
small enough to survive. It is not wired to a button.

`--stats` prints duplicated ids, which is directly useful: duplicate ids are why
`FindChildTraverse` by id is unreliable in this codebase (it returns the first match
in traversal order, not necessarily the live panel — that cost a full debug cycle on
the build-save pipeline).

Every way a capture can be incomplete — rolled log, missing END, capped id list,
depth lines lost — is reported by the importer and carried into the profile header as
a tree note. A partial capture is a **floor**, not a baseline.

Captured and modelled runs are **not comparable** — the header and saved JSON record
which one you got, so don't diff across them.

### Known coverage gap

`HEALTHBAR_TYPE` is a numeric enum, not an `ENABLE_*` toggle, so the default
"everything on" config leaves it at 0 and **none of the five healthbar variants
run**. Use `--healthbar 5` for the Minecraft variant, which is the heaviest. Even
then the simulated tree lacks the heart panels, so healthbar work is only
partially covered — changes there need an in-game check. A run saved at one
healthbar setting is not a valid baseline for a run at another.

## Regression ceilings (removed)

`tests/perf_guards.test.js` locked in the fixes whose entire value is "this
expensive thing stopped happening" — the output is identical either way, only the
amount of work differs. It went with the rest of `tests/` on 2026-08-23
(`docs/TESTING.md` explains why).

One of its two genuinely load-bearing checks survives without it: the profiler
itself prints `scheduled-callback errors` (`scripts/simulator/perf/profile.js:317`).
A feature that throws every tick is invisible in game — the mod's error boundary
catches it — while the work leading up to the throw repeats forever. That is how
the `betterUnsecuredHud` ReferenceError was found, and a profiler run still shows
it.

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
