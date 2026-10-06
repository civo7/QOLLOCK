(() => {
    "use strict";
    const Q = globalThis.QOL;
    const P = Q.core.panel;
    const localize = text => Q.ui.theme.LocalizeSettingsText(text, true);
    const entryKeys = id => Q.presentation.elements.find(element => element.id === id)?.fields.map(field => field.key) || [];
    function collectEntry(elementId) {
        const element = Q.presentation.elements.find(item => item.id === elementId);
        const state = globalThis.gSearchCollectState;
        if (!element || !state?.currentSection) return;
        const aliases = [element.name, ...element.fields.flatMap(field => [field.key, field.label, localize(field.label)])];
        state.currentSection.rows.push(Q.ui.search.buildSearchCollectedRow("Customize", "", "customize", null, null, null,
            [{ elementId }], localize(element.name), aliases));
    }
    function createEntryAction(parent, elementId) {
        if (!P.isAlive(parent) || !Q.presentation.elements.some(element => element.id === elementId)) return null;
        const action = P.create("Button", parent, "QOLCustomizeEntry_" + elementId);
        action.AddClass("SectionTitleActionBtn");
        action.AddClass("QOLCustomizeEntry");
        action.SetAttributeString("QOL_CUSTOMIZE_ELEMENT", elementId);
        const caption = P.create("Label", action, "");
        caption.AddClass("SectionTitleActionLabel");
        caption.text = localize("Customize");
        action.SetPanelEvent("onactivate", () => {
            if (!P.isAlive(action)) return;
            $.DispatchEvent("UIHideTextTooltip", action);
            if (!Q.ui.customize.start(null, { elementId })) {
                $.DispatchEvent("UIShowTextTooltip", action, Q.ui.customize.failureText() ||
                    localize("The editor could not open. Close other visual tools and try again."));
            }
        });
        action.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", action));
        return action;
    }
    Q.ui.customize.createEntryAction = createEntryAction;
    Q.ui.customize.collectEntry = collectEntry;
    Q.ui.customize.entryKeys = entryKeys;
    function render(list) {
        // Gameplay sections already index scoped actions. The standalone
        // launcher must not create panels during the search metadata pass.
        if (globalThis.gSearchCollectMode) return;
        const I = Q.ui.customizeInspector;
        const host = Q.core.panel.create("Panel", list, "QOLCustomizeLaunch");
        host.AddClass("QOLCustomizeLaunch");
        host.AddClass("QOLUnifiedModalSurface");
        I.label(host, "Customize", "ModalTitle").AddClass("QOLCustomizeTitle");
        I.label(host, "Move HUD elements on screen and edit their colors. Apply keeps changes; Cancel discards the draft.");
        const status = I.label(host, "");
        status.text = Q.ui.customize.failureText();
        I.button(host, "QOLCustomizeOpen", "Open editor", () => {
            status.text = "";
            const started = Q.ui.customize.start(message => {
                if (message && Q.core.panel.isAlive(status)) status.text = Q.ui.theme.LocalizeSettingsText(message, true);
            });
            if (!started) status.text = Q.ui.customize.failureText() || Q.ui.theme.LocalizeSettingsText("The editor could not open. Close other visual tools and try again.", true);
        }, true);
    }
    Q.ui.window.registerTabRenderer("Customize", render);
})();
