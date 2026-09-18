# Adding A New Setting in QOLLOCK

This document is the standard checklist for adding a new configuration setting to QOLLOCK.

---

## The 5-Step Checklist

1. **Declare in Feature Manifest (`panorama/scripts/manifests/<feature_id>/manifest.js`)**
2. **Add Declarative Control in `panorama/scripts/ui/layout.js`**
3. **Add Localization Strings in `panorama/scripts/ui/theme.js`**
4. **Implement Reactive Handling in `manifest.js` (`onSettingsChanged`)**
5. **Verify with Full Test Suite (`npm test`)**

---

## Step 1: Declare in Manifest

Every setting belongs to an isolated feature manifest.
In `panorama/scripts/manifests/<feature_id>/manifest.js`:

```javascript
settings: [
    { key: "MY_SETTING_ENABLED", type: "toggle", default: true },
    { key: "MY_SETTING_SCALE",   type: "slider", min: 50, max: 150, step: 5, default: 100 },
    { key: "MY_SETTING_MODE",    type: "dropdown", default: "default", options: [
        { label: "#QOL_ModeDefault", value: "default" },
        { label: "#QOL_ModeCompact", value: "compact" }
    ]}
]
```

- Choose a safe default value that will not disrupt existing user setups.
- Settings declared in this array are automatically registered with `QOL.core.ConfigStore`.

---

## Step 2: Add to UI Layout (`panorama/scripts/ui/layout.js`)

QOLLOCK uses declarative layout definitions in `panorama/scripts/ui/layout.js`.
Locate the relevant tab (e.g. `hud`, `minimap`, `crosshair`, `items`, `gameplay`) and section:

### Standard Toggle:
```javascript
{
    key: "MY_SETTING_ENABLED",
    type: "toggle",
    label: "#QOL_MySetting",
    desc: "#QOL_MySetting_desc"
}
```

### Slider:
```javascript
{
    key: "MY_SETTING_SCALE",
    type: "slider",
    label: "#QOL_MySettingScale",
    desc: "#QOL_MySettingScale_desc",
    min: 50,
    max: 150,
    step: 5,
    unit: "%"
}
```

### Dropdown (Enum):
```javascript
{
    key: "MY_SETTING_MODE",
    type: "dropdown",
    label: "#QOL_MySettingMode",
    desc: "#QOL_MySettingMode_desc",
    options: [
        { value: "default", label: "#QOL_ModeDefault" },
        { value: "compact", label: "#QOL_ModeCompact" }
    ]
}
```

---

## Step 3: Add Localization (`panorama/scripts/ql_settings_loc/`)

Add readable English and Russian strings in `panorama/scripts/ql_settings_loc/ql_settings_loc_en.js` and `panorama/scripts/ql_settings_loc/ql_settings_loc_ru.js` (and any other supported languages as needed):

```javascript
"#QOL_MySetting": "Enable My Setting",
"#QOL_MySetting_desc": "Displays custom information overlay on screen.",
```

Descriptions and tooltips are displayed automatically when hovering rows in the Settings Window. Run `npm test` to verify dictionary integrity across all 15 supported locales. See `docs/LOCALIZATION.md` for translation tooling details.

---

## Step 4: Handle Setting Changes Reactively (`onSettingsChanged`)

Do **NOT** poll `ctx.config.get()` on every scheduler tick.
Instead, update visual state instantly inside `onSettingsChanged`:

```javascript
onSettingsChanged: (key, value, allSettings) => {
    if (key === "MY_SETTING_ENABLED") {
        _panel?.SetHasClass("Hidden", !value);
    } else if (key === "MY_SETTING_SCALE") {
        _updateScale(value);
    }
}
```

This guarantees 0ms response latency with zero CPU overhead while idle.

---

## Step 5: Verification

Run the test suite to ensure schema migration invariants, unit tests, and API contracts remain intact:

```bash
npm test
```
