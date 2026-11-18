"use strict";

(() => {
    const languageAttribute = "QOL_BETTER_BUILDS_LANGUAGE";
    const { SafeGetAttribute, SafeSetAttribute } = QOL_UTILS;
    QOL.features.betterBuilds = {
        // The HUD publishes the language on the common Panorama root. Empty means disabled.
        readLanguage: root => SafeGetAttribute(root, languageAttribute, ""),
        writeLanguage: (root, language) => SafeSetAttribute(root, languageAttribute, language)
    };
})();
