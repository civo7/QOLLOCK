# Configuration parsing

`panorama/scripts/ql_config.js` provides default merging, setting normalization, compatibility migrations, and storage parsing to both HUD and Escape Menu contexts. It uses the shared schema utilities and envelope helpers from `ql_shared_presets.js`.

## Asynchronous persistence boundary

`ParseStoredConfig(raw)`, exported as `QOL.parseStoredConfig`, is a side-effect-free parser for bridge save/restore operations. It accepts a configuration object in the schema envelope or legacy flat JSON form. Arrays, scalar roots, malformed envelopes, nested/null values for recognized settings, and nonempty objects with no recognized keys are rejected.

The parser copies recognized primitive settings into a fresh object, then runs the existing `MergeConfig` normalization chain. Unknown keys are omitted from the resulting configuration. This is structural validation plus existing normalization, not a new universal range/type validator for every setting. The namespaced ConfigStore has its own validation contract.

Bridge operations serialize the accepted result into a canonical envelope before publishing or saving it. Later HUD reads therefore see normalized data rather than the original untrusted raw object. Validation rejection must not clear panel attributes, replace MOD_CONFIG, or reset State.lastConfig.

## Sharing unpublished settings

The current release and schema numbers remain unchanged until the maintainer
authorizes a version change. `QOL_SETTINGS_FIELDS` describes current control
ranges independently of historical compact layouts. Default exports use the
existing compact layout when it can represent the configured values. Otherwise,
both writers encode the JSON storage envelope inside the usual Base64Url token;
both decoders recognize the envelope before inspecting a binary wire byte.
Explicit historical encoding requests still use their original binary layout.
The import and control normalizers use current field metadata for the current
schema tag. Older clients without envelope-token support cannot import these
extended exports; historical compact exports retain their existing meaning.

## Legacy parsing and compatibility

`SafeParseConfig(raw)` remains the legacy HUD parsing entry point. Its error recovery can clear the context panel's corrupt configuration and report a defaults fallback. Asynchronous bridge operations must use `ParseStoredConfig` instead, because an unsuccessful restore must preserve the live session.

`MergeConfig` starts with defaults, overlays recognized values, and applies the established compatibility normalizers, including split minimap zoom, ammo scales, cooldown modes, healthbar type, and warning settings. Successful JSON parsing alone does not establish valid storage data; envelope shape and the recognized setting values are checked before bridge publication.
