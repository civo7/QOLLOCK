# `panorama/scripts/core/ql_config_adapter.js`

## Purpose
Bridges legacy flat configuration storage (over 300 flat global keys such as `ENABLE_AMMO_STATUS`, `AMMO_PANEL_SCALE`) into modern namespaced `ConfigStore` feature buckets (`ql_ammo`, `ql_crosshair_stats`, etc.), and converts values back to flat structures for serialization.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core`)
- `panorama/scripts/core/ql_config_store.js` (`QOL.core.ConfigStore`)
- `legacy/ql_config_defaults.js` (`QOL_DEFAULT_CONFIG`, fallback defaults)

## Interface (`QOL.core.ConfigAdapter`)
- `loadFromFlat(flatConfig)`: Maps a flat configuration dictionary into feature-specific buckets, coerces numeric booleans (`0`/`1` -> `false`/`true`), and loads them into `ConfigStore`.
- `exportToFlat()`: Iterates through all registered features and builds a single flat dictionary representing the complete mod configuration, suitable for saving to panel attributes.

## Invariants & Architectural Notes
- Maps legacy settings using an explicit mapping table (`OLD_TO_NEW`) supplemented by schema-derived key matching.
- Ensures zero regressions for users migrating existing configurations stored in Deadlock HUD panel attributes.
