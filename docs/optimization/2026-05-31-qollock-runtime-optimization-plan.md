# QOLLOCK Runtime Optimization Plan

Date: 2026-05-31
Scope: runtime optimization plan, guardrails, and validation checklist for the first low-risk implementation pass.

## Baseline Static Metrics

Captured during the read-only swarm planning pass with static text scans. These counts identify likely review areas; they do not prove runtime cost without in-game profiling and may differ after implementation edits.

| File | Lines | Bytes | Schedules | Traverse calls | Class/style writes | Text writes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `panorama/scripts/ql_core.js` | 34,636 | 1,918,916 | 38 | 678 | 1,083 | 108 |
| `panorama/scripts/ql_settings.js` | 23,413 | 1,282,796 | 89 | 239 | 1,027 | 205 |
| `panorama/scripts/ql_shared_presets.js` | 6,543 | 230,141 | 0 | 4 | 0 | 0 |
| `panorama/scripts/showrank_web_media_bridge.js` | 5,161 | 225,442 | 18 | 4 | 47 | 0 |

Other surface counts:

- `panorama/layout`: 28 XML files.
- `panorama/styles`: 128 CSS files, including baseline/reference CSS.
- Existing guardrail: feature OFF should mean zero or near-zero runtime work.

## Runtime Map

- `ql_core.js`: main in-game runtime. Owns the core scheduler, compass loop, build request loop, Minecraft healthbar behavior, quickbuy, minimap, keyboard overlay, shop/build payload save/load, recent purchases, chat image scaling, and unit target bootstrap.
- `ql_settings.js`: settings UI runtime. Owns settings rows, preset UI, translations, export/import, schema registry, save/load controls, and menu-side DOM/class/style updates.
- `ql_shared_presets.js`: shared schema/default/preset data. Treat as compatibility-critical and low runtime risk unless schema shape changes.
- `showrank_web_media_bridge.js`: ShowRank/Statlocker media bridge. Owns rank image injection, guarded wrappers, bounded retries, account matching, and escape/player-list/profile/context-menu/top-bar flows.
- XML/CSS overlays: bind injected panels and visual state. Optimize only when a runtime write or scan depends on the layout/style structure.

## Approved Low-Risk Targets

These targets are approved for investigation and narrow patches after profiling or local evidence confirms the cost.

1. Gate feature-off work in `ql_core.js`.
   - Confirm each scheduled loop exits early when its feature is disabled.
   - Move scans behind active feature checks where the result is not needed globally.
   - Preserve existing scheduler rollback constants and timing semantics.

2. Reduce repeated stable-panel traversal.
   - Cache stable roots and child panels.
   - Re-query only after invalidation, visibility changes, bounded retry windows, or layout reload.
   - Prefer existing cache helpers and state fields over new global registries.

3. Guard repeated class, style, and text writes.
   - Add or reuse signature checks before writes that can run repeatedly.
   - Keep one write path per feature where possible.
   - Do not batch unrelated features together.

4. Tighten settings-menu work while hidden.
   - Keep settings UI updates scoped to menu-open or row-visible states.
   - Avoid adding menu-side polling that runs during active gameplay.

5. Keep ShowRank retries bounded.
   - Preserve role checks, mismatch quarantine, duplicate account handling, and guarded wrappers.
   - Prefer retry coalescing and cached roots over wider profile simulation.

## Explicit Non-Goals

- No broad rewrite of `ql_core.js`, `ql_settings.js`, scheduler architecture, schema handling, or ShowRank bridge.
- No behavior change to saved settings, schema versions, preset aliases, import/export tokens, or account-bound settings unless a task explicitly approves it.
- No deletion of suspected dead code from static evidence alone.
- No changes to baseline CSS under `panorama/styles/base/**` unless baseline parity is the explicit task.
- No debug logging in hot paths by default.
- No new high-frequency polling, duplicate timers, or unbounded retry loops.

## Dead-Code Candidate Policy

Dead-code candidates must be treated as unproven until checked against Panorama entry points and runtime hooks.

Before removal:

1. Search XML event handlers, compiled include paths, global function names, `GameEvents`, `RegisterForUnhandledEvent`, `$.Schedule`, and string-based callbacks.
2. Check settings schema/default/preset references and import/export compatibility.
3. Check W.log or in-game behavior when the code touches HUD, shop, minimap, healthbar, top bar, profile, or ShowRank surfaces.
4. Prefer disabling a redundant branch behind an existing gate before deleting shared helpers.
5. Remove only the smallest proven-unused block, and document the evidence in the change summary.

## Implementation Checklist

- Start with `git status --short --branch`; do not revert other workers' edits.
- Pick one target at a time and state the observed cost or mismatch.
- Inspect the actual runtime path before editing.
- Keep patches narrow and feature-scoped.
- Preserve Panorama guards for `$`, `GameUI`, `Game`, `Players`, `Entities`, `SteamOverlayAPI`, and panel validity.
- Preserve schema semver and wire compatibility unless the task is schema work.
- Keep feature-off paths near zero work.
- Gate repeated panel scans with cache validity, cooldowns, or active visibility.
- Gate repeated style/class/text writes with signatures or cached last values.
- Keep debug constants disabled before handoff.
- Re-check `git diff` for unrelated churn before reporting.

## Verification Plan

Run the smallest relevant automated checks for the touched surface:

```powershell
node --check panorama/scripts/ql_shared_presets.js
node --check panorama/scripts/ql_settings.js
node --check panorama/scripts/ql_core.js
node --check panorama/scripts/showrank_web_media_bridge.js
node --check scripts/validate_compact_schema.js
node scripts/validate_compact_schema.js
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_qollock.ps1
```

For documentation-only changes, `git diff -- docs/optimization/2026-05-31-qollock-runtime-optimization-plan.md` is enough unless the branch owner asks for a full build.

When code changes touch runtime behavior, record:

- What feature was enabled or disabled during the test.
- Whether the changed path runs while feature OFF.
- Any before/after static counts or measured loop intervals.
- Build output and any W.log errors or warnings.

## Manual In-Game Validation

After runtime, XML, or CSS optimization patches, validate in Deadlock:

- HUD loads without Panorama error spam.
- ESC menu opens QOL LOCK settings.
- Settings update `MOD_CONFIG` and persist/export/import when schema-backed.
- Presets and account-bound settings remain manually changeable.
- Minecraft healthbar, quickbuy, minimap, keyboard overlay, shop, top bar, and profile surfaces render without layout overlap.
- ShowRank rank media populates from ESC, player-list, profile, context-menu, and top-bar flows without mismatched accounts.
- Feature-off states stop visible effects and avoid ongoing heavy work.
- A 3-5 minute active play test shows no runaway schedules, repeated heavy scans, or persistent W.log spam.
