# QOLLOCK performance guardrails

Start with [the architecture guide](../ARCHITECTURE.md) for runtime ownership and
[PROFILING.md](PROFILING.md) for measurement methods. These are implementation
constraints, not claims that every existing feature already satisfies them.

## Runtime work and lifecycle

- A disabled feature should do zero or near-zero work. Use the existing
  FeatureRegistry lifecycle and feature-owned Scheduler loops; do not add a
  second watcher for state already provided by core services.
- Prefer `onSettingsChanged` for settings reaction. Use bounded, feature-specific
  polling for native state that has no verified event source.
- Reduce work when hidden or idle, but preserve cleanup. Do not globally skip
  callbacks in hideout: callbacks can remove overlays or restore the native cursor.
- Stop owned loops and remove owned UI/classes/styles on disable. Cancel other
  callbacks/subscriptions that the Scheduler does not own.
- A valid context can outlive its native source panels. Handle source replacement,
  shop closure, respawn and match changes without retaining stale derived state.

## Panel lookup and caching

- Reuse the APIs in [HELPERS.md](HELPERS.md). Validate cached native handles before
  use and invalidate them when the relevant root/player/selection changes.
- Use the narrowest authoritative subtree. A matching ID elsewhere in the tree
  can belong to a different player or an obsolete panel instance.
- Cache stable references rather than repeating `FindChildTraverse` every tick.
  A miss can walk the entire subtree; it is not a cheap no-op.
- Back off unsuccessful discovery where the source is legitimately absent. Check
  recovery after it appears or is recreated; a permanent negative cache is wrong.
- `QOL.panelCache.resolve` validates liveness, not ownership by its new parent.
  Clear/rebind owned entries explicitly. Do not clear another feature's cache.
- Keep bounded/local traversal where ordering, identity or depth is part of the
  feature contract. A generic helper is not automatically a cheaper equivalent.

## Style and class updates

- Avoid repeating unchanged writes. Use the existing property-appropriate style
  helper or a caller-owned signature; account for native read-back normalization.
- Reset signatures when a panel reference changes, otherwise a new panel may
  never receive its initial styles.
- Preserve the distinction between clearing a code override and assigning a
  replacement value. Restore only the styles/classes this feature owns.
- Model counters can identify identical writes. They do not establish the native
  setter's exact layout cost; client frame-time measurements are separate evidence.

## Cooldown mirrors and shared observations

- Keep matching deterministic and assignments stable. Do not repeatedly reassign
  ambiguous sources or accidentally combine cooldown instances.
- Preserve explicit exceptions and runtime mode differences; consult
  [item mirror](features/ql_item_mirror.md) and
  [passive cooldown](features/ql_passive_cooldown.md) before changing the pipeline.
- Reuse current-player/HUD/shared-state observations when their identity and
  lifetime contract fits. Do not infer that every similar panel is authoritative.

## Logging and allocations

- Disable temporary diagnostic logging before normal use. Do not emit a message
  every polling tick or on every expected missing-panel path.
- Guard expensive log argument construction before calling a disabled logger;
  arguments are evaluated even when the logger discards them.
- Avoid needless arrays, object copies, serialization and repeated configuration
  reads in hot loops. Do not optimize away required revision/invalidation checks.

## Evidence for a performance change

```text
node scripts/profile_hud.js --seconds 20 --save before
node scripts/profile_hud.js --seconds 20 --compare before
node scripts/audit_panel_ids.js
```

Compare the same tree, player count, feature configuration and warm-up. Retain raw
operation counts and collected callback errors; weighted cost is an estimate, not
milliseconds or FPS. Audit-panel-ID misses are investigation candidates: C++ and
dynamic IDs can create panels absent from scanned XML/JS sources.

There is no current `tests/perf_guards.test.js` gate. Use the current commands in
[TESTING.md](TESTING.md), focused behavior regressions and comparable profiling
runs. Do not revive historical test counts or removed build-storage fuzz commands.

The maintainer compiles/repacks and checks the actual client. For a frame-time
claim, repeat comparable scenes with/without the change and keep diagnostic
reporting outside the measured window. Also check menu return and re-entry,
feature disable/re-enable, and several minutes of representative gameplay. Report
unverified rendering, panel lifecycle or FPS explicitly.
