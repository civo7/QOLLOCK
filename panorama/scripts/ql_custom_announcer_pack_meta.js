"use strict";

// Phase 4.5: Consolidated from 5 near-identical files (slot1–slot5).
// Initializes metadata slots for custom announcer packs.
(function() {
    try {
        if (!(typeof globalThis === "object" && globalThis)) return;

        if (!globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS || typeof globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS !== "object") {
            globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS = {};
        }

        var SLOT_COUNT = 5;
        for (var i = 1; i <= SLOT_COUNT; i++) {
            var slotKey = String(i);
            var existing = globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS[slotKey];
            if (!existing || typeof existing !== "object") {
                existing = { name: "", author: "", voiceActor: "" };
                globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS[slotKey] = existing;
            }
            // Legacy global for backward compat
            var legacyKey = "QOL_CUSTOM_ANNOUNCER_SLOT" + slotKey + "_META";
            if (!globalThis[legacyKey] || typeof globalThis[legacyKey] !== "object") {
                globalThis[legacyKey] = existing;
            }
        }
    } catch (e0) { /* globalThis may be unavailable in restricted contexts */ }
})();
