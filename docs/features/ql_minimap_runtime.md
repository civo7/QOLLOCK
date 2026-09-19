# `panorama/scripts/manifests/ql_minimap_runtime` (Minimap Dynamic Scaling, Zoom & Overlays)

## Description
Serves as the central runtime controller for the Deadlock tactical minimap (`hud_minimap` and `minimap_persp`). Provides granular dimension controls (small baseline size, dynamic Alt-key zoom, Tab-key scoreboard zoom), margin positioning, opacity adjustment, and integration for subterranean tunnel route overlays. Uses vector-level `uiScale` transformations to ensure icon coordinates and hero markers scale seamlessly without visual artifacting.

## Files
- Manifest: `panorama/scripts/manifests/ql_minimap_runtime/manifest.js`
- Styles: `panorama/styles/features/ql_feat_minimap.css`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `MINIMAP_SMALL_SIZE` | `slider` | `400` | Baseline minimap dimensions in pixels (200px to 1000px). |
| `MINIMAP_LARGE_SIZE` | `slider` | `750` | Fallback enlarged minimap size in pixels (400px to 1200px). |
| `MINIMAP_LARGE_SIZE_ALT` | `slider` | `750` | Minimap dimensions when holding the Alt key (Detail View). |
| `MINIMAP_LARGE_SIZE_TAB` | `slider` | `750` | Minimap dimensions when opening the Tab key (Scoreboard). |
| `ENABLE_TAB_ZOOM` | `toggle` | `false` | Automatically enlarges minimap while holding the Tab key. |
| `ENABLE_ALT_ZOOM` | `toggle` | `false` | Automatically enlarges minimap while holding the Alt key. |
| `MINIMAP_OPACITY` | `slider` | `100` | Opacity percentage for the minimap container (0% to 100%). |
| `MINIMAP_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting the minimap container. |
| `MINIMAP_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting the minimap container. |
| `ENABLE_TUNNEL_OVERLAY` | `toggle` | `false` | Renders a high-contrast graphic overlay depicting underground tunnel networks. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Injects `minimap_overlay_root`, hooks `engine:scoreboard_toggle` for instant Tab-key zoom detection, and registers an adaptive scheduler task running at 20Hz (`0.05s`) during active zoom, throttling down to 2Hz (`0.5s`) when stable.
- **`onDisable()`**: Cancels scheduler loops, restores native panel scales and positioning, removes tunnel overlays, and resets transform signatures.
- **`onSettingsChanged()`**: Synchronously runs `_apply()` to re-evaluate dimensions, offsets, and overlay visibility.
- **`test()`**: Verifies that `#hud_minimap` and `#minimap_persp` are present and valid in the HUD tree.

### DOM Injection & Target Panels
- **Target Containers**:
  - `Panel#hud_minimap`: Outer minimap wrapper.
  - `Panel#minimap_persp`: Vector-scaled projection panel receiving `uiScale` transformations.
  - `Panel#minimap_container`: Layout anchor for minimap widgets.
- **Injected Panels**:
  - `Panel#minimap_overlay_root`: Container for custom HUD overlays.
  - `Image#tunnel_overlay`: Underground tunnel network graphic overlay.

### Engine Events & Polling Frequency
- **Engine Events**: Hooked to `engine:scoreboard_toggle` via `ctx.events` to instantly toggle Tab zoom state without polling latency.
- **Polling Frequency**: Adaptive—runs at 20Hz (`0.05s` interval) while Alt or Tab zoom transitions occur; throttles to 2Hz (`0.5s`) once dimensions stabilize.

### Performance Tier & Caveats
- **Performance Tier**: Low to Medium (`~0.07ms` per tick during zoom transitions).
- **Suppression**: Collapses custom overlays in the Hideout/Sandbox lobby.
- **Vector Scaling**: Rather than modifying CSS `width`/`height` (which causes expensive C++ layout invalidations across the entire minimap subtree), this feature manipulates `uiScale` on `minimap_persp`, allowing GPU-accelerated scaling.
