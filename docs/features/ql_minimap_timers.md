# `panorama/scripts/manifests/ql_minimap_timers` (Minimap Objective Timers — Buff & Mid-Boss)

## Description
Renders objective countdown timers directly onto the tactical minimap for Mid-Boss (Rejuvenator) and Bridge Powerup runes. Supports two distinct rendering modes: **Standard Mode** (compact status plates anchored to the bottom edge of the minimap) and **Bridge Mode** (pins timer plates directly over the left and right bridge powerup runes and the center Mid-Boss pit), allowing players to anticipate rune and boss timings at a glance.

## Files
- Manifest: `panorama/scripts/manifests/ql_minimap_timers/manifest.js`
- Styles: Inline layout and styling in 400px coordinate space

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_MINIMAP_REJUV_TIMER` | `toggle` | `false` | Master toggle to display Mid-Boss / Rejuvenator timer on the minimap. |
| `ENABLE_MINIMAP_BUFF_TIMER` | `toggle` | `false` | Master toggle to display Bridge Powerup rune timers on the minimap. |
| `ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE` | `toggle` | `false` | Pins buff timers directly onto left and right bridge rune locations. |
| `ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS` | `toggle` | `false` | Pins the Rejuvenator timer directly over the Mid-Boss pit on the minimap. |
| `ENABLE_TAB_ZOOM` | `toggle` | `false` | Adapts timer coordinates when Tab-key minimap zoom is active. |
| `ENABLE_ALT_ZOOM` | `toggle` | `false` | Adapts timer coordinates when Alt-key minimap zoom is active. |
| `MINIMAP_SMALL_SIZE` | `slider` | `400` | Baseline minimap dimension for coordinate calculation. |
| `MINIMAP_LARGE_SIZE` | `slider` | `750` | Fallback enlarged minimap dimension. |
| `MINIMAP_LARGE_SIZE_ALT` | `slider` | `750` | Enlarged minimap dimension when holding Alt. |
| `MINIMAP_LARGE_SIZE_TAB` | `slider` | `750` | Enlarged minimap dimension when holding Tab. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Locates the minimap overlay anchor (`minimap_container` or `minimap_persp`), builds the `QOLMinimapTimersRoot` panel structure, runs an immediate initial evaluation tick, and registers a cooperative scheduler loop running at `0.3s` (~3.3Hz).
- **`onDisable()`**: Cancels the scheduler loop, collapses or hides timer overlays, and invalidates cached panel references.
- **`onSettingsChanged()`**: Synchronously runs an immediate evaluation tick (`_tick()`) to reconfigure timer layout and positioning.
- **`test()`**: Verifies that `#hud_minimap` is present in the HUD tree.

### DOM Injection & Target Panels
- **Parent Container**: Injected under `minimap_container` or `minimap_persp`.
- **Injected Panels**:
  - `Panel#QOLMinimapTimersRoot`: Top-level overlay container.
  - Standard Mode Panels:
    - `Panel#QOLMinimapBuffTimer`: Centered buff rune timer with `Image#QOLMinimapBuffIcon` and `Label#QOLMinimapBuffTime`.
    - `Panel#QOLMinimapRejuvTimer`: Centered Rejuvenator timer with `Image#QOLMinimapRejuvIcon` and `Label#QOLMinimapRejuvTime`.
  - Bridge Mode Panels:
    - `Panel#QOLMinimapBuffBridgeLeftTimer`: Left bridge powerup timer badge.
    - `Panel#QOLMinimapBuffBridgeRightTimer`: Right bridge powerup timer badge.
- **Dynamic Classes**:
  - `.yellow` / `.red`: Warning color classes applied when countdown enters final 20 and 10 seconds.
  - `.buff_spawned`: Applied when an active buff is detected on the bridge.

### Engine Events & Polling Frequency
- **Polling Frequency**: `0.3s` interval (~3.3Hz) cooperative polling loop via `QOL.core.Scheduler`. Spawner detection queries `#hud_minimap` directly for live `.powerup_spawn` elements, avoiding stale panel handles or backoff desync when runes are consumed and respawned.
- **State Coupling**: Reads live Rejuvenator data from `QOL.state.rejuvState` (maintained by `ql_rejuv_hud`).
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: Low (`~0.03ms` per tick).
- **Suppression**: Automatically hidden when connected to the Hideout / Sandbox or during Street Brawl matches.
- **Resolution Independence**: Layout offsets and plate dimensions are defined in a fixed 400px base coordinate space; Panorama's `uiScale` on `minimap_persp` automatically vector-scales the overlays to match any minimap size (550px, 750px, zoom, etc.) without offset drift or manual layout recalculation.
- **Layout Invalidation Guards**: `ApplyMinimapObjectiveTimersBridgeMode` guards all inline style assignments behind `State.minimapObjectiveBridgePosSig`, completely bypassing style mutations when objective positions are unchanged.
- **DOM Struct & Anchor Caching**: Caches `_cachedAnchor` and `_cachedPanelsStruct` so `EnsureMinimapObjectiveTimers` bypasses 14 recursive `FindChildTraverse` lookups and eliminates redundant DOM z-order reorderings (`MoveChildAfter` / `MoveChildBefore`) on every polling tick.
