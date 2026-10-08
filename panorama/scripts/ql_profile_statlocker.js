// Profile-page context: only ql_utils is included by citadel_db_page_profile.xml.
// Owns the existing friend rank image/tools class and Statlocker activation handler.
(() => {
    "use strict";
    const U = QOL_UTILS, alive = U.IsPanelValid;
    const context = $.GetContextPanel();
    let binding = null, tools = null, image = null, button = null;
    let imageAccount = null, boundButton = null, nextDiscovery = 0, timer = null;
    let fallbackAccount = "", nextFallback = 0, canonicalObserved = false;

    function parent(panel) { try { return alive(panel) ? panel.GetParent() : null; } catch (_) { return null; } }
    function active() {
        let current = context;
        for (let depth = 0; depth < 24 && alive(current); depth++, current = parent(current)) {
            if (current.BHasClass("isShowingProfilePage")) return true;
            if (depth < 12 && current.BHasClass("DashboardPage") && current.BHasClass("active")) return true;
        }
        return false;
    }
    function belongs(panel) {
        for (let depth = 0; depth < 64 && alive(panel); depth++, panel = parent(panel)) if (panel === context) return true;
        return false;
    }
    function find(id) { return alive(context) && context.FindChildTraverse ? context.FindChildTraverse(id) : null; }
    function readAccount(panel) {
        if (!alive(panel)) return "";
        return U.ParseAccountId(panel.text || "") || U.ParseAccountId(panel.accountid) || U.ParseAccountId(panel.account_id) ||
            U.ParseAccountId(U.SafeGetAttribute(panel, "accountid", "")) || U.ParseAccountId(U.SafeGetAttribute(panel, "account_id", ""));
    }
    function clearButton(panel) { if (alive(panel)) { try { panel.SetPanelEvent("onactivate", () => {}); } catch (_) {} } }
    function hide(panel) { if (alive(panel) && panel.BHasClass("QOLProfileToolsVisible")) panel.RemoveClass("QOLProfileToolsVisible"); }
    function clearImage(panel) { if (alive(panel)) { try { panel.SetImage(""); } catch (_) {} } }
    function release() {
        if (timer !== null) { $.CancelScheduled(timer); timer = null; }
        hide(tools); clearButton(button); clearImage(image);
        binding = null; tools = null; image = null; button = null; boundButton = null; imageAccount = null;
    }
    function discover(force = false) {
        const now = U.PerfNowMs();
        const stale = [binding, tools, image, button].some(panel => !alive(panel) || !belongs(panel));
        if (!force && !stale && now < nextDiscovery) return;
        if (!force && stale && now < nextDiscovery && [binding, tools, image, button].every(panel => !alive(panel) || belongs(panel))) return;
        nextDiscovery = now + 500;
        const currentBinding = find("QOLProfileAccountID"), currentTools = find("QOLFriendProfileTools");
        const currentImage = find("QOLFriendRankImage"), currentButton = find("QOLProfileStatlockerButton");
        if (currentTools !== tools) hide(tools);
        if (currentImage !== image) { clearImage(image); imageAccount = null; }
        if (currentButton !== button) { clearButton(button); boundButton = null; }
        if (currentBinding !== binding) { fallbackAccount = ""; nextFallback = 0; imageAccount = null; }
        binding = currentBinding; tools = currentTools; image = currentImage; button = currentButton;
    }
    function account(force = false) {
        // A canonical binding that is present but blank is an authoritative
        // loading state. Never use another friend's stacked card in its place.
        const canonical = find("QOLProfileAccountID");
        if (alive(canonical)) { canonicalObserved = true; return readAccount(canonical); }
        if (canonicalObserved) return "";
        const now = U.PerfNowMs();
        if (force || now >= nextFallback) {
            nextFallback = now + 2000; fallbackAccount = "";
            for (const label of U.FindPanelsByClass(context, "HiddenAccountID")) {
                fallbackAccount = readAccount(label);
                if (fallbackAccount) break;
            }
            if (!fallbackAccount) fallbackAccount = readAccount(context);
        }
        return fallbackAccount;
    }
    function render(accountId) {
        if (alive(image) && imageAccount !== accountId) {
            image.SetImage(accountId ? "https://api.deadlock-api.com/v1/players/" + accountId + "/rank-predict/image?format=webp&size=small" : "");
            imageAccount = accountId;
        }
        if (alive(button) && boundButton !== button) {
            const owner = button;
            owner.SetPanelEvent("onactivate", () => {
                if (!alive(context) || !active() || owner !== button || !belongs(owner) || find("QOLProfileStatlockerButton") !== owner) return;
                const currentAccount = account(true);
                if (currentAccount) $.DispatchEvent("ExternalBrowserGoToURL", "https://statlocker.gg/profile/" + currentAccount);
            });
            boundButton = owner;
        }
        if (alive(tools)) {
            const visible = !!accountId;
            if (tools.BHasClass("QOLProfileToolsVisible") !== visible) tools.SetHasClass("QOLProfileToolsVisible", visible);
        }
    }
    function update() {
        timer = null;
        if (!alive(context)) { release(); return; }
        let delay = 1.0;
        try {
            if (active()) { discover(); render(account()); if (alive(tools)) delay = 0.35; }
            else hide(tools);
        } catch (error) { $.Msg("[QOLLock][ProfileStatlocker] " + (error.message || String(error))); }
        timer = $.Schedule(delay, update);
    }
    update();
})();
