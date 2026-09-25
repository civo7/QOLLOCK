# Settings Tabs & Declarative Layout Architecture

QOLLOCK settings window employs a unified, declarative layout system centered around `panorama/scripts/ui/layout.js`.

---

## 1. Single Source of Truth (`Q.ui.layout`)

All tabs, sidebar groupings, sections, and feature placements are declared in:
`panorama/scripts/ui/layout.js`

```javascript
Q.ui.layout = [
    // ── Group Heading ──
    { heading: "General" },
    {
        id: "Support",
        name: "Support",
        icon: "s2r://panorama/images/icons/icon_thumbsup.vsvg",
        custom: true
    },
    {
        id: "Config",
        name: "Settings",
        icon: "s2r://panorama/images/icons/icon_gear.vsvg",
        sections: [
            {
                title: "Display & Screen",
                features: ["ql_ui_controls"]
            }
        ]
    },
    // ── Group Heading ──
    { heading: "Gameplay" },
    {
        id: "Crosshair",
        name: "Crosshair",
        icon: "s2r://panorama/images/icons/properties/range_aoe.vsvg",
        sections: [
            {
                title: "Item Cooldowns",
                animatedToggle: true,
                enableKey: "ENABLE_PASSIVE_COOLDOWN",
                description: "Tracked cooldowns near crosshair",
                features: ["ql_passive_cooldown", { id: "ql_item_mirror", hideToggle: true }]
            }
        ]
    }
];
```

---

## 2. Dynamic Tab Derivation (`ql_settings_tabs.js`)

`panorama/scripts/ui/ql_settings_tabs.js` dynamically inspects `Q.ui.layout` at runtime:
- `GetSettingsTabOrder()`: Returns array of tab IDs in the order they appear in `Q.ui.layout`.
- `GetSettingsTabGroups()`: Groups tabs into titled sections based on `{ heading: "..." }` entries.
- `GetSettingsTabDisplayName(tabId)`: Resolves tab display title.
- `GetSettingsTabIconSource(tabId)`: Resolves tab icon SVG path.

If `Q.ui.layout` is not yet loaded (e.g. isolated test harness), it gracefully falls back to canonical defaults.

### Canonical Tab Hierarchy
- **General**: Support, Settings (`Config`), Presets, Console, Arcade
- **Gameplay**: Crosshair, Healthbar, HUD, Overlay, Minimap, Shop, Audio

---

## 3. How to Move, Reorder, or Add Tabs

Because layout is purely declarative:

1. **Reorder tabs in the sidebar:**
   Move the tab object up or down within `Q.ui.layout` in `panorama/scripts/ui/layout.js`.
2. **Move a tab to a different group:**
   Move the tab object above or below a `{ heading: "..." }` line.
3. **Move a feature between tabs:**
   Move the feature ID string (e.g. `"ql_stamina"`) from one section's `features` array to another.
4. **Create a new tab:**
   Add a new object `{ id: "MyTab", name: "My Tab", icon: "...", sections: [...] }` to `Q.ui.layout`.
   The window manager and tab bar automatically detect the new tab and render it with zero imperative boilerplate.

---

## 4. Tab Content Rendering Architecture

- **Registered Tab Renderers (`_tabRenderers`) Take Precedence**:
  Because feature manifests are loaded strictly in `hud.xml` (the match HUD realm) and are **not** present in `hud_escape_menu.xml` (the settings menu realm), settings tabs in the escape menu cannot dynamically inspect `FeatureRegistry.getManifest()`.
  Instead, tabs rely on dedicated, high-fidelity renderers registered with `Q.ui.window.registerTabRenderer(tabId, renderFn)`:
  - `QOL.ui.gameplayTabs` (`ui/gameplay_tabs.js`): Renders Crosshair, Healthbar, HUD, Minimap, Shop, UI, Overlay.
  - `QOL.ui.presets` (`ui/presets.js`): Renders Presets tab.
  - `QOL.ui.configTab` (`ui/config_tab.js`): Renders Settings (Config) tab.
  - `QOL.ui.support` (`ui/support.js`): Renders Support tab.
  - `QOL.ui.audio` (`ui/audio.js`): Renders Audio tab.
  - `QOL.ui.console` (`ui/console_tab.js`): Renders Console tab.
  - `QOL.ui.arcade` (`ui/arcade_tab.js`): Renders Arcade tab.

- **Declarative Fallback (`renderLayoutTab`)**:
  If a tab does not register a custom renderer in `_tabRenderers`, `window.js` falls back to `renderLayoutTab(tabId, container)` to render any sections and manifests declared in `Q.ui.layout`.
  When a section declares `animatedToggle: true` and `enableKey: "..."`, the setting matching `enableKey` is automatically suppressed from the section body to prevent duplicate toggle rows.

---

## 5. Window Action Controls

- **Window Close Semantics (`forceCloseModSettings`)**:
  Closing the settings window (via the header close button 'X' or ESC handling) toggles the visibility of the `SettingsWindow` panel without dispatching `CitadelResumePlaying`. This ensures that closing the QOLLOCK settings window preserves Deadlock's native Escape Menu rather than dismissing the pause state.

