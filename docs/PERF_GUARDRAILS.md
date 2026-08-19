# QOLLOCK Performance Guardrails

Performance is a first-class constraint for this Panorama Source 2 mod.

## Principles
- Feature OFF should mean zero or near-zero runtime work.
- Prefer cached references and bounded refresh intervals.
- Avoid full-tree scans in frequent loops unless strictly necessary.
- Debug logging in hot paths must default OFF.

## Loop / Polling Guidance
- Use low-frequency polling for non-critical UI state.
- Increase frequency only while feature is active and visible.
- Degrade back to idle polling when hidden/disabled.
- Avoid duplicated watchers for same state.

## Panel Access Patterns
- Cache panel handles and validate before reuse.
- Re-query only on invalidation windows.
- Avoid repeated `FindChildTraverse` per-frame for stable panels.

## Class / Style Sync
- Avoid syncing large class sets every tick if signature unchanged.
- Gate expensive style writes with signature comparison.
- Batch style updates where possible.

## Item Cooldown / Mirror Rules
- Maintain deterministic matching and stable assignment.
- Keep exception logic explicit and minimal.
- Avoid repeated ambiguity churn; use sticky panel assignment.

## Debug Rules
- Temporary debug constants can be enabled during diagnosis.
- Must be disabled before normal release/testing.
- Avoid high-volume logs in core render/update loops.

## Release Performance Checks
- Run a 3-5 minute active play test.
- Confirm no persistent error spam.
- Confirm no runaway update intervals or repeated heavy scans.

## Measuring instead of assuming

Every rule above is now checkable offline. See `docs/PROFILING.md`.

- `node scripts/profile_hud.js` — runs the real mod against a realistic HUD tree
  and reports per-feature engine work: tree nodes walked, redundant style writes,
  attribute bytes, panel churn. `--compare` diffs two runs, which is how you show
  an optimisation actually worked.
- `node scripts/audit_panel_ids.js` — finds `FindChildTraverse` ids that nothing
  can ever create. Each one is a guaranteed full-tree walk that can only return
  null. Directly enforces the "avoid full-tree scans in frequent loops" rule.
- `node --test tests/perf_guards.test.js` — ceilings that fail the build when one
  of these guarantees regresses, including a check that no feature throws on a
  per-tick path.

Two findings worth internalising, because they are the reason several of these
rules exist and were nonetheless being broken:

- **A `FindChildTraverse` miss is not cheap.** It walks the entire subtree before
  returning null. "The panel usually isn't there so the lookup is free" is exactly
  backwards — it is most expensive when it fails, and the tree is largest during a
  teamfight.
- **Panorama does not compare before acting on a style write.** Assigning the value
  a panel already holds still dirties layout. "Only write when changed" is not a
  micro-optimisation here; it is the difference between zero engine work and a
  re-layout.

And one about debug code: arguments are evaluated before the call, so a disabled
logger still pays for everything you pass it. `if (DEBUG_FLAG) { ... }` around the
whole block, not just a guard inside the logger.
