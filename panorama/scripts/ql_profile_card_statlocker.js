// Profile-card context: existing XML account binding and Statlocker link only.
// Bounded late-binding work; retained/reused cards refresh on native hover/click/onload.
(() => {
    "use strict";
    const U = QOL_UTILS, alive = U.IsPanelValid;
    const context = $.GetContextPanel();
    let binding = null, link = null, label = null, boundLink = null, displayText = null;
    let retries = 0, timer = null;
    function find(id) { return alive(context) && context.FindChildTraverse ? context.FindChildTraverse(id) : null; }
    function retireLink(panel) {
        if (!alive(panel)) return;
        try { panel.SetPanelEvent("onactivate", () => {}); panel.SetPanelEvent("onmouseover", () => {}); } catch (_) {}
    }
    function resolve() {
        const nextLink = find("QOLStatlockerProfileCardLink"), nextLabel = find("QOLStatlockerProfileCardLabel");
        if (nextLink !== link) { retireLink(link); boundLink = null; }
        if (nextLabel !== label) displayText = null;
        binding = find("QOLProfileCardAccountID"); link = nextLink; label = nextLabel;
    }
    function readAccount() {
        if (!alive(binding)) return "";
        return U.ParseAccountId(binding.text || "") || U.ParseAccountId(binding.accountid) ||
            U.ParseAccountId(U.SafeGetAttribute(binding, "accountid", "")) || U.ParseAccountId(U.SafeGetAttribute(binding, "account_id", ""));
    }
    function refresh() {
        if (!alive(context)) return "";
        resolve();
        const account = readAccount(), nextText = account ? "Friend ID: " + account : "Friend ID:";
        if (alive(label) && displayText !== nextText) { label.text = nextText; displayText = nextText; }
        if (alive(link) && boundLink !== link) {
            const owner = link;
            owner.SetPanelEvent("onactivate", () => {
                if (!alive(context) || find("QOLStatlockerProfileCardLink") !== owner) return;
                const currentAccount = refresh();
                if (currentAccount) $.DispatchEvent("ExternalBrowserGoToURL", "https://statlocker.gg/profile/" + currentAccount);
            });
            owner.SetPanelEvent("onmouseover", refresh);
            boundLink = owner;
        }
        return account;
    }
    function update() {
        timer = null;
        if (!alive(context)) { retireLink(link); link = null; binding = null; label = null; return; }
        let settled = false;
        try { settled = !!refresh() && alive(label) && alive(link) && boundLink === link; }
        catch (error) { $.Msg("[QOLLock][ProfileCardStatlocker] " + (error.message || String(error))); }
        if (settled || retries >= 28) return;
        const delay = retries++ < 20 ? 0.1 : 1.0;
        timer = $.Schedule(delay, update);
    }
    // Same-context hook used by the existing CitadelProfileCard onload callback.
    // It restarts one bounded retry chain rather than adding a second timer.
    $.RefreshStatlockerProfileCard = () => {
        if (timer !== null) { $.CancelScheduled(timer); timer = null; }
        retries = 0; update();
    };
    update();
})();
