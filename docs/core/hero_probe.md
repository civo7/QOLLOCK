# `panorama/scripts/core/ql_hero_probe.js`

## Purpose
Provides hero identity resolution from UI panels, command strings, crosshair dash elements, and live ability signature scanning for build storage and game state tracking.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core.heroProbe`)
- `panorama/scripts/core/ql_panel_helpers.js` (`QOL.core.panel`)

## Key Interface (`QOL.core.heroProbe`)
- `readHeroFromCrosshair(root)`: Discovers `#crosshair` -> `.citadel_ability_dash` and reads the active player pawn's `hero_<codename>` CSS class. Returns empty when evidence is absent, conflicting, or unreadable.
- `readHeroFromPregame(root)`: Reads the `ShowingHero hero_<codename>` classes on `#Pregame #HeroAbilities` while the HUD is in pregame or hero testing. Returns empty for missing or conflicting classes.
- `confirmSignatureAbilities(root, nowMs, requiredHits)`: Legacy signature verification helper for `#hud_signature`.
- `readSignatureSlots(root)`: Reads ability names from `#hud_signature` slots.
- `readHeroFromPanelDetails(panel)`: Resolves a normalized hero identifier from panel attributes, classes, and metadata text.
- `resolvePlayableHeroAlias(token)`: Normalizes loose or internal hero names into bare internal aliases (for example `magician`); it does not add `hero_`.

## Engine reality and FG use

`readHeroFromCrosshair()` reads the crosshair itself and all live descendants
with `citadel_ability_dash`, accepting `hero_<alias>` and bare alias classes.
Every recognized class must agree; it returns empty for conflicts instead of
choosing the first entry in alias-map or panel order. Class-read failures also
return empty. Other loose panel/shop probes retain their separate contracts.

FG prefers the native pregame reveal while it is active, then uses the crosshair.
The pregame panel is confirmed in the Panorama Debugger during hero testing with
`ShowingHero hero_frank`; it is ignored in normal gameplay so an old reveal
cannot override a live pawn. Missing or ambiguous evidence hides the portrait.
These helpers read UI evidence, not a verified entity identity API. Class
freshness during spawn, hero changes, death/respawn and spectating still needs
client observation.
