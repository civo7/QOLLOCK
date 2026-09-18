# `panorama/scripts/core/ql_config_store.js`

## Purpose
Central reactive, schema-validated configuration store for all QOLLOCK features. Validates setting types, enforces min/max/options bounds, and dispatches change events to the event bus.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core`)
- `panorama/scripts/core/ql_event_bus.js` (`QOL.core.EventBus`)

## Interface (`QOL.core.ConfigStore`)
- `registerSchema(featureId, schema)`: Registers a feature configuration schema. `schema.settings` contains array of setting definitions. Re-registration preserves current in-memory values while backfilling newly defined keys with defaults.
- `get(featureId, key)`: Retrieves current typed value for a feature setting. Returns `schema.default` if unset, or `undefined` if key is unregistered.
- `set(featureId, key, value)`: Validates and updates a setting value. If value changes, updates store and emits `config:changed` (`{ featureId, key, value }`) on `EventBus`.
- `all(featureId)`: Returns a shallow clone of all current settings for a feature bucket.
- `view(featureId)`: Returns a read-only frozen proxy / snapshot of the feature's configuration.
- `exportAll()`: Exports all buckets as a deep copy for serialization or IPC.
- `hasSchema(featureId)`: Checks if a feature schema is registered.
- `load(data)`: Batch-loads settings into feature buckets from external JSON data, validating against registered schemas.
- `syncFromExternal(data)`: Selectively updates values that differ from external state and returns the count of updated keys.

## Supported Types
`toggle`, `slider` (requires `min`, `max`), `dropdown` (requires `options`), `text`, `palette`, `action`, `number`, `buttongroup`, `multitoggle`.

## Invariants & Architectural Notes
- Dispatches `config:changed` only when values actually differ (`oldVal !== newVal`).
- Feature manifests consume config reactively through `ctx.config` (backed by `ConfigStore`) and `onSettingsChanged` handlers.
