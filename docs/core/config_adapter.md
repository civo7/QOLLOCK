# Flat configuration adapter

Source: `panorama/scripts/core/ql_config_adapter.js`; export `QOL.core.ConfigAdapter`.
Requires ConfigStore. Shared defaults come from `ql_shared_presets.js`, not a
`legacy/ql_config_defaults.js` file.

- `loadFromFlat(flatConfig, enableKeyMap)` builds feature ownership from the
  transitional registry plus current manifests: setting keys, enable keys and
  multitoggle option keys. A shared key can reach several feature buckets.
- Coercion combines registered toggle keys with compatibility name rules;
  numeric 0/1 toggles become booleans. Do not infer every key's type solely from
  its prefix. Palette/numeric compatibility conversions also occur.
- Values without owners enter the adapter's `_legacy` staging bucket. ConfigStore
  only accepts registered buckets; do not assume unowned settings reach a feature.
- The optional enable-key map injects an `enabled` value for mapped keys. The
  registry still owns full enablement policy, including custom `isEnabled`.
- `exportToFlat()` starts with `QOL_DEFAULT_CONFIG`, overlays mapped bucket values
  and converts booleans back to numeric 0/1. It is not an arbitrary unknown-key
  preservation/export mechanism. Shared-key owners must agree on values.

`loadFromFlat` mutates its supplied object to zero `ENABLE_MIN_SOULS` and
`ENABLE_UNSPENT_SOULS` and remove `DEFAULT_HERO`. It also forces the two retired
feature buckets off. Those are deliberate compatibility restrictions, not
features to restore during a refactor.

ConfigStore `load` emits changed-key events; the app also reconciles desired
feature enable state after synchronization. Declare every setting a feature
reads in its manifest and keep flat defaults, UI metadata and compact schema
consistent. See [adding settings](../ADDING_SETTINGS.md).
