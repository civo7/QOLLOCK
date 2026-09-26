# Presets and account bindings

## Source ownership

- `panorama/scripts/ql_shared_presets.js`: `QOL_PRESETS`, flat defaults,
  `QOL_ACCOUNT_PRESET_BINDINGS` and versioned compact schemas.
- `panorama/scripts/ui/presets.js`: visible preset entries, name resolution,
  application, comparison and active-button tracking.
- `panorama/scripts/ql_config.js` and the settings normalization chain:
  migrations/dependency normalization used when values change.

`QOL_ACCOUNT_PRESET_BINDINGS` is currently empty. Historical Ranger/Gyzeh
binding investigations do not establish a current account-to-preset mapping.
Do not invent automatic account selection from a preset's name or author.

## Current application behavior

`applyPresetConfig` resets flat default keys, overlays the preset's own keys,
then runs normalizers. It preserves `DRAG_ENABLED`, `PREVIEWS_ENABLED` and an
existing `ENABLE_UPDATE_CHECKER` preference. This is not a generic rule that
all UI preferences survive preset changes: `LANGUAGE` can change.

Preset values are overlaid as supplied; this function is not an unknown-key
validation boundary. User-provided serialized configurations must use the
canonical parsing/import path rather than being treated as trusted preset data.

`applyPresetByName` resolves the existing Bread/BreadRollius naming compatibility,
updates the runtime preset name, calls `SaveAndSync` and refreshes language UI.
`ACTIVE_PRESET_NAME` has special Bread matching behavior; it is not a general
persistent record of whichever preset button was last clicked.

## Maintenance

1. Change values in `QOL_PRESETS`, not a second Markdown table of preset data.
2. If changing visible membership/name, update the entries in `ui/presets.js`.
   Display names and stored names are not always identical.
3. If a new key is needed, follow [ADDING_SETTINGS.md](ADDING_SETTINGS.md):
   maintainer-approved defaults, actual UI renderer, localization, consumers,
   normalization and compatible codec representation.
4. Check application over an already-customized config, preserved preferences,
   dependent settings, active-button matching and export/import round-trips.
5. Add an account binding only with explicit requirements and a real runtime
   consumer. Check that a late autoload cannot overwrite newer manual edits.

The preset roster changes in source; this document intentionally does not keep
a stale second roster or historical account IDs. For durable restore behavior,
see [storage bridge](core/storage_bridge.md); preset selection alone does not
prove disk-save success.
