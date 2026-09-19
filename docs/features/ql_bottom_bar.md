# `panorama/scripts/manifests/ql_bottom_bar` (HUD Bottom Bar Customization)

## Description
Customizes the layout, scaling, positioning, transparency, and color accents of the native HUD bottom bar. Targets the signature ability bar, ability point (AP) counter, and gold currency containers, allowing players to shift the bottom HUD upward for wide aspect ratios or adjust visual prominence.

## Files
- Manifest: `panorama/scripts/manifests/ql_bottom_bar/manifest.js`
- Styles: Dynamic inline style management on native bottom HUD containers

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `HUD_BOTTOM_BAR_ENABLED` | `toggle` | `false` | Master toggle enabling bottom bar repositioning, scaling, and styling. |
| `BOTTOM_BAR_OPACITY` | `slider` | `100` | Opacity percentage applied to bottom bar components (0% to 100%). |
| `BOTTOM_BAR_SCALE` | `slider` | `1.0` | Uniform scale multiplier applied to the bottom bar container (0.5 to 2.0). |
| `BOTTOM_BAR_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting the bottom bar. |
| `BOTTOM_BAR_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting the bottom bar. |
| `BOTTOM_BAR_WASH_COLOR` | `dropdown` | `"none"` | Color tint applied across currency and signature containers (`none`, `gold`, `green`, `purple`, `orange`, `blue`). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Locates `#hud_signature`, `#APContainer`, and `#gold_and_ap_container`, caches their initial style states, and applies configured offsets and wash colors.
- **`onDisable()`**: Reverts modified panels to default margins, transforms, opacity, and wash color, then invalidates style signatures.
- **`onSettingsChanged()`**: Synchronously runs `_apply()` to re-evaluate offsets and styling without polling.
- **`test()`**: Verifies that `#hud_signature` is present in the active HUD hierarchy.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created; manipulates existing engine panels.
- **Target Panels**:
  - `Panel#hud_signature`: Native signature abilities panel.
  - `Panel#APContainer`: Container rendering unspent Ability Points.
  - `Panel#gold_and_ap_container`: Parent currency and progression bar.

### Engine Events & Polling Frequency
- **Polling Frequency**: Zero polling (0Hz). The feature is purely reactive to configuration updates.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: Low (executes only on configuration modification, consuming `< 0.02ms`).
- **Suppression**: Validates panel existence with `PanelHelpers.isPanelAlive` prior to mutating styles.
- **Style Optimization**: Guards style updates with composite string signature diffing (`ox|oy|op|scText|wcIdx|enabled`), preventing redundant Source 2 C++ layout passes.
