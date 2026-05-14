# Adding A New Setting

This doc is the checklist for adding a new QOLLOCK setting safely.

The short version:

1. Add the config key to the shared defaults.
2. Add the setting to the UI and metadata in `ql_settings.js`.
3. Add runtime usage in `ql_core.js` if the setting changes live behavior.
4. Decide whether the compact settings schema must change.
5. Validate with the schema guard and normal pipeline.

## 1. Add The Default Config Key

The source of truth for config defaults is:

- `panorama/scripts/ql_shared_presets.js`

Add the new key to `QOL_DEFAULT_CONFIG` with a stable default value.

Notes:
- Use the final real config key name here.
- Pick a default that is safe for all users, because this value is used when a setting is missing from older imports.
- If the setting belongs in presets, this is also the base value used for preset diffs.

## 2. Add Settings UI Metadata

Most settings also need metadata in:

- `panorama/scripts/ql_settings.js`

Depending on the setting, update the relevant places:

- description text map
- creator/owner map if used
- performance cost map if used
- dropdown option arrays or toggle/button labels
- row creation in the right tab section

Common UI work:
- add a `CreateRow(...)` call in the correct tab
- use the right control type: `toggle`, `slider`, `dropdown`, `actionbutton`, `multitoggle`, etc.
- if it is a grouped or conditional control, place it inside the same animated section helpers used by neighboring settings

If the setting is user-facing, also think about:
- tooltip text
- readable label wording
- whether it should appear inside search naturally

## 3. Add Runtime Behavior

If the setting changes actual HUD/UI/game behavior, add the runtime handling in:

- `panorama/scripts/ql_core.js`

Typical runtime work:
- read the new config key from `cfg` / `MOD_CONFIG`
- apply panel classes, offsets, opacity, scale, visibility, or logic based on the value
- normalize or clamp values if the setting can be loaded from older strings

If the setting is settings-menu-only and has no runtime effect outside the menu, `ql_core.js` may not need changes.

## 4. Decide Whether Schema Must Change

This is the important part.

QOLLOCK has compact export/import schemas in both:

- `panorama/scripts/ql_settings.js`
- `panorama/scripts/ql_core.js`

If the new setting should be saved inside:
- exported settings strings
- imported settings strings
- build payload save/load

then you must add it to the schema.

### When To Bump Schema Version

Bump the schema version when the shape or meaning of saved data changes.

Examples:
- adding a brand new saved field
- expanding the allowed range of a saved enum
- changing how an old saved field should be interpreted

Do not silently change the meaning of an existing released schema version.

If a released version already exists in the wild, and you need to add or reinterpret fields:
- leave the old version mapped to the old schema shape
- create a new schema version for the new behavior

That is the exact reason `2.3.4` exists after `2.3.3`:
- old `2.3.3` strings stay compatible with the older schema shape
- the newer saved fields moved into `2.3.4`

### Where To Add New Schema Fields

In `ql_settings.js`:
- add the field to the newest compact schema block
- add the new version entry to `COMPACT_SCHEMA_REGISTRY` if needed

In `ql_core.js`:
- mirror the same field/version work in the build payload schema
- add the new version entry to `BUILD_CATEGORY_COMPACT_SCHEMA_REGISTRY`

Both files must stay aligned.

### Current Rule Of Thumb

If the setting should round-trip through a settings code, it is not done until:
- `ql_settings.js` compact schema includes it
- `ql_core.js` build payload schema includes it
- schema validation passes

## 5. Update Validation Coverage

When schema versions change, update:

- `scripts/validate_compact_schema.js`

Make sure the new semver is included in the targeted regression list if needed.

The schema guard should validate:
- settings export/import schema
- build payload schema
- round-trip compatibility against config states

## 6. Check Preset Impact

If the new setting matters for presets:
- add explicit values to affected presets in `ql_shared_presets.js`
- or leave it at default if that is the intended preset behavior

If the setting is part of imported/exported preset verification, make sure preset round-trips still match.

## 7. Translations

If the setting label or description is user-facing and should be localized, update the language maps in:

- `panorama/scripts/ql_settings.js`

If you do not add translations immediately:
- English will still work
- non-English languages may fall back to the raw key/label text

That is acceptable for temporary development work, but not ideal for polished user-facing features.

## 8. Validation Checklist

For a normal setting change, run at least:

```powershell
node --check panorama/scripts/ql_settings.js
node --check panorama/scripts/ql_core.js
node scripts/validate_compact_schema.js
```

Then run the normal pipeline:

```powershell
scripts/qollock_pipeline.ps1
```

## 9. Practical Smoke Tests

After adding a setting, verify:

1. The setting appears in the correct tab.
2. The control updates `MOD_CONFIG` correctly.
3. The runtime behavior actually changes in-game if applicable.
4. Exported strings preserve the setting if it is schema-backed.
5. Imported strings restore the setting correctly.
6. Save/load build payload behavior still works if the setting is payload-backed.
7. Presets still apply correctly if the setting intersects with preset logic.

## 10. Common Mistakes

- Adding a setting to the UI but forgetting `QOL_DEFAULT_CONFIG`
- Adding a saved field to `ql_settings.js` schema but not `ql_core.js`
- Changing an existing released schema version instead of bumping semver
- Forgetting to update validation coverage
- Forgetting to add or preserve migration/normalization for older imports
- Assuming a setting is saved just because it exists in config

## Quick Decision Guide

If you are unsure whether a version bump is needed, ask:

- Can an old exported string with this semver now decode differently than before?
- Does this add a new saved field to export/import or build payloads?
- Did the allowed range or meaning of a saved field change?

If the answer is yes, make a new schema version.
