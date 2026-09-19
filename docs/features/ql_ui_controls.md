# `panorama/scripts/manifests/ql_ui_controls` (General UI Controls & Aspect Ratio Support)

## Description
A centralized collection of global interface refinements, aspect ratio compatibility adjustments, and menu layout reorganizations. Through reactive HUD root class gating, it provides:
- Tailored HUD positioning offsets for non-standard aspect ratios (16:10, 4:3, and 21:9 ultrawide streaming fix).
- Centered layouts for the Escape Menu and Friends List.
- Sandbox testing tools override controls (forcibly showing or hiding hero testing palettes).
- Suppression of disciplinary Behavior Summary notification dialogues.
- Legacy ability cooldown duration indicators.

## Files
- Manifest: `panorama/scripts/manifests/ql_ui_controls/manifest.js`
- Styles: `panorama/styles/hud_escape_menu.css`, `panorama/styles/qollock_global.css`

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `SUPPORT_16_10` | `toggle` | `false` | Shifts HUD elements for proper alignment on 16:10 displays. |
| `SUPPORT_4_3` | `toggle` | `false` | Shifts HUD elements for proper alignment on 4:3 stretched displays. |
| `ENABLE_HUD_SHIFT` | `toggle` | `false` | 21:9 streaming fix; adjusts HUD bounds to prevent cropping on 16:9 stream outputs. |
| `ENABLE_CENTER_ESC` | `toggle` | `false` | Centers options and buttons within the Escape Menu for quicker access. |
| `ENABLE_CENTER_FRIENDS_LIST` | `toggle` | `false` | Centers the friends list container within the Escape Menu. |
| `ENABLE_FORCE_TESTING_TOOLS` | `toggle` | `false` | Forcibly reveals developer/sandbox testing tools in all gameplay environments. |
| `ENABLE_HIDE_TESTING_TOOLS` | `toggle` | `false` | Forcibly suppresses testing tools from the screen. |
| `ENABLE_HIDE_BEHAVIOR_SUMMARY`| `toggle` | `false` | Inverted toggle to suppress the penalty behavior summary pop-up dialog. |
| `ENABLE_LEGACY_COOLDOWNS` | `toggle` | `false` | Render cooldown durations on ability icons matching legacy Deadlock UI. |
| `ENABLE_UPDATE_CHECKER` | `toggle` | `true` | Checks for new public QOLLOCK releases upon opening the settings menu. |

*Note: Enabled by default (`enabledByDefault: true`).*

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Calls `_apply()` to dispatch setting values to `QOL.core.hud.applyRootClasses()`.
- **`onDisable()`**: Removes all active class flags (`support_16_10_active`, `support_4_3_active`, `hud_shift_active`, `center_esc_active`, `center_friends_list_active`, `force_testing_tools_active`, `hide_testing_tools_active`, `hide_behavior_summary_active`) from the root HUD panel.
- **`onSettingsChanged()`**: Synchronously reapplies root class configurations.
- **`test()`**: Verifies that the manifest is correctly identified in the feature registry.

### DOM Injection & Target Panels
- **DOM Creation**: Zero DOM elements created.
- **Target Panel**: `#Hud` / Context panel.
- **Classes Managed**:
  - `support_16_10_active`
  - `support_4_3_active`
  - `hud_shift_active`
  - `center_esc_active`
  - `center_friends_list_active`
  - `force_testing_tools_active`
  - `hide_testing_tools_active`
  - `hide_behavior_summary_active`

### Engine Events & Polling Frequency
- **Polling Frequency**: Zero polling (0Hz). The feature is purely reactive to configuration dispatches.
- **Engine Events**: None hooked.

### Performance Tier & Caveats
- **Performance Tier**: None (`0ms` runtime impact).
- **CSS-Driven Architecture**: All visual modifications, layout reflows, and element repositioning are delegated entirely to hardware-accelerated Source 2 CSS stylesheets without script-side polling loops.
