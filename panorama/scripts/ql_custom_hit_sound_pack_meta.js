"use strict";

// Placeholder for the Custom hitsound's Name, Description and Credit. A pack made with the
// QOL Lock Audio Pack Builder ships a file with this same path that fills them in.
(function() {
    try {
        if (!(typeof globalThis === "object" && globalThis)) return;
        if (!globalThis.QOL_HIT_KILL_SOUND_CUSTOM || typeof globalThis.QOL_HIT_KILL_SOUND_CUSTOM !== "object") {
            globalThis.QOL_HIT_KILL_SOUND_CUSTOM = {};
        }
        if (!globalThis.QOL_HIT_KILL_SOUND_CUSTOM["hit"]) {
            globalThis.QOL_HIT_KILL_SOUND_CUSTOM["hit"] = { name: "", description: "", credit: "" };
        }
    } catch (e0) { /* globalThis may be unavailable in restricted contexts */ }
})();
