// Exact field controls for one selection. Rebuilt only when selection changes.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const P = Q.core.panel;
    let nextBuild = 0;
    const localize = text => Q.ui.theme.LocalizeSettingsText(text, true);
    const label = (parent, text, role = "ModalInstructions") => {
        const panel = P.create("Label", parent, "");
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
    function build(parent, element, session, changed) {
        parent.RemoveAndDeleteChildren();
        const generation = ++nextBuild;
        let disposed = false;
        let syncing = false;
        let timer = null;
        const valid = () => !disposed && generation === nextBuild && session.valid() && P.isAlive(parent);
        const syncs = [];
        const entries = [];
        const cancelTimer = () => {
            if (timer !== null) $.CancelScheduled(timer);
            timer = null;
        };
        const opacityField = field => /Opacity$/.test(field.label);
        const multiplier = field => opacityField(field) || (field.label === "Scale" && Q.presentation.wireFields.get(field.key).max <= 10) ? 100 : 1;
        const display = (field, value) => String(Number((value * multiplier(field)).toFixed(6)));
        const unit = field => field.unit || (field.key === "PASSIVE_COOLDOWN_SIZE" ? "" :
            field.key === "UNIT_TARGET_SIZE" || field.key === "UNIT_TARGET_HINT_SIZE" ? "%" :
            field.axis || field.label === "Size" ? "px" :
            opacityField(field) || /Scale|Ammo|Width|Height/.test(field.label) ? "%" : field.label === "Rotation" ? "°" : "");
        const read = (field, input) => {
            const text = String(input.text).trim();
            return field.type === "color" || field.type === "palette" ? QOL_UTILS.EncodeHexColor(text) :
                (/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text) ? Number(text.replace(",", ".")) / multiplier(field) : NaN);
        };
        const header = P.create("Panel", parent, "QOLCustomizeSelectionHeader");
        header.AddClass("QOLCustomizeSelectionHeader");
        label(header, element.name, "ModalTitle").AddClass("QOLCustomizeTitle");
        const availability = label(parent, "");
        availability.AddClass("QOLCustomizeAvailability");
        const draggable = Q.presentation.canDrag(element);
        const resizable = !!Q.presentation.resizeField(element);
        if (draggable || resizable) label(parent, draggable ? (resizable ? "Drag to move. Drag any corner to resize." : "Drag to move.")
            : "Drag any corner to resize.").AddClass("QOLCustomizeHint");
        const visibleFields = element.fields.filter(field => !field.hidden);
        const primaryToggle = visibleFields.find(field => field.visibility) ||
            visibleFields.find(field => field.type === "toggle" && field.label === "Enable");
        const toggle = (host, field, title = null) => {
            const control = button(host, "QOLCustomize_" + field.key, title || "On", () => {
                if (!valid()) return;
                if (commit({ [field.key]: Number(session.value(field.key)) === 1 ? 0 : 1 })) changed();
            });
            syncs.push(() => {
                const on = Number(session.value(field.key)) === 1;
                const shown = field.inverted ? !on : on;
                setActive(control, title ? shown : on);
                control.GetChild(0).text = localize(field.type === "side" ? (on ? "Right" : "Left") :
                    title ? (shown ? "Visible" : "Hidden") : (on ? "On" : "Off"));
            });
            return control;
        };
        if (primaryToggle) toggle(header, primaryToggle, "Visible").AddClass("QOLCustomizeVisibility");
        const main = P.create("Panel", parent, "QOLCustomizeMainProperties");
        main.AddClass("QOLCustomizeSectionBody");
        const section = (id, title, expanded) => {
            const host = P.create("Panel", parent, id);
            host.AddClass("QOLCustomizeSection");
            let body;
            let indicator;
            const heading = button(host, id + "Toggle", title, () => {
                if (!valid()) return;
                body.visible = !body.visible;
                heading.SetHasClass("Expanded", body.visible);
                indicator.text = body.visible ? "−" : "+";
            });
            heading.AddClass("QOLCustomizeSectionHeading");
            indicator = label(heading, "", "QOLCustomizeDisclosure");
            indicator.text = expanded ? "−" : "+";
            body = P.create("Panel", host, id + "Body");
            body.AddClass("QOLCustomizeSectionBody");
            body.visible = expanded;
            heading.SetHasClass("Expanded", expanded);
            return { host, body, heading };
        };
        const positions = visibleFields.filter(field => field.axis);
        const position = positions.length ? section("QOLCustomizePosition", "Exact position", !draggable) : null;
        const lockHost = position ? position.body : main;
        const lock = button(lockHost, "QOLCustomizeLock", "Lock position", () => {
            if (!valid() || !commit()) return;
            session.setLocked(element.id, !session.isLocked(element.id));
            setActive(lock, session.isLocked(element.id));
            changed();
        });
        setActive(lock, session.isLocked(element.id));
        lock.visible = draggable || resizable;
        lock.AddClass("QOLCustomizeLock");
        const extra = visibleFields.filter(field => !field.axis && !field.resize && field.label !== "Opacity" &&
            field.type !== "enum" && field.type !== "color" && field.type !== "palette" && field !== primaryToggle);
        const advanced = extra.length ? section("QOLCustomizeMore", "More options", false) : null;
        const orderedFields = visibleFields.filter(field => field.resize || field.label === "Opacity")
            .concat(visibleFields.filter(field => !(field.resize || field.label === "Opacity")));
        for (const field of orderedFields) {
            if (field === primaryToggle) continue;
            const host = field.axis ? position.body : extra.includes(field) ? advanced.body : main;
            const row = P.create("Panel", host, "");
            row.AddClass("QOLCustomizeField");
            label(row, field.axis ? (field.axis === "x" ? "Horizontal" : "Vertical") : field.label);
            if (field.type === "enum") {
                row.AddClass("QOLCustomizeFieldColor");
                const options = P.create("Panel", row, "");
                options.AddClass("QOLCustomizeEnum");
                for (const [value, text] of field.options) {
                    const choice = button(options, "QOLCustomize_" + field.key + "_" + value, text, () => {
                        if (!valid()) return;
                        if (commit({ [field.key]: value })) changed();
                    });
                    syncs.push(() => setActive(choice, Number(session.value(field.key)) === value));
                }
                continue;
            }
            if (field.type === "toggle" || field.type === "side") {
                toggle(row, field);
                continue;
            }
            const controlHost = P.create("Panel", row, "");
            controlHost.AddClass("QOLCustomizeValueGroup");
            const isColor = field.type === "color" || field.type === "palette";
            if (isColor) {
                row.AddClass("QOLCustomizeFieldColor");
                const palette = P.create("Panel", row, "QOLCustomizePalette_" + field.key);
                palette.AddClass("QOLCustomizePalette");
                palette.visible = false;
                const showPalette = button(row, "QOLCustomizePaletteToggle_" + field.key, "Color presets", () => {
                    if (!valid()) return;
                    palette.visible = !palette.visible;
                    setActive(showPalette, palette.visible);
                });
                showPalette.AddClass("QOLCustomizePaletteToggle");
                for (let value = 1; value < QOL_UTILS.QOL_WASH_COLOR_PALETTE.length; value++) {
                    const hex = QOL_UTILS.ResolveWashColorFromPalette(value);
                    const choice = P.create("Button", palette, "QOLCustomizeColor_" + field.key + "_" + value);
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
            }
            let entry;
            if (!isColor) {
                const decrease = button(controlHost, "QOLCustomizeDecrease_" + field.key, "−", () => adjust(-1));
                decrease.AddClass("QOLCustomizeStepper");
            }
            const input = P.create("TextEntry", controlHost, "QOLCustomize_" + field.key);
            input.AddClass("QOLCustomizeInput");
            input.AddClass("ValueInput");
            input.maxchars = isColor ? 7 : 16;
            entry = { field, input, lastText: "", error: null };
            entries.push(entry);
            let swatch = null;
            if (isColor) {
                swatch = P.create("Panel", controlHost, "");
                swatch.AddClass("QOLCustomizeSwatch");
                button(controlHost, "QOLCustomizeDefault_" + field.key, "Default", () => {
                    if (!valid()) return;
                    input.RemoveClass("Invalid");
                    if (commit({ [field.key]: 0 })) changed();
                });
            } else {
                if (unit(field)) label(controlHost, unit(field), "QOLCustomizeUnit");
                const increase = button(controlHost, "QOLCustomizeIncrease_" + field.key, "+", () => adjust(1));
                increase.AddClass("QOLCustomizeStepper");
            }
            const error = label(row, isColor ? "Enter a complete HEX color, such as #AABBCC." : "Use a number from {min} to {max}.");
            if (!isColor) {
                const wire = Q.presentation.wireFields.get(field.key);
                // Localize the sentence before substituting numeric display values.
                error.text = error.text.replace("{min}", display(field, wire.min)).replace("{max}", display(field, wire.max));
            }
            error.AddClass("QOLCustomizeFieldError");
            error.visible = false;
            entry.error = error;
            input.SetPanelEvent("onmouseover", () => $.DispatchEvent("UIShowTextTooltip", input, error.text));
            input.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", input));
            function adjust(direction) {
                if (!valid()) return;
                const typed = read(field, input);
                const value = Number.isFinite(typed) ? typed : Number(session.value(field.key));
                const step = Q.presentation.wireFields.get(field.key).step;
                if (commit({ [field.key]: value + direction * step })) changed();
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
                const text = isColor ? QOL_UTILS.ResolveWashColorFromPalette(value) : display(field, value);
                // Refresh only after an accepted edit/selection/history action;
                // a heartbeat must never overwrite a partially typed value.
                if (!options.preserveInput) {
                    input.text = text;
                    entry.lastText = text;
                    input.RemoveClass("Invalid");
                    error.visible = false;
                }
                if (swatch) swatch.style.backgroundColor = text || "transparent";
            });
        }
        if (element.note) {
            const details = section("QOLCustomizeDetails", "About this element", false);
            label(details.body, element.note);
        }
        const sync = (options = {}) => {
            if (!valid()) return;
            if (!options.preserveInput) cancelTimer();
            syncing = true;
            try { syncs.forEach(update => update(options)); }
            finally { syncing = false; }
        };
        function commit(patch = {}, partial = false) {
            if (!valid()) return false;
            cancelTimer();
            const values = Object.assign({}, patch);
            let accepted = true;
            const pending = [];
            for (const entry of entries) {
                const { field, input, lastText, error } = entry;
                if (input.text === lastText || Object.prototype.hasOwnProperty.call(patch, field.key)) continue;
                const value = read(field, input);
                const wire = Q.presentation.wireFields.get(field.key);
                const color = field.type === "color" || field.type === "palette";
                const invalid = value === null || Q.presentation.normalize(field.key, value) === null ||
                    (partial && !color && (value < wire.min || value > wire.max));
                input.SetHasClass("Invalid", invalid);
                error.visible = invalid;
                if (invalid) accepted = false;
                else { values[field.key] = value; pending.push(entry); }
            }
            if ((!partial && !accepted) || (Object.keys(values).length && !session.edit(values))) return false;
            for (const entry of pending) entry.lastText = String(entry.input.text);
            return partial ? !!Object.keys(values).length : accepted;
        }
        sync();
        return { sync, commit, availability, hasPending: () => entries.some(entry => entry.input.text !== entry.lastText),
            dispose: () => { disposed = true; cancelTimer(); } };
    }
    Q.ui.customizeInspector = { build, button, label, setActive };
})();
