(function () {
    "use strict";

    var UPDATE_INTERVAL_SEC = 0.35;
    var IDLE_INTERVAL_SEC = 1.0;
    var API_RANK_URL = "https://api.deadlock-api.com/v1/players/";
    var gLastAccountId = "";

    function IsPanelValid(panel) {
        if (!panel) return false;
        if (!panel.IsValid) return true;
        try { return panel.IsValid(); } catch (e0) { return false; }
    }

    function ParseAccountId(value) {
        if (value === undefined || value === null) return "";
        var digits = String(value).replace(/[^0-9]/g, "");
        if (!digits || digits.length < 5 || digits.length > 12) return "";
        return digits;
    }

    function ReadAccountIdFromPanel(panel) {
        if (!IsPanelValid(panel)) return "";
        var candidates = [];
        try { candidates.push(panel.accountid); } catch (e0) { /* property unavailable */ }
        try { candidates.push(panel.account_id); } catch (e1) { /* property unavailable */ }
        try { candidates.push(panel.accountID); } catch (e2) { /* property unavailable */ }
        try {
            if (panel.GetAttributeString) {
                candidates.push(panel.GetAttributeString("accountid", ""));
                candidates.push(panel.GetAttributeString("account_id", ""));
                candidates.push(panel.GetAttributeString("accountID", ""));
            }
        } catch (e3) { /* panel deleted mid-frame */ }
        for (var i = 0; i < candidates.length; i++) {
            var parsed = ParseAccountId(candidates[i]);
            if (parsed) return parsed;
        }
        return "";
    }

    function FindAccountIdInClass(ctx, className) {
        if (!IsPanelValid(ctx) || !ctx.FindChildrenWithClassTraverse) return "";
        var panels = ctx.FindChildrenWithClassTraverse(className) || [];
        for (var i = 0; i < panels.length; i++) {
            var panel = panels[i];
            if (!IsPanelValid(panel)) continue;
            var fromText = "";
            try { fromText = ParseAccountId(panel.text || ""); } catch (e0) { fromText = ""; }
            if (fromText) return fromText;
            var fromPanel = ReadAccountIdFromPanel(panel);
            if (fromPanel) return fromPanel;
        }
        return "";
    }

    function ScanPanelTree(root) {
        if (!IsPanelValid(root)) return "";
        var stack = [root];
        var scanned = 0;
        while (stack.length > 0 && scanned < 2500) {
            var panel = stack.pop();
            if (!IsPanelValid(panel)) continue;
            scanned++;
            var accountId = ReadAccountIdFromPanel(panel);
            if (accountId) return accountId;
            try {
                var childCount = panel.GetChildCount ? panel.GetChildCount() : 0;
                for (var i = 0; i < childCount; i++) {
                    var child = panel.GetChild ? panel.GetChild(i) : null;
                    if (IsPanelValid(child)) stack.push(child);
                }
            } catch (e0) { /* panel deleted mid-frame */ }
        }
        return "";
    }

    function FindCurrentAccountId(ctx) {
        return (
            FindAccountIdInClass(ctx, "HiddenAccountID") ||
            FindAccountIdInClass(ctx, "FriendID") ||
            FindAccountIdInClass(ctx, "AccountID") ||
            ReadAccountIdFromPanel(ctx) ||
            ScanPanelTree(ctx)
        );
    }

    function SetToolsVisible(tools, visible) {
        if (!IsPanelValid(tools)) return;
        try {
            if (visible) tools.AddClass("QOLProfileToolsVisible");
            else tools.RemoveClass("QOLProfileToolsVisible");
        } catch (e0) { /* panel deleted mid-frame */ }
    }

    function BindStatlockerButton(button, accountId) {
        if (!IsPanelValid(button) || !accountId) return;
        try {
            button.SetPanelEvent("onactivate", function () {
                $.DispatchEvent("ExternalBrowserGoToURL", "https://statlocker.gg/profile/" + accountId);
            });
        } catch (e0) { /* panel deleted mid-frame */ }
    }

    function UpdateProfileTools(ctx, accountId) {
        var tools = ctx.FindChildTraverse ? ctx.FindChildTraverse("QOLFriendProfileTools") : null;
        if (!IsPanelValid(tools)) return false;
        if (!accountId) {
            SetToolsVisible(tools, false);
            return true;
        }

        var rankImage = ctx.FindChildTraverse ? ctx.FindChildTraverse("QOLFriendRankImage") : null;
        var statlockerButton = ctx.FindChildTraverse ? ctx.FindChildTraverse("QOLProfileStatlockerButton") : null;
        if (accountId !== gLastAccountId) {
            gLastAccountId = accountId;
            if (IsPanelValid(rankImage) && rankImage.SetImage) {
                try {
                    rankImage.SetImage(API_RANK_URL + accountId + "/rank-predict/image?format=webp&size=small");
                } catch (e0) { /* panel deleted mid-frame */ }
            }
            BindStatlockerButton(statlockerButton, accountId);
        }
        SetToolsVisible(tools, true);
        return true;
    }

    function Update() {
        var ctx = $.GetContextPanel ? $.GetContextPanel() : null;
        if (!IsPanelValid(ctx)) {
            $.Schedule(IDLE_INTERVAL_SEC, Update);
            return;
        }
        var accountId = FindCurrentAccountId(ctx);
        var foundTools = UpdateProfileTools(ctx, accountId);
        $.Schedule(foundTools ? UPDATE_INTERVAL_SEC : IDLE_INTERVAL_SEC, Update);
    }

    Update();
})();
