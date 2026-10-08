// OWNS: Read-only native ChatMessage text-label selection shared by chat consumers.
// Source: citadel_hud_top_bar_chat.xml and chat.xml snippets. No message lifetime or content writes.
(() => {
    "use strict";
    const P = QOL.core.panel;
    function findLabel(message) {
        const named = P.findTraverse(message, "MessageText");
        if (P.isAlive(named)) return named;
        const contents = P.findTraverse(message, "MessageContents");
        if (!P.isAlive(contents)) return null;
        // Retain the earlier direct-label binding and current .Text > Label.
        for (let i = 0; i < contents.GetChildCount(); i++) {
            const child = contents.GetChild(i);
            if (!P.isAlive(child)) continue;
            if (child.paneltype === "Label") return child;
            if (!child.BHasClass("Text")) continue;
            for (let j = 0; j < child.GetChildCount(); j++) {
                const label = child.GetChild(j);
                if (P.isAlive(label) && label.paneltype === "Label") return label;
            }
        }
        return null;
    }
    QOL.core.chatMessages = { findLabel };
})();
