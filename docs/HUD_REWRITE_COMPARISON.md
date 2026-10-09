# HUD rewrite operation comparison — 2026-10-10

This is an offline search-operation comparison, not native timings or FPS.
Baseline: local `main`, commit `6cda7147f996f6124f0e129a2aa84f892057eb22`.
Measured rewritten HUD script fingerprint:
`f4404174d8ebdfb515bb7a53e0d5e9e475fbe3c31065198fedcfc6be39dec064`.
Each runtime loads its own active HUD XML includes (80 baseline, 98 rewritten).
The comparison tool does not switch checkouts, stash changes, fetch or compile.

Both runs use `captures/deadlock_hud_debugger_hero_testing_musbu75a.json`,
15,435 panels, and the baseline's identical complete input configuration.
The tree replay fingerprint is
`95dd92c041af43a3d8e6a84f1785d70e5922f4301678bee324b3eba3d2275804`.
Each sample is 20 virtual seconds. Loading, callback and registry checks passed;
input fingerprints match within each pair.

| Scenario | Warm-up | Main nodes/s | Rewritten nodes/s | Change | Main lookups/s | Rewritten lookups/s |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Baseline defaults + FG | 8 s | 364,896 | 36,795 | −89.92% | 163 | 361.4 |
| Expanded toggles + FG | 8 s | 476,160 | 296,493 | −37.73% | 398.55 | 2,956.5 |
| Baseline defaults, steady window | 30 s | 1,096 | 2,202 | +100.95% | 23 | 68 |

In the defaults + FG scenario, FG itself falls from 363,800 to 22,129 visited
nodes/s. Its native hero evidence stays live at the existing update cadence;
source discovery uses verified owner paths and bounded fallback retries. Default
presentation geometry no longer discovers native panels when it owns no override.

The first expanded comparison exposed a rewrite regression: crate-tree ownership
performed separate sibling searches for every marker on every tick. Total visits
were 5,681,071 nodes/s. Batched child reconciliation and parent-grouped sweep
removed that quadratic search pattern while retaining replacement/move cleanup.
The expanded count above is after this correction. With default settings and
no FG, the rewrite still adds checks and does not show a search-operation win.

The ordinary 8-second defaults warm-up also includes pending chat account
discovery: this capture cannot supply all native account bindings. Its total is
15,191 nodes/s after rewriting. The separate 30-second window is explicitly
reported so startup discovery is not silently called steady-state work.

Added enabled owners are `ql_damage_report`, `ql_chat_geometry` and
`ql_presentation_scale`; expanded coverage also adds `ql_urn_tracker` and
`ql_combat_indicator`. None are removed in these scenarios. Owner changes can
represent split responsibilities and do not prove equivalent gameplay behavior.
Expanded prefixes do not exercise every enum, toggle or event. Higher lookup
counts coexist with smaller search scopes; neither alone establishes frame time.
Custom `Children()`/`GetChild()` walks are not included in native-search visit
counts. Batched ownership still performs linear child inspection each pass.

The capture is a static debugger description with unverified freshness, missing
text/flags and `fullHudCapture=false`. CSS, computed geometry, native bindings,
gameplay and rendering are not replayed. Client compilation/repacking and
comparable frame-time captures remain necessary.

Reproduce against the current working tree:

```powershell
node scripts/compare_hud_refs.js --before main --after working-tree --tree captures/deadlock_hud_debugger_hero_testing_musbu75a.json --healthbar 2 --output comparison-fg.json
node scripts/compare_hud_refs.js --before main --after working-tree --tree captures/deadlock_hud_debugger_hero_testing_musbu75a.json --expanded --healthbar 2 --output comparison-expanded.json
node scripts/compare_hud_refs.js --before main --after working-tree --tree captures/deadlock_hud_debugger_hero_testing_musbu75a.json --warmup-ms 30000 --output comparison-defaults.json
```

`--after HEAD` measures committed sources instead. Reports retain both raw
snapshots, source hashes, coverage, errors and input metadata. See
[profiling](PROFILING.md) for the existing profile, trace and lifecycle tools.
