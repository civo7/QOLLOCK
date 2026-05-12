# QOLLOCK Presets And Account Bindings

Purpose: maintain a clear source of truth for preset intent and account bindings.

## Usage Notes
- Preset values should stay in one source of truth and autoload should reference those values.
- Account IDs here are Deadlock account IDs used by project binding logic.
- Update this file whenever adding/removing presets or changing account binds.

## Presets (Track Here)
- Base/Player presets:
  - Clean
  - Vegas
  - Ranger
  - NKD
  - Wouwei
  - Hoot
  - Obikym
  - (Add new player presets here)
- Community presets:
  - SunnyD
  - Hikyo
  - Tuna
  - Chjcago
  - Wirdly
  - Gambler
  - Jared
  - Kr1stux
  - Satanael
  - Bubsito
  - (Add new community presets here)

## Known Binding Operations (Recent)
- Ranger used for multiple account binds in prior iterations.
- Gyzeh-related binds were involved in settings-lock investigations.

## Current Binding Source
- Runtime/config binding map should be verified in script source before release.
- If there is a mismatch between this file and source, source wins until reconciled.

## Recommended Maintenance Pattern
1. Change preset value(s).
2. Update binding map in source.
3. Run checklist for bound-account manual setting changes.
4. Update this file with final account-to-preset mapping.
