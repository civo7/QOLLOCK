# Feature registry and lifecycle

Source: `panorama/scripts/core/ql_feature_registry.js`; the same API is exported
as `QOL.core.FeatureRegistry` and `QOL.core.registry`. Requires namespace,
EventBus and ConfigStore; uses Logger/Scheduler when available. This is lifecycle
coordination, not a security sandbox or shared settings-context registry.

## Manifest contract

`register(manifest)` requires a valid ID and synchronous `create(ctx)` factory.
It registers manifest settings plus the synthetic `enabled` toggle in ConfigStore.
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
`on` and `off` take the complete event name without adding a prefix.

`onSettingsChanged` receives one payload, including `{featureId, key, value,
changes: {[key]: value}}`, not `(key, value, allSettings)` or `(keys, config)`.
Read the current slice through `ctx.config` where needed.

## Public lifecycle and inspection

- `boot(config)` creates enabled instances and installs registry event listeners.
- `enable(id)` / `disable(id)` activate/deactivate individual registered features.
- `shutdown()` disables instances in object-key iteration order, cancels their
  managed loops and registry listeners, and cancels manifest audit collection.
  It does not promise reverse dependency order.
- `isEnabled`, `isRegistered`, `getRegisteredIds`, `getEnabledIds`, `getManifest`,
  `getInstance`, and `getErrorCounts` expose current registry state.

Disable invokes feature cleanup and then cancels Scheduler loops registered to
that ID. Features must still undo owned UI/styles/classes, unsubscribe their own
events, cancel raw/native callbacks and invalidate owned caches. Context event
subscriptions are not automatically tracked for removal.

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
