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

## 4. Declarative vs Custom Tabs

- **Declarative Tabs (`sections: [...]`)**:
  Rendered automatically by `window.js` (`renderLayoutTab`) via `renderer.js`. Reads setting definitions directly from the corresponding feature manifests.
  If a section has `animatedToggle: true` and `enableKey: "..."`, the inner setting matching `enableKey` is automatically suppressed from the section body to prevent duplicate toggle rows.
- **Custom Tabs (`custom: true`)**:
  Tabs that require dedicated custom canvases or complex multi-pane widgets (such as `Presets`, `Console`, `Arcade`, `Support`, `Audio`) are marked `custom: true` and defer to their registered custom renderers (`_tabRenderers`).
