// ql_feat_showrank_card.js — Profile card account ID bridge for ShowRank
// Loaded ONLY in profile_card.xml context (CitadelProfileCard onload).
// Reads the game-populated {i:r:account_id} data binding from the
// HiddenAccountID label and writes it to the doc-root attribute that
// FillRow (in the HUD context) polls during escape-menu player-list scanning.
//
// Extracted from ql_feat_showrank.js — Phase 10a handler cleanup.
(function() {
    'use strict';

    function ShowRankCardLoaded() {
        var card = null;
        try { card = $.GetContextPanel(); } catch(e) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_showrank_card"", (e && e.message ? e.message : String(e || ""))); }
        if (!card || !card.FindChildrenWithClassTraverse) return;

        // Read account_id from HiddenAccountID (populated by {i:r:account_id})
        var accountId = "";
        var hiddenList = card.FindChildrenWithClassTraverse("HiddenAccountID") || [];
        if (hiddenList.length > 0) {
            try {
                var t = String(hiddenList[0].text || "").replace(/[^0-9]/g, "");
                if (t.length >= 7 && t.length <= 10) accountId = t;
            } catch(e) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_showrank_card"", (e && e.message ? e.message : String(e || ""))); }
        }

        // Fallback: AccountID class (may contain [U:1:XXXX] Steam ID format)
        if (!accountId) {
            var accList = card.FindChildrenWithClassTraverse("AccountID") || [];
            for (var i = 0; i < accList.length; i++) {
                try {
                    var text = String(accList[i].text || "");
                    var m = text.match(/\[U:1:(\d+)\]/i);
                    if (m) { accountId = m[1]; break; }
                    var digits = text.replace(/[^0-9]/g, "");
                    if (digits.length >= 7 && digits.length <= 10) { accountId = digits; break; }
                } catch(e) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_showrank_card"", (e && e.message ? e.message : String(e || ""))); }
            }
        }

        if (!accountId) return;

        // Walk to doc root so FillRow can poll qol_sr_probe_account
        var root = card;
        var guard = 0;
        while (root && root.GetParent && root.GetParent() && guard < 64) {
            root = root.GetParent();
            guard++;
        }

        if (root && root.SetAttributeString) {
            try { root.SetAttributeString("qol_sr_probe_account", accountId); } catch(e) { if (typeof Utils !== "undefined" && Utils.WarnLog) Utils.WarnLog("ql_feat_showrank_card"", (e && e.message ? e.message : String(e || ""))); }
        }
    }

    // Install as global — called by profile_card.xml onload
    $.ShowRankCardLoaded = ShowRankCardLoaded;
})();
