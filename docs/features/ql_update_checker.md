# Public release update checker

Source: [ql_update_checker.js](../../panorama/scripts/ql_update_checker.js), loaded
by `hud_escape_menu.xml`. Exports `QOL.updateChecker`. This is settings-side code,
not a FeatureRegistry HUD manifest.

## Protocol and lifetime

`QOL_UPDATE_MARKER` identifies the public release independently of package or
settings-schema version. The checker loads
`https://raw.githubusercontent.com/Predi-i/qollock-updates/main/markers/<marker>.png`
through a Panorama Image panel; it does not use browser `fetch`/XHR.

`classifyMarker(width, height)` computes larger/smaller dimension ratio:

- Non-positive/non-finite dimensions or an intermediate ratio: `invalid`.
- Ratio at most 1.35: `current`.
- Ratio at least 4.0: `outdated`.

The probe is kept on-screen and nontransparent because native image loading may
be skipped for hidden panels. It polls dimensions at 0.1-second intervals up to
8 seconds, then deletes the probe. A failed load, timeout or invalid image does
not prove that the release is current.

`onSettingsOpened()` initiates at most one automatic attempt per script-context
lifetime. `onSettingsChanged()` hides the popup when disabled, or displays a
previously detected update / starts the not-yet-attempted check when enabled
with settings open. Context recreation is not the same as one full game session.

## Setting and public API

- `ENABLE_UPDATE_CHECKER` is disabled by numeric `0` or boolean `false`.
  Its flat default belongs to `ql_shared_presets.js`; preset application preserves
  an existing preference. Do not generalize that to every import/restore path.
- `QOL.updateChecker.marker`: the compiled-in marker number.
- `onSettingsOpened()`, `onSettingsChanged()`: shell/config integration.
- `classifyMarker(width, height)`: pure marker classification.
- `isEnabled()`: reads the current settings/default config.

Changing a setting label or adding a tooltip must follow
[localization](../LOCALIZATION.md). A bounded network probe still performs work;
UI performance-tier metadata is not proof of zero runtime cost.

## Release workflow and verification

Use the [public release procedure](../../README.md#publishing-a-public-release)
when the maintainer is publishing a release. Do not update the marker, publish
assets or dispatch a release workflow during an unrelated documentation change.

Classification can be checked offline, but image loading, popup layout and
behavior in a repacked client require native validation. This reference does
not claim a current network probe or in-game check was performed.
