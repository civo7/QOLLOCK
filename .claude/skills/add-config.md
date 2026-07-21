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
   **If this key is internal-only** (no user-facing toggle — e.g., schema version, build state,
   feature sub-options), skip steps 4-5 and go directly to step 6 (presets, if applicable).

4. **Add settings UI row** — in `ql_settings.js` `RenderCurrentTabContent`, add a `CreateRow` call.
   Full signature: `CreateRow(parent, label, configId, type, min, max, step, options, description)`.
   For a simple toggle:
   ```js
   CreateRow(list, "New Feature", "ENABLE_NEW_FEATURE", "toggle");
   ```
   For a slider (0-100, step 5):
   ```js
   CreateRow(list, "New Feature", "ENABLE_NEW_FEATURE", "slider", 0, 100, 5);
   ```
   For a dropdown:
   ```js
   CreateRow(list, "New Feature", "ENABLE_NEW_FEATURE", "dropdown", null, null, null, ["Off", "Mode1", "Mode2"]);
   ```

   **Locale entries** — if the label or options need translation, add to `ql_settings_loc/ql_settings_loc_en.js`.
   English is an identity map (key === value):
   ```js
   "New Feature": "New Feature",
   "Off": "Off",
   "Mode1": "Mode1",
   ```
   Also add to non-English locale files (`ql_settings_loc/ql_settings_loc_*.js` — all 14
   non-English files: `_bg`, `_by`, `_es`, `_fr`, `_it`, `_ja`, `_ko`, `_pl`, `_pt`, `_pt_br`,
   `_ru`, `_tr`, `_uk`, `_zh`) with translated values. If you can't translate them all,
   at minimum copy the English entry to every file to prevent missing-key errors.

   **Exception:** `_it.js` has a sparse key set (~50 keys vs ~830 in other files).
   Match its existing pattern — only add keys that have actual Italian translations.
   Copying English to `_it.js` for every new key would break its deliberately minimal structure.

   **Batch sync tip** — to copy a key to all full-size locale files at once (skip `_it` and `_en`):
   ```bash
   KEY='"New Feature": "New Feature",'
   for f in ql_settings_loc/ql_settings_loc_{bg,by,es,fr,ja,ko,pl,pt,pt_br,ru,tr,uk,zh}.js; do
     sed -i "/^    \"Action Button/a    $KEY" "$f"
   done
   ```
   Adjust the anchor line (`"Action Button"`) to insert after the correct alphabetical neighbor.

   **Other row types** available: `palette` (color palette), `Color` (single color picker),
   `multitoggle` (grouped toggles), `buttongroup` / `runtime_buttongroup` (button groups),
   `actionbutton` (action button). See existing `CreateRow` calls in `ql_settings.js` for examples.

5. **Add normalization** (if needed) — in `ql_config.js`, add a normalizer function following the established pattern.

   **Most common pattern** (two-arg, void-mutating — used by ~9 normalizers):
   ```js
   function NormalizeNewFeatureConfig(configTarget, sourceConfig) {
       var utils = GetSharedSchemaUtils();
       if (utils && typeof utils.NormalizeNewFeatureConfig === "function") {
           utils.NormalizeNewFeatureConfig(configTarget, sourceConfig);
       }
   }
   ```
   Register in `MergeConfig` after the last existing `Normalize*` call:
   ```js
   NormalizeNewFeatureConfig(targetConfig, sourceConfig);
   ```

   **Other patterns** in `ql_config.js` (lines 84-141):
   - **Single-arg:** `NormalizeVoiceTypeConfig(configTarget)` — takes only the target config
   - **Value-returning:** `NormalizeVoiceTypeValue(rawValue)` — returns a normalized value instead of mutating
   - **Inline fallback:** Some normalizers have fallback code inside the `if (!utils)` branch

   Check `ql_config.js` lines 55-150 for the full set of patterns before writing your normalizer.

6. **Add to presets** (optional) — in `ql_shared_presets.js` `QOL_PRESETS`, add the key to presets that should enable it.

7. **Run validate-qollock** — smoke test + bridge checker + import validator.

8. **Test in-game** — verify the toggle appears in settings, toggles correctly, and the feature responds.

## Common Mistakes

- **Forgetting to add to QOL_DEFAULT_CONFIG** — the key will be `undefined` in the config, causing `IsCfgEnabled` to return false.
- **configKeys typo** — the key name must match exactly between default config, feature registration, and settings UI.
- **Missing locale entry** — if the row label isn't in the English locale map, it won't appear translated.
