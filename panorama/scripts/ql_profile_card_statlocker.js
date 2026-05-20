(function () {
    "use strict";

    var UPDATE_INTERVAL_SEC = 0.5;
    var gLastKnownAccountId = "";

    function IsPanelValid(panel) {
        if (!panel) return false;
        if (!panel.IsValid) return true;
        return panel.IsValid();
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
        try { candidates.push(panel.accountid); } catch (e0) {}
        try { candidates.push(panel.account_id); } catch (e1) {}
        try { candidates.push(panel.accountID); } catch (e2) {}
        try { candidates.push(panel.steamid); } catch (e3) {}
        try {
            if (panel.GetAttributeString) {
                candidates.push(panel.GetAttributeString("accountid", ""));
                candidates.push(panel.GetAttributeString("account_id", ""));
                candidates.push(panel.GetAttributeString("accountID", ""));
                candidates.push(panel.GetAttributeString("steamid", ""));
            }
        } catch (e4) {}
        for (var i = 0; i < candidates.length; i++) {
            var parsed = ParseAccountId(candidates[i]);
            if (parsed) return parsed;
        }
        return "";
    }

    function FindAccountIdFromLabels(ctx) {
        if (!IsPanelValid(ctx) || !ctx.FindChildrenWithClassTraverse) return "";
        var labels = ctx.FindChildrenWithClassTraverse("AccountID") || [];
        for (var i = 0; i < labels.length; i++) {
            var label = labels[i];
            if (!IsPanelValid(label)) continue;
            var parsed = ParseAccountId(label.text || "");
            if (parsed) return parsed;
        }
        return "";
    }

    function ScanLikelyPanels(ctx) {
        var panelIds = [
            "AvatarImage",
            "UserName",
            "UserNickname",
            "MiniProfileContainer",
            "ContentsMain",
            "CardHeader",
            "AccountArea"
        ];
        for (var i = 0; i < panelIds.length; i++) {
            var panel = ctx.FindChildTraverse ? ctx.FindChildTraverse(panelIds[i]) : null;
            var panelId = ReadAccountIdFromPanel(panel);
            if (panelId) return panelId;
        }
        return "";
    }

    function ScanPanelTree(root) {
        if (!IsPanelValid(root)) return "";
        var stack = [root];
        var scanned = 0;
        while (stack.length > 0 && scanned < 1200) {
            var panel = stack.pop();
            if (!IsPanelValid(panel)) continue;
            scanned++;
            var panelId = ReadAccountIdFromPanel(panel);
            if (panelId) return panelId;
            try {
                var childCount = panel.GetChildCount ? Number(panel.GetChildCount()) || 0 : 0;
                for (var i = 0; i < childCount; i++) {
                    var child = panel.GetChild ? panel.GetChild(i) : null;
                    if (IsPanelValid(child)) stack.push(child);
                }
            } catch (e0) {}
        }
        return "";
    }

    function GetAccountId() {
        var ctx = $.GetContextPanel ? $.GetContextPanel() : null;
        if (!IsPanelValid(ctx)) return "";
        return (
            ScanLikelyPanels(ctx) ||
            ReadAccountIdFromPanel(ctx) ||
            FindAccountIdFromLabels(ctx) ||
            ScanPanelTree(ctx)
        );
    }

    function OpenStatlocker() {
        var accountId = GetAccountId() || gLastKnownAccountId;
        if (!accountId) return;
        var url = "https://statlocker.gg/profile/" + accountId;
        try { $.DispatchEvent("ExternalBrowserGoToURL", url); } catch (e0) {}
        try { $.DispatchEvent("SteamOverlayOpenURL", url); } catch (e1) {}
    }

    function UpdateLabel() {
        var ctx = $.GetContextPanel ? $.GetContextPanel() : null;
        if (!IsPanelValid(ctx)) {
            $.Schedule(UPDATE_INTERVAL_SEC, UpdateLabel);
            return;
        }
        var link = ctx.FindChildTraverse ? ctx.FindChildTraverse("QOLStatlockerProfileCardLink") : null;
        var label = ctx.FindChildTraverse ? ctx.FindChildTraverse("QOLStatlockerProfileCardLabel") : null;
        if (IsPanelValid(link)) {
            try { link.SetPanelEvent("onactivate", OpenStatlocker); } catch (e0) {}
        }
        var accountId = GetAccountId();
        if (accountId) gLastKnownAccountId = accountId;
        if (IsPanelValid(label)) {
            var displayId = accountId || gLastKnownAccountId;
            label.text = displayId ? ("Friend ID: " + displayId) : "Friend ID:";
        }
        $.Schedule(UPDATE_INTERVAL_SEC, UpdateLabel);
    }

    UpdateLabel();
})();
