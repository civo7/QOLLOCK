# QOLLOCK Known Gotchas

## Panorama CSS Compatibility
- Some CSS patterns that look valid in web CSS can break Panorama/Source 2 behavior.
- Keep styling conservative and verify in-game after CSS changes.

## Runtime Image Source Availability
- Some runtime item icons may not expose `src/defaultsrc` consistently.
- Do not rely solely on icon path for critical matching unless verified.

## Classless Item Exceptions
- Certain items need structural matching due to missing/unstable class signals.
- Structural matches can collide; use explicit exclusions and deterministic fallback.

## Twin Structural Items
- Spirit Shielding and Weapon Shielding can appear structurally identical.
- Requires grouped resolver with sticky per-panel assignment to remain stable.

## Debug Logging Side Effects
- Verbose logs in hot paths can create noise and apparent lag.
- Keep debug flags OFF outside focused diagnosis.

## Preset Binding Edge Cases
- Bound accounts may appear “locked” if runtime preset marker logic is too aggressive.
- Validate bound accounts can still manually change settings.

## Pipeline Expectations
- Project expectation is one game launch after final pack.
- Multiple launches indicate pipeline flow regression.
