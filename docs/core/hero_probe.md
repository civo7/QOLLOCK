# `panorama/scripts/core/ql_hero_probe.js`

## Purpose
Provides hero identity resolution from UI panels, command strings, crosshair dash elements, and live ability signature scanning for build storage and game state tracking.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core.heroProbe`)
- `panorama/scripts/core/ql_panel_helpers.js` (`QOL.core.panel`)

## Key Interface (`QOL.core.heroProbe`)
- `readHeroFromCrosshair(root)`: Discovers `#crosshair` -> `.citadel_ability_dash` and reads the active player pawn's `hero_<codename>` CSS class. Immune to ability panel loading delays.
- `confirmSignatureAbilities(root, nowMs, requiredHits)`: Verifies that the storage hero (`hero_skyrunner`) signature abilities are present in `#hud_signature` across consecutive scheduler hits.
- `readSignatureSlots(root)`: Reads ability names from `#hud_signature` slots.
- `readHeroFromPanelDetails(panel)`: Resolves a normalized hero identifier from panel attributes, classes, and metadata text.
- `resolvePlayableHeroAlias(token)`: Normalizes loose or internal hero names into canonical `hero_<name>` strings.

## Engine Reality Note
- During initial map loading or bot spawning in the hideout, the ability HUD may lag behind pawn initialization. `readHeroFromCrosshair()` binds directly to the pawn's crosshair dash indicator for instant and resilient live hero resolution.
