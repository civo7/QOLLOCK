// manifests/ql_build_storage/legacy_3_1_9.js
// =============================================================================
// QOLLOCK — 3.1.9 config migration: the OLD carrier, READ ONLY
// =============================================================================
// 3.1.9 (shipped, `main`) kept the config token in a storage build's CATEGORY
// NAME. 3.2.0 keeps it in the build DESCRIPTION. Everything else about the two
// is identical — same storage hero (hero_skyrunner), same token syntax, one
// token, no chunking — so this file exists only to read the old place.
//
// DELETE THE WHOLE FILE once 3.1.9 is far enough behind. It is deliberately
// self-contained and called from exactly two marked sites, so removing it is:
//   1. delete this file
//   2. delete its <include> in panorama/layout/hud.xml
//   3. delete the three `Legacy319` references in ./manifest.js
// Nothing else in the round trip knows it exists.
//
// IT NEVER WRITES AND NEVER CLEARS. The old category name is left exactly as
// 3.1.9 left it, on purpose:
//   - migration becomes idempotent — a failed one just happens again next boot
//   - a user who rolls back to 3.1.9 still has a working config
// The cost is one stale copy of the token in a category name nobody reads. That
// is a much better trade than a destructive one-way migration.
//
// GROUND TRUTH USED HERE (verified 2026-08-25 unless marked):
//   - main never sets a build NAME: "BuildNameTextEntry" and "QOLLOCK-Settings"
//     appear 0 times in main's ql_feat_buildsave.js and ql_core.js. So a 3.1.9
//     build cannot be found by name, and the token itself is the only identity.
//   - #HeroBuildList holds the local player's builds AND public ones; the
//     My Builds / Public tabs only switch visibility through CSS on the classes
//     MyBuild / HidePublic / ActiveBuild (Panorama debugger). A sweep that skips
//     that filter clicks through other people's builds.
//   - INFERRED, not observed: the shop's #CategoryContainer follows the build
//     selected in the browser popup. This is how 3.1.9 itself works — it opens
//     the browser, activates a row, then reads #ShopModsSelectedBuild
//     (main ql_feat_buildload.js:1292 TryFindBuildCategoryPayloadText) — and
//     that version ships working. If the inference is wrong this reader simply
//     finds nothing, which is visible in the log and loses no data.
// =============================================================================

