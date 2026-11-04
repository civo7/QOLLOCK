// Exact field controls for one selection. Rebuilt only when selection changes.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const P = Q.core.panel;
    let nextBuild = 0;
    const localize = text => Q.ui.theme.LocalizeSettingsText(text, true);
    const label = (parent, text, role = "ModalInstructions", id = "") => {
        const panel = P.create("Label", parent, id);
        panel.hittest = false;
        panel.AddClass(role);
        panel.text = localize(text);
        return panel;
    };
    function button(parent, id, text, action, primary = false) {
        const panel = P.create("Button", parent, id);
        panel.hittest = true;
        panel.hittestchildren = false;
        panel.AddClass("QOLCustomizeButton");
        panel.AddClass(primary ? "QOLUnifiedModalPrimary" : "QOLUnifiedModalSecondary");
        label(panel, text, "QOLCustomizeButtonLabel");
        panel.SetPanelEvent("onactivate", () => { if (P.isAlive(panel)) action(); });
        return panel;
    }
    function setActive(panel, active) {
        panel.SetHasClass("Active", active);
        panel.SetHasClass("QOLUnifiedModalPrimary", active);
        panel.SetHasClass("QOLUnifiedModalSecondary", !active);
    }
    function build(parent, element, session, changed, paletteHost = parent, geometrySource = null) {
        parent.RemoveAndDeleteChildren();
        const generation = ++nextBuild;
        const docked = paletteHost !== parent;
        if (docked) {
            paletteHost.RemoveAndDeleteChildren();
            paletteHost.visible = false;
        }
        let disposed = false;
        let syncing = false;
        let timer = null;
        const valid = () => !disposed && generation === nextBuild && session.valid() && P.isAlive(parent) &&
            (!docked || P.isAlive(paletteHost));
        const syncs = [];
        const rangeSyncs = [];
        const cleanups = [];
        const palettes = [];
        if (docked) cleanups.push(() => {
            if (generation === nextBuild && P.isAlive(paletteHost)) paletteHost.visible = false;
        });
        const entries = [];
        const cancelTimer = () => {
            if (timer !== null) $.CancelScheduled(timer);
            timer = null;
        };
        const multiplier = field => Q.settings.get(field.key).displayFactor;
        const displayValue = (field, value) => Q.settings.toDisplayValue(field.key, value);
        const storedValue = (field, value) => Q.settings.fromDisplayValue(field.key, value);
        const display = (field, value) => String(Number((displayValue(field, value) * multiplier(field)).toFixed(6)));
        const unit = field => field.unit || Q.settings.get(field.key).unit;
        const read = (field, input) => {
            const text = String(input.text).trim();
            if (field.type === "color" || field.type === "palette") return QOL_UTILS.EncodeHexColor(text);
            if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) return NaN;
            const value = Number(text.replace(",", ".")) / multiplier(field);
            // Validate displayed rotation before wrapping its compatibility field.
            if (field.key === "STAMINA_CHARGE_ANGLE" && (value < 0 || value > 360)) return NaN;
            return storedValue(field, value);
        };
        const header = P.create("Panel", parent, "QOLCustomizeSelectionHeader");
        header.AddClass("QOLCustomizeSelectionHeader");
        label(header, element.name, "ModalTitle").AddClass("QOLCustomizeTitle");
        const availability = label(parent, "");
        availability.AddClass("QOLCustomizeAvailability");
        availability.visible = false;
        const visibleFields = element.fields.filter(field => !field.hidden);
        const primaryToggle = visibleFields.find(field => field.visibility);
        const toggle = (host, field, title = null) => {
            const control = P.create("Button", host, "QOLCustomize_" + field.key);
            control.AddClass("SettingToggleBtn");
            control.hittest = true;
            control.hittestchildren = false;
            const switchButton = P.create("Button", control, "");
            switchButton.AddClass("SwitchButton");
            switchButton.hittest = false;
            switchButton.hittestchildren = false;
            const handle = P.create("Panel", switchButton, "handle");
            handle.AddClass("SettingToggleHandle");
            handle.hittest = false;
            handle.hittestchildren = false;
            const paint = active => {
                control.SetHasClass("ToggleActive", active);
                control.SetHasClass("ToggleOn", active);
                control.SetHasClass("ToggleOff", !active);
                control.SetHasClass("Checked", active);
            };
            control.SetPanelEvent("onactivate", () => {
                if (!valid()) return;
                if (commit({ [field.key]: Number(session.value(field.key)) === 1 ? 0 : 1 })) changed();
            });
            syncs.push(() => {
                const on = Number(session.value(field.key)) === 1;
                const shown = field.inverted ? !on : on;
                paint(shown);
            });
            if (title) {
                const shown = () => {
                    const on = Number(session.value(field.key)) === 1;
                    return field.inverted ? !on : on;
                };
                control.SetPanelEvent("onmouseover", () => $.DispatchEvent("UIShowTextTooltip", control,
                    localize(shown() ? "Visible" : "Hidden")));
                control.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", control));
            }
            return control;
        };
        if (primaryToggle) toggle(header, primaryToggle, "Visible").AddClass("QOLCustomizeVisibility");
        const main = P.create("Panel", parent, "QOLCustomizeMainProperties");
        main.AddClass("QOLCustomizeSectionBody");

        const groupFor = field => {
            if (field.section) return field.section;
            const role = Q.settings.get(field.key).role;
            if (role === "stateVisibility") return "Visibility";
            if (field.axis || field.resize || ["position", "size", "referenceSize", "scale", "fontSize", "fontScale", "axisScale", "rotation", "distance"].includes(role)) return "Position";
            return field.type === "toggle" ? "Content" : "Appearance";
        };
        const groups = new Map();
        for (const [id, title] of [["Content", "Content"], ["Position", "Position & size"], ["Appearance", "Appearance"], ["Visibility", "Visibility"]]) {
            const fields = visibleFields.filter(field => field !== primaryToggle && groupFor(field) === id);
            if (!fields.length) continue;
            const section = P.create("Panel", main, "QOLCustomize" + id + "Section");
            section.AddClass("QOLCustomizeSection");
            label(section, title, "ModalTitle").AddClass("QOLCustomizeSectionHeading");
            const body = P.create("Panel", section, "QOLCustomize" + id + "Body");
            body.AddClass("QOLCustomizeSectionBody");
            groups.set(id, body);
            syncs.push(() => { section.visible = fields.some(field => !field.when || field.when(session)); });
        }

        const categories = new Map();
        for (const field of visibleFields) {
            if (field === primaryToggle) continue;
            let host = groups.get(groupFor(field));
            if (field.category) {
                const id = groupFor(field) + ":" + field.category;
                if (!categories.has(id)) {
                    const section = P.create("Panel", host, "");
                    section.AddClass("QOLCustomizeSubsection");
                    label(section, field.category).AddClass("QOLCustomizeSubheading");
                    categories.set(id, section);
                }
                host = categories.get(id);
            }
            const row = P.create("Panel", host, "");
            row.AddClass("QOLCustomizeField");
            if (field.when) syncs.push(() => { row.visible = !!field.when(session); });
            label(row, field.axis ? (field.axis === "x" ? "Horizontal" : "Vertical") : field.label);
            if (field.type === "enum") {
                row.AddClass("QOLCustomizeFieldEnum");
                const control = P.create("DropDown", row, "QOLCustomize_" + field.key);
                control.AddClass("SettingsDropDown");
                control.AddClass("QOLSettingsDropDown");
                control.AddClass("QOLCustomizeDropDown");
                control.AddClass("ValueInput");
                const options = new Map();
                for (const [value, text] of field.options) {
                    const option = label(control, text, "QOLSettingsDropDownItem", "QOLCustomize_" + field.key + "_" + value);
                    option.AddClass("DropDownChild");
                    option.AddClass("QOLCustomizeDropDownItem");
                    // Native dropdown options must receive their own input.
                    option.hittest = true;
                    control.AddOption(option);
                    options.set(option.id, value);
                }
                control.SetPanelEvent("oninputsubmit", () => {
                    if (!valid() || syncing) return;
                    const selected = control.GetSelected();
                    if (!P.isAlive(selected) || !options.has(selected.id)) return;
                    if (commit({ [field.key]: options.get(selected.id) })) changed();
                    else sync({ preserveInput: true });
                });
                syncs.push(() => {
                    const id = "QOLCustomize_" + field.key + "_" + session.value(field.key);
                    if (control.GetSelected()?.id !== id) control.SetSelected(id);
                });
                continue;
            }
            if (field.type === "toggle") {
                row.AddClass("QOLCustomizeToggleRow");
                toggle(row, field);
                continue;
            }
            const controlHost = P.create("Panel", row, "");
            controlHost.AddClass("QOLCustomizeValueGroup");
            const isColor = field.type === "color" || field.type === "palette";
            let slider = null;
            let palette = null;
            let contract = null;
            let mult = 1;
            if (isColor) {
                row.AddClass("QOLCustomizeFieldColor");
                // Native marker dragging can scroll an ancestor. Keep the
                // picker in the editor's non-scrolling dock, outside fields.
                palette = P.create("Panel", docked ? paletteHost : row, "QOLCustomizePalette_" + field.key);
                palette.AddClass("QOLCustomizeColorEditor");
                palette.visible = false;
                if (docked) {
                    label(palette, field.label, "ModalTitle").AddClass("QOLCustomizeSectionHeading");
                    cleanups.push(() => {
                        if (P.isAlive(palette)) palette.visible = false;
                        P.delete(palette);
                    });
                }
                if (QOL_UTILS.SupportsCustomColor(field.key)) {
                    // Stock control and event contract used by HP Bars v2's
                    // origin/main picker; native children own RGB/HEX editing.
                    const picker = P.create("CitadelColorPicker", palette, "QOLCustomizePicker_" + field.key);
                    if (P.isAlive(picker)) {
                        picker.AddClass("QOLCustomizeNativePicker");
                        let seededHex = null;
                        let seeding = false;
                        const colorChanged = (red, green, blue) => {
                            if (!valid() || !palette.visible || syncing || seeding) return;
                            const channels = [red, green, blue];
                            if (!channels.every(value => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255)) return;
                            const hex = "#" + channels.map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase();
                            const value = QOL_UTILS.EncodeHexColor(hex);
                            if (value === session.value(field.key)) return;
                            if (commit({ [field.key]: value }, false, "color:" + field.key)) { seededHex = hex; changed(); }
                        };
                        // This panel-scoped handler retires with the owned picker.
                        // Deadlock has no $.UnregisterEventHandler binding; valid()
                        // rejects late callbacks while panel deletion is pending.
                        $.RegisterEventHandler("CitadelColorPickerColorChanged", picker, colorChanged);
                        syncs.push(() => {
                            const hexEntry = P.findTraverse(picker, "HexValue");
                            if (!palette.visible || !P.isAlive(hexEntry)) return;
                            // White is only the picker cursor for native/default;
                            // opening the palette must never write a setting.
                            const hex = QOL_UTILS.ResolveWashColorFromPalette(session.value(field.key)) || "#FFFFFF";
                            if (seededHex === hex) return;
                            seeding = true;
                            try {
                                if (hexEntry.text !== hex.slice(1)) hexEntry.text = hex.slice(1);
                                $.DispatchEvent("TextEntryChanged", hexEntry);
                                seededHex = hex;
                            } finally { seeding = false; }
                        });
                    }
                }
                const presets = P.create("Panel", palette, "");
                presets.AddClass("QOLCustomizePalette");
                for (let value = 1; value < QOL_UTILS.QOL_WASH_COLOR_PALETTE.length; value++) {
                    const hex = QOL_UTILS.ResolveWashColorFromPalette(value);
                    const choice = P.create("Button", presets, "QOLCustomizeColor_" + field.key + "_" + value);
                    choice.AddClass("QOLCustomizeColorChoice");
                    choice.style.backgroundColor = hex;
                    choice.SetPanelEvent("onactivate", () => {
                        if (!valid()) return;
                        if (commit({ [field.key]: value })) changed();
                    });
                    choice.SetPanelEvent("onmouseover", () => $.DispatchEvent("UIShowTextTooltip", choice, hex));
                    choice.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", choice));
                    syncs.push(() => choice.SetHasClass("Active", session.value(field.key) === value));
                }
            } else {
                contract = Q.presentation.settingFields.get(field.key);
                mult = multiplier(field);
                const sliderContainer = P.create("Panel", controlHost, "");
                sliderContainer.AddClass("SliderContainer");
                slider = P.create("Slider", sliderContainer, "QOLCustomizeSlider_" + field.key, { direction: "horizontal" });
                slider.AddClass("HorizontalSlider");
                let acceptedRange = null;
                const refreshRange = () => {
                    if (!valid()) return;
                    const range = field.axis && geometrySource
                        ? Q.ui.customizeGeometry.positionSliderBounds(field, geometrySource()) : contract;
                    if (range) {
                        const bounds = Q.presentation.displayBounds(field.key, range.min, range.max);
                        const first = Math.ceil(bounds.min * mult), last = Math.floor(bounds.max * mult);
                        acceptedRange = { min: first, max: Math.max(first, last) };
                    }
                    // Native layout can disappear while Slider owns the mouse.
                    // Retain numeric travel, never the missing panel's geometry.
                    // Disabling/reconfiguring native input on every preview can
                    // interrupt capture before it receives the button release.
                    const enabled = !!acceptedRange && acceptedRange.max > acceptedRange.min;
                    if (acceptedRange) {
                        if (slider.min !== acceptedRange.min) slider.min = acceptedRange.min;
                        if (slider.max !== acceptedRange.max) slider.max = acceptedRange.max;
                    }
                    if (slider.enabled !== enabled) slider.enabled = enabled;
                    const value = Math.round(displayValue(field, session.value(field.key)) * mult);
                    const thumb = acceptedRange ? Math.max(slider.min, Math.min(slider.max, value)) : value;
                    if (Number(slider.value) !== thumb) slider.value = thumb;
                };
                rangeSyncs.push(refreshRange);
                refreshRange();

            }

            const input = P.create("TextEntry", controlHost, "QOLCustomize_" + field.key,
                isColor ? { placeholder: localize("Default") } : undefined);
            input.AddClass("QOLCustomizeInput");
            input.AddClass("ValueInput");
            input.maxchars = isColor ? 7 : 16;
            const entry = { field, input, lastText: "", error: null };
            entries.push(entry);
            let swatch = null;
            let swatchSignature = null;
            if (isColor) {
                const showPalette = button(controlHost, "QOLCustomizePaletteToggle_" + field.key, "Color palette", () => {
                    if (!valid()) return;
                    const opening = !palette.visible;
                    for (const item of palettes) {
                        item.panel.visible = item.panel === palette && opening;
                        setActive(item.toggle, item.panel.visible);
                    }
                    if (docked) paletteHost.visible = opening;
                    changed({ preserveInput: true });
                });
                palettes.push({ panel: palette, toggle: showPalette });
                showPalette.AddClass("QOLCustomizePaletteToggle");
                swatch = P.create("Panel", showPalette, "QOLCustomizeSwatch_" + field.key);
                swatch.AddClass("QOLCustomizeSwatch");
                swatch.hittest = false;
                swatch.hittestchildren = false;
                button(controlHost, "QOLCustomizeDefault_" + field.key, "Default", () => {
                    if (!valid()) return;
                    input.RemoveClass("Invalid");
                    if (commit({ [field.key]: 0 })) changed();
                }).AddClass("QOLCustomizeQuiet");
            } else {
                if (unit(field)) label(controlHost, unit(field), "QOLCustomizeUnit");
            }
            const error = label(row, isColor ? "Enter a complete HEX color, such as #AABBCC." : "Use a number from {min} to {max}.");
            if (!isColor && contract) {
                const bounds = Q.presentation.displayBounds(field.key, contract.min, contract.max);
                error.text = error.text.replace("{min}", String(Number((bounds.min * mult).toFixed(6))))
                    .replace("{max}", String(Number((bounds.max * mult).toFixed(6))));
            }
            error.AddClass("QOLCustomizeFieldError");
            error.visible = false;
            entry.error = error;

            if (slider) {
                slider.SetPanelEvent("onvaluechanged", () => {
                    if (!valid() || syncing || slider.enabled === false) return;
                    const shown = Math.max(slider.min, Math.min(slider.max, Number(slider.value)));
                    const raw = storedValue(field, shown / mult);
                    const norm = Q.presentation.normalize(field.key, raw);
                    if (norm !== null && norm !== session.value(field.key)) {
                        if (commit({ [field.key]: norm })) changed();
                        else sync({ preserveInput: true });
                    }
                });
                slider.SetPanelEvent("onmousewheel", wheel);
            }

            input.SetPanelEvent("onmouseover", () => $.DispatchEvent("UIShowTextTooltip", input, error.text));
            input.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", input));
            if (!isColor) input.SetPanelEvent("onmousewheel", wheel);

            function wheel(delta) {
                if (!valid() || !delta) return false;
                adjust(delta > 0 ? 1 : -1);
                // A value adjustment consumes the wheel instead of also
                // forwarding it to the inspector's scrolling container.
                return true;
            }

            function adjust(direction) {
                if (!valid()) return;
                const typed = read(field, input);
                const value = Number.isFinite(typed) ? typed : Number(session.value(field.key));
                const step = contract ? contract.step : 1;
                const nextVal = storedValue(field, displayValue(field, value) + direction * step);
                if (commit({ [field.key]: nextVal })) changed();
            }
            const submit = () => {
                if (!valid() || !P.isAlive(input)) return;
                if (commit()) changed();
            };
            input.SetPanelEvent("oninputsubmit", submit);
            input.SetPanelEvent("onblur", submit);
            input.SetPanelEvent("ontextentrychange", () => {
                if (!valid() || syncing) return;
                cancelTimer();
                if (input.text === entry.lastText) {
                    input.RemoveClass("Invalid");
                    error.visible = false;
                    return;
                }
                timer = $.Schedule(0.3, () => {
                    timer = null;
                    if (!valid()) return;
                    if (commit({}, true)) changed({ preserveInput: true });
                });
            });
            syncs.push(options => {
                const value = session.value(field.key);
                // Native/default colors have no HEX representation. Panorama
                // coerces null to an empty TextEntry, so the accepted snapshot
                // must use the same string or every pristine field looks dirty.
                const text = isColor ? QOL_UTILS.ResolveWashColorFromPalette(value) || "" : display(field, value);
                if (!options.preserveInput) {
                    if (input.text !== text) input.text = text;
                    entry.lastText = text;
                    input.RemoveClass("Invalid");
                    error.visible = false;
                }
                if (!isColor && slider && P.isAlive(slider) && !field.axis) {
                    const targetVal = Math.round(displayValue(field, value) * mult);
                    if (Math.round(Number(slider.value)) !== targetVal) {
                        slider.value = targetVal;
                    }
                }
                if (swatch) swatchSignature = P.syncStyles(swatch, { backgroundColor: text || "transparent" }, swatchSignature).sig;
            });
        }
        const sync = (options = {}) => {
            if (!valid()) return;
            if (!options.preserveInput) cancelTimer();
            syncing = true;
            try { rangeSyncs.forEach(update => update()); syncs.forEach(update => update(options)); }
            finally { syncing = false; }
        };
        function commit(patch = {}, partial = false, group = null) {
            if (!valid()) return false;
            cancelTimer();
            const values = Object.assign({}, patch);
            let accepted = true;
            const pending = [];
            for (const entry of entries) {
                const { field, input, lastText, error } = entry;
                if (input.text === lastText || Object.prototype.hasOwnProperty.call(patch, field.key)) continue;
                const value = read(field, input);
                const contract = Q.presentation.settingFields.get(field.key);
                const color = field.type === "color" || field.type === "palette";
                const bounds = contract && Q.presentation.displayBounds(field.key, contract.min, contract.max);
                const shown = Number.isFinite(value) ? displayValue(field, value) : NaN;
                const invalid = value === null || Q.settings.normalize(field.key, value, false) === null ||
                    (partial && !color && (shown < bounds.min || shown > bounds.max));
                input.SetHasClass("Invalid", invalid);
                error.visible = invalid;
                if (invalid) accepted = false;
                else { values[field.key] = value; pending.push(entry); }
            }
            if ((!partial && !accepted) || (Object.keys(values).length && !session.edit(values, group))) return false;
            for (const entry of pending) entry.lastText = String(entry.input.text);
            return partial ? !!Object.keys(values).length : accepted;
        }
        sync();
        return { sync, commit, availability, refreshRanges: () => {
            syncing = true;
            try { rangeSyncs.forEach(update => update()); } finally { syncing = false; }
        }, hasPending: () => entries.some(entry => entry.input.text !== entry.lastText),
            dispose: () => { disposed = true; cancelTimer(); cleanups.forEach(cleanup => cleanup()); } };
    }
    Q.ui.customizeInspector = { build, button, label, setActive };
})();
