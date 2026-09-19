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

