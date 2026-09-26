# Feature configuration store

Source: `panorama/scripts/core/ql_config_store.js`; export `QOL.core.ConfigStore`.
Requires namespace and EventBus. This is in-memory feature configuration, not
settings UI state or disk persistence. See [configuration](config_parsing.md)
and [adapter](config_adapter.md).

| API | Current behavior |
| --- | --- |
| `registerSchema(featureId, schema)` | Validates `schema.settings`, creates defaults and returns success. Re-registering an existing feature returns false; it does not backfill a replacement schema. |
| `get(featureId, key)` | Reads the stored value, or undefined. |
| `set(featureId, key, value)` | Validates a registered key, normalizes numeric toggles and slider decimals, writes and emits `config:changed`. Returns false on rejection. Even an equal successful value emits. |
| `all(featureId)` | Shallow copy of one bucket. |
| `view(featureId)` | Actual live bucket, read-only by convention; not frozen or proxied. Never mutate it. |
| `exportAll()` | New outer object with shallow copies of registered buckets; not recursive cloning. |
| `hasSchema(featureId)` | Whether a schema was registered. |
| `load(data)` | Merges recognized valid keys for registered buckets, preserves other values, emits for changed values. It is not silent. |
| `syncFromExternal(data)` | Compares incoming values, calls `set` for differences and returns accepted update count. |

Accepted schema types are `toggle`, `slider`, `dropdown`, `text`, `palette`,
`action`, `number`, `buttongroup`, and `multitoggle`. Slider schemas require min/max;
`set` rounds decimals but does not impose the compact codec's step. `load` does
not perform that same slider-decimal rounding. UI/wire consistency must be checked
separately. Dropdown options, when provided, are compared by string value.
Multitoggle options create individual boolean keys in addition to the group key.

`config:changed` carries `{featureId, key, value}`. FeatureRegistry augments that
payload with `changes` for `onSettingsChanged`. Consumers must not bypass this
path by mutating `view()`. Registration defaults do not automatically extend the
flat `QOL_DEFAULT_CONFIG` used by settings/storage.
