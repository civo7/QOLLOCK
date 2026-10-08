# Flat configuration adapter

Source: `panorama/scripts/core/ql_config_adapter.js`; export `QOL.core.ConfigAdapter`.
Requires ConfigStore. Shared defaults come from `ql_shared_presets.js`, not a
`legacy/ql_config_defaults.js` file.

- `loadFromFlat(flatConfig, enableKeyMap)` builds feature ownership from the
  transitional registry plus current manifests: setting keys, enable keys and
  multitoggle option keys. A shared key can reach several feature buckets.
- Coercion combines registered toggle keys with compatibility name rules;
  numeric 0/1 toggles become booleans. Do not infer every key's type solely from
  its prefix. Declared toggles take priority, then numeric suffixes, then legacy
  toggle-prefix rules. Numeric opacity/size values of zero or one must remain
  numeric even under `MINIMAL_` or `HUD_`. Palette conversions retain tagged RGB.
- Values without owners enter the adapter's `_legacy` staging bucket. ConfigStore
  only accepts registered buckets; do not assume unowned settings reach a feature.
- The optional enable-key map injects an `enabled` value for mapped keys. The
  registry still owns full enablement policy, including custom `isEnabled`.
- `exportToFlat()` starts with `QOL_DEFAULT_CONFIG`, overlays mapped bucket values
  and converts booleans back to numeric 0/1, excluding retired `DEFAULT_HERO`.
  It is not an arbitrary unknown-key preservation/export mechanism. ConfigStore
  maintains one accepted value across all shared-key subscribers.

`loadFromFlat` processes a copy of its supplied object, zeroing `ENABLE_MIN_SOULS`
and `ENABLE_UNSPENT_SOULS` and removing `DEFAULT_HERO`. It also forces the two retired
feature buckets off. Those are deliberate compatibility restrictions, not
features to restore during a refactor.

ConfigStore `load` commits all buckets together and emits one batch per changed
owner, so hooks can safely read other feature settings; the app also reconciles desired
feature enable state after synchronization. Declare every setting a feature
reads in its manifest and keep flat defaults, UI metadata and compact schema
consistent. See [adding settings](../ADDING_SETTINGS.md).
