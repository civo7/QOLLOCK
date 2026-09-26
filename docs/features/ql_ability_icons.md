# `panorama/scripts/manifests/ql_ability_icons` (Ability Icon Layouts & Styling)

## Description
Customizes the visual presentation and clutter of ability icons on the HUD. The feature provides options to simplify ability icon graphics, conceal decorative border flourishes, suppress upgrade suggestion glows, and clean up ability stack count badges for enhanced combat legibility.

## Files
- Manifest: `panorama/scripts/manifests/ql_ability_icons/manifest.js`
- Styles: `panorama/styles/features/ql_feat_ability_icons.css`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_SIMPLIFY_ABILITY_ICONS` | `toggle` | `false` | Simplifies ability icon presentation and removes ornate borders. |
| `ENABLE_HIDE_COSMETIC_ABILITY` | `toggle` | `false` | Hides decorative cosmetic borders around ability slots. |
| `ENABLE_HIDE_ABILITY_SUGGESTION` | `toggle` | `false` | Disables ability upgrade recommendation and suggestion highlights. |
| `ENABLE_CLEAN_STACKS` | `toggle` | `false` | Cleans up ability stack indicator rendering for improved visibility. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **Enable Keys**: Registered with `enableKeys: ["ENABLE_SIMPLIFY_ABILITY_ICONS", "ENABLE_HIDE_COSMETIC_ABILITY", "ENABLE_HIDE_ABILITY_SUGGESTION", "ENABLE_CLEAN_STACKS"]`. Automatically activated if any of the toggles are true.
- **`onEnable()`**: Queries configuration keys and invokes `_apply()` to attach active CSS classes to the root `#Hud` panel.
- **`onDisable()`**: Removes all four CSS classes (`simplify_ability_icons_active`, `hide_cosmetic_ability_active`, `hide_ability_suggestion_active`, `clean_stacks_active`) from the root HUD panel.
- **`onSettingsChanged()`**: Immediately calls `_apply()` to synchronize class states with updated settings (0ms latency).
- **`test()`**: Checks whether the `#Hud` container is accessible in the current Panorama context.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panels**:
  - `#Hud` (resolved via `QOL.core.hud.findHud()` or `$.GetContextPanel()`): Target for root CSS class synchronization.
- **CSS Classes**:
  - `simplify_ability_icons_active`
  - `hide_cosmetic_ability_active`
  - `hide_ability_suggestion_active`
  - `clean_stacks_active`

### Engine Events & Polling Frequency
- **Polling Frequency**: Zero polling (0Hz). The feature operates strictly through CSS class switches.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: None (0ms CPU execution time).
- **Suppression**: None required; classes apply safely across all game modes without background processing.
- **Style Optimization**: Direct class manipulation via `QOL.core.hud.applyRootClasses` avoids expensive layout computations.
