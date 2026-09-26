# Configuration parsing

`panorama/scripts/ql_config.js` provides default merging, setting normalization, compatibility migrations, and storage parsing to both HUD and Escape Menu contexts. It uses the shared schema utilities and envelope helpers from `ql_shared_presets.js`.

## Asynchronous persistence boundary

`ParseStoredConfig(raw)`, exported as `QOL.parseStoredConfig`, is a side-effect-free parser for bridge save/restore operations. It accepts a configuration object in the schema envelope or legacy flat JSON form. Arrays, scalar roots, malformed envelopes, nested/null values for recognized settings, and nonempty objects with no recognized keys are rejected.

The parser copies recognized primitive settings into a fresh object, then runs the existing `MergeConfig` normalization chain. Unknown keys are omitted from the resulting configuration. This is structural validation plus existing normalization, not a new universal range/type validator for every setting. The namespaced ConfigStore has its own validation contract.

Bridge operations serialize the accepted result into a canonical envelope before publishing or saving it. Later HUD reads therefore see normalized data rather than the original untrusted raw object. Validation rejection must not clear panel attributes, replace MOD_CONFIG, or reset State.lastConfig.

## Legacy parsing and compatibility

`SafeParseConfig(raw)` remains the legacy HUD parsing entry point. Its error recovery can clear the context panel's corrupt configuration and report a defaults fallback. Asynchronous bridge operations must use `ParseStoredConfig` instead, because an unsuccessful restore must preserve the live session.

`MergeConfig` starts with defaults, overlays recognized values, and applies the established compatibility normalizers, including split minimap zoom, ammo scales, cooldown modes, healthbar type, and warning settings. Successful JSON parsing alone does not establish valid storage data; envelope shape and the recognized setting values are checked before bridge publication.
