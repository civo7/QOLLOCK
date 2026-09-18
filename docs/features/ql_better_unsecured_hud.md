# `panorama/scripts/manifests/ql_better_unsecured_hud` (Enhanced Unsecured Souls HUD)

## Description
Creates a dedicated, highly customizable HUD overlay for unsecured souls that can be repositioned, rescaled, and styled independently from the native death gold container. In vanilla Deadlock, unsecured souls are tucked into a subtle corner label; this feature brings the count into central focus so players know exactly when they are risking high soul bounties.

## Files
- Manifest: `panorama/scripts/manifests/ql_better_unsecured_hud/manifest.js`
- Styles: `panorama/styles/features/ql_feat_unsecured_souls.css`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_BETTER_UNSECURED` | `toggle` | `false` | Master toggle to enable the enhanced unsecured souls HUD overlay. |
| `UNSECURED_SOULS_HUD_SCALE` | `slider` | `1.0` | Scale multiplier for the unsecured souls HUD element (0.5 to 2.5). |
| `UNSECURED_SOULS_HUD_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting the overlay position. |
| `UNSECURED_SOULS_HUD_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting the overlay position. |
| `ENABLE_BETTER_UNSECURED_SHOW_ICON` | `toggle` | `true` | Toggles display of the unsecured soul urn icon. |
| `ENABLE_BETTER_UNSECURED_SHOW_TEXT` | `toggle` | `true` | Toggles display of the numeric unsecured souls counter. |
| `ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT` | `toggle` | `false` | Toggles display of the secondary text label indicator. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Resolves `gameplay_hud`, constructs the `QOLBetterUnsecuredOverlay` panel tree, and registers a cooperative scheduler loop running at 5Hz (`0.2s`).
- **`onDisable()`**: Cancels the scheduler loop, calls `safeDeletePanel` on `_panel`, and cleans up cached references.
- **`onSettingsChanged()`**: Synchronizes transforms, scale, and visibility flags immediately upon config dispatch.
- **`test()`**: Verifies that `gameplay_hud` and native `#hudDeathGoldContainer` exist in the DOM.

### DOM Injection & Target Panels
- **Parent Container**: Injected under `gameplay_hud` (or root `#Hud` if `gameplay_hud` is unmounted).
- **Injected Panels**:
  - `Panel#QOLBetterUnsecuredOverlay`: Main container positioned via transform margins.
  - `Image#QOLBetterUnsecuredIcon`: Displays the soul icon graphic.
  - `Label#QOLBetterUnsecuredLabel`: Primary numeric label mirroring current unsecured souls.
  - `Label#QOLBetterUnsecuredSubLabel`: Supplementary text badge.
- **Native Read Targets**:
  - `#hudDeathGoldContainer` -> `#hudDeathGoldLabel` / `#hudUnsecuredLabel`.

### Engine Events & Polling Frequency
- **Polling Frequency**: 5Hz (`0.2s` interval) cooperative polling loop via `QOL.core.Scheduler`.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: Low (`~0.04ms` per tick).
- **Suppression**:
  - Suppressed in the Hideout/Sandbox lobby (`connectedToHideout` / `InHideout`).
  - Hides automatically via the `hidden_zero` CSS class whenever unsecured soul count drops to zero to prevent screen clutter.
- **Style Optimization**: Position coordinates, scale values, and visibility states are cached and diffed via signature comparison before applying style modifications.
