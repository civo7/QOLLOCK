// Loaded only by profile_card.xml. Captures the HUD probe at card creation and
// publishes the canonical account binding only while that exact request is active.
(() => {
    "use strict";
    const U = QOL_UTILS, alive = U.IsPanelValid;
    const card = $.GetContextPanel();
    let doc = card;
    for (let depth = 0; depth < 80 && alive(doc); depth++) {
        let next = null;
        try { next = doc.GetParent(); } catch (_) { break; }
        if (!alive(next) || next === doc) break;
        doc = next;
    }
    const attr = (panel, key) => U.SafeGetAttribute(panel, key, "");
    const request = { token: attr(doc, "qol_sr_probe_token"), name: attr(doc, "qol_sr_probe_name"),
        hero: attr(doc, "qol_sr_probe_hero"), generation: attr(doc, "qol_sr_generation") };
    let timer = null, attempts = 0, canonicalObserved = false;
    function currentRequest() {
        return alive(card) && alive(doc) && !!request.token && !!request.name &&
            attr(doc, "qol_sr_probe_token") === request.token && attr(doc, "qol_sr_fill_token") === request.token &&
            attr(doc, "qol_sr_probe_name") === request.name && attr(doc, "qol_sr_probe_hero") === request.hero &&
            attr(doc, "qol_sr_generation") === request.generation;
    }
    if (currentRequest()) U.SafeSetAttribute(card, "qol_sr_card_probe_token", request.token);
    function accountId() {
        const canonical = card.FindChildTraverse ? card.FindChildTraverse("QOLProfileCardAccountID") : null;
        const read = panel => alive(panel) ? U.ParseAccountId(panel.text || "") || U.ParseAccountId(panel.accountid) ||
            U.ParseAccountId(attr(panel, "accountid")) || U.ParseAccountId(attr(panel, "account_id")) : "";
        if (alive(canonical)) { canonicalObserved = true; return read(canonical); }
        if (canonicalObserved) return "";
        for (const className of ["HiddenAccountID", "AccountID"]) for (const panel of U.FindPanelsByClass(card, className)) {
            const account = read(panel);
            if (account) return account;
        }
        return "";
    }
    function publish() {
        timer = null;
        if (!currentRequest()) return;
        try {
            const account = accountId();
            if (account) {
                doc.SetAttributeString("qol_sr_probe_account", account);
                doc.SetAttributeString("qol_sr_probe_result_token", request.token);
                return;
            }
        } catch (error) { $.Msg("[QOLLock][ShowRankCard] " + (error.message || String(error))); }
        if (++attempts <= 20) timer = $.Schedule(0.1, publish);
    }
    $.ShowRankCardLoaded = () => {
        if ($.RefreshStatlockerProfileCard) $.RefreshStatlockerProfileCard();
        if (timer !== null) { $.CancelScheduled(timer); timer = null; }
        attempts = 0; publish();
    };
})();
