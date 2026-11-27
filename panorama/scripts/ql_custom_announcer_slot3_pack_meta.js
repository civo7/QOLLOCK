"use strict";

// Default (empty) metadata for custom announcer slot 3.
// A custom announcer pack overrides this file with its own copy that fills in
// name / author / voiceActor, so it MUST be loaded after
// ql_custom_announcer_pack_meta.js and before the Audio tab builds its dropdown.
(function() {
    try {
        if (!(typeof globalThis === "object" && globalThis)) return;

        if (!globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS || typeof globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS !== "object") {
            globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS = {};
        }

        var slotKey = "3";
        var existing = globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS[slotKey];
        if (!existing || typeof existing !== "object") {
            existing = { name: "", author: "", voiceActor: "" };
            globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS[slotKey] = existing;
        }

        if (!globalThis.QOL_CUSTOM_ANNOUNCER_SLOT3_META || typeof globalThis.QOL_CUSTOM_ANNOUNCER_SLOT3_META !== "object") {
            globalThis.QOL_CUSTOM_ANNOUNCER_SLOT3_META = existing;
        }
    } catch (e0) {}
})();
