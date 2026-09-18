(function () {
    "use strict";

    var RETRY_INTERVAL_SEC = 0.10;
    var MAX_RETRY_COUNT = 20;
    var SETTLED_INTERVAL_SEC = 1.0;
    var MAX_SETTLED_RETRY_COUNT = 8;
    var gContext = null;
    var gAccountLabel = null;
    var gLink = null;
    var gDisplayLabel = null;
    var gBoundLink = null;
    var gLastDisplayText = "";
    var gRetryCount = 0;

    var IsPanelValid = QOL_UTILS.IsPanelValid;

    var ParseAccountId = QOL_UTILS.ParseAccountId;

    function ResolvePanels() {
        if (!IsPanelValid(gContext)) {
            gContext = $.GetContextPanel ? $.GetContextPanel() : null;
        }
        if (!IsPanelValid(gContext)) return false;
        if (!IsPanelValid(gAccountLabel)) {
            gAccountLabel = gContext.FindChildTraverse ? gContext.FindChildTraverse("QOLProfileCardAccountID") : null;
        }
        if (!IsPanelValid(gLink)) {
            var oldLink = gLink;
            gLink = gContext.FindChildTraverse ? gContext.FindChildTraverse("QOLStatlockerProfileCardLink") : null;
            if (gLink !== oldLink) gBoundLink = null;
        }
        if (!IsPanelValid(gDisplayLabel)) {
            var oldDisplayLabel = gDisplayLabel;
            gDisplayLabel = gContext.FindChildTraverse ? gContext.FindChildTraverse("QOLStatlockerProfileCardLabel") : null;
            if (gDisplayLabel !== oldDisplayLabel) gLastDisplayText = "";
        }
        return true;
    }

    function ReadAccountId() {
        if (!IsPanelValid(gAccountLabel)) return "";
        var accountId = "";
        try { accountId = ParseAccountId(gAccountLabel.text || ""); } catch (e0) {}
        if (accountId) return accountId;
        try { accountId = ParseAccountId(gAccountLabel.accountid); } catch (e1) {}
        if (accountId) return accountId;
        try {
            if (gAccountLabel.GetAttributeString) {
                accountId = ParseAccountId(gAccountLabel.GetAttributeString("accountid", "")) ||
                    ParseAccountId(gAccountLabel.GetAttributeString("account_id", ""));
            }
        } catch (e2) {}
        return accountId;
    }

    function OpenStatlocker() {
        // Never fall back to a prior binding: Panorama can reuse a profile card
        // while its new account label is temporarily blank.
        var accountId = RefreshLabelOnce();
        if (!accountId) return;
        try {
            $.DispatchEvent("ExternalBrowserGoToURL", "https://statlocker.gg/profile/" + accountId);
        } catch (e0) {
            $.Msg("[QOLLock][ProfileCardStatlocker] Failed to open URL: " + String(e0));
        }
    }

    function BindLinkOnce() {
        if (!IsPanelValid(gLink) || gBoundLink === gLink) return;
        try {
            gLink.SetPanelEvent("onactivate", OpenStatlocker);
            // Refresh a reused card on demand without retaining an immortal
            // polling chain for every hidden profile-card panel.
            gLink.SetPanelEvent("onmouseover", RefreshLabelOnce);
            gBoundLink = gLink;
        } catch (e0) { /* panel deleted mid-frame */ }
    }

    function RefreshLabelOnce() {
        ResolvePanels();
        var accountId = ReadAccountId();
        var displayText = accountId ? ("Friend ID: " + accountId) : "Friend ID:";
        if (IsPanelValid(gDisplayLabel) && displayText !== gLastDisplayText) {
            try {
                gDisplayLabel.text = displayText;
                gLastDisplayText = displayText;
            } catch (e0) { /* panel deleted mid-frame */ }
        }
        return accountId;
    }

    function UpdateLabel() {
        ResolvePanels();
        // A dismissed card cannot become valid again. Ending here prevents one
        // recursive schedule chain from surviving for every Show Rank probe.
        if (!IsPanelValid(gContext)) return;

        BindLinkOnce();
        var accountId = RefreshLabelOnce();
        var settled = !!accountId && IsPanelValid(gLink) &&
            IsPanelValid(gDisplayLabel) && gBoundLink === gLink;
        if (settled) return;

        // Keep late binding tolerant, but bound every schedule chain. Panorama
        // can retain dismissed cards as valid hidden panels, so IsValid alone
        // is not a safe lifetime signal. Reused cards refresh on hover/click.
        var maxRetryCount = MAX_RETRY_COUNT + MAX_SETTLED_RETRY_COUNT;
        if (gRetryCount >= maxRetryCount) return;
        var nextDelay = gRetryCount < MAX_RETRY_COUNT
            ? RETRY_INTERVAL_SEC
            : SETTLED_INTERVAL_SEC;
        gRetryCount++;
        $.Schedule(nextDelay, UpdateLabel);
    }

    UpdateLabel();
})();