(function() {
    "use strict";
    if (typeof QOL === "undefined" || !QOL) { return; }

    const LOG_TAG = "[QOLLock][ql_build_storage/legacy] ";

    // Same syntax on both sides — only the version digits differ. main's
    // BUILD_CATEGORY_PAYLOAD_TOKEN_REGEX (ql_feat_buildload.js:132) is the
    // anchored form of this; the loose form is used here for the same reason
    // manifest.js:50 uses it, because the carrier text may carry surroundings.
    const TOKEN_EXTRACT = /(\[QOL-\d+-\d+-\d+\]:[A-Za-z0-9\-_]+)/i;

    // Every CitadelShopModsBuild instance carries class shopModsBuild
    // (citadel_shop_mods_build.xml). That class is the only dependable handle on
    // the panel: the tree holds several instances and their ids are C++-assigned
    // and have already proven to duplicate.
    const HOST_CLASS = "shopModsBuild";
    // citadel_shop_mods_build_category.xml declares the rendered label as
    // id=BuildCategoryName class=CategoryName, under #CategoryContainer.
    const PID_CATEGORY_NAME = "BuildCategoryName";
    const CLASS_CATEGORY_NAME = "CategoryName";
    // The editor's own input buffer, and it is EXCLUDED on purpose. It holds
    // whatever was typed whether or not a commit ever landed, so accepting it
    // would let an uncommitted keystroke pass as a stored config — the exact
    // mistake that once made a no-op save verify as success.
    const PID_CATEGORY_ENTRY = "CategoryNameTextEntry";
    const CLASS_EDIT_FIELD = "EditFieldTextEntry";

    // A row in #HeroBuildList is the local player's only if it carries this.
    const CLASS_OWN_ROW = "MyBuild";

    function _alive(p) {
        return !!(p && typeof p.IsValid === "function" && p.IsValid());
    }
    function _find(root, id) {
        try { return (root && root.FindChildTraverse) ? root.FindChildTraverse(id) : null; } catch(e) { return null; }
    }
    function _findClass(root, cls) {
        try { return (root && root.FindChildrenWithClassTraverse) ? (root.FindChildrenWithClassTraverse(cls) || []) : []; } catch(e) { return []; }
    }
    function _hasClass(panel, cls) {
        if (!_alive(panel)) return false;
        try { return typeof panel.BHasClass === "function" && panel.BHasClass(cls); } catch(e) { return false; }
    }
    function _idOf(panel) {
        if (!_alive(panel)) return "";
        try { return String(panel.id || ""); } catch(e) { return ""; }
    }

    function extractToken(text) {
        if (!text) return "";
        const m = TOKEN_EXTRACT.exec(String(text).replace(/\s+/g, ""));
        return m ? String(m[1]) : "";
    }

    /**
     * Read a label's text from BOTH stores the engine keeps for it.
     *
     * A Label declared text="#Citadel_HeroBuilds_CategoryName" renders from the
     * dialog variable that token expands to ("{s:category_name}"), so `.text`
     * can hold the TEMPLATE while the value C++ pushed in is reachable as the
     * "text" ATTRIBUTE. They are separate stores.
     *
     * Which one the live label reports is genuinely unsettled in this repo, and
     * the two halves of the evidence contradict each other: every token reader
     * on main goes through ReadPanelTextMaybe, which returns `.text` whenever it
     * is non-empty — and 3.1.9 ships working, which argues the label resolves.
     * This branch documents the opposite, that `.text` is the template and only
     * the attribute holds the value.
     *
     * So do not bet on an answer. Read both and ask only "does either contain a
     * token", which is correct under either reading and costs one extra call.
     * Asking that question rather than "what is the text" is also what makes it
     * safe: unlike an early return on the first non-empty store, it cannot mask
     * a value that lives in the other one. The mod writes no "text" attribute
     * anywhere, so nothing stale can be sitting there.
     */
    function _tokenFromEitherStore(panel) {
        if (!_alive(panel)) return "";
        let fromAttr = "";
        try {
            if (typeof panel.GetAttributeString === "function") {
                fromAttr = String(panel.GetAttributeString("text", "") || "");
            }
        } catch(e) {}
        const attrToken = extractToken(fromAttr);
        if (attrToken) return attrToken;

        let fromProp = "";
        try {
            if (typeof panel.text !== "undefined" && panel.text !== null) fromProp = String(panel.text);
        } catch(e) {}
        return extractToken(fromProp);
    }

    /** True for the editor's input buffer, which must never count as stored. */
    function _isEditorBuffer(panel) {
        return _idOf(panel) === PID_CATEGORY_ENTRY || _hasClass(panel, CLASS_EDIT_FIELD);
    }

    /**
     * The 3.1.9 token for whichever build the shop is currently showing, or "".
     *
     * Scoped to shopModsBuild hosts rather than swept from the root, which is the
     * one design decision here worth stating. A root-wide scan would also reach
     * Label.BuildDescription inside the browser popup — the NEW carrier — and
     * that label belongs to whatever row the popup has selected. Reading it would
     * make this function answer a different question than the one it is named
     * for, and during a multi-build sweep it could attribute one build's token to
     * another. The shop panel shows exactly one build, so keeping the scan inside
     * it is what makes the answer mean something.
     */
    function readCategoryToken(root) {
        if (!root) return "";
        const hosts = _findClass(root, HOST_CLASS);
        for (let h = 0; h < hosts.length; h++) {
            const host = hosts[h];
            if (!_alive(host)) continue;

            const byId = _find(host, PID_CATEGORY_NAME);
            if (!_isEditorBuffer(byId)) {
                const t = _tokenFromEitherStore(byId);
                if (t) return t;
            }
            const labels = _findClass(host, CLASS_CATEGORY_NAME);
            for (let i = 0; i < labels.length; i++) {
                if (_isEditorBuffer(labels[i])) continue;
                const t2 = _tokenFromEitherStore(labels[i]);
                if (t2) return t2;
            }
        }
        return "";
    }

    /**
     * Is this build-list row one of the local player's?
     *
     * The gate on the legacy sweep. 3.1.9 builds have no name to filter by, so
     * the sweep would otherwise walk every row in #HeroBuildList — and that list
     * carries public builds from other players, which the tabs only hide with
     * CSS. Clicking through strangers' builds looking for our token is both
     * pointless and the kind of thing that gets noticed.
     */
    function isOwnBuildRow(row) {
        return _hasClass(row, CLASS_OWN_ROW);
    }

    QOL.legacy319 = {
        readCategoryToken: readCategoryToken,
        isOwnBuildRow: isOwnBuildRow,
        extractToken: extractToken
    };

    try { $.Msg(LOG_TAG + "3.1.9 category-name reader available\n"); } catch(e) {}
})();
