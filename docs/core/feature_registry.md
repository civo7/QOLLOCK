# `panorama/scripts/core/ql_feature_registry.js`

## Purpose
Manages the registration, lifecycle, and runtime sandboxing of all 50 feature manifests. Handles feature activation (`onEnable`), deactivation (`onDisable`), reactive setting propagation (`onSettingsChanged`), and fault tolerance via error streak circuit-breaking.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core`)
- `panorama/scripts/core/ql_event_bus.js` (`QOL.core.EventBus`)
- `panorama/scripts/core/ql_config_store.js` (`QOL.core.ConfigStore`)

## Interface (`QOL.core.FeatureRegistry` / `QOL.core.registry`)
- `register(manifest)`: Registers a feature definition. Auto-registers its `settings` with `ConfigStore`. Features implement factory `create(ctx)` returning `{ onEnable(), onDisable(), onSettingsChanged?(keys, config), test?() }`.
- `boot(config)`: Evaluates enablement conditions for all registered features against configuration and calls `onEnable()` inside safe try/catch boundaries.
- `shutdown()`: Disables all running features in reverse order and clears instances.
- `createContext(featureId)`: Generates a scoped sandbox context passed to `manifest.create(ctx)`:
  - `ctx.id`: Feature ID string.
  - `ctx.events`: Scoped event emitter (`on`, `off`, `emit`). Emitted events are prefixed (`${featureId}:${event}`).
  - `ctx.config`: Scoped accessor for `ConfigStore` (`get`, `all`).
- `enable(featureId)`: Instantiates and activates a feature safely.
- `disable(featureId)`: Calls `onDisable()` and cleans up feature state.
- `isEnabled(featureId)`: Boolean check if feature is actively running.
- `isRegistered(featureId)`: Boolean check if feature manifest is registered.
- `isFeatureSupposedToBeEnabled(featureId)`: Evaluates if feature should run based on its configured enable keys and environment constraints.
- `getRegisteredIds()`: Array of all registered feature ID strings.
- `getEnabledIds()`: Array of currently running feature ID strings.
- `getErrorCounts()`: Map of consecutive and total error counts per feature.
- `getManifest(featureId)`: Retrieves raw manifest definition.
- `getInstance(featureId)`: Retrieves runtime instance created by `manifest.create(ctx)`.

## Error Handling & Circuit Breaking
- Automatically isolates features that encounter 10 consecutive unhandled errors (`ERROR_STREAK_MAX`), preventing cascading UI crashes in Panorama.
- Resets consecutive error streak counters upon receiving `scheduler:tick_ok` events.
