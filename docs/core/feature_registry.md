# Feature registry and lifecycle

Source: `panorama/scripts/core/ql_feature_registry.js`; the same API is exported
as `QOL.core.FeatureRegistry` and `QOL.core.registry`. Requires namespace,
EventBus and ConfigStore; uses Logger/Scheduler when available. This is lifecycle
coordination, not a security sandbox or shared settings-context registry.

## Manifest contract

`register(manifest)` requires a valid ID and synchronous `create(ctx)` factory.
It registers manifest settings plus the synthetic `enabled` toggle in ConfigStore.
Persisted defaults and slider metadata come from the shared configuration catalog,
so overlapping owners receive the same units, bounds and initial values. Invalid
schemas fail registration without leaving a manifest behind. See the
[implementation pattern](../MANIFEST_STYLE.md) for native owner structure.
The instance owns `onEnable()`, `onDisable()` and optional
`onSettingsChanged(payload)`/read-only `test()` behavior.

Enablement is evaluated by `isFeatureSupposedToBeEnabled(id, configSlice?)`:
custom `isEnabled(cfg)` first, then a present `enableKey`, then OR across
`enableKeys`, then applicable always-on/default or synthetic `enabled` handling.
A custom predicate is the right existing mechanism for numeric modes. Do not
copy old migration advice that all manifests must remain disabled by default.
New defaults still require the maintainer's decision.

`createContext(id)` provides `ctx.id`, `ctx.config.get/getBool/set/all/view`, and
`ctx.events.on/off/emit`. `all()` allocates a shallow copy; `view()` is live and
read-only by convention. `emit("event", data)` prefixes the feature ID, but
`on` and `off` take the complete event name without adding a prefix. Subscriptions
are scoped to the instance generation; `off(event)` removes only that context's
listeners. Disable or failed enable retires them before feature cleanup, including
callbacks already present in an EventBus dispatch snapshot.
Retired contexts cannot emit events, install listeners or write settings through
`ctx.config.set`; read access remains available for cleanup.

`onSettingsChanged` receives one payload, including `{featureId, key, value,
changes: {[key]: value}}`, not `(key, value, allSettings)` or `(keys, config)`.
Batch payloads can contain several changed keys; `key`/`value` identify only the
first. Read the current slice through `ctx.config` where needed. Flat loads commit
all owner buckets before any settings hook runs.

## Public lifecycle and inspection

- `boot(config)` creates enabled instances and installs registry event listeners.
- `enable(id)` / `disable(id)` activate/deactivate individual registered features.
- `shutdown()` disables instances in object-key iteration order, cancels their
  managed loops and registry listeners, and cancels manifest audit collection.
  It does not promise reverse dependency order.
- `isEnabled`, `isRegistered`, `getRegisteredIds`, `getEnabledIds`, `getManifest`,
  `getInstance`, and `getErrorCounts` expose current registry state.
- `isPresentationAvailable(id)` reports transient presentation policy. A failed
  or explicitly disabled owner is unavailable before cleanup starts; re-enable
  restores availability before its hook, including enable-in-progress projection.
  Unknown/pre-boot owners are neutral. This does not prove native content exists
  and never changes stored configuration or synthetic `enabled` settings.

The internal `feature:presentation_changed` event publishes completed enable,
disable and failed-enable transitions. Core reprojects its complete-config CSS
with transient release policy, so a custom-only layout cannot remain active
after its content owner retires. Passive cooldown observes mirror availability
through the same event while retaining its own mode-class ownership. Shutdown
projects retirement once, then clears session policy for standalone/pre-boot
consumers; reboot uses the same accepted settings.

Disable retires context events, invokes feature cleanup, then cancels Scheduler
work registered to that ID. Features must still undo owned UI/styles/classes,
cancel raw/native callbacks and invalidate owned caches. Events installed outside
`ctx.events` remain the feature's cleanup responsibility.

## Error semantics

Scheduler errors contribute to consecutive error streaks; ten consecutive poll
errors auto-disable the feature. A subsequent successful tick after errors resets
the streak. Lifecycle/settings exceptions are logged/countable but do not all
follow the same immediate circuit-breaker path. `getErrorCounts()` returns
current streaks, not lifetime totals. Swallowing unexpected tick errors prevents
Scheduler from observing them; guard expected invalid panels instead of wrapping
every feature in a silent catch.

Read-only `test()` observations are collected by `core/ql_manifest_tests.js`.
They are not run by the HUD load smoke, and do not prove full visual correctness.
See [testing](../TESTING.md).

Failed `onEnable` calls, both during `boot` and explicit `enable`, invoke the
partially created instance's `onDisable` and cancel managed schedules for that ID.
Cleanup failures do not replace the original error. Context subscriptions are
also released when a factory throws before returning an instance. Factories must
be side-effect free; other non-Scheduler side effects cannot be recovered without
a returned instance's cleanup hook.
