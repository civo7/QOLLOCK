# `panorama/scripts/manifests/ql_damage_numbers` (Floating Damage Numbers Customization)

## Description
Provides aesthetic and clarity controls for floating in-game damage numbers rendered during combat (`HudIndicatorText` inside `HudEventIndicatorsPanel`). Allows players to adjust font size, transparency, filter out negligible chip damage numbers, and enable clean typography to reduce visual clutter during rapid-firing attacks.

## Files
- Manifest: `panorama/scripts/manifests/ql_damage_numbers/manifest.js`
- Styles: Dynamic styling applied across indicator text elements

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_DAMAGE_NUMBERS` | `toggle` | `false` | Master toggle to enable damage number customization. |
| `DAMAGE_NUMBERS_OPACITY` | `slider` | `100` | Opacity percentage for floating combat numbers (0% to 100%). |
| `DAMAGE_NUMBERS_FONT_SIZE` | `slider` | `18` | Font size in pixels for damage numbers (10px to 36px). |
| `ENABLE_CLEAN_DAMAGE_NUMBERS` | `toggle` | `false` | Removes heavy text shadows and stroke outlines for a minimalist appearance. |
| `ENABLE_HIDE_SMALL_DAMAGE` | `toggle` | `false` | Filters out low-value damage ticks (e.g. burn damage, minion pings). |
| `SMALL_DAMAGE_THRESHOLD` | `slider` | `15` | Minimum damage threshold required for a number to be rendered. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Locates `#HudEventIndicatorsPanel` and registers a cooperative polling task in `QOL.core.Scheduler` running at 2Hz (`0.5s` interval).
- **`onDisable()`**: Cancels scheduler task, removes custom styling from active indicator labels, and clears panel references.
- **`onSettingsChanged()`**: Synchronously runs an immediate update tick.
- **`test()`**: Verifies that `#HudEventIndicatorsPanel` is mounted in the HUD tree.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panels**:
  - `Panel#HudEventIndicatorsPanel`: Native container hosting floating world-space combat text.
  - `Label.HudIndicatorText`: Dynamic child labels spawned by C++ for damage ticks.

### Engine Events & Polling Frequency
- **Polling Frequency**: 2Hz (`0.5s` interval).
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: Low (`~0.04ms` per tick).
- **Suppression**: Inactive when no combat indicator elements are present in the viewport.
- **Dynamic Elements**: Because damage text labels are continuously spawned and destroyed by engine C++ code, styling is batch-applied during traversal without retaining stale pointers.
