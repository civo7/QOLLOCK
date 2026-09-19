# `panorama/scripts/manifests/ql_item_mirror` (HUD Item Cooldown Mirror Overlay)

## Description
Renders a customizable secondary item bar (`QOLItemMirrorRoot`) positioned directly near the crosshair or healthbar. Mirrors purchased active items (and optionally cooldown-tracked passives) with real-time radial cooldown sweeps, ready flash animations, ability stack counters, and keybind badges. This enables players to monitor item readiness without averting their vision to the bottom-right corner of the screen during fights.

## Files
- Manifest: `panorama/scripts/manifests/ql_item_mirror/manifest.js`
- Styles: `panorama/styles/features/ql_feat_item_mirror.css`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_ITEM_MIRROR` | `toggle` | `false` | Master toggle to enable the mirrored active item HUD overlay. |
| `ITEM_MIRROR_SCALE` | `slider` | `1.0` | Global scale multiplier for the mirrored item bar (0.5 to 2.0). |
| `ITEM_MIRROR_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting mirror position. |
| `ITEM_MIRROR_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting mirror position. |
| `ITEM_MIRROR_OPACITY` | `slider` | `100` | Opacity percentage for the mirrored item bar (0% to 100%). |
| `ITEM_MIRROR_SHOW_PASSIVES` | `toggle` | `false` | Also displays passive items that have internal cooldowns or stack mechanics. |
| `ITEM_MIRROR_HORIZONTAL` | `toggle` | `true` | Toggles between horizontal and vertical bar layouts. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Locates `#Hud`, constructs the `QOLItemMirrorRoot` hierarchy, applies configured orientation and scales, and registers a cooperative scheduler task running at 20Hz (`0.05s`) during active cooldown tracking.
- **`onDisable()`**: Cancels scheduler task, safely destroys `_panel` via `safeDeletePanel`, and clears cooldown tracking caches.
- **`onSettingsChanged()`**: Synchronously updates bar orientation, offsets, and visibility flags (0ms latency).
- **`test()`**: Verifies that `#Hud` and native `#ModsContainer` are resolvable.

### DOM Injection & Target Panels
- **Parent Container**: Injected under `#Hud`.
- **Injected Panels**:
  - `Panel#QOLItemMirrorRoot`: Main outer positioned wrapper.
  - `Panel#QOLItemMirrorRow`: Flex container enforcing horizontal or vertical item flow.
  - `Panel#QOLItemMirrorSlot_N`: Individual item slots containing item icons, cooldown sweep masks, ready glows, and keybind badges.
- **Native Read Targets**:
  - Scans and mirrors ability slots inside `Panel#ModsContainer`.

### Engine Events & Polling Frequency
- **Polling Frequency**: Adaptive—runs at 20Hz (`0.05s` / 50ms) when any item is on cooldown for fluid radial sweep animation; throttles to `0.12s` (~8Hz) when all items are ready.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: Medium (`~0.09ms` per tick during active cooldown animation).
- **Suppression**: Collapses automatically in the Hideout/Sandbox lobby.
- **Cooldown Sweeps**: Cooldown degree angles and clip-path sweeps are diffed to avoid touching style properties when cooldown percentages do not change.
