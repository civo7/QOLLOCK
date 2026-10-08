// OWNS: Dynamic STAT buttons attached to native profile hero-row coreRating panels.
// DOES NOT OWN: Native profile rows/account bindings or profile page/card companion UI.
// Evidence: citadel_db_page_profile.xml HeroRow/HeroRowBackground; existing coreRating discovery.
(() => {
    "use strict";
    const BUTTON_STYLES = { flowChildren: "none", horizontalAlign: "right", verticalAlign: "center", height: "22px",
        minWidth: "44px", marginLeft: "6px", padding: "0px 8px",
        backgroundColor: "gradient( linear, 0% 0%, 0% 100%, from( #171717 ), to( #111111 ) )",
        border: "1px solid #66cc9930", borderRadius: "4px", boxShadow: "fill #66cc9920 0px 0px 4px 0px" };
    const LABEL_STYLES = { horizontalAlign: "center", verticalAlign: "center", textAlign: "center", fontSize: "14px",
        fontWeight: "bold", color: "#66cc99", letterSpacing: "1px", textShadow: "0px 0px 4px #66cc9930" };
    QOL.core.FeatureRegistry.register({
        id: "ql_statlocker", enableKey: "ENABLE_STATLOCKER", enabledByDefault: false,
        settings: [{ key: "ENABLE_STATLOCKER", type: "toggle" }],
        create(ctx) {
            const P = QOL.core.panel, U = QOL.utils;
            const records = new Map();
            let enabled = false, loop = null, scanRoot = null, nextScan = 0, misses = 0;
            function parent(panel) { try { return P.isAlive(panel) ? panel.GetParent() : null; } catch (_) { return null; } }
            function documentScope() {
                let scope = $.GetContextPanel();
                for (let i = 0; i < 8 && P.isAlive(scope); i++) {
                    const next = parent(scope);
                    if (!P.isAlive(next) || next === scope) break;
                    scope = next;
                }
                return scope;
            }
            function belongs(panel, root) {
                for (let depth = 0; depth < 64 && P.isAlive(panel); depth++, panel = parent(panel)) if (panel === root) return true;
                return false;
            }
            function target(panel) {
                return P.isAlive(panel) && panel.BHasClass("coreRating") &&
                    !!(P.findTraverse(parent(panel), "HeroRowBackground") || P.findTraverse(panel, "HeroRowBackground"));
            }
            function directClass(owner, name) {
                if (!P.isAlive(owner)) return null;
                for (let i = 0; i < owner.GetChildCount(); i++) {
                    const child = owner.GetChild(i);
                    if (P.isAlive(child) && child.BHasClass(name)) return child;
                }
                return null;
            }
            function readAccount(panel) {
                if (!P.isAlive(panel)) return "";
                return U.ParseAccountId(panel.text || "") || U.ParseAccountId(panel.accountid) ||
                    U.ParseAccountId(U.SafeGetAttribute(panel, "accountid", "")) || U.ParseAccountId(U.SafeGetAttribute(panel, "account_id", ""));
            }
            function classAccount(panel) {
                for (const label of U.FindPanelsByClass(panel, "AccountID")) {
                    const account = readAccount(label);
                    if (account) return account;
                }
                return "";
            }
            function resolveAccount(anchor, root) {
                // The viewed profile's canonical binding takes precedence even
                // while blank: unrelated stacked cards are not a fallback account.
                let current = anchor;
                for (let depth = 0; depth < 16 && P.isAlive(current); depth++, current = parent(current)) {
                    const binding = current.id === "QOLProfileAccountID" ? current : P.findTraverse(current, "QOLProfileAccountID");
                    if (P.isAlive(binding)) return readAccount(binding);
                    if (current.paneltype === "CitadelProfilePage") return "";
                }
                current = anchor;
                for (let depth = 0; depth < 10 && P.isAlive(current); depth++, current = parent(current)) {
                    const account = classAccount(current);
                    if (account) return account;
                }
                for (const owner of [root, $.GetContextPanel()]) {
                    const account = classAccount(owner);
                    if (account) return account;
                }
                return QOL.getAccountIdForBuildCategoryPayload ? U.ParseAccountId(QOL.getAccountIdForBuildCategoryPayload(root)) : "";
            }
            function retireButton(record) {
                record.active = false;
                if (P.isAlive(record.button)) {
                    try { record.button.SetPanelEvent("onactivate", () => {}); } catch (_) {}
                    P.setVisible(record.button, false);
                    P.delete(record.button);
                }
                record.button = null; record.label = null; record.buttonSig = null; record.labelSig = null; record.bound = false;
            }
            function release() {
                for (const record of records.values()) retireButton(record);
                records.clear(); scanRoot = null; nextScan = 0; misses = 0;
            }
            function createButton(record) {
                if (P.isAlive(record.button) && parent(record.button) !== record.source) retireButton(record);
                if (!P.isAlive(record.button)) {
                    // Retire leftovers from a prior script generation; adoption
                    // could retain its account closure or pending asynchronous delete.
                    const orphan = directClass(record.source, "QOLStatlockerButton");
                    if (P.isAlive(orphan)) { orphan.SetPanelEvent("onactivate", () => {}); P.setVisible(orphan, false); P.delete(orphan); }
                    record.button = P.create("Button", record.source, "", { hittest: "true", hittestchildren: "false", acceptsfocus: "true" });
                    record.buttonSig = null; record.label = null; record.bound = false;
                }
                if (!P.isAlive(record.button)) return;
                P.setClass(record.button, "QOLStatlockerButton", true);
                if (!P.isAlive(record.label) || parent(record.label) !== record.button || !record.label.BHasClass("QOLStatlockerLabel")) {
                    record.label = directClass(record.button, "QOLStatlockerLabel") || P.create("Label", record.button, "");
                    record.labelSig = null;
                }
                if (!P.isAlive(record.label)) return;
                P.setClass(record.label, "QOLStatlockerLabel", true);
                if (record.label.text !== "STAT") record.label.text = "STAT";
                record.buttonSig = P.syncStyles(record.button, BUTTON_STYLES, record.buttonSig).sig;
                record.labelSig = P.syncStyles(record.label, LABEL_STYLES, record.labelSig).sig;
                if (!record.bound) {
                    const button = record.button;
                    button.SetPanelEvent("onactivate", () => {
                        const currentScope = documentScope();
                        if (!enabled || !record.active || record.button !== button || parent(button) !== record.source ||
                            !belongs(record.source, currentScope) || !target(record.source)) return;
                        const account = resolveAccount(record.source, currentScope);
                        if (account) $.DispatchEvent("ExternalBrowserGoToURL", "https://statlocker.gg/profile/" + account);
                    });
                    record.bound = true;
                }
                record.active = true;
            }
            function discover(scope) {
                const found = U.FindPanelsByClass(scope, "coreRating").filter(target);
                const current = new Set(found);
                for (const [source, record] of records) if (!current.has(source)) { retireButton(record); records.delete(source); }
                for (const source of found) if (!records.has(source)) records.set(source,
                    { source, button: null, label: null, buttonSig: null, labelSig: null, active: false, bound: false });
                misses = found.length ? 0 : Math.min(4, misses + 1);
                nextScan = U.PerfNowMs() + (found.length ? 3000 : Math.min(6000, 3000 * (1 + misses)));
            }
            function update() {
                if (!enabled) return;
                const scope = documentScope();
                if (!P.isAlive(scope)) { release(); return; }
                if (scope !== scanRoot) { release(); scanRoot = scope; }
                let invalid = false;
                for (const [source, record] of records) if (!belongs(source, scope) || !target(source)) {
                    retireButton(record); records.delete(source); invalid = true;
                }
                if (invalid || U.PerfNowMs() >= nextScan) discover(scope);
                for (const record of records.values()) createButton(record);
            }
            return {
                onEnable() { enabled = true; update(); loop = QOL.core.Scheduler.createPollLoop(update, 1.2, ctx.id); },
                onSettingsChanged() { nextScan = 0; update(); },
                onDisable() { enabled = false; if (loop) { loop.stop(); loop = null; } release(); }
            };
        },
        test() {
            const sources = QOL.utils.FindPanelsByClass($.GetContextPanel(), "coreRating");
            return sources.length ? { passed: true, name: "Statlocker native rows", message: "Observed " + sources.length + " coreRating panels" } : null;
        }
    });
})();
