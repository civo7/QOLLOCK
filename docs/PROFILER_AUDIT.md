# Offline profiler audit — 2026-10-03

This audit reviewed the HUD lookup tracer and the performance claims made from
`captures/deadlock_hud_dump.json`. It measures simulator accounting, not FPS.
No compilation, repack or client performance measurement was performed.

## Reproduced measurement defects

- Lookup observer callbacks ran while operation counters were disabled. The
  tracer registered observers before boot and warm-up, then divided those
  events by only the requested sample duration. A 0.2-second crosshair run
  reported ten misses per target instead of two: **487,700 vs 97,540 modeled
  visits/second**, a fivefold overstatement.
- Timestamps used the beginning of a fixed 50ms slice rather than callback
  execution time. Nonmultiple sample durations could advance past the requested
  end while still using the shorter denominator.
- Single-feature mode only filtered output. Its synthetic configuration override
  did not disable other features or enable the named feature.
- Direct `FindChild` calls were omitted from trace events; their operation
  counters counted all children even after an early hit, and omitted misses.
- `--json` with a feature printed a chronological trace before JSON.
- Window-root import omitted one root from the panel count and could reorder
  siblings relative to Hud, changing which duplicated ID won a search. Supplied
  text/attributes/basic boolean state were discarded.
- Reports assigned automatic leak/optimal labels and suggested deleting or
  replacing IDs based on absence in a single supplied tree.

These defects are corrected. Portable regressions test accounting independently
of the large local capture and deliberately inject a callback failure. Both
reports expose enabled coverage, Clock errors and current registry error streaks;
the latter do not constitute a cumulative error log. Compare the same inputs.

## Capture fidelity

The hierarchy contains 16,511 nodes. Its Hud carries `connectedToHeroTesting`,
`infiniteMoney` and related testing classes. Calling this a representative live
match without qualification is unsupported.

None of its 2,615 Label records contains text. The historical HUD-Dumper v2
collector's `buildPanelTree` does not serialize `panel.text`. Its `extractClasses`
tries enumeration and falls back to probing 355 known names. That whitelist
omits `currentHealthLabel`, `totalHealthLabel`, `miniModifierCore`, `statNumber`
and `statPostfix`. Those missing classes affect feature branches in simulation.
The fallback cannot establish a complete class inventory. The importer now
reports missing text and the v2 class limitation instead of silently presenting
this as full runtime state.

The extracted `hud_health_container.xml` declares the anonymous current/total
health Labels with their respective classes. The production color-warning
manifest already searches those classes under `HealthRegenAndTotal` before ID
fallbacks. A simulator executing the fallbacks does not prove the class lookup
is missing from production or failing in the native client.

## Assessment of the earlier claims

| Claim | Assessment |
| --- | --- |
| Every missing ID scans all 16,511 panels and causes microstutters | Unsupported. Search scope varies; native internal steps and frame times were not measured. |
| Crosshair stats repeatedly searches missing source containers | Reproduced in this snapshot: each absent target is retried ten times/second. Existence in other states remains open. |
| `CitadelHudAbilitiesContainer` is the current abilities ID | The supplied capture and extracted HUD XML use `AbilitiesContainer`. The production lookup is suspect, but other callers can populate the shared cache. |
| The core lookup costs 1.2 million visits/second and clean stacks never works | Unsupported. Static-class synchronization is signature-gated, not unconditional each tick. The warmed expanded run has no such lookup misses; cache interactions matter. |
| Searching the vitality column checks ten nodes | Only a direct-child search has that small scope. The captured column contains 1,980 nodes including itself, with ten direct children. Recursive search still visits descendants. |
| `FindChild` is guaranteed O(1) | Not established. The simulator scans direct children and stops on the first match. Native implementation details are unmeasured. |
| Missing dynamic stats should be deleted | Unsupported. Absence in one snapshot cannot establish permanent absence. |
| Negative caching reduces work to zero | Incorrect for periodic retry. It reduces search frequency and introduces a bounded discovery delay. |
| A full-tree miss is a memory leak | Incorrect. Repeated lookup work is different from retained panels/tasks/listeners. |
| The removed synthetic guard was useless | Too strong. Its local untracked fixture dependency was broken; portable accounting and negative-control tests remain useful without claiming FPS. |

## Next optimization work

1. Improve capture fidelity first: include readable text, report failed reads,
   make class coverage explicit and probe the exact classes used by features.
   Capture focused subtrees to limit collector overhead; preserve the old file.
   Keep match, hero-testing and hideout snapshots separately labeled.
