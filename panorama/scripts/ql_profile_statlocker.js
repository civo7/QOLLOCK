(function () {
    "use strict";

    var ACTIVE_INTERVAL_SEC = 0.35;
    var IDLE_INTERVAL_SEC = 1.0;
    var PANEL_RETRY_MS = 500;
    var FALLBACK_SCAN_MS = 2000;
    var API_RANK_URL = "https://api.deadlock-api.com/v1/players/";

    var gAccountLabel = null;
    var gToolsPanel = null;
    var gRankImage = null;
    var gStatlockerButton = null;
    var gLastAccountId = "";
    var gToolsVisible = null;
    var gNextPanelSearchMs = 0;
    var gNextFallbackScanMs = 0;

    function IsPanelValid(panel) {
        if (!panel) return false;
        if (!panel.IsValid) return true;
        try { return panel.IsValid(); } catch (e0) { return false; }
    }

    function ParseAccountId(value) {
        if (value === undefined || value === null) return "";
        var digits = String(value).replace(/[^0-9]/g, "");
        if (!digits || digits.length < 1 || digits.length > 10) return "";
        return digits;
    }

    function ReadAccountIdFromPanel(panel) {
        if (!IsPanelValid(panel)) return "";
        var parsed = "";
        try { parsed = ParseAccountId(panel.text || ""); } catch (e0) {}
        if (parsed) return parsed;
        try { parsed = ParseAccountId(panel.accountid); } catch (e1) {}
        if (parsed) return parsed;
        try { parsed = ParseAccountId(panel.account_id); } catch (e2) {}
        if (parsed) return parsed;
        try {
            if (panel.GetAttributeString) {
                parsed = ParseAccountId(panel.GetAttributeString("accountid", "")) ||
                    ParseAccountId(panel.GetAttributeString("account_id", ""));
            }
        } catch (e3) {}
        return parsed;
    }

    function HasClassSafe(panel, className) {
        if (!IsPanelValid(panel) || !panel.BHasClass) return false;
        try { return !!panel.BHasClass(className); } catch (e0) { return false; }
    }

    function HasAscendantClass(panel, className, maxDepth) {
        var cur = panel;
        var depth = 0;
        while (IsPanelValid(cur) && depth < maxDepth) {
            if (HasClassSafe(cur, className)) return true;
            try { cur = cur.GetParent ? cur.GetParent() : null; } catch (e0) { cur = null; }
            depth++;
        }
        return false;
    }

    function IsProfilePageActive(ctx) {
        if (!IsPanelValid(ctx)) return false;
        if (HasAscendantClass(ctx, "isShowingProfilePage", 24)) return true;
        var cur = ctx;
        for (var i = 0; i < 12 && IsPanelValid(cur); i++) {
            if (HasClassSafe(cur, "DashboardPage") && HasClassSafe(cur, "active")) return true;
            try { cur = cur.GetParent ? cur.GetParent() : null; } catch (e0) { cur = null; }
        }
        return false;
    }

    function ResolvePanels(ctx, nowMs) {
        var needsSearch = !IsPanelValid(gAccountLabel) || !IsPanelValid(gToolsPanel) ||
            !IsPanelValid(gRankImage) || !IsPanelValid(gStatlockerButton);
        if (!needsSearch || nowMs < gNextPanelSearchMs) return;
        gNextPanelSearchMs = nowMs + PANEL_RETRY_MS;

        var oldTools = gToolsPanel;
        var oldImage = gRankImage;
        var oldButton = gStatlockerButton;
        if (!IsPanelValid(gAccountLabel)) {
            gAccountLabel = ctx.FindChildTraverse ? ctx.FindChildTraverse("QOLProfileAccountID") : null;
        }
        if (!IsPanelValid(gToolsPanel)) {
            gToolsPanel = ctx.FindChildTraverse ? ctx.FindChildTraverse("QOLFriendProfileTools") : null;
        }
        if (!IsPanelValid(gRankImage)) {
            gRankImage = ctx.FindChildTraverse ? ctx.FindChildTraverse("QOLFriendRankImage") : null;
        }
        if (!IsPanelValid(gStatlockerButton)) {
            gStatlockerButton = ctx.FindChildTraverse ? ctx.FindChildTraverse("QOLProfileStatlockerButton") : null;
        }
        if (gToolsPanel !== oldTools) gToolsVisible = null;
        if (gRankImage !== oldImage || gStatlockerButton !== oldButton) gLastAccountId = "";
    }

    function FindAccountIdFallback(ctx) {
        if (!IsPanelValid(ctx) || !ctx.FindChildrenWithClassTraverse) return "";
        var labels = ctx.FindChildrenWithClassTraverse("HiddenAccountID") || [];
        for (var i = 0; i < labels.length; i++) {
            var accountId = ReadAccountIdFromPanel(labels[i]);
            if (accountId) return accountId;
        }
        return ReadAccountIdFromPanel(ctx);
    }

    function SetToolsVisible(visible) {
        if (!IsPanelValid(gToolsPanel) || gToolsVisible === visible) return;
        try {
            if (visible) gToolsPanel.AddClass("QOLProfileToolsVisible");
            else gToolsPanel.RemoveClass("QOLProfileToolsVisible");
            gToolsVisible = visible;
        } catch (e0) { /* panel deleted mid-frame */ }
    }

    function BindStatlockerButton(accountId) {
        if (!IsPanelValid(gStatlockerButton) || !accountId) return;
        try {
            gStatlockerButton.SetPanelEvent("onactivate", function () {
                $.DispatchEvent("ExternalBrowserGoToURL", "https://statlocker.gg/profile/" + accountId);
            });
        } catch (e0) { /* panel deleted mid-frame */ }
    }

    function UpdateProfileTools(accountId) {
        if (!IsPanelValid(gToolsPanel)) return false;
        if (!accountId) {
            SetToolsVisible(false);
            return true;
        }

        if (accountId !== gLastAccountId) {
            gLastAccountId = accountId;
            if (IsPanelValid(gRankImage) && gRankImage.SetImage) {
                try {
                    gRankImage.SetImage(API_RANK_URL + accountId + "/rank-predict/image?format=webp&size=small");
                } catch (e0) { /* panel deleted mid-frame */ }
            }
            BindStatlockerButton(accountId);
        }
        SetToolsVisible(true);
        return true;
    }

    function Update() {
        var ctx = $.GetContextPanel ? $.GetContextPanel() : null;
        // A destroyed Panorama context cannot recover. Do not create a zombie
        // schedule chain after this profile page has been torn down.
        if (!IsPanelValid(ctx)) return;

        if (!IsProfilePageActive(ctx)) {
            $.Schedule(IDLE_INTERVAL_SEC, Update);
            return;
        }

        var nowMs = Date.now ? Date.now() : (new Date()).getTime();
        ResolvePanels(ctx, nowMs);
        var accountId = ReadAccountIdFromPanel(gAccountLabel);
        if (!accountId && nowMs >= gNextFallbackScanMs) {
            gNextFallbackScanMs = nowMs + FALLBACK_SCAN_MS;
            accountId = FindAccountIdFallback(ctx);
        }
        var foundTools = UpdateProfileTools(accountId);
        $.Schedule(foundTools ? ACTIVE_INTERVAL_SEC : IDLE_INTERVAL_SEC, Update);
    }

    Update();
})();
