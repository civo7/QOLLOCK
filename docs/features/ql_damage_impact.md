# `panorama/scripts/manifests/ql_damage_impact` (Directional Damage Indicator & Screen Flash Customization)

## Description
Adjusts the scale, opacity, and positioning of the native directional damage impact indicator (`#damage_impact`). When taking enemy gunfire or ability damage, Deadlock renders red directional vignettes around the reticle and screen edges; this feature allows players to tone down or rescale these indicators to avoid visual disorientation in heavy teamfights.

## Files
- Manifest: `panorama/scripts/manifests/ql_damage_impact/manifest.js`
- Styles: Dynamic inline style management on the native `#damage_impact` panel

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_DAMAGE_IMPACT` | `toggle` | `false` | Master toggle enabling custom scale, opacity, and offset overrides for damage impact indicators. |
| `DAMAGE_IMPACT_SCALE` | `slider` | `1.0` | Uniform scale multiplier applied to the damage impact container (0.5 to 2.0). |
| `DAMAGE_IMPACT_OPACITY` | `slider` | `100` | Opacity percentage for directional damage flashes (0% to 100%). |
| `DAMAGE_IMPACT_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting the damage impact indicator. |
| `DAMAGE_IMPACT_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting the damage impact indicator. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Resolves `#damage_impact` within the HUD hierarchy, caches baseline properties, and invokes `_apply()`.
- **`onDisable()`**: Reverts `#damage_impact` transforms, margins, and opacity to default values.
- **`onSettingsChanged()`**: Synchronously runs `_apply()` to update styling (0ms latency).
- **`test()`**: Verifies that `#damage_impact` exists in the HUD DOM.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panels**:
  - `Panel#damage_impact`: Native directional damage flash container.

### Engine Events & Polling Frequency
- **Polling Frequency**: Zero polling (0Hz). The feature is purely reactive to configuration dispatches.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: None (`< 0.02ms` on setting update).
- **Suppression**: Validates panel vitality before attempting style updates.
- **Style Optimization**: Guards style updates using composite string signature diffing (`ox|oy|op|sc|enabled`), completely eliminating unnecessary layout reflows.
