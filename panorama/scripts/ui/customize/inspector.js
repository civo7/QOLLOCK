// Exact field controls for one selection. Rebuilt only when selection changes.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const P = Q.core.panel;
    let nextBuild = 0;
    const localize = text => Q.ui.theme.LocalizeSettingsText(text, true);
    const label = (parent, text, role = "ModalInstructions") => {
        const panel = P.create("Label", parent, "");
        panel.AddClass(role);
        panel.text = localize(text);
        return panel;
    };
    function button(parent, id, text, action, primary = false) {
        const panel = P.create("Button", parent, id);
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
    function build(parent, element, session, changed) {
        parent.RemoveAndDeleteChildren();
        const generation = ++nextBuild;
        const valid = () => generation === nextBuild && session.valid() && P.isAlive(parent);
        const syncs = [];
        const entries = [];
        const read = (field, input) => {
            const text = String(input.text).trim();
            return field.type === "color" || field.type === "palette" ? QOL_UTILS.EncodeHexColor(text) : (text ? Number(text.replace(",", ".")) : NaN);
        };
        label(parent, element.name, "ModalTitle").AddClass("QOLCustomizeTitle");
        const availability = label(parent, "");
        const draggable = Q.presentation.canDrag(element);
        const resizable = !!Q.presentation.resizeField(element);
        label(parent, draggable ? (resizable ? "Drag to move. Pull the bottom-right corner to resize." : "Drag to move.")
            : resizable ? "Pull the bottom-right corner to resize." : "This element is edited with the controls below.");
        if (element.note) label(parent, element.note);
        const lock = button(parent, "QOLCustomizeLock", "Lock dragging", () => {
            if (!valid()) return;
            session.setLocked(element.id, !session.isLocked(element.id));
            setActive(lock, session.isLocked(element.id));
            changed();
        });
        setActive(lock, session.isLocked(element.id));
        lock.visible = Q.presentation.canDrag(element) || !!Q.presentation.resizeField(element);
        const visibleFields = element.fields.filter(field => !field.hidden);
        // Keep color picking in view rather than beneath a long list of flags.
        const orderedFields = visibleFields.filter(field => field.type === "color" || field.type === "palette")
            .concat(visibleFields.filter(field => field.type !== "color" && field.type !== "palette"));
        for (const field of orderedFields) {
            if (field.hidden) continue;
            const row = P.create("Panel", parent, "");
            row.AddClass("QOLCustomizeField");
            label(row, field.label);
            if (field.type === "enum") {
                row.AddClass("QOLCustomizeFieldColor");
                const options = P.create("Panel", row, "");
                options.AddClass("QOLCustomizeEnum");
                for (const [value, text] of field.options) {
                    const choice = button(options, "QOLCustomize_" + field.key + "_" + value, text, () => {
                        if (!valid()) return;
                        session.edit({ [field.key]: value }); changed();
                    });
                    syncs.push(() => setActive(choice, Number(session.value(field.key)) === value));
                }
                continue;
            }
            if (field.type === "toggle" || field.type === "side") {
                const control = button(row, "QOLCustomize_" + field.key, field.type === "side" ? "Left" : "Enable", () => {
                    if (!valid()) return;
                    session.edit({ [field.key]: Number(session.value(field.key)) === 1 ? 0 : 1 });
                    changed();
                });
                syncs.push(() => {
                    const on = Number(session.value(field.key)) === 1;
                    setActive(control, on);
                    control.GetChild(0).text = localize(field.type === "side" ? (on ? "Right" : "Left") : (on ? "On" : "Off"));
                });
                continue;
            }
            let controlHost = row;
            const isColor = field.type === "color" || field.type === "palette";
            if (isColor) {
                row.AddClass("QOLCustomizeFieldColor");
                const palette = P.create("Panel", row, "QOLCustomizePalette_" + field.key);
                palette.AddClass("QOLCustomizePalette");
                for (let value = 1; value < QOL_UTILS.QOL_WASH_COLOR_PALETTE.length; value++) {
                    const hex = QOL_UTILS.ResolveWashColorFromPalette(value);
                    const choice = P.create("Button", palette, "QOLCustomizeColor_" + field.key + "_" + value);
                    choice.AddClass("QOLCustomizeColorChoice");
                    choice.style.backgroundColor = hex;
                    choice.SetPanelEvent("onactivate", () => {
                        if (!valid()) return;
                        session.edit({ [field.key]: value }); changed();
                    });
                    choice.SetPanelEvent("onmouseover", () => $.DispatchEvent("UIShowTextTooltip", choice, hex));
                    choice.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", choice));
                    syncs.push(() => choice.SetHasClass("Active", session.value(field.key) === value));
                }
                label(row, "HEX (#RRGGBB)");
                controlHost = P.create("Panel", row, "");
                controlHost.AddClass("QOLCustomizeActions");
            }
            const input = P.create("TextEntry", controlHost, "QOLCustomize_" + field.key);
            input.AddClass("QOLCustomizeInput");
            input.AddClass("ValueInput");
            input.maxchars = isColor ? 7 : 16;
            const entry = { field, input, lastText: "" };
            entries.push(entry);
            let swatch = null;
            if (isColor) {
                swatch = P.create("Panel", controlHost, "");
                swatch.AddClass("QOLCustomizeSwatch");
                button(controlHost, "QOLCustomizeDefault_" + field.key, "Default", () => {
                    if (!valid()) return;
                    input.RemoveClass("Invalid");
                    session.edit({ [field.key]: 0 });
                    changed();
                });
            }
            const submit = () => {
                if (!valid() || !P.isAlive(input)) return;
                if (input.text === entry.lastText) return;
                const value = read(field, input);
                const accepted = value !== null && Number.isFinite(value) && session.edit({ [field.key]: value });
                input.SetHasClass("Invalid", !accepted);
                if (accepted) changed();
            };
            input.SetPanelEvent("oninputsubmit", submit);
            input.SetPanelEvent("onblur", submit);
            syncs.push(() => {
                const value = session.value(field.key);
                const text = isColor ? QOL_UTILS.ResolveWashColorFromPalette(value) : String(value);
                // Refresh only after an accepted edit/selection/history action;
                // a heartbeat must never overwrite a partially typed value.
                input.text = text;
                entry.lastText = text;
                input.RemoveClass("Invalid");
                if (swatch) swatch.style.backgroundColor = text || "transparent";
            });
        }
        button(parent, "QOLCustomizeReset", "Reset", () => { if (valid()) { session.reset(element); changed(); } });
        const sync = () => { if (valid()) syncs.forEach(update => update()); };
        function commit() {
            if (!valid()) return false;
            const values = {};
            let accepted = true;
            for (const { field, input, lastText } of entries) {
                if (input.text === lastText) continue;
                const value = read(field, input);
                const invalid = value === null || Q.presentation.normalize(field.key, value) === null;
                input.SetHasClass("Invalid", invalid);
                if (invalid) accepted = false;
                else values[field.key] = value;
            }
            return accepted && (!Object.keys(values).length || session.edit(values));
        }
        sync();
        return { sync, commit, availability };
    }
    Q.ui.customizeInspector = { build, button, label, setActive };
})();
