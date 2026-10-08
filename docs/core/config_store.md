# Feature configuration store

Source: `panorama/scripts/core/ql_config_store.js`; export `QOL.core.ConfigStore`.
Requires namespace, utilities and EventBus. This is in-memory feature configuration, not
settings UI state or disk persistence. See [configuration](config_parsing.md)
and [adapter](config_adapter.md).

| API | Current behavior |
| --- | --- |
| `registerSchema(featureId, schema)` | Canonicalizes and validates `schema.settings`, subscribes persisted keys and initializes the bucket from current shared values. Rejects incompatible shared declarations and repeated feature IDs without partial registration. |
| `get(featureId, key)` | Reads the stored value, or undefined. |
| `canonicalSetting(setting)` | Resolves existing persisted defaults and slider metadata from the shared catalog for FeatureRegistry registration. Does not create persistent keys. |
| `set(featureId, key, value)` | Validates a registered key, normalizes numeric toggles and slider decimals, writes and emits `config:changed` only when the normalized value changes. Returns false on rejection. |
| `all(featureId)` | Shallow copy of one bucket. |
| `view(featureId)` | Actual live bucket, read-only by convention; not frozen or proxied. Never mutate it. |
| `exportAll()` | New outer object with shallow copies of registered buckets; not recursive cloning. |
| `hasSchema(featureId)` | Whether a schema was registered. |
| `load(data)` | Validates and normalizes recognized keys, commits all subscribers before emitting one changed-settings payload per owner, and returns the changed bucket-key count. |
| `syncFromExternal(data)` | Uses the same atomic load path and returns the changed-key count. |

Accepted schema types are `toggle`, `slider`, `dropdown`, `text`, `palette`,
`action`, `number`, `buttongroup`, and `multitoggle`. Resolved slider schemas require min/max;
`set` and `load` share finite-number validation and decimal rounding, without
imposing the compact codec's step. Registered persisted sliders obtain bounds,
step and decimal precision from the shared settings catalog; their declarations
omit those repeated values and defaults. Local-only fields require explicit
defaults and validation metadata. UI/wire consistency
must still be checked separately. Dropdown options, when provided, are compared by string value.
Multitoggle options create individual boolean keys in addition to the group key.

Palette validation also accepts tagged RGB values for the explicitly supported
keys in `QOL_UTILS.SupportsCustomColor`; other owners retain palette-only values.
See [custom colors](custom_colors.md) for format and compatibility.

`config:changed` carries `{featureId, key, value, changes}`. For a batch, `key` and
`value` identify the first changed setting; `changes` includes every changed key
in that owner. Read the whole current bucket or inspect `changes`, rather than
assuming a batch contains only `key`. All owner buckets already hold the new
values when hooks run. Consumers must not bypass this path by mutating `view()`.
FeatureRegistry derives existing persisted defaults from `QOL_DEFAULT_CONFIG`;
registration never extends that flat known-key set.

Each approved persisted key has one logical value, even when several manifests
declare it. `set` and batch loads update every registered subscriber atomically;
flat export cannot select a stale observer's copy. Numeric persisted declarations
with shared field metadata receive the same slider contract, including declarations
formerly typed as `number`. Later subscribers receive the current value. Synthetic
`enabled` and feature-local keys remain scoped to their bucket. A batch containing
conflicting normalized values, or an invalid value, for a shared key leaves that
key unchanged for all owners; other valid keys can still be applied.
