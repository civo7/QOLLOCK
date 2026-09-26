# `panorama/scripts/manifests/ql_ammo` (Ammo HUD Customization & Clip Orientation)

## Description
Provides granular control over the Deadlock weapon ammo HUD and circular clip ring. Allows repositioning, rescaling, colorizing, rotating, or completely hiding the active magazine counter and clip status indicators to accommodate custom crosshairs and cleaner screen layouts.

## Files
- Manifest: `panorama/scripts/manifests/ql_ammo/manifest.js`
- Styles: Dynamic inline style management on native ammo elements

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_AMMO_STATUS` | `toggle` | `false` | Master toggle enabling custom position, scale, and orientation overrides for the ammo HUD. |
| `ENABLE_HIDE_MAGAZINE` | `toggle` | `false` | Hides the circular magazine/clip status ring around the crosshair reticle. |
| `ENABLE_HIDE_AMMO_ALL` | `toggle` | `false` | Completely collapses and hides the entire ammo numerical display panel. |
| `AMMO_PANEL_SCALE` | `slider` | `1.0` | Global scale multiplier applied to the ammo panel container (range: 0.5 to 2.5). |
| `AMMO_CURRENT_SCALE` | `slider` | `1.0` | Independent scale factor applied specifically to the current clip ammo digits. |
| `AMMO_TOTAL_SCALE` | `slider` | `1.0` | Independent scale factor applied specifically to the total reserve ammo digits. |
| `AMMO_PANEL_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting the ammo counter relative to default screen position. |
| `AMMO_PANEL_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting the ammo counter relative to default screen position. |
| `AMMO_CLIP_ANGLE` | `slider` | `0` | Rotational orientation in degrees (`0deg` - `360deg`) applied to the circular clip ring. |
| `AMMO_TEXT_COLOR` | `color` | `"#FFFFFF"` | Hex color code applied to numerical ammo readouts. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`isEnabled(cfg)`**: Dynamically enables the feature whenever any ammo toggle is active (`ENABLE_AMMO_STATUS`, `ENABLE_HIDE_MAGAZINE`, `ENABLE_HIDE_AMMO_ALL`) OR whenever any slider/color setting is customized away from default (`AMMO_CURRENT_SCALE !== 100`, `AMMO_TOTAL_SCALE !== 100`, `AMMO_PANEL_SCALE !== 100`, `AMMO_PANEL_X_OFFSET !== 0`, `AMMO_PANEL_Y_OFFSET !== 0`, `AMMO_CLIP_ANGLE !== 0`, `AMMO_TEXT_COLOR !== 0`). This ensures slider edits take effect immediately even if the master toggle is inactive.
- **`onEnable()`**: Locates `#ammo_panel` and `#clip_status` within the HUD hierarchy, caches their initial properties, and calls `_apply()`.
- **`onDisable()`**: Restores original layout transforms, scales, margins, visibility flags, clears inline font sizes/widths (setting them to `null` to restore native engine styling), and clears signature caches.
- **`onSettingsChanged()`**: Synchronously runs `_apply()` to re-evaluate transformations and colors on change.
- **`test()`**: Verifies that the native `#ammo_panel` exists in the active HUD hierarchy.

### Scaling & Resolution Sizing
- When scale settings (`AMMO_CURRENT_SCALE`, `AMMO_TOTAL_SCALE`) are at neutral default (100), inline `fontSize`, `width`, and `marginLeft` styles are kept at `null`, allowing the native engine CSS to scale dynamically with the player's screen resolution rather than being pinned to fixed pixel values. Custom scales (> 100) apply scaled pixel dimensions.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created; operates directly on native engine panels.
- **Target Panels**:
  - `Panel#ammo_panel`: Primary ammo container hosting current and reserve bullet counters.
  - `Panel#clip_status`: Circular clip ring panel surrounding the reticle.
  - Target labels: Child `Label` elements within `#ammo_panel` for digit color styling.

### Engine Events & Polling Frequency
- **Polling Frequency**: Zero polling (0Hz). The feature is purely reactive to configuration dispatches.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Runtime cost**: Reactive to configuration, with no recurring loop in this manifest. Per-callback cost is not measured here.
- **Validity**: Native handles must remain valid before style mutation; shared validity APIs are `QOL_UTILS.IsPanelValid` and `QOL.core.panel.isAlive`, not `PanelHelpers.isPanelAlive`.
- **Style Optimization**: Guards style writes using `_lastMainSig` and `_lastClipSig` string signatures, ensuring layout properties (`preTransformScale2d`, `transform`, `marginLeft`, `marginTop`) are mutated only when values differ.
