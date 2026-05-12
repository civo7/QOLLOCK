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
