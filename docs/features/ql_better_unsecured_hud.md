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
| `UNSECURED_SOULS_HUD_SCALE` | `slider` | `100` | Scale multiplier percentage for the unsecured souls HUD element (50 to 200). |
| `UNSECURED_SOULS_HUD_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting the overlay position (-1000 to 2000). |
| `UNSECURED_SOULS_HUD_Y_OFFSET` | `slider` | `1095` | Vertical pixel offset shifting the overlay position (800 to 2000). |
| `ENABLE_BETTER_UNSECURED_SHOW_ICON` | `toggle` | `true` | Toggles display of the unsecured soul urn icon. |
| `ENABLE_BETTER_UNSECURED_SHOW_TEXT` | `toggle` | `false` | Toggles display of the secondary text label indicator. |
| `ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT` | `toggle` | `false` | Legacy key: toggles display of both icon and text simultaneously. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Resolves `gameplay_hud`, constructs the `QOLBetterUnsecuredOverlay` panel tree, and registers a cooperative scheduler loop running at 5Hz (`0.2s`).
- **`onDisable()`**: Stops the polling loop, deletes the overlay with `DeleteAsync(0)`, and clears cached source/mirror references and layout signature.
- **`onSettingsChanged()`**: Synchronizes transforms, scale, and visibility flags immediately upon config dispatch.
- **`test()`**: Checks only whether `gameplay_hud` exists; it does not verify source text readability or overlay rendering.

### DOM Injection & Target Panels
- **Parent Container**: Injected under `StatsAndModsContainer` (or `gameplay_hud` / root `#Hud` if unmounted).
- **Injected Panels**:
  - `Panel#QOLBetterUnsecuredOverlay`: Positioned via `marginLeft` and `marginBottom`, using the `115/130` baseline from the legacy runtime loaded at the 3.2.0 schema commit (`0907222`).
  - `Panel#QOLBetterUnsecuredMirrorIcon`: Displays the soul urn icon graphic.
  - `Label#QOLBetterUnsecuredMirrorLabel`: Primary numeric label mirroring current unsecured souls.
  - `Label#QOLBetterUnsecuredMirrorText`: Supplementary text badge.
- **Native Read Targets**:
  - `#gold_and_ap_container` -> `.hudDeathGoldContainer` -> `#hudDealthGoldLabel` (or `#hudDeathGoldLabel`).

### Engine Events & Polling Frequency
- **Polling Frequency**: 5Hz (`0.2s` interval) cooperative polling loop via `QOL.core.Scheduler`.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Runtime cost**: Not measured here; no per-tick millisecond or FPS guarantee.
- **Suppression**:
  - Automatically hidden via `qol-hidden` (`visibility: collapse`) whenever unsecured soul count is zero (`sourceValue <= 0`), preventing screen clutter when not carrying souls.
  - A later positive count must remove `qol-hidden`, including when the source label appears after the overlay. The manifest cutover (`cb46e0b`) omitted the legacy runtime's unconditional unhide; the transition regression now covers that case.
- **Style Optimization**: Position coordinates, scale values, and visibility states are cached and diffed via signature comparison before applying style modifications.
- **Verification boundary**: Offline checks cover count/visibility transitions and disable/re-enable. Native text access, placement, ancestor visibility in Hero Testing, and final rendering require a maintainer-built VPK and an in-game check.
