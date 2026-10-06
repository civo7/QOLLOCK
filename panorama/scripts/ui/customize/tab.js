(() => {
    "use strict";
    const Q = globalThis.QOL;
    function render(list) {
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
