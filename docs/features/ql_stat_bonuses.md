# `panorama/scripts/manifests/ql_stat_bonuses` (Stat Bonuses Overlay)

## Description
Tracks and displays total passive attribute bonuses accumulated from Golden Statues and Boons across six core combat statistics:
- Fire Rate
- Ability Cooldown %
- Spirit Power
- Clip Size %
- Weapon Damage %
- Max Health

The feature creates an unobtrusive on-screen HUD widget by extracting Golden Statue values directly from the hero stat breakdown tooltip (`StatsBreakdownContainer`) or by calculating derived bonus values (`Modified - Base - Mods - Scaling`). Zero-value stats are visually dimmed (`is_zero`) to maintain clutter-free situational awareness.

## Files
- Manifest: `panorama/scripts/manifests/ql_stat_bonuses/manifest.js`
- Styles: `panorama/styles/features/ql_feat_stat_bonuses.css` (defines rules for `#QOLStatBonusesOverlay`, `.QOLStatBonusesLine`, and `.is_zero`)

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_STAT_BONUSES` | `toggle` | `false` | Master toggle to display the Golden Statues bonus overlay. |
| `STAT_BONUSES_SCALE` | `slider` | `100` | UI scale percentage for the overlay panel (range: 50% to 200%). |
| `STAT_BONUSES_X_OFFSET` | `slider` | `0` | Horizontal pixel offset from the base anchor (range: -1000px to +1000px). |
| `STAT_BONUSES_Y_OFFSET` | `slider` | `0` | Vertical pixel offset upward from the bottom (range: 0px to 1000px). |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Spawns a 5Hz (`0.2s` interval) polling loop via `QOL.core.Scheduler.createPollLoop(_tick, 0.2, "ql_stat_bonuses")`.
- **`onDisable()`**: Halts the poll loop, deletes `_overlay` (`QOLStatBonusesOverlay`) via `DeleteAsync(0)`, clears label caches, and resets layout signatures.
- **`onSettingsChanged()`**: Clears `_lastLayoutSig` and triggers an immediate `_tick()` to refresh layout scales and offsets.
- **`test()`**: Verifies that the native `#gameplay_hud` anchor panel exists.

### DOM Injection & Target Panels
- **Parent Container**: Injected under `#gameplay_hud`.
- **Injected Panels**:
  - `Panel#QOLStatBonusesOverlay.QOLStatBonusesOverlay`: Container panel configured with `hittest = false` and `hittestchildren = false`.
  - `Label#QOLStatBonusesTitle`: Header label ("Stat Bonuses").
  - `Label#QOLStatBonusesFireRate`, `QOLStatBonusesAbilityCooldown`, `QOLStatBonusesSpiritPower`, `QOLStatBonusesClipSize`, `QOLStatBonusesWeaponDamage`, `QOLStatBonusesMaxHealth`: Six individual stat lines with class `.QOLStatBonusesLine`.
- **Data Source Containers**:
  - `StatContainer_*` panels (e.g. `StatContainer_FireRate`, `StatContainer_TechPower`, `StatContainer_MaxHealth`).
  - Active tooltip breakdown panel: `#StatsBreakdownContainer`.

### Engine Events & Polling Frequency
- **Polling Frequency**: 5Hz (`0.2s` interval).
- **Tooltip Harvesting**: Scans for active shop stat breakdown tooltips every 250ms (`STAT_BONUSES_TOOLTIP_SCAN_MS`).
- **Exponential Backoff**: When stat containers are not yet spawned in the DOM, lookup retries back off from 500ms up to 8000ms (`STAT_BONUSES_SOURCE_SEARCH_MAX_MS`).

### Performance Tier & Caveats
- **Performance Tier**: Low-to-Medium.
- **Suppression**: Suppressed when inside the Hideout / Sandbox lobby.
- **Style Optimization**: Transforms and offsets are guarded by `_lastLayoutSig` (`scale|xOffset|yOffset`), ensuring zero style mutation passes when position is static.
- **Label Text Diffing**: Label text updates check `_lastValues[key]` before assigning `lbl.text`, eliminating redundant Panorama layout reflows.