2. Establish a client baseline with the actual configuration. Use the existing
   Current Config benchmark for synchronous managed callbacks and HUD-state
   recording for transitions/task accumulation. Compare repeated frame-time
   captures in an equivalent scene independently of those diagnostic observers.
3. Optimize crosshair source discovery first: cache verified column owners and
   use direct-child lookup where evidence confirms placement. Keep existing
   value-update cadence; narrow search before adding delay to optional-stat
   discovery. Verify missing -> appearing -> removed -> replaced containers and
   owner replacement, rather than deleting absent targets.
4. Investigate better unsecured HUD and recent purchases next. They have large
   lookup counts in this snapshot, but missing data/bindings and custom JS walks
   prevent treating the ranking as a native CPU/FPS ranking.
5. Use small before/after changes and lifecycle regressions. Verify native UI
   behavior and frame times only after the maintainer's compile/repack.

The corrected 10-second expanded run has 43 enabled manifests, zero Clock
callback errors and zero final registry streaks. Its crosshair source misses
account for 97,540 modeled visits/second. That establishes a specific search
candidate under this input, not a promised FPS gain or whole-mod cost.

## Native Debugger integration follow-up

The rebuilt native Debugger export is now imported locally as a separate
hero-testing capture, preserving the historical v2 file. The selected HUD has
15,435 panels and 1,331 displayed classes. Its collection interval is 547,968ms;
97 Label/TextEntry descriptions lack text and the target visible/enabled state
is absent. Freshness and full live coverage remain unverified.

Review found another replay defect: `BuildsModel` created a synthetic shop before
capture import, and the importer appended the hierarchy without clearing those
modeled panels. Captured replay now omits that model and replaces prior panel
children. Portable regressions check that native text/classes survive and that
neither model panels nor inspector visibility/description attributes contaminate
the runtime hierarchy. Class-search traces now retain the first result identity.

The dependency audit derives active HUD includes and compares ID/class reads
against the selected hierarchy. Current XML declarations and supported source
creation sites are separate evidence. A declared/snippet panel missing in this
JSON is conditional/state evidence, not an invalid lookup; source absence also
cannot rule out C++ creation. For example, `recentPurchase` is a shop XML snippet
and `HeroNameHidden` is declared in QOLLOCK's top-bar override. Their absence in
the standalone capture must not be used to delete these searches. Optional active
stats need appearance/replacement scenarios rather than an existence assertion.

The fresh 10-second expanded replay still enables 43 manifests without callback
errors or final registry streaks. Repeated scoped crosshair source misses and
the root-level recent-purchases hero-label search are investigation candidates.
Their modeled visit counts establish neither native cost nor a client bug.
See [capture testing](CAPTURE_TESTING.md) for the workflow and regression scope.

## Crosshair source discovery follow-up

The first runtime optimization is limited to crosshair stats. Its source search
was already scoped to `hudActivePlayerStats`, rather than the entire HUD.
Extracted active-player-stats XML and the native Debugger capture agree on the
direct paths through `StatList`'s columns and `HudStatBlock/CoreStats`'s Weapon
and Spirit owners. The feature now caches these owners with parent checks and
uses direct-child searches for missing rows. No owner is inferred for optional
rows absent from the available evidence: they are checked across the narrow
owners and source itself. Existing value polling remains unchanged.

A compatibility traversal still searches the source periodically if direct
lookups fail. A row appearing outside the verified paths may therefore be
discovered after the fallback retry interval defined in the manifest; once found,
its values update at the normal cadence. Source/owner changes, reparented or
destroyed rows, and disable clear the associated discovery caches. A cached
compatibility result cannot mask a row later created at its verified path.

An equivalent 10-second expanded replay of the rebuilt hero-testing capture
reduced crosshair modeled lookup visits from 97,600 to 6,516 per second (93.3%).
Recursive source misses fell from 20 to 1.2 per second in that measurement
window. Direct lookup calls increased, and ownership checks also add native
parent/validity reads; these are not included in lookup-visit counts. Neither
the count reduction nor this static capture establishes a native timing or FPS
gain. Configuration, capture fingerprint, warm-up and sample duration match;
both runs have no callback errors or final registry error streaks.

Portable regressions cover late sources/rows/columns, replacement while old
panels remain alive, unfamiliar fallback placement, responsive value updates,
and disable/re-enable cleanup. After maintainer compilation/repacking, client
checks must still exercise buffs/debuffs, conditional stat appearance and
native HUD transitions. Compare native callback/frame timings in an equivalent
scene before claiming an optimization benefit.
