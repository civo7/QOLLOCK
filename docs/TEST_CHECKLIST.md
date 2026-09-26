# QOLLOCK release-candidate checklist

Record the exact source commit and repacked build, scenario, expected result,
observed result, and remaining issue. A green offline suite is not a client pass.

## Offline and build preparation

- Run `npm test` and retain the result. Use the commands in [TESTING.md](TESTING.md)
  for targeted failures; no separate pipeline script is required.
- Export a known-good configuration and keep an untouched recovery copy.
- The maintainer alone compiles and repacks the release candidate. Agents must
  not run build scripts or resourcecompiler, modify game addons, or write VPKs.
- Test that exact repacked build; source edits alone do not reach the game.

## Highest priority: save and restore

- Change several distinctive nondefault values, including Buff Delay = 15 and
  Minimap Reminder interval = 60. Save, fully exit the game, restart, and verify
  both the displayed values and their runtime effects.
- Repeat after opening settings promptly during startup and editing before
  storage finishes loading. A late automatic reply must preserve newer edits.
- Exercise delayed/unavailable storage and retry. Confirm failure is visible,
  no false success is reported, and current values are not silently reset.
- Explicitly Load a known-good saved configuration after making another edit;
  the requested saved configuration should apply. Missing storage must preserve
  the current settings.
- Use one genuine legacy exported configuration through the supported import
  path. Confirm representative values, then save/restart again. If the old
  release stored settings in builds, record the actual recovery steps; do not
  assume automatic migration from that mechanism.
- Check malformed/truncated and wrong-shape imports while retaining the recovery
  copy. Rejection must preserve current settings. For malformed stored replies,
  use the focused offline regression unless a separate disposable client profile
  is available; do not corrupt the only saved configuration for testing.

## Audio boundaries

- With repeating bridge reminders enabled, Buff Delay = 15 should dispatch near
  04:45 and 09:45; zero should dispatch near 05:00 and 10:00. Allow the polling
  interval, and distinguish dispatch timing from spoken content in the recording.
- Verify Minimap Reminder interval = 60 does not play every 15 seconds.
- Disable DL4D reminders for this timing check: they have an independent fixed
  timetable. Re-enable afterward if part of the intended configuration.
- If the UI shows 15 but timing remains 30 seconds early, preserve the exported
  config and exact observed times. The zero-value fix does not explain that
  discrepancy by itself.

## HUD lifecycle and feature interactions

- Enter a normal match, die/respawn, return to menu, and enter another match.
  Confirm critical HUD panels remain usable and no repeated Panorama errors occur.
- Open/close shop and settings; disable/re-enable affected features.
- Check Basic and Advanced item cooldown modes: changing text, completion flash,
  filters, and no stale countdown after death/respawn or rapid retrigger.
- Check top bar/rejuv/buff/urn displays, crosshair and reload controls, and minimap
  base/Alt/Tab states under a representative nondefault preset.
- Check representative supported screen sizes and languages. Native panel
  replacement/visibility must be observed in the client, not inferred from XML.

## Performance and evidence

- Let a representative match run for several minutes; check for debug spam and
  persistent UI hitches. Use repeatable frame-time comparisons if claiming an
  improvement. Callback timings alone do not measure frame rendering.
- Record failed, skipped, and not-run cases separately. Publish only the claims
  supported by the offline assertions and these observed client scenarios.
