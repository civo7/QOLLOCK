# `panorama/scripts/manifests/ql_keyboard` (Visual Keyboard & Keybind Overlay)

## Description
Renders an on-screen graphical keyboard and keybind overlay (`QOLKeyboardOverlayRoot`) displaying active movement controls, ability slots, active item triggers, and movement modifiers (jump, dash, slide). Designed for content creators, streamers, and players practicing complex movement tech, this overlay visualizes input timing and keypress states in real time.

## Files
- Manifest: `panorama/scripts/manifests/ql_keyboard/manifest.js`
- Styles: `panorama/styles/features/ql_feat_keyboard.css`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_KEYBOARD_OVERLAY` | `toggle` | `false` | Master toggle to enable the visual keyboard input overlay. |
| `KEYBOARD_SCALE` | `slider` | `1.0` | Global scale multiplier for the keyboard display (0.5 to 2.0). |
| `KEYBOARD_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting keyboard position. |
| `KEYBOARD_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting keyboard position. |
| `KEYBOARD_OPACITY` | `slider` | `100` | Opacity percentage for the keyboard overlay (0% to 100%). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Injects `QOLKeyboardOverlayRoot` under `gameplay_hud`, generates the keycap grid layout, applies configured styling, and registers a cooperative scheduler loop at 5Hz (`0.2s` interval).
- **`onDisable()`**: Cancels scheduler task, safely destroys `_panel` via `safeDeletePanel`, and clears keycap references.
- **`onSettingsChanged()`**: Synchronously updates panel scale, offsets, and opacity without rebuilding the DOM.
- **`test()`**: Verifies that `gameplay_hud` is mounted and valid.

### DOM Injection & Target Panels
- **Parent Container**: Injected under `gameplay_hud` (or root `#Hud`).
- **Injected Panels**:
  - `Panel#QOLKeyboardOverlayRoot`: Outer container positioned via transform margins.
  - `Panel#AllBindingsBox`: Container hosting structured key groups (movement cluster, ability row, item grid).
  - Child keycap panels: Individual key buttons with active state classes (`.key_pressed`).

### Engine Events & Polling Frequency
- **Polling Frequency**: 5Hz (`0.2s` interval) cooperative polling loop via `QOL.core.Scheduler`.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: Low (`~0.05ms` per tick).
- **Suppression**: Collapses in Hideout/Sandbox when no active hero is controlled.
- **Style Optimization**: Keypress classes are diffed against previous frame state; style updates are executed only when a key transitions between pressed and released states.
