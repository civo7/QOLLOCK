# `panorama/scripts/core/ql_hero_probe.js`

## Purpose
Provides read-only native pregame/crosshair hero evidence for the FG portrait.
It owns no configuration, confirmation history, schedules or shop/build actions.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core.heroProbe`)
- `panorama/scripts/core/ql_panel_helpers.js` (`QOL.core.panel`)
- `panorama/scripts/ql_panelcache.js` (`QOL.panelCache`, available when readers are created)

## Key Interface (`QOL.core.heroProbe`)
- `createReader()`: Creates an instance-owned reader with the two read methods below and `reset()`. FG owns one reader per variant instance and resets it on release.
- `readHeroFromCrosshair(root)`: Discovers `#crosshair` -> `.citadel_ability_dash` and reads the active player pawn's `hero_<codename>` CSS class. Returns empty when evidence is absent, conflicting, or unreadable.
- `readHeroFromPregame(root)`: Reads the `ShowingHero hero_<codename>` classes on `#Pregame #HeroAbilities` while the HUD is in pregame or hero testing. Returns empty for missing or conflicting classes.

## Engine reality and FG use

`readHeroFromCrosshair()` reads the crosshair itself and all live descendants
with `citadel_ability_dash`, accepting `hero_<alias>` and bare alias classes.
Every recognized class must agree; it returns empty for conflicts instead of
choosing the first entry in alias-map or panel order. Class-read failures also
return empty. A requested root cannot fall back to another context's crosshair;
missing/loading roots remain unresolved and later live sources are read afresh.
Native class/lookup failures also leave pregame evidence unresolved.

Readers cache native source handles through `createIdResolver`, using verified
HUD owner paths for crosshair and Pregame and bounded missing-result retries for
compatibility discovery. Current direct-child replacements bypass miss deadlines;
missing fallback sources can appear by the next retry. Parent/root changes and
periodic discovery refresh reject detached or superseded sources. Hero classes
remain uncached and are read at every active FG update. No scheduling is owned by
the reader. The root read methods remain compatibility delegates to one lazily
created context reader; feature instances use their own resettable reader.

Unconsumed signature confirmation, loose panel/command scans and shop/build
navigation are removed with their root aliases and shared `State` writes. These
were retired loader implementations, separate from historical config decoding.

FG prefers the native pregame reveal while it is active, then uses the crosshair.
The pregame panel is confirmed in the Panorama Debugger during hero testing with
`ShowingHero hero_frank`; it is ignored in normal gameplay so an old reveal
cannot override a live pawn. Missing or ambiguous evidence hides the portrait.
These helpers read UI evidence, not a verified entity identity API. Class
freshness during spawn, hero changes, death/respawn and spectating still needs
client observation.
