// =============================================================================
// QOLLOCK — UI: Friends List Search Filter
// File: panorama/scripts/ui/friends.js
// Description: Provides search filtering for the in-game friends list in the Escape Menu.
// USED BY:     hud_escape_menu.xml, ql_settings.js, ui/window.js
// =============================================================================

"use strict";

(() => {
    const Q = (typeof globalThis !== "undefined" && globalThis.QOL) || {};
    Q.ui = Q.ui || {};

    const findRoot = () => {
        let root = (typeof $.GetContextPanel === "function") ? $.GetContextPanel() : null;
        while (root && root.GetParent && root.GetParent()) {
            root = root.GetParent();
        }
        return root;
    };

    const filterFriendsList = () => {
        const root = findRoot();
        const searchInput = root && root.FindChildTraverse ? root.FindChildTraverse("FriendSearchInput") : null;
        if (!searchInput) return;

        const searchText = (searchInput.text || "").toLowerCase();
        const friendsContainer = root && root.FindChildTraverse ? root.FindChildTraverse("FriendsCategories") : null;
        if (!friendsContainer || !friendsContainer.GetChildCount) return;

        for (let i = 0; i < friendsContainer.GetChildCount(); i++) {
            const categoryPanel = friendsContainer.GetChild(i);
            if (!categoryPanel) continue;

            let friendEntries = categoryPanel.FindChildTraverse ? categoryPanel.FindChildTraverse("FriendEntries") : null;
            if (!friendEntries && categoryPanel.GetChildCount && categoryPanel.GetChildCount() > 1) {
                friendEntries = categoryPanel.GetChild(1);
            }
            if (!friendEntries || !friendEntries.GetChildCount) continue;

            for (let j = 0; j < friendEntries.GetChildCount(); j++) {
                const playerPanel = friendEntries.GetChild(j);
                if (!playerPanel) continue;

                const userNameHost = playerPanel.FindChildInLayoutFile ? playerPanel.FindChildInLayoutFile("UserName") : null;
                let nameLabel = null;
                if (userNameHost && userNameHost.GetChildCount && userNameHost.GetChildCount() > 0) {
                    nameLabel = userNameHost.GetChild(0);
                }

                if (nameLabel && typeof nameLabel.text === "string") {
                    const playerName = nameLabel.text.toLowerCase();
                    playerPanel.visible = (searchText.length === 0 || playerName.indexOf(searchText) !== -1);
                } else {
                    playerPanel.visible = true;
                }
            }
        }

        const searchClear = root && root.FindChildTraverse ? root.FindChildTraverse("FriendSearchClear") : null;
        if (searchClear) {
            searchClear.visible = (searchText.length > 0);
        }
    };

    const clearFriendsSearch = () => {
        const root = findRoot();
        const searchInput = root && root.FindChildTraverse ? root.FindChildTraverse("FriendSearchInput") : null;
        if (!searchInput) return;

        searchInput.text = "";
        if (searchInput.ClearSelection) searchInput.ClearSelection();
        filterFriendsList();
    };

    const bindFriendsSearchHandlers = () => {
        const root = findRoot();
        if (!root || !root.FindChildTraverse) return false;

        const searchInput = root.FindChildTraverse("FriendSearchInput");
        const searchClear = root.FindChildTraverse("FriendSearchClear");
        if (!searchInput || !searchClear) return false;

        searchInput.SetPanelEvent("ontextentrychange", () => {
            filterFriendsList();
        });
        searchClear.SetPanelEvent("onactivate", () => {
            clearFriendsSearch();
        });
        filterFriendsList();
        return true;
    };

    const ensureFriendsSearchHandlers = () => {
        if (!bindFriendsSearchHandlers()) {
            if (typeof $.Schedule === "function") {
                $.Schedule(0.5, ensureFriendsSearchHandlers);
            }
        }
    };

    const friendsApi = {
        filterFriendsList,
        clearFriendsSearch,
        bindFriendsSearchHandlers,
        ensureFriendsSearchHandlers,
    };

    Q.ui.friends = friendsApi;

    if (typeof globalThis !== "undefined") {
        globalThis.QOLFilterFriendsList = filterFriendsList;
        globalThis.QOLClearFriendsSearch = clearFriendsSearch;
        globalThis.QOLBindFriendsSearchHandlers = bindFriendsSearchHandlers;
        globalThis.QOLEnsureFriendsSearchHandlers = ensureFriendsSearchHandlers;
    }
})();
