# `panorama/scripts/manifests/ql_build_storage` (Persistent Build Description Storage)

## Description
Serves as the primary persistent configuration storage system for QOLLOCK. Because Valve's Panorama V8 environment provides no standard file system write access or persistent localStorage across game sessions, QOLLOCK serializes its settings dictionary into a compressed, versioned payload and stores it within the description field of a dedicated private Hero Build (defaulting to `hero_skyrunner`). This feature automatically loads settings on startup and seamlessly saves user changes.

## Files
- Manifest: `panorama/scripts/manifests/ql_build_storage/manifest.js`
- Test Suite: `scripts/simulator/fuzz_build_storage.js`
- Styles: None

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `DEFAULT_HERO` | `dropdown` | `"hero_skyrunner"` | Hero profile used to host the private QOLLOCK settings storage build. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Initiates an adaptive state machine via `QOL.core.Scheduler` running at 5Hz (`0.2s`) to detect build loading state, read existing payloads, and perform initial synchronization.
- **`onDisable()`**: Cancels scheduler polling tasks, clears debounced save timers, and releases DOM references.
- **`onSettingsChanged()`**: Enqueues a debounced write operation (`~1.5s` delay) to flush modified configurations to the build description.
- **`test()`**: Verifies that the Hero Shop or build manager panel infrastructure is resolvable.

### DOM Injection & Target Panels
- **DOM Creation**: Zero permanent UI panels injected into gameplay.
- **Target Panels**:
  - `CitadelHudHeroShop`: Monitored to access build editing dialogs.
  - Build metadata panels: `#BuildDescription`, `#BuildName`, `#SaveBuildButton`.
  - Applies a temporary dimming style during background serialization to eliminate visual flickering.

### Engine Events & Polling Frequency
- **Polling Frequency**: Adaptive—runs at 5Hz (`0.2s` interval) during read/write cycles, immediately throttling down to `5.0s` once persistent state is verified in memory.
- **Engine Events**: Hooked to `engine:shop_opened`, `engine:shop_closed`, and build editor transitions.

### Performance Tier & Caveats
- **Performance Tier**: Low during gameplay (0ms cost); transient Low-to-Medium CPU utilization only during active serialization/deserialization.
- **Data Integrity**: Payloads include schema versioning, checksum validation, and payload length verification to guard against truncation or corruption.
- **Anti-Flicker Protection**: Coordinates with engine classes (`BuildsLoading`, `Selected`, `gEditingBuilds`) so save operations occur silently without user interruption.

### Hero Selection Propagation & Deserialization Resilience
- **In-Engine Hero Propagation**: Updating `DEFAULT_HERO` dispatches `applyDefaultHeroSelection`, which registers both `QOL_HERO_HINT` and `QOL_LAST_SELECTED_HERO_HINT` attributes on the root HUD panel and issues the engine ConCommand `selecthero <hero>`.
- **Load, Import, & Preset Synchronization**: In addition to interactive dropdown selection, `applyDefaultHeroSelection` is explicitly invoked during startup config synchronization (`SyncConfigFromStorage`), manual settings import (`ui/config_tab.js`), and preset application (`ui/presets.js`), ensuring imported or loaded hero profiles take effect immediately in-game.
- **Defensive Field Resolution**: Compact binary serialization and deserialization in `ql_settings_persistence.js` resolve hero options, compact field identifiers, and default configurations through defensive accessors (`GetDefaultHeroOptions`, `GetCompactDefaultHeroField`, `GetDefaultConfig`), ensuring full compatibility across isolated unit test runners and runtime Panorama environments.

### Pre-Switch Hero Readiness (`wait_hero`) & Crosshair Detection
- **Crosshair Hero Detection (`readHeroFromCrosshair`)**: Modeled after ThirdEye persistence, the live player hero is detected directly from the HUD `#crosshair` -> `.citadel_ability_dash` container via `hero_<codename>` class membership. This is immune to ability HUD loading delays and reflects the exact live player pawn.
- **Pre-Switch Readiness Gate (`wait_hero`)**: Rather than switching to `hero_skyrunner` immediately at tick 0 during hideout map load (where the engine may drop commands while spawning bot entities or transitioning game states), the state machine enters `wait_hero` (up to `HERO_WAIT_TIMEOUT_MS = 15000`). Once the player's pawn is alive:
  - If the player is already playing `hero_skyrunner`, switching is skipped entirely (`_st.didSwitch = false`) and the machine jumps directly to `open_shop`.
  - Otherwise, `_st.returnHero` is stamped from the live crosshair reading and the hero switch proceeds.
  - If the hero never spawns within 15 seconds, the loader session gracefully defers without setting `configLoadState = "failed"`, preventing saving from being permanently locked out.
- **Match Write Guard**: Save requests (`_pendingWrite`) require active hideout context (`_inHideout`); requests made in active matches are rejected with `not_in_hideout` to prevent invalid hero switching.


