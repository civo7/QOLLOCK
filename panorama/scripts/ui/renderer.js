// =============================================================================
// QOLLOCK — ui/renderer.js
// =============================================================================
// OWNS:        Declarative UI control factories:
//              createRow, createResetButton, createToggle, createCheckbox,
//              createSlider, createDropdown, createButtonGroup, createMultiToggle,
//              createPalette, createAction, createSeparator, createSpacer,
//              createSectionHeader, createSubsectionHeader,
//              createAnimatedInlineToggleSection, createControl.
// DOES NOT OWN: Tab routing, settings persistence, search indexing.
// DEPENDS ON:  core/ql_namespace.js (QOL.ui, QOL.core), core/ql_panel_helpers.js
// USED BY:     ui/window.js, ql_settings.js
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL) ||
        (typeof QOL !== "undefined" ? QOL : null);
    if (!Q) {
        $.Msg("[QOLLock] ui/renderer: QOL namespace missing — aborting.");
        return;
    }
    Q.ui = Q.ui || {};

    // =========================================================================
    // Core Panel & Localization Helpers
    // =========================================================================

    const isAlive = (panel) => {
        if (Q.core?.panel?.isAlive) return Q.core.panel.isAlive(panel);
        return !!(panel && typeof panel.IsValid === "function" && panel.IsValid());
    };

    const createPanel = (type, parent, id, props) => {
        if (!isAlive(parent)) return null;
        if (Q.core?.panel?.create) return Q.core.panel.create(type, parent, id, props);
        try {
            if (props) return $.CreatePanel(type, parent, id || "", props);
            return $.CreatePanel(type, parent, id || "");
        } catch (e) {
            $.Msg(`[QOLLock][WARN][Renderer] CreatePanel('${type}') failed: ${e?.message || e}`);
            return null;
        }
    };

    const localize = (text, keepRawIfMissing = false) => {
        if (!text) return "";
        if (typeof LocalizeSettingsText === "function") {
            return LocalizeSettingsText(text, keepRawIfMissing);
        }
        if (typeof $.Localize === "function") {
            const str = String(text);
            if (str.startsWith("#")) return $.Localize(str);
            return str;
        }
        return String(text);
    };

    const bindTooltip = (panel, description, perfImpact = "none") => {
        if (!isAlive(panel) || !description) return;
        const text = localize(description, true);
        if (Q.tooltip && typeof Q.tooltip.showRowTooltip === "function") {
            panel.SetPanelEvent("onmouseover", () => {
                Q.tooltip.cancelHide?.();
                Q.tooltip.showRowTooltip(panel, "", text, perfImpact, "");
            });
            panel.SetPanelEvent("onmouseout", () => {
                Q.tooltip.hideTooltipDeferred?.("ui_renderer_row_mouseout");
            });
        } else {
            panel.SetPanelEvent("onmouseover", () => {
                try { $.DispatchEvent("UIShowTextTooltip", panel, text); } catch (_) {}
            });
            panel.SetPanelEvent("onmouseout", () => {
                try { $.DispatchEvent("UIHideTextTooltip"); } catch (_) {}
            });
        }
    };

    const snapToStep = (val, step, min = -Infinity, max = Infinity) => {
        const num = Number(val);
        if (!isFinite(num)) return min;
        const s = Number(step) > 0 ? Number(step) : 1;
        const snapped = Math.round(num / s) * s;
        const clamped = Math.max(min, Math.min(max, snapped));
        const stepStr = String(s);
        const dot = stepStr.indexOf(".");
        if (dot !== -1) {
            const decimals = stepStr.length - dot - 1;
            return Number(clamped.toFixed(decimals));
        }
        return Math.round(clamped);
    };

    // =========================================================================
    // Dependent Settings Registry (dependsOn visibility tracking)
    // =========================================================================

    const _dependents = new Map();

    const registerDependent = (depKey, container, expected) => {
        if (!depKey || !container) return;
        let list = _dependents.get(depKey);
        if (!list) {
            list = new Set();
            _dependents.set(depKey, list);
        }
        list.add({ container, expected });
    };

    const updateDependents = (depKey, value) => {
        const list = _dependents.get(depKey);
        if (!list) return;
        for (const entry of list) {
            if (!isAlive(entry.container)) {
                list.delete(entry);
                continue;
            }
            const matches = (entry.expected === undefined) ? !!value : (value === entry.expected);
            entry.container.SetHasClass("Collapsed", !matches);
            try { entry.container.visible = matches; } catch (_) {}
        }
    };

    const clearDependents = () => {
        _dependents.clear();
    };

    // =========================================================================
    // Base Row Shell
    // =========================================================================

    const createRow = (parent, setting = {}) => {
        const row = createPanel("Panel", parent, "");
        if (!row) return null;
        row.AddClass("SettingRow");
        if (setting.key) {
            row.AddClass(`SettingRow_${String(setting.key).replace(/[^A-Za-z0-9_]/g, "_")}`);
        }
        if (setting.type) {
            const typeClassMap = {
                slider: "RowTypeSlider",
                angle_slider: "RowTypeSlider",
                toggle: "RowTypeToggle",
                checkbox: "RowTypeToggle",
                dropdown: "RowTypeDropDown",
                select: "RowTypeDropDown",
                buttongroup: "RowTypeButtonGroup",
                multitoggle: "RowTypeMultiToggle",
                palette: "RowTypePalette",
                action: "RowTypeAction",
                actionbutton: "RowTypeAction",
            };
            const cls = typeClassMap[setting.type];
            if (cls) row.AddClass(cls);
        }
        if (setting.className) {
            row.AddClass(setting.className);
        }

        const labelContainer = createPanel("Panel", row, "");
        if (labelContainer) {
            labelContainer.AddClass("LabelContainer");
        }

        let labelPanel = null;
        if (setting.label || setting.name || setting.key) {
            labelPanel = createPanel("Label", labelContainer || row, "");
            if (labelPanel) {
                labelPanel.AddClass("SettingLabel");
                labelPanel.text = localize(setting.label || setting.name || setting.key);
            }
        }

        const controlGroup = createPanel("Panel", row, "");
        if (controlGroup) {
            controlGroup.AddClass("SettingControlRoot");
        }

        if (setting.description) {
            bindTooltip(row, setting.description, setting.perfImpact);
        }

        return { row, labelContainer, label: labelPanel, controlGroup };
    };

    // =========================================================================
    // Reset Button (Inline ↺ icon)
    // =========================================================================

    const createResetButton = (parent, setting, currentValue, onChange, beforeReset) => {
        const def = setting.default;
        const button = createPanel("Button", parent, "");
        if (!button) return null;
        button.AddClass("SettingRowResetBtn");

        const icon = createPanel("Image", button, "", {
            src: "s2r://panorama/images/icons/icon_refresh.vsvg",
            defaultsrc: "",
            scaling: "contain",
        });
        if (icon) {
            icon.AddClass("SettingRowResetIcon");
            icon.AddClass("QOLResetIcon");
            try { icon.SetImage("s2r://panorama/images/icons/icon_refresh.vsvg"); } catch (_) {}
        }

        const updateNotDefault = (value) => {
            if (!isAlive(button)) return;
            const isChanged = (def !== undefined && value !== def);
            button.SetHasClass("NotDefault", isChanged);
            button.SetHasClass("Changed", isChanged);
        };
        updateNotDefault(currentValue);

        button.SetPanelEvent("onactivate", () => {
            if (typeof beforeReset === "function") {
                beforeReset(def);
            }
            if (typeof onChange === "function") {
                onChange(setting.key, def);
            }
            updateNotDefault(def);
        });

        return { button, updateNotDefault };
    };

    // =========================================================================
    // Toggle Switch (SwitchButton + Handle)
    // =========================================================================

    const createToggle = (parent, setting, currentValue, onChange, description) => {
        const rowObj = createRow(parent, { ...setting, type: "toggle", description });
        if (!rowObj) return null;
        const group = rowObj.controlGroup || rowObj.row;

        const invert = !!setting.invert;
        let value = (currentValue !== undefined) ? currentValue : (setting.default ?? false);
        let isActive = invert ? !value : !!value;

        const toggleBtn = createPanel("Panel", group, "");
        if (!toggleBtn) return null;
        toggleBtn.AddClass("SettingToggleBtn");

        const switchButton = createPanel("Button", toggleBtn, "");
        if (switchButton) switchButton.AddClass("SwitchButton");

        const handle = createPanel("Panel", switchButton || toggleBtn, "handle");
        if (handle) handle.AddClass("SettingToggleHandle");

        const paint = (active) => {
            toggleBtn.SetHasClass("ToggleActive", active);
            toggleBtn.SetHasClass("ToggleOn", active);
            toggleBtn.SetHasClass("ToggleOff", !active);
            toggleBtn.SetHasClass("Checked", active);
        };
        paint(isActive);

        const resetBtn = createResetButton(rowObj.labelContainer || group, setting, value, onChange, (def) => {
            value = def;
            isActive = invert ? !value : !!value;
            paint(isActive);
        });

        const activate = () => {
            isActive = !isActive;
            value = invert ? !isActive : isActive;
            paint(isActive);
            if (typeof onChange === "function") {
                onChange(setting.key, value);
            }
            if (resetBtn?.updateNotDefault) {
                resetBtn.updateNotDefault(value);
            }
            updateDependents(setting.key, value);
        };

        if (switchButton) {
            switchButton.SetPanelEvent("onactivate", activate);
        } else {
            toggleBtn.SetPanelEvent("onactivate", activate);
        }

        return {
            row: rowObj.row,
            button: toggleBtn,
            update: (nextVal) => {
                value = nextVal;
                isActive = invert ? !value : !!value;
                paint(isActive);
                resetBtn?.updateNotDefault(value);
            },
        };
    };

    // =========================================================================
    // Checkbox (ToggleButton + Label)
    // =========================================================================

    const createCheckbox = (parent, setting, currentValue, onChange, description) => {
        const rowObj = createRow(parent, { ...setting, type: "checkbox", description });
        if (!rowObj) return null;
        const group = rowObj.controlGroup || rowObj.row;

        let value = (currentValue !== undefined) ? currentValue : (setting.default ?? false);
        const invert = !!setting.invert;
        let isChecked = invert ? !value : !!value;

        const checkBtn = createPanel("ToggleButton", group, "");
        if (!checkBtn) return null;
        checkBtn.AddClass("CitadelSettingsCheckbox");
        checkBtn.AddClass("MultiCheckboxBtn");

        const checkLabel = createPanel("Label", checkBtn, "");
        if (checkLabel) {
            checkLabel.AddClass("MultiCheckboxLabel");
            checkLabel.text = localize(setting.checkboxLabel || setting.label || "");
        }

        const paint = (checked) => {
            try { checkBtn.SetSelected(checked); } catch (_) {}
            checkBtn.SetHasClass("selected", checked);
            checkBtn.SetHasClass("IsSelected", checked);
            checkBtn.SetHasClass("Active", checked);
        };
        paint(isChecked);

        const resetBtn = createResetButton(rowObj.labelContainer || group, setting, value, onChange, (def) => {
            value = def;
            isChecked = invert ? !value : !!value;
            paint(isChecked);
        });

        checkBtn.SetPanelEvent("onactivate", () => {
            isChecked = !isChecked;
            value = invert ? !isChecked : isChecked;
            paint(isChecked);
            if (typeof onChange === "function") {
                onChange(setting.key, value);
            }
            resetBtn?.updateNotDefault(value);
            updateDependents(setting.key, value);
        });

        return {
            row: rowObj.row,
            button: checkBtn,
            update: (nextVal) => {
                value = nextVal;
                isChecked = invert ? !value : !!value;
                paint(isChecked);
                resetBtn?.updateNotDefault(value);
            },
        };
    };

    // =========================================================================
    // Slider (Range Slider + TextEntry Input)
    // =========================================================================

    const createSlider = (parent, setting, currentValue, onChange, description) => {
        const rowObj = createRow(parent, { ...setting, type: "slider", description });
        if (!rowObj) return null;
        const group = rowObj.controlGroup || rowObj.row;

        const min = (typeof setting.min === "number") ? setting.min : 0;
        const max = (typeof setting.max === "number") ? setting.max : 100;
        const step = (typeof setting.step === "number" && setting.step > 0) ? setting.step : 1;
        let value = (typeof currentValue === "number") ? currentValue :
            ((typeof setting.default === "number") ? setting.default : min);

        const isFloat = (step < 1) || (max <= 5.0 && (setting.key?.includes("OPACITY") || setting.key?.includes("SCALE")));
        const isPercent = setting.unit === "%" || (isFloat && setting.key?.includes("OPACITY"));
        const isSeconds = setting.unit === "s" || setting.isSeconds;
        const isAngle = setting.unit === "°" || setting.isAngle || setting.type === "angle_slider";

        const stepStr = String(step);
        const dot = stepStr.indexOf(".");
        const decimals = dot !== -1 ? stepStr.length - dot - 1 : (isFloat ? 2 : 0);
        const scaleFactor = Math.pow(10, decimals);

        const formatValue = (v) => {
            const num = Number(v);
            if (!isFinite(num)) return "0";
            if (isPercent) return `${Math.round(Math.max(0, Math.min(1, num)) * 100)}%`;
            if (isSeconds) return `${Math.round(num)}s`;
            if (isAngle) return `${Math.round(num)}°`;
            if (decimals > 0) return num.toFixed(decimals);
            return String(Math.round(num));
        };

        const parseValue = (text) => {
            const raw = String(text || "").trim().replace(",", ".");
            if (!raw) return null;
            let parsed = parseFloat(raw);
            if (!isFinite(parsed)) return null;
            if (isPercent && (raw.includes("%") || parsed > 1)) {
                parsed = parsed / 100;
            }
            return snapToStep(parsed, step, min, max);
        };

        const sliderValueGroup = createPanel("Panel", group, "");
        if (sliderValueGroup) sliderValueGroup.AddClass("SliderValueGroup");

        const sliderContainer = createPanel("Panel", sliderValueGroup || group, "");
        if (sliderContainer) sliderContainer.AddClass("SliderContainer");

        const slider = createPanel("Slider", sliderContainer || sliderValueGroup || group, "", {
            direction: "horizontal",
        });
        if (!slider) return null;
        slider.AddClass("HorizontalSlider");

        try {
            slider.min = Math.round(min * scaleFactor);
            slider.max = Math.round(max * scaleFactor);
            slider.value = Math.round(value * scaleFactor);
            if (typeof slider.SetShowDefaultValue === "function") slider.SetShowDefaultValue(false);
            if (typeof slider.SetRequiresSelection === "function") slider.SetRequiresSelection(false);
        } catch (_) {}

        const valueInput = createPanel("TextEntry", sliderValueGroup || group, "");
        if (valueInput) {
            valueInput.AddClass("ValueInput");
            valueInput.text = formatValue(value);
        }

        let debounceTimer = null;
        const commitValue = (nextVal, immediate = false) => {
            const clamped = Math.max(min, Math.min(max, nextVal));
            value = snapToStep(clamped, step, min, max);
            if (valueInput) valueInput.text = formatValue(value);

            if (immediate) {
                if (debounceTimer !== null) {
                    try { $.CancelScheduled(debounceTimer); } catch (_) {}
                    debounceTimer = null;
                }
                if (typeof onChange === "function") onChange(setting.key, value);
                resetBtn?.updateNotDefault(value);
                updateDependents(setting.key, value);
                return;
            }

            if (debounceTimer !== null) {
                try { $.CancelScheduled(debounceTimer); } catch (_) {}
            }
            debounceTimer = $.Schedule(0.06, () => {
                debounceTimer = null;
                if (typeof onChange === "function") onChange(setting.key, value);
                resetBtn?.updateNotDefault(value);
                updateDependents(setting.key, value);
            });
        };

        slider.SetPanelEvent("onvaluechanged", () => {
            const desired = Number(slider.value) / scaleFactor;
            commitValue(desired, false);
        });

        if (valueInput) {
            valueInput.SetPanelEvent("oninputsubmit", () => {
                const parsed = parseValue(valueInput.text);
                if (parsed !== null) {
                    try { slider.value = Math.round(parsed * scaleFactor); } catch (_) {}
                    commitValue(parsed, true);
                    valueInput.AddClass("ValueSavedFlash");
                    $.Schedule(0.28, () => {
                        if (isAlive(valueInput)) valueInput.RemoveClass("ValueSavedFlash");
                    });
                } else {
                    valueInput.text = formatValue(value);
                }
            });

            valueInput.SetPanelEvent("onblur", () => {
                valueInput.text = formatValue(value);
            });
        }

        const resetBtn = createResetButton(rowObj.labelContainer || group, setting, value, onChange, (def) => {
            try { slider.value = Math.round(def * scaleFactor); } catch (_) {}
            commitValue(def, true);
        });

        return {
            row: rowObj.row,
            slider,
            input: valueInput,
            update: (nextVal) => {
                value = snapToStep(nextVal, step, min, max);
                try { slider.value = Math.round(value * scaleFactor); } catch (_) {}
                if (valueInput) valueInput.text = formatValue(value);
                resetBtn?.updateNotDefault(value);
            },
        };
    };

    // =========================================================================
    // Dropdown (DropDown with Custom Item Panels)
    // =========================================================================

    const createDropdown = (parent, setting, currentValue, onChange, description) => {
        const rowObj = createRow(parent, { ...setting, type: "dropdown", description });
        if (!rowObj) return null;
        const group = rowObj.controlGroup || rowObj.row;

        const options = Array.isArray(setting.options) ? setting.options : [];
        let value = (currentValue !== undefined) ? currentValue : (setting.default ?? options[0]?.value);

        const dropdown = createPanel("DropDown", group, `${setting.key || "dropdown"}_select`);
        if (!dropdown) return null;
        dropdown.AddClass("SettingsDropDown");
        dropdown.AddClass("QOLSettingsDropDown");

        const optionPanels = [];
        let selectedIndex = 0;

        options.forEach((opt, idx) => {
            const optId = `opt_${setting.key || "dd"}_${idx}`;
            const optLabel = createPanel("Label", dropdown, optId);
            if (!optLabel) return;
            optLabel.AddClass("QOLSettingsDropDownItem");
            optLabel.AddClass("DropDownChild");

            const labelText = opt.label !== undefined ? opt.label : String(opt.value);
            optLabel.text = setting.localizeOptions !== false ? localize(labelText) : labelText;

            if (opt.icon) {
                try {
                    optLabel.style.backgroundImage = `url("${opt.icon}")`;
                    optLabel.style.backgroundRepeat = "no-repeat";
                    optLabel.style.backgroundPosition = "10px 50%";
                    optLabel.style.backgroundSize = "18px 18px";
                } catch (_) {}
            }

            try { dropdown.AddOption(optLabel); } catch (_) {}
            optionPanels.push(optLabel);

            if (String(opt.value) === String(value)) {
                selectedIndex = idx;
            }
        });

        const selectIndex = (idx) => {
            const panel = optionPanels[idx];
            if (panel && isAlive(panel)) {
                try { dropdown.SetSelected(panel.id); } catch (_) {}
            }
        };
        selectIndex(selectedIndex);

        const resetBtn = createResetButton(rowObj.labelContainer || group, setting, value, onChange, (def) => {
            for (let i = 0; i < options.length; i++) {
                if (String(options[i].value) === String(def)) {
                    selectIndex(i);
                    value = options[i].value;
                    break;
                }
            }
        });

        dropdown.SetPanelEvent("oninputsubmit", () => {
            try {
                const sel = dropdown.GetSelected?.();
                if (sel) {
                    const idx = optionPanels.findIndex((p) => p.id === sel.id);
                    if (idx >= 0 && options[idx]) {
                        value = options[idx].value;
                        if (typeof onChange === "function") {
                            onChange(setting.key, value);
                        }
                        resetBtn?.updateNotDefault(value);
                        updateDependents(setting.key, value);
                    }
                }
            } catch (_) {}
        });

        return {
            row: rowObj.row,
            dropdown,
            update: (nextVal) => {
                value = nextVal;
                const idx = options.findIndex((o) => String(o.value) === String(value));
                if (idx >= 0) selectIndex(idx);
                resetBtn?.updateNotDefault(value);
            },
        };
    };

    // =========================================================================
    // Button Group (Segmented Buttons)
    // =========================================================================

    const createButtonGroup = (parent, setting, currentValue, onChange, description) => {
        const rowObj = createRow(parent, { ...setting, type: "buttongroup", description });
        if (!rowObj) return null;
        const group = rowObj.controlGroup || rowObj.row;

        const btnGroup = createPanel("Panel", group, "");
        if (!btnGroup) return null;
        btnGroup.AddClass("SettingButtonGroup");

        const options = Array.isArray(setting.options) ? setting.options : [];
        let value = (currentValue !== undefined) ? currentValue : (setting.default ?? options[0]?.value);

        const buttonPanels = [];
        const paint = () => {
            buttonPanels.forEach(({ btn, optValue }) => {
                if (isAlive(btn)) {
                    btn.SetHasClass("Active", String(optValue) === String(value));
                }
            });
        };

        const resetBtn = createResetButton(rowObj.labelContainer || group, setting, value, onChange, (def) => {
            value = def;
            paint();
        });

        options.forEach((opt) => {
            const btn = createPanel("Button", btnGroup, "");
            if (!btn) return;
            btn.AddClass("SegmentBtn");
            if (opt.className) btn.AddClass(opt.className);

            const lbl = createPanel("Label", btn, "");
            if (lbl) lbl.text = localize(opt.label !== undefined ? opt.label : String(opt.value));

            buttonPanels.push({ btn, optValue: opt.value });

            btn.SetPanelEvent("onactivate", () => {
                value = opt.value;
                paint();
                if (typeof onChange === "function") {
                    onChange(setting.key, value);
                }
                resetBtn?.updateNotDefault(value);
                updateDependents(setting.key, value);
            });
        });
        paint();

        return {
            row: rowObj.row,
            buttons: buttonPanels,
            update: (nextVal) => {
                value = nextVal;
                paint();
                resetBtn?.updateNotDefault(value);
            },
        };
    };

    // =========================================================================
    // Multi-Toggle (Row of Multiple Bitmask/Feature Checkboxes)
    // =========================================================================

    const createMultiToggle = (parent, setting, currentValues = {}, onChange, description) => {
        const rowObj = createRow(parent, { ...setting, type: "multitoggle", description });
        if (!rowObj) return null;
        const group = rowObj.controlGroup || rowObj.row;

        const multiGroup = createPanel("Panel", group, "");
        if (!multiGroup) return null;
        multiGroup.AddClass("SettingButtonGroup");
        multiGroup.AddClass("MultiCheckboxGroup");

        const options = Array.isArray(setting.options) ? setting.options : [];
        const itemButtons = [];

        options.forEach((opt) => {
            const key = opt.key;
            if (!key) return;
            const btn = createPanel("ToggleButton", multiGroup, "");
            if (!btn) return;
            btn.AddClass("CitadelSettingsCheckbox");
            btn.AddClass("MultiCheckboxBtn");

            const lbl = createPanel("Label", btn, "");
            if (lbl) {
                lbl.AddClass("MultiCheckboxLabel");
                lbl.text = localize(opt.label || key);
            }

            let isActive = Number(currentValues[key]) === 1;
            const paint = () => {
                try { btn.SetSelected(isActive); } catch (_) {}
                btn.SetHasClass("selected", isActive);
                btn.SetHasClass("IsSelected", isActive);
                btn.SetHasClass("Active", isActive);
            };
            paint();

            btn.SetPanelEvent("onactivate", () => {
                isActive = !isActive;
                paint();
                if (typeof onChange === "function") {
                    onChange(key, isActive ? 1 : 0);
                }
                updateDependents(key, isActive ? 1 : 0);
            });

            itemButtons.push({ key, btn, update: (val) => { isActive = (Number(val) === 1); paint(); } });
        });

        return {
            row: rowObj.row,
            items: itemButtons,
            update: (key, val) => {
                const item = itemButtons.find((it) => it.key === key);
                item?.update(val);
            },
        };
    };

    // =========================================================================
    // Palette (Color Swatch Picker Grid)
    // =========================================================================

    const createPalette = (parent, setting, currentValue, onChange, description) => {
        const rowObj = createRow(parent, { ...setting, type: "palette", description });
        if (!rowObj) return null;
        const group = rowObj.controlGroup || rowObj.row;

        const paletteGroup = createPanel("Panel", group, "");
        if (!paletteGroup) return null;
        paletteGroup.AddClass("PalettePickerGroup");

        const options = Array.isArray(setting.options) ? setting.options : [];
        let value = Number(currentValue) || 0;

        const swatches = [];
        let swatchRow = null;

        const paint = () => {
            swatches.forEach(({ swatch, optValue }) => {
                if (isAlive(swatch)) {
                    swatch.SetHasClass("Active", optValue === value);
                }
            });
        };

        const resetBtn = createResetButton(rowObj.labelContainer || group, setting, value, onChange, (def) => {
            value = Number(def) || 0;
            paint();
        });

        options.forEach((opt, idx) => {
            if (!swatchRow || idx % 10 === 0) {
                swatchRow = createPanel("Panel", paletteGroup, "");
                if (swatchRow) swatchRow.AddClass("PalettePickerSwatchRow");
            }

            const swatch = createPanel("Button", swatchRow || paletteGroup, "");
            if (!swatch) return;
            swatch.AddClass("PalettePickerSwatch");
            if (Number(opt.value) === 0) swatch.AddClass("PalettePickerSwatchDefault");

            const chip = createPanel("Panel", swatch, "");
            if (chip) {
                chip.AddClass("PalettePickerSwatchChip");
                if (opt.hex) {
                    try {
                        chip.style.backgroundColor = String(opt.hex);
                        chip.style.border = "1px solid rgba(255, 255, 255, 0.28)";
                    } catch (_) {}
                } else {
                    chip.AddClass("PalettePickerSwatchChipDefault");
                }
            }

            const activeDot = createPanel("Panel", swatch, "");
            if (activeDot) activeDot.AddClass("PalettePickerSwatchActiveDot");

            swatches.push({ swatch, optValue: Number(opt.value) });

            if (opt.label || opt.hex) {
                const tooltipText = `${localize(opt.label || "Color")}${opt.hex ? " - " + opt.hex : ""}`;
                swatch.SetPanelEvent("onmouseover", () => {
                    try { $.DispatchEvent("UIShowTextTooltip", swatch, tooltipText); } catch (_) {}
                });
                swatch.SetPanelEvent("onmouseout", () => {
                    try { $.DispatchEvent("UIHideTextTooltip"); } catch (_) {}
                });
            }

            swatch.SetPanelEvent("onactivate", () => {
                value = Number(opt.value);
                paint();
                if (typeof onChange === "function") {
                    onChange(setting.key, value);
                }
                resetBtn?.updateNotDefault(value);
            });
        });
        paint();

        return {
            row: rowObj.row,
            swatches,
            update: (nextVal) => {
                value = Number(nextVal) || 0;
                paint();
                resetBtn?.updateNotDefault(value);
            },
        };
    };

    // =========================================================================
    // Action Button (Standalone Click Trigger)
    // =========================================================================

    const createAction = (parent, setting, onActivate, description) => {
        const rowObj = createRow(parent, { ...setting, type: "action", description });
        if (!rowObj) return null;
        const group = rowObj.controlGroup || rowObj.row;

        const actionGroup = createPanel("Panel", group, "");
        if (actionGroup) actionGroup.AddClass("SettingActionGroup");

        const btn = createPanel("Button", actionGroup || group, "");
        if (!btn) return null;
        btn.AddClass("SettingActionBtn");
        if (setting.className) btn.AddClass(setting.className);

        const inner = createPanel("Panel", btn, "");
        if (inner) inner.AddClass("SettingActionBtnInner");

        if (setting.icon) {
            const icon = createPanel("Image", inner || btn, "", {
                src: setting.icon,
                defaultsrc: "",
                scaling: "contain",
            });
            if (icon) icon.AddClass("SettingActionBtnIcon");
        }

        const lbl = createPanel("Label", inner || btn, "");
        if (lbl) {
            lbl.AddClass("SettingActionBtnLabel");
            lbl.text = localize(setting.buttonLabel || setting.label || "Action");
        }

        btn.SetPanelEvent("onactivate", () => {
            if (typeof onActivate === "function") {
                onActivate(setting.key);
            }
            btn.AddClass("SuccessState");
            $.Schedule(0.28, () => {
                if (isAlive(btn)) btn.RemoveClass("SuccessState");
            });
        });

        return { row: rowObj.row, button: btn };
    };

    // =========================================================================
    // Separators & Spacers
    // =========================================================================

    const createSeparator = (parent) => {
        const sep = createPanel("Panel", parent, "");
        if (sep) sep.AddClass("RowSeparator");
        return sep;
    };

    const createSpacer = (parent, heightPx = 8) => {
        const sp = createPanel("Panel", parent, "");
        if (sp) {
            sp.AddClass("SettingSpacer");
            try { sp.style.height = `${heightPx}px`; } catch (_) {}
        }
        return sp;
    };

    // =========================================================================
    // Section Header
    // =========================================================================

    const createSectionHeader = (parent, title, options = {}) => {
        const titleRow = createPanel("Panel", parent, "");
        if (!titleRow) return null;
        titleRow.AddClass("SectionTitleRow");
        titleRow.AddClass("SectionTitleStaticRow");

        const titleHead = createPanel("Panel", titleRow, "");
        if (titleHead) titleHead.AddClass("SectionTitleInlineHead");

        const titleLabel = createPanel("Label", titleHead || titleRow, "");
        if (titleLabel) {
            titleLabel.AddClass("SectionTitle");
            titleLabel.AddClass("SectionTitleInlineLabel");
            titleLabel.text = localize(title);
        }

        if (typeof options.onReset === "function") {
            const resetBtn = createPanel("Button", titleHead || titleRow, "");
            if (resetBtn) {
                resetBtn.AddClass("SectionTitleActionBtn");
                resetBtn.AddClass("SettingRowResetBtn");
                const icon = createPanel("Image", resetBtn, "", {
                    src: "s2r://panorama/images/icons/icon_refresh.vsvg",
                    defaultsrc: "",
                    scaling: "contain",
                });
                if (icon) {
                    icon.AddClass("SettingRowResetIcon");
                    icon.AddClass("QOLResetIcon");
                }
                resetBtn.SetPanelEvent("onactivate", options.onReset);
            }
        }

        return { row: titleRow, label: titleLabel };
    };

    // =========================================================================
    // Subsection Header (Accordion Disclosure)
    // =========================================================================

    const createSubsectionHeader = (parent, title, initialEnabled = false, onToggle) => {
        let expanded = !!initialEnabled;

        const header = createPanel("Button", parent, "");
        if (!header) return null;
        header.AddClass("QOLCollapsibleSubHeader");

        const chevron = createPanel("Panel", header, "");
        if (chevron) chevron.AddClass("QOLCollapsibleSubChevron");

        const headLabel = createPanel("Label", header, "");
        if (headLabel) {
            headLabel.AddClass("QOLCollapsibleSubLabel");
            headLabel.text = localize(title);
        }

        const body = createPanel("Panel", parent, "");
        if (body) {
            body.AddClass("SettingsSectionBody");
            body.SetHasClass("Collapsed", !expanded);
        }

        const paint = () => {
            header.SetHasClass("Expanded", expanded);
            if (body && isAlive(body)) {
                body.SetHasClass("Collapsed", !expanded);
            }
        };
        paint();

        header.SetPanelEvent("onactivate", () => {
            expanded = !expanded;
            paint();
            if (typeof onToggle === "function") onToggle(expanded);
        });

        return {
            header,
            body,
            toggle: (open) => {
                expanded = (open !== undefined) ? !!open : !expanded;
                paint();
            },
        };
    };

    // =========================================================================
    // Animated Inline Toggle Section
    // =========================================================================

    const createAnimatedInlineToggleSection = (parent, title, enableSetting, currentValue, onChange, buildRowsFn) => {
        let enabled = (currentValue !== undefined) ? !!currentValue : (enableSetting.default ?? false);

        const safeId = String(title || "Section").replace(/[^A-Za-z0-9]/g, "");
        const titleRow = createPanel("Panel", parent, `${safeId}SectionTitleRow`);
        if (!titleRow) return null;
        titleRow.AddClass("SectionTitleRow");

        const titleHead = createPanel("Panel", titleRow, `${safeId}SectionTitleHead`);
        if (titleHead) titleHead.AddClass("SectionTitleInlineHead");

        const titleLabel = createPanel("Label", titleHead || titleRow, `${safeId}SectionTitle`);
        if (titleLabel) {
            titleLabel.AddClass("SectionTitle");
            titleLabel.AddClass("SectionTitleInlineLabel");
            titleLabel.text = localize(title);
        }

        const body = createPanel("Panel", parent, `${safeId}SectionBody`);
        if (body) body.AddClass("SettingsSectionBody");

        const toggleBtn = createPanel("Panel", titleRow, `${safeId}SectionToggle`);
        if (toggleBtn) toggleBtn.AddClass("SectionInlineToggleBtn");

        const switchButton = createPanel("Button", toggleBtn || titleRow, `${safeId}SectionToggleButton`);
        if (switchButton) switchButton.AddClass("SwitchButton");

        const handle = createPanel("Panel", switchButton || toggleBtn, "handle");
        if (handle) handle.AddClass("SectionInlineToggleHandle");

        let animToken = 0;
        const applyState = (nextEnabled, animate = true) => {
            enabled = nextEnabled;
            animToken++;
            const token = animToken;

            if (toggleBtn && isAlive(toggleBtn)) {
                toggleBtn.SetHasClass("Active", enabled);
                toggleBtn.SetHasClass("ToggleOn", enabled);
                toggleBtn.SetHasClass("ToggleOff", !enabled);
            }

            if (!body || !isAlive(body)) return;

            if (!animate) {
                body.SetHasClass("ShowPrep", false);
                body.SetHasClass("Hiding", false);
                body.SetHasClass("Collapsed", !enabled);
                body.hittest = enabled;
                body.hittestchildren = enabled;
                return;
            }

            if (enabled) {
                body.SetHasClass("Collapsed", false);
                body.SetHasClass("Hiding", false);
                body.SetHasClass("ShowPrep", true);
                body.hittest = true;
                body.hittestchildren = true;
                $.Schedule(0.01, () => {
                    if (!isAlive(body) || animToken !== token) return;
                    body.SetHasClass("ShowPrep", false);
                });
            } else {
                body.SetHasClass("Collapsed", false);
                body.SetHasClass("ShowPrep", false);
                body.SetHasClass("Hiding", true);
                body.hittest = false;
                body.hittestchildren = false;
                $.Schedule(0.17, () => {
                    if (!isAlive(body) || animToken !== token) return;
                    body.SetHasClass("Hiding", false);
                    body.SetHasClass("Collapsed", true);
                });
            }
        };
        applyState(enabled, false);

        const activate = () => {
            const next = !enabled;
            applyState(next, true);
            if (typeof onChange === "function") {
                onChange(enableSetting.key, next);
            }
            updateDependents(enableSetting.key, next);
        };

        if (switchButton) {
            switchButton.SetPanelEvent("onactivate", activate);
        } else if (toggleBtn) {
            toggleBtn.SetPanelEvent("onactivate", activate);
        }

        if (body && typeof buildRowsFn === "function") {
            buildRowsFn(body);
        }

        return { row: titleRow, body, applyState };
    };

    // =========================================================================
    // Unified Control Factory Dispatcher
    // =========================================================================

    const createControl = (parent, setting, currentValue, onChange, options = {}) => {
        if (!setting || !setting.type) return null;

        let targetParent = parent;
        let depContainer = null;

        if (setting.dependsOn?.key) {
            depContainer = createPanel("Panel", parent, "");
            if (depContainer) {
                try {
                    depContainer.style.width = "100%";
                    depContainer.style.flowChildren = "down";
                } catch (_) {}
                depContainer.AddClass("QOLDependent");
                targetParent = depContainer;
            }
        }

        let result = null;
        switch (setting.type) {
            case "toggle":
                result = createToggle(targetParent, setting, currentValue, onChange, setting.description);
                break;
            case "checkbox":
                result = createCheckbox(targetParent, setting, currentValue, onChange, setting.description);
                break;
            case "slider":
            case "angle_slider":
                result = createSlider(targetParent, setting, currentValue, onChange, setting.description);
                break;
            case "dropdown":
            case "select":
                result = createDropdown(targetParent, setting, currentValue, onChange, setting.description);
                break;
            case "buttongroup":
                result = createButtonGroup(targetParent, setting, currentValue, onChange, setting.description);
                break;
            case "multitoggle":
                result = createMultiToggle(targetParent, setting, currentValue, onChange, setting.description);
                break;
            case "palette":
                result = createPalette(targetParent, setting, currentValue, onChange, setting.description);
                break;
            case "action":
            case "actionbutton":
                result = createAction(targetParent, setting, options.onActivate || onChange, setting.description);
                break;
            case "separator":
                result = createSeparator(targetParent);
                break;
            case "spacer":
                result = createSpacer(targetParent, setting.height);
                break;
            default:
                $.Msg(`[QOLLock][WARN][Renderer] Unknown control type '${setting.type}' for key '${setting.key}'`);
                break;
        }

        if (depContainer && setting.dependsOn?.key) {
            const dep = setting.dependsOn;
            registerDependent(dep.key, depContainer, dep.value);
            const parentVal = options.getDependencyValue?.(dep.key);
            const initialMatches = (dep.value === undefined) ? !!parentVal : (parentVal === dep.value);
            depContainer.SetHasClass("Collapsed", !initialMatches);
            try { depContainer.visible = initialMatches; } catch (_) {}
        }

        return result;
    };

    // =========================================================================
    // Export API onto QOL.ui.renderer
    // =========================================================================

    const renderer = {
        createRow,
        createResetButton,
        createToggle,
        createCheckbox,
        createSlider,
        createDropdown,
        createButtonGroup,
        createMultiToggle,
        createPalette,
        createAction,
        createSeparator,
        createSpacer,
        createSectionHeader,
        createSubsectionHeader,
        createAnimatedInlineToggleSection,
        createControl,
        registerDependent,
        updateDependents,
        clearDependents,
        snapToStep,
        localize,
    };

    Q.ui.renderer = renderer;
    $.Msg("[QOLLock] ui/renderer: declarative UI renderer ready.");
})();
