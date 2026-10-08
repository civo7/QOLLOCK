// OWNS: HUD rank badge presentation, scoreboard account probes and rank publication.
// DOES NOT OWN: Native player identities, profile-card contexts or remote rank images.
// Sources: hud.xml EscapeMenu; players_list_entry.xml; citadel_hud_top_bar_team/player.xml.
// Profile-card communication uses document attributes, never shared JavaScript state.
(() => {
    "use strict";
    const API_URL = "https://api.deadlock-api.com/v1/players/";
    const imageUrl = account => API_URL + account + "/rank-predict/image?format=webp&size=small";
    const nameKey = name => String(name || "").toLowerCase().split("%").join("%25").split("|").join("%7C");

    QOL.core.FeatureRegistry.register({
        id: "ql_showrank", enableKey: "SHOW_RANK", enabledByDefault: false,
        settings: [{ key: "SHOW_RANK", type: "toggle" }, { key: "SHOW_RANK_TOPBAR", type: "toggle" }],
        create(ctx) {
            const P = QOL.core.panel, U = QOL.utils, S = QOL.core.Scheduler;
            const topResolver = QOL.panelCache.createIdResolver("TopBar", { retryMs: 500, ownerPath: [{ id: "Hud", optional: true }] });
            const escapeResolver = QOL.panelCache.createIdResolver("EscapeMenu", { retryMs: 500, ownerPath: [{ id: "Hud", optional: true }] });
            const listResolver = QOL.panelCache.createIdResolver("PlayersList", { retryMs: 500 });
            let root = null, doc = null, model = null, loop = null, deferred = null;
            let enabled = false, lifecycle = 0, generation = "", probeSerial = 0, probe = null;
            let hideout = false, scoreboardOpen = false;
            const rows = new Map(), players = new Map();

            function parent(panel) { try { return P.isAlive(panel) ? panel.GetParent() : null; } catch (_) { return null; } }
            function belongs(panel, owner) {
                for (let depth = 0; depth < 80 && P.isAlive(panel); depth++, panel = parent(panel)) if (panel === owner) return true;
                return false;
            }
            function documentRoot(panel) {
                for (let depth = 0; depth < 80 && P.isAlive(panel); depth++) {
                    const next = parent(panel);
                    if (!P.isAlive(next) || next === panel) break;
                    panel = next;
                }
                return panel;
            }
            const attr = (panel, key, fallback = "") => U.SafeGetAttribute(panel, key, fallback);
            function writeAttr(panel, key, value) {
                if (P.isAlive(panel) && attr(panel, key) !== String(value)) panel.SetAttributeString(key, String(value));
            }
            function classPanel(owner, className) { return U.FindFirstPanelByClass(owner, className); }
            function text(panel) { try { return P.isAlive(panel) ? String(panel.text || "").trim() : ""; } catch (_) { return ""; } }
            function classBinding(record, key, className) {
                let panel = record.bindings[key];
                if (!P.isAlive(panel) || !belongs(panel, record.source) || !panel.BHasClass(className) || U.PerfNowMs() >= record.nextBindingRefresh) {
                    panel = classPanel(record.source, className);
                    record.bindings[key] = panel;
                }
                return panel;
            }
            function readIdentity(record) {
                const isRow = record.kind === "row";
                const hero = classBinding(record, "hero", isRow ? "PlayerHeroHidden" : "HeroNameHidden") ||
                    (!isRow ? classBinding(record, "heroFallback", "HeroName") : null);
                const name = classBinding(record, "name", "PlayerName") ||
                    (!isRow ? classBinding(record, "nameFallback", "AlwaysPlayerName") : null);
                return { hero: text(hero), name: text(name) };
            }
            function makeRecord(source, kind) {
                const suffix = kind === "row" ? "" : "TopBar";
                return { source, kind, bindings: {}, nextBindingRefresh: 0, identity: null, account: "", failed: false,
                    nextLookup: U.PerfNowMs() + 300, idle: 0, base: null, overlay: null, accountLabel: null, imageAccount: null,
                    baseResolver: QOL.panelCache.createIdResolver("RankPredictionBadge" + suffix, { retryMs: 500 }),
                    overlayResolver: QOL.panelCache.createIdResolver("RankPredictionBadge" + suffix + "Overlay", { retryMs: 500 }) };
            }
            function clearPresentation(record) {
                P.setClass(record.base, "ShowRankVisible", false);
                P.setClass(record.overlay, "ShowRankVisible", false);
                if (P.isAlive(record.overlay)) record.overlay.SetImage("");
                if (P.isAlive(record.accountLabel) && text(record.accountLabel)) record.accountLabel.text = "";
                record.imageAccount = null;
            }
            function releaseRecord(record) {
                try { clearPresentation(record); } catch (_) { /* native generation retiring */ }
                record.baseResolver.reset(); record.overlayResolver.reset();
                record.bindings = {};
            }
            function refreshRecord(record) {
                const base = record.baseResolver.resolve(record.source);
                const overlay = record.overlayResolver.resolve(record.source);
                const accountLabel = classBinding(record, "account", record.kind === "row" ? "PlayerAccountHidden" : "PlayerAccountHiddenTopBar");
                if (base !== record.base || overlay !== record.overlay || accountLabel !== record.accountLabel) {
                    clearPresentation(record);
                    record.base = base; record.overlay = overlay; record.accountLabel = accountLabel;
                }
                const identity = readIdentity(record);
                if (!record.identity || identity.name !== record.identity.name || identity.hero !== record.identity.hero) {
                    clearPresentation(record);
                    record.identity = identity; record.account = ""; record.failed = false; record.nextLookup = 0; record.idle = 0;
                    if (probe?.record === record) abortProbe();
                }
                if (U.PerfNowMs() >= record.nextBindingRefresh) record.nextBindingRefresh = U.PerfNowMs() + 3000;
            }
            function render(record, visible) {
                P.setClass(record.base, "ShowRankVisible", visible);
                if (P.isAlive(record.overlay) && record.imageAccount !== record.account) {
                    record.overlay.SetImage(record.account ? imageUrl(record.account) : "");
                    record.imageAccount = record.account;
                }
                if (P.isAlive(record.accountLabel)) {
                    const value = record.failed ? "-" : record.account;
                    if (text(record.accountLabel) !== value) record.accountLabel.text = value;
                }
                P.setClass(record.overlay, "ShowRankVisible", visible && !!record.account);
            }

            // The roster is read from verified direct children each pass; a cached
            // player count cannot establish membership after native replacement.
            function topPlayers() {
                const top = topResolver.resolve(root), out = [];
                const teams = P.findChild(top, "TeamsContainer");
                if (!P.isAlive(teams)) return out;
                for (let i = 0; i < Math.min(4, teams.GetChildCount()); i++) {
                    const contents = P.findChild(teams.GetChild(i), "PlayerContents");
                    const container = P.findChild(contents, "PlayersContainer");
                    if (!P.isAlive(container)) continue;
                    for (let j = 0; j < Math.min(12, container.GetChildCount()); j++) {
                        const player = container.GetChild(j);
                        if (P.isAlive(player)) out.push(player);
                    }
                }
                return out;
            }
            function escapeRows() {
                const escape = escapeResolver.resolve(root);
                const list = listResolver.resolve(P.isAlive(escape) ? escape : root);
                if (!P.isAlive(list)) return [];
                const queue = [], out = [];
                for (let i = 0; i < Math.min(200, list.GetChildCount()); i++) queue.push(list.GetChild(i));
                for (let i = 0; i < queue.length && i < 2000; i++) {
                    const panel = queue[i];
                    if (!P.isAlive(panel)) continue;
                    if (panel.paneltype === "CitadelPlayersListEntry") { out.push(panel); continue; }
                    for (let j = 0; j < panel.GetChildCount() && queue.length < 2000; j++) queue.push(panel.GetChild(j));
                }
                return out;
            }
            function reconcile(records, sources, kind) {
                const current = new Set(sources);
                for (const [source, record] of records) if (!current.has(source)) {
                    if (probe?.record === record) abortProbe();
                    releaseRecord(record); records.delete(source);
                }
                for (const source of sources) {
                    if (!records.has(source)) records.set(source, makeRecord(source, kind));
                    refreshRecord(records.get(source));
                }
            }

            function clearPublication(target = doc) {
                if (!P.isAlive(target)) return;
                for (const [list, prefix] of [["qol_sr_ranked_heroes", "qol_sr_rank_"], ["qol_sr_ranked_names", "qol_sr_rankp_"]]) {
                    for (const key of attr(target, list).split("|")) if (key) writeAttr(target, prefix + key, "");
                    writeAttr(target, list, "");
                }
            }
            function publishRanks() {
                const heroes = new Map(), names = new Map();
                function add(map, key, account) {
                    if (!key) return;
                    if (!map.has(key)) map.set(key, account);
                    else if (map.get(key) !== account) map.set(key, "");
                }
                for (const record of rows.values()) if (record.account) {
                    add(heroes, record.identity.hero.toLowerCase(), record.account);
                    add(names, nameKey(record.identity.name), record.account);
                }
                for (const [list, prefix, values] of [["qol_sr_ranked_heroes", "qol_sr_rank_", heroes], ["qol_sr_ranked_names", "qol_sr_rankp_", names]]) {
                    for (const key of attr(doc, list).split("|")) if (key && !values.has(key)) writeAttr(doc, prefix + key, "");
                    for (const [key, account] of values) writeAttr(doc, prefix + key, account);
                    writeAttr(doc, list, Array.from(values.keys()).join("|"));
                }
            }
            function dismissCard() {
                try { if (typeof DismissAllContextMenus === "function") DismissAllContextMenus(); else $.DispatchEvent("DismissAllContextMenus"); } catch (_) {}
                try { if (typeof DropInputFocus === "function") DropInputFocus(); else $.DispatchEvent("DropInputFocus"); } catch (_) {}
            }
            function cancelDeferred() { if (deferred) { deferred.stop(); deferred = null; } }
            function clearProbeAttributes(target = doc) {
                for (const key of ["qol_sr_fill_token", "qol_sr_probe_token", "qol_sr_probe_name", "qol_sr_probe_hero", "qol_sr_probe_account", "qol_sr_probe_result_token"]) writeAttr(target, key, "");
            }
            function abortProbe() {
                cancelDeferred();
                const active = !!probe;
                probe = null;
                clearProbeAttributes();
                if (active) dismissCard();
            }
            function defer(callback, seconds) {
                cancelDeferred();
                const activeLifecycle = lifecycle;
                deferred = S.scheduleOnce(() => {
                    deferred = null;
                    if (enabled && lifecycle === activeLifecycle) callback();
                }, seconds, ctx.id);
            }
            function isOpen() {
                const hud = P.findHud(root);
                return !!(hud?.BHasClass("ShowEscapeMenu") || root?.BHasClass("ShowEscapeMenu"));
            }
            function isHideout() {
                const hud = P.findHud(root);
                return [hud, root].some(panel => P.isAlive(panel) && ["InHideout", "inHideoutIntro", "connectedToHideout"].some(name => panel.BHasClass(name)));
            }
            function correlatedFallback(token) {
                const labels = U.FindPanelsByClass(doc, "HiddenAccountID");
                for (let i = 0; i < Math.min(200, labels.length); i++) {
                    let card = labels[i];
                    for (let depth = 0; depth < 24 && P.isAlive(card); depth++, card = parent(card)) {
                        if (card.paneltype !== "CitadelProfileCard") continue;
                        if (attr(card, "qol_sr_card_probe_token") === token) {
                            // Canonical binding, including its blank state, wins.
                            const canonical = P.findTraverse(card, "QOLProfileCardAccountID");
                            return U.ParseAccountId(text(P.isAlive(canonical) ? canonical : labels[i]));
                        }
                        break;
                    }
                }
                return "";
            }
            function finishProbe(account, failed) {
                const record = probe.record;
                record.account = account; record.failed = failed;
                abortProbe();
                render(record, true); publishRanks();
                defer(startNextProbe, 0.1);
            }
            function pollProbe() {
                if (!probe) return;
                const identity = readIdentity(probe.record);
                if (!isOpen() || isHideout() || !rows.has(probe.record.source) ||
                    !belongs(probe.record.source, root) || !P.isAlive(probe.record.source) ||
                    identity.name !== probe.name || identity.hero !== probe.hero || attr(doc, "qol_sr_probe_token") !== probe.token) {
                    abortProbe(); return;
                }
                probe.attempt++;
                if (U.PerfNowMs() - probe.started > 2000 || probe.attempt > 20) { finishProbe("", true); return; }
                const account = attr(doc, "qol_sr_probe_result_token") === probe.token ? U.ParseAccountId(attr(doc, "qol_sr_probe_account")) : "";
                const result = account || correlatedFallback(probe.token);
                if (result) { finishProbe(result, false); return; }
                defer(pollProbe, 0.1);
            }
            function startNextProbe() {
                if (probe || !enabled || !isOpen() || isHideout()) return;
                const record = Array.from(rows.values()).find(row => !row.account && !row.failed && P.isAlive(row.accountLabel) && row.identity.name);
                if (!record) return;
                const token = generation + ":" + lifecycle + ":" + (++probeSerial);
                probe = { record, token, name: record.identity.name, hero: record.identity.hero, attempt: 0, started: U.PerfNowMs() };
                writeAttr(doc, "qol_sr_fill_token", token); writeAttr(doc, "qol_sr_probe_token", token);
                writeAttr(doc, "qol_sr_probe_name", probe.name); writeAttr(doc, "qol_sr_probe_hero", probe.hero);
                writeAttr(doc, "qol_sr_probe_account", ""); writeAttr(doc, "qol_sr_probe_result_token", "");
                dismissCard();
                try { $.DispatchEvent("Activated", P.findTraverse(record.source, "MainContents") || record.source, "mouse"); }
                catch (_) { finishProbe("", true); return; }
                defer(pollProbe, 0.1);
            }
            function resetGeneration() {
                abortProbe(); clearPublication();
                generation = String((parseInt(attr(doc, "qol_sr_generation", "0"), 10) || 0) + 1);
                writeAttr(doc, "qol_sr_generation", generation);
                for (const record of [...rows.values(), ...players.values()]) {
                    clearPresentation(record); record.account = ""; record.failed = false; record.nextLookup = 0; record.idle = 0;
                }
            }
            function update() {
                if (!enabled || !model) return;
                const currentRoot = $.GetContextPanel(), currentDoc = documentRoot(currentRoot);
                if (currentRoot !== root || currentDoc !== doc) {
                    abortProbe(); clearPublication();
                    for (const record of [...rows.values(), ...players.values()]) releaseRecord(record);
                    rows.clear(); players.clear(); P.setClass(root, "HideShowRankTopBar", false);
                    root = currentRoot; doc = currentDoc; resetGeneration();
                    scoreboardOpen = false; hideout = false;
                }
                if (!P.isAlive(root) || !P.isAlive(doc)) return;
                P.setClass(root, "HideShowRankTopBar", !model.topbar);
                const inHideout = isHideout();
                if (inHideout && !hideout) resetGeneration();
                hideout = inHideout;
                writeAttr(doc, "qol_sr_hideout", inHideout ? "1" : "0");
                if (inHideout) { scoreboardOpen = false; return; }
                reconcile(players, topPlayers(), "topbar");
                const open = isOpen();
                if (open) {
                    reconcile(rows, escapeRows(), "row");
                    publishRanks();
                    for (const record of rows.values()) render(record, true);
                    const pending = Array.from(rows.values()).some(record => !record.account && !record.failed && P.isAlive(record.accountLabel) && record.identity.name);
                    if (pending && !probe && !deferred) defer(startNextProbe, scoreboardOpen ? 0.1 : 0.2);
                } else if (probe || deferred) abortProbe();
                scoreboardOpen = open;
                for (const record of players.values()) {
                    const now = U.PerfNowMs();
                    if (model.topbar && now >= record.nextLookup) {
                        const account = U.ParseAccountId(attr(doc, "qol_sr_rank_" + record.identity.hero.toLowerCase())) ||
                            U.ParseAccountId(attr(doc, "qol_sr_rankp_" + nameKey(record.identity.name)));
                        record.idle = account === record.account ? record.idle + 1 : 0;
                        record.account = account;
                        record.nextLookup = now + (record.idle >= 3 ? 10000 : 3000);
                    }
                    render(record, model.topbar);
                }
            }
            function refreshSettings() {
                model = { topbar: Number(ctx.config.view().SHOW_RANK_TOPBAR) === 1 };
                for (const record of players.values()) record.nextLookup = 0;
                update();
            }
            return {
                onEnable() { enabled = true; lifecycle++; refreshSettings(); loop = S.createPollLoop(update, 0.5, ctx.id); },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    enabled = false; lifecycle++;
                    if (loop) { loop.stop(); loop = null; }
                    abortProbe(); clearPublication();
                    for (const record of [...rows.values(), ...players.values()]) releaseRecord(record);
                    rows.clear(); players.clear();
                    P.setClass(root, "HideShowRankTopBar", true);
                    topResolver.reset(); escapeResolver.reset(); listResolver.reset();
                    root = null; doc = null; model = null;
                }
            };
        },
        test() {
            const top = QOL.core.panel.findTraverse($.GetContextPanel(), "TopBar");
            return top ? { passed: true, name: "ShowRank native TopBar", message: "Observed current source" } : null;
        }
    });
})();
