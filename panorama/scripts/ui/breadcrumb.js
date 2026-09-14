// panorama/scripts/ui/breadcrumb.js
// =============================================================================
// QOLLOCK — Feature Location Lookup & Breadcrumbs (ES6)
// =============================================================================
// Derived from ui/layout.js. Maps feature IDs to their location in the settings window.
// Provides tab and section lookup for search results and diagnostics.
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : null);

    if (!Q?.ui) {
        $.Msg("[QOLLock] ui/breadcrumb: QOL.ui missing — aborting");
        return;
    }

    let _index = null;

    const buildIndex = () => {
        if (_index) return;
        _index = new Map();

        const layout = Q.ui.layout;
        if (!Array.isArray(layout)) return;

        for (let i = 0; i < layout.length; i++) {
            const tab = layout[i];
            if (!tab || tab.heading || !Array.isArray(tab.sections)) continue;

            const tabId = tab.id;
            const tabName = tab.name || tabId;

            for (let j = 0; j < tab.sections.length; j++) {
                const section = tab.sections[j];
                if (!section || !Array.isArray(section.features)) continue;

                const sectionTitle = section.title || "";

                for (let k = 0; k < section.features.length; k++) {
                    const item = section.features[k];
                    const featureId = typeof item === "string" ? item : item?.id;
                    if (!featureId) continue;

                    _index.set(featureId, {
                        tabId,
                        tabName,
                        sectionTitle,
                    });
                }
            }
        }
    };

    /**
     * Look up settings location for a feature ID.
     * @param {string} featureId
     * @returns {{tabId: string, tabName: string, sectionTitle: string}|null}
     */
    const lookup = (featureId) => {
        buildIndex();
        return _index.get(featureId) || null;
    };

    /**
     * Returns formatted breadcrumb label (e.g. "Healthbar / Player").
     * @param {string} featureId
     * @returns {string}
     */
    const label = (featureId) => {
        const entry = lookup(featureId);
        if (!entry) return "";
        return entry.sectionTitle
            ? `${entry.tabName} / ${entry.sectionTitle}`
            : entry.tabName;
    };

    Q.ui.breadcrumb = {
        lookup,
        label,
    };
})();
