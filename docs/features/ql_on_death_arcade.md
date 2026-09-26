# ql_on_death_arcade

HUD death detection and launch bridge; games execute in the settings context.

Source: [manifest.js](../../panorama/scripts/manifests/ql_on_death_arcade/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

The HUD manifest starts a 0.2-second loop and coordinates launch/close
signals through panel attributes. `ql_arcade_games.js` and the settings-side UI
own game execution. Disable clears owned bridge state as well as stopping the
loop. The six game-selection keys below are the current contract; do not copy
an older three-game list or try to share a JS object across the two contexts.

## Declared settings

- `ENABLE_ON_DEATH_GAMES` (toggle)
- `ON_DEATH_GAME_MINESWEEPER` (toggle)
- `ON_DEATH_GAME_BLACKJACK` (toggle)
- `ON_DEATH_GAME_FLAPPY_BAT` (toggle)
- `ON_DEATH_GAME_GRAVES_TRAINER` (toggle)
- `ON_DEATH_GAME_ZERGGY_MANIA` (toggle)
- `ON_DEATH_GAME_WHACK_A_REM` (toggle)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
