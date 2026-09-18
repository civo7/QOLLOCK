# `panorama/scripts/manifests/ql_nicknames` (Top Bar Player Nicknames)

## Description
Enables always-visible player nicknames on hero portraits across the Deadlock Top Bar. By default, Deadlock conceals player names unless inspecting portraits; this feature activates the native `{s:player_name}` layout binding in `citadel_hud_top_bar_player.xml` via CSS class gating, allowing players to instantly identify teammates and opponents without checking the full scoreboard.

## Files
- Manifest: `panorama/scripts/manifests/ql_nicknames/manifest.js`
- Styles: `panorama/styles/citadel_hud_top_bar.css` (rules for `.nicknames_active .AlwaysPlayerName`)

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_NICKNAMES` | `toggle` | `false` | Master toggle to display persistent player nicknames over Top Bar portraits. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Invokes `_apply(true)` to add the `nicknames_active` CSS class to the context root, `#Hud`, and `#TopBar`.
- **`onDisable()`**: Invokes `_apply(false)` to strip the `nicknames_active` CSS class from the context root, `#Hud`, and `#TopBar`.
- **`onSettingsChanged()`**: Synchronizes the class presence immediately according to the boolean/numeric evaluation of `ENABLE_NICKNAMES`.
- **`test()`**: Traverses from the context root to verify the presence of the native `#TopBar` container.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panels**:
  - `$.GetContextPanel()`: Receives class `nicknames_active`.
  - `#Hud` (resolved via `QOL.ui.PanelHelpers.findHud()`): Receives class `nicknames_active`.
  - `#TopBar` (child of `#Hud`): Receives class `nicknames_active`.

### Engine Events & Polling Frequency
- **Polling Frequency**: Zero polling (0Hz). The feature relies completely on reactive state gating.
- **Engine Events**: None required; state is pushed reactively on configuration change.

### Performance Tier & Caveats
- **Performance Tier**: None (`0ms` runtime impact). Pure CSS class gating.
- **Suppression**: None required; classes apply safely across both Hideout and active match contexts without performance overhead.
- **Style Optimization**: Direct class manipulation (`SetHasClass`) ensures zero continuous layout recalculations.
