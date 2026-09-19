# `panorama/scripts/manifests/ql_on_death_arcade` (On-Death Arcade)

## Description
Detects player death and triggers embedded mini-games to entertain the player during respawn countdowns. When the player dies, the feature detects the active respawn countdown timer, selects a random mini-game from a user-configured pool (such as Minesweeper, Blackjack, Flappy Bat, Graves Trainer, Zerggy Mania, or Whack-a-Rem), transmits launch attributes to the arcade bridge root, and opens the Escape Menu container where the arcade game is hosted. When the player respawns, the bridge attributes are cleared and the Escape Menu is closed automatically.

## Files
- Manifest: `panorama/scripts/manifests/ql_on_death_arcade/manifest.js`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_ON_DEATH_GAMES` | `toggle` | `false` | Master toggle to enable launching mini-games upon death. |
| `ON_DEATH_GAME_MINESWEEPER` | `toggle` | `false` | Include Minesweeper in the random mini-game pool. |
| `ON_DEATH_GAME_BLACKJACK` | `toggle` | `false` | Include Blackjack in the random mini-game pool. |
| `ON_DEATH_GAME_FLAPPY_BAT` | `toggle` | `false` | Include Flappy Bat in the random mini-game pool. |
| `ON_DEATH_GAME_GRAVES_TRAINER` | `toggle` | `false` | Include Graves Aim Trainer in the random mini-game pool. |
| `ON_DEATH_GAME_ZERGGY_MANIA` | `toggle` | `false` | Include Zerggy Mania rhythm game in the random mini-game pool. |
| `ON_DEATH_GAME_WHACK_A_REM` | `toggle` | `false` | Include Whack-a-Rem in the random mini-game pool. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Initiates a cooperative polling loop at 5Hz (`0.2s` interval) via `QOL.core.Scheduler.createPollLoop(_tick, 0.2, "ql_on_death_arcade")`.
- **`onDisable()`**: Halts the poll loop, cancels any scheduled callbacks via `Scheduler.cancelAllForFeature("ql_on_death_arcade")`, clears all bridge string attributes on root and `#Hud`, removes `ShowEscapeMenu` from escape target panels, and resets internal state variables.
- **`onSettingsChanged()`**: Immediately calls `_tick()` to refresh the active game pool and bridge state.
- **`test()`**: Verifies the presence of both the native `respawn_timer` and `EscapeMenu` panels in the context tree.

### DOM Injection & Target Panels
- **DOM Creation**: Does not instantiate new DOM panels. Interacts with the host environment via Panorama panel attributes and class toggles.
- **Bridge Root Attributes**:
  - `QOL_ON_DEATH_ARCADE_ACTIVE`: `"1"` when dead with an active mini-game request, or empty string `""` when alive.
  - `QOL_ON_DEATH_ARCADE_REQUEST`: String ID of selected mini-game (e.g., `"minesweeper"`, `"flappy_bat"`).
  - `QOL_ON_DEATH_ARCADE_REQUEST_TOKEN`: Monotonically increasing request serial string.
  - Written via `SetAttributeString` on the root panel and `#Hud`.
- **Target Escape Panels**:
  - `ShowEscapeMenu` class added/removed on: Root context panel, `#EscapeMenu`, `EscapeMenu.GetParent()`, and `#Hud`.
- **Detection Target Panels**:
  - Resolves `respawn_timer` and children with classes `respawn_number` or `RespawnTimer` to read respawn seconds.

### Engine Events & Polling Frequency
- **Polling Frequency**: 5Hz (`0.2s` interval).
- **Engine Events**: Driven by timer polling. Monitors the parsed floating-point value from the `respawn_number` text content.

### Performance Tier & Caveats
- **Performance Tier**: Low (`0.2s` tick).
- **Trigger Cooldown**: Enforces a 5000ms (`ON_DEATH_ARCADE_TRIGGER_COOLDOWN_MS`) cooldown between triggers to prevent duplicate game invocations within a single death.
- **Panel Caching**: Caches the resolved respawn label in `State.onDeathArcadeRespawnPanel` and checks validity with `IsPanelValid` / `IsPanelVisibleMaybe` to avoid repeating expensive full-tree traversals on every tick.
