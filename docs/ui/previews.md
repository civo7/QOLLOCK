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
| **Speedometer** | `ENABLE_COMPASS_SPEED`, `COMPASS_SPEED_X_OFFSET`, `COMPASS_SPEED_Y_OFFSET` | Styled gold glow pill displaying `"SPEED: 8.5 m/s"` matching in-game speedometer coordinates. |
| **Compass** | `ENABLE_COMPASS`, `COMPASS_X_OFFSET`, `COMPASS_Y_OFFSET`, `COMPASS_SCALE`, `COMPASS_STRETCH_X`, `COMPASS_STRETCH_Y` | Bounding box showing compass placement and aspect ratio. |
| **Crosshair Stats** | `ENABLE_CROSSHAIR_STATS`, `CROSSHAIR_STATS_X_OFFSET`, `CROSSHAIR_STATS_Y_OFFSET`, `CROSSHAIR_STATS_SCALE`, `CROSSHAIR_STATS_OPACITY` | Active stats indicator near crosshair. |
| **Unsecured Souls** | `ENABLE_UNSECURED_SOUL_TIMER`, `UNSECURED_SOUL_TIMER_X_OFFSET`, `UNSECURED_SOUL_TIMER_Y_OFFSET`, `UNSECURED_SOUL_TIMER_SCALE` | Unsecured soul countdown preview. |
| **Keyboard Overlay**| `ENABLE_KEYBOARD_OVERLAY`, `KEYBOARD_OVERLAY_X_OFFSET`, `KEYBOARD_OVERLAY_Y_OFFSET`, `KEYBOARD_OVERLAY_SCALE` | Overlay footprint showing scaled dimensions. |
| **Item Cooldown** | `PASSIVE_COOLDOWN_SIZE`, `PASSIVE_COOLDOWN_X_OFFSET`, `PASSIVE_COOLDOWN_Y_OFFSET` | Cooldown icon frame next to crosshair. |

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
