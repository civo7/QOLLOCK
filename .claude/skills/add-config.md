---
name: add-config-qollock
description: Add a new config key end-to-end — default config, preset entries, settings UI toggle, feature gate, normalization
---

# Add New Config Key

End-to-end workflow for adding a new configurable option to QOLLOCK.

## Steps

1. **Add default value** — in `ql_shared_presets.js`, add the key to `QOL_DEFAULT_CONFIG`:
   ```js
   ENABLE_NEW_FEATURE: 0,  // 0=off, 1=on
   ```
   If the key has a range, add to the schema section: `{ key: "ENABLE_NEW_FEATURE", min: 0, max: 1, step: 1 }`

2. **Add to feature registration** — in the feature file's `configKeys` array:
   ```js
   configKeys: ["ENABLE_NEW_FEATURE", ...],
   ```

3. **Add gate logic** — update the feature's `gate` function to check the new key:
   ```js
   gate: function(cfg) {
       return IsCfgEnabled(cfg, "ENABLE_NEW_FEATURE") || ...;
   }
   ```

4. **Add settings UI row** — in `ql_settings.js` `RenderCurrentTabContent`, add a `CreateRow` call:
   ```js
   CreateRow(list, "New Feature", "ENABLE_NEW_FEATURE", "toggle");
   ```
   If it needs a description, add to locale dictionaries in `ql_settings_loc/`.

5. **Add normalization** (if needed) — in `ql_config.js`, add a `NormalizeNewFeatureConfig` function. Register it in `MergeConfig`.

6. **Add to presets** (optional) — in `ql_shared_presets.js` `QOL_PRESETS`, add the key to presets that should enable it.

7. **Run validate-qollock** — smoke test + bridge checker + import validator.

8. **Test in-game** — verify the toggle appears in settings, toggles correctly, and the feature responds.

## Common Mistakes

- **Forgetting to add to QOL_DEFAULT_CONFIG** — the key will be `undefined` in the config, causing `IsCfgEnabled` to return false.
- **configKeys typo** — the key name must match exactly between default config, feature registration, and settings UI.
- **Missing locale entry** — if the row label isn't in the English locale map, it won't appear translated.
