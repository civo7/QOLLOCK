# Settings Realtime Previews Architecture

The QOLLOCK settings window provides realtime visual previews for HUD elements when their positions, scales, or toggle states are adjusted in the UI.

---

## 1. Overview & Architecture

Settings previews are implemented in `panorama/scripts/ql_settings_previews.js` and exposed via `QOL.preview` (and `Q.preview`).

```
┌─────────────────────────────────────────────────────────┐
│                    Settings UI Action                   │
│ (Slider move, Animated Section toggle, Title Checkbox)  │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
               `QOL.preview.showForConfigId(id)`
                             │
            ┌────────────────┴────────────────┐
            │ Checks:                         │
            │ - MOD_CONFIG.PREVIEWS_ENABLED   │
            │ - IsSettingsWindowVisible()     │
            │ - Feature enabled toggle status │
            └────────────────┬────────────────┘
                             │
                             ▼
              `ShowConfigPreviewForConfigId(id)`
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
ShowZipBoostPreview()  ShowCompassPreview()   ShowSpeedPreview()
     │                       │                       │
     ▼                       ▼                       ▼
  Displays floating pill/box on screen for 1.5 seconds
```

---

## 2. Public API (`QOL.preview`)

- **`showForConfigId(configId)`**: Dispatches preview creation or update for the given configuration key.
- **`hideAll()`**: Immediately hides all active preview panels across all categories.
- **`wirePreviewToggleButton(buttonPanel)`**: Attaches event listeners and active state styling to the preview master switch (`MOD_CONFIG.PREVIEWS_ENABLED`).
- **Config Identification Helpers**:
  - `isMinimapPreviewConfig(configId)`
  - `isZoomMinimapPreviewConfig(configId)`
  - `isCompassPreviewConfig(configId)`
  - `isSpeedPreviewConfig(configId)`
  - `isCrosshairStatsPreviewConfig(configId)`
  - `isKeyboardOverlayPreviewConfig(configId)`
  - `isItemCooldownPreviewConfig(configId)`
  - `isAmmoPreviewConfig(configId)`
  - `isReloadCooldownPreviewConfig(configId)`
  - `isUnitTargetPreviewConfig(configId)`
  - `isDamageReportPreviewConfig(configId)`
  - `isShopPreviewConfig(configId)`
  - `isUnsecuredPlusPreviewConfig(configId)`

---

## 3. Supported Previews

| Preview Type | Supported Config Keys | Description |
| :--- | :--- | :--- |
| **Zipline Boost** | `ENABLE_ZIP_BOOST`, `ZIP_BOOST_X_OFFSET`, `ZIP_BOOST_Y_OFFSET`, `ZIP_BOOST_SCALE` | Floating green glowing pill showing configured position and scale. |
| **Speedometer** | `ENABLE_COMPASS_SPEED`, `COMPASS_SPEED_X_OFFSET`, `COMPASS_SPEED_Y_OFFSET` | Styled square 50x50 gold glow pill displaying `"SPD"` matching in-game speedometer coordinates. |
| **Compass** | `ENABLE_COMPASS`, `COMPASS_X_OFFSET`, `COMPASS_Y_OFFSET`, `COMPASS_SCALE`, `COMPASS_STRETCH_X`, `COMPASS_STRETCH_Y` | Bounding box showing compass placement and aspect ratio. |
| **Crosshair Stats** | `ENABLE_CROSSHAIR_STATS`, `CROSSHAIR_STATS_X_OFFSET`, `CROSSHAIR_STATS_Y_OFFSET`, `CROSSHAIR_STATS_SCALE`, `CROSSHAIR_STATS_OPACITY` | Active stats indicator near crosshair. |
| **Unsecured Souls** | `ENABLE_UNSECURED_SOUL_TIMER`, `UNSECURED_SOUL_TIMER_X_OFFSET`, `UNSECURED_SOUL_TIMER_Y_OFFSET`, `UNSECURED_SOUL_TIMER_SCALE` | Unsecured soul countdown preview. |
| **Keyboard Overlay**| `ENABLE_KEYBOARD_OVERLAY`, `KEYBOARD_OVERLAY_X_OFFSET`, `KEYBOARD_OVERLAY_Y_OFFSET`, `KEYBOARD_OVERLAY_SCALE` | Overlay footprint showing scaled dimensions. |
| **Item Cooldown** | `PASSIVE_COOLDOWN_SIZE`, `PASSIVE_COOLDOWN_X_OFFSET`, `PASSIVE_COOLDOWN_Y_OFFSET` | Cooldown icon frame next to crosshair. |
| **Minimap Size & Offset** | `MINIMAP_SMALL_SIZE`, `MINIMAP_X_OFFSET`, `MINIMAP_Y_OFFSET`, `MINIMAP_BASE_OPACITY` | Bounding circular reticle indicating exact minimap placement, diameter, and opacity. |

---

## 4. UI Controls Integration

When a user interacts with a control in `panorama/scripts/ui/controls.js`:
1. **Sliders (`createSliderSettingsRow`, `createDualSliderSettingsRow`, `createOffsetControlRow`)**: Calls `getPreview().showForConfigId(configId)` during drag/change.
2. **Animated Section Toggles (`createAnimatedInlineToggleSection`)**: Calls `getPreview().showForConfigId(enableConfigId)` immediately upon switch activation or deactivation.
3. **Title Checkboxes (`createSectionTitleCheckboxToggle`)**: Calls `getPreview().showForConfigId(configId)` upon check state toggle.

---

## 5. Hideout vs In-Match Behavior Gotcha

- **In-Game Feature Manifests**: Certain HUD manifests (e.g. `ql_zipboost` and `ql_compass`) intentionally include `_isInHideout(root)` guards in their active polling loops to disable unnecessary HUD clutter while in the sandbox/hideout.
- **Settings Previews**: Settings previews are separate UI panels created directly under the escape menu context root (`CitadelHudEscapeMenu`). They function regardless of match or hideout status whenever `MOD_CONFIG.PREVIEWS_ENABLED === 1` and the settings window is open.

---

## 6. Resolution & Coordinate Space Scaling (DPI / Aspect Ratio Fix)

- **Virtual vs. Physical Coordinates**: Source 2 Panorama inline styles (`style.x`, `style.y`, `style.marginRight`, `style.marginBottom`) operate in virtual layout design units (normalized 1920x1080 canvas), whereas runtime layout queries (`actuallayoutwidth`, `actuallayoutheight`, `actualxoffset`, `GetPositionWithinAncestor`) return unscaled physical device pixels.
- **DPI Scaling**: On higher-DPI displays such as 1440p (`1.333x`) and 4K (`2.0x`), assigning raw physical pixels directly into CSS inline styles causes elements to drift off-target. Previews utilize `GetPreviewHostScale(host)` (`actualuiscale_x`, `actualuiscale_y`, or `actuallayoutwidth / desiredlayoutwidth`) to convert physical measurements back into virtual CSS units before assigning inline styles.
- **Live Minimap Hierarchy Alignment**: In Deadlock, `#minimap_persp` is nested inside `.clamp_width` (which applies `max-width: 2000px; horizontal-align: center;`), introducing variable horizontal insets on ultrawide displays (16:10, 21:9, 32:9). When `#minimap_persp` is alive in the HUD hierarchy, `ShowMinimapSizePreview` computes its live physical distance to the right/bottom bounds of `contextRoot`, normalizes by `hostScale`, and sets `marginRight` / `marginBottom` dynamically. This guarantees 1:1 pixel-perfect alignment with the actual minimap across all resolutions, aspect ratios, and custom user offsets.

