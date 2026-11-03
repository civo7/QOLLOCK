// OWNS: URL image children in native chat messages; private source generations and bounded caches.
// DOES NOT OWN: Chat geometry, native message text/visibility or image-load completion.
// Sources: hud.xml, citadel_hud_top_bar_chat.xml and chat.xml; original proxy and URL matching are retained.
(() => {
    "use strict";
    const ID = "ql_chat_images", MAX_MESSAGES = 80;
    const URL_PATTERN = /^https?:\/\/\S+\.(?:png|jpg|jpeg|webp|gif)(?:\?\S*)?$/i;
    QOL.core.FeatureRegistry.register({
        id: ID, enableKey: "ENABLE_IMAGES_IN_CHAT", enabledByDefault: false,
        settings: [{ key: "ENABLE_IMAGES_IN_CHAT", type: "toggle" }],
        create(ctx) {
            const P = QOL.core.panel, U = QOL.utils, findLabel = QOL.core.chatMessages.findLabel;
            const channel = (team, bottom = false) => ({ team, bottom,
                container: null, records: new Map(), nextScan: 0, idle: 0 });
            const channels = [
                channel("Team1Chat"), channel("Team2Chat"), channel(null, true)
            ];
            let running = false, model = null, root = null, loop = null, imageSerial = 0;
            function parent(panel) { return P.isAlive(panel) ? panel.GetParent() : null; }
            function belongs(panel, owner) {
                if (!P.isAlive(owner)) return false;
                for (let depth = 0; depth < 64 && P.isAlive(panel); depth++, panel = parent(panel)) if (panel === owner) return true;
                return false;
            }
            function imageModel(text, bottom) {
                if (!URL_PATTERN.test(text)) return null;
                let encoded;
                try { encoded = encodeURIComponent(text); } catch (_) { return null; }
                return { url: "https://wsrv.nl/?url=" + encoded + "&w=150&h=150&fit=inside",
                    styles: { maxWidth: "150px", maxHeight: "150px", margin: bottom ? "4px 4px 4px 4px" : "8px 8px 8px 8px" } };
            }
            function retireImage(record) {
                if (P.isAlive(record.image)) { P.setVisible(record.image, false); P.delete(record.image); }
                record.image = null; record.signature = null; record.requested = null;
            }
            function releaseChannel(source) {
                for (const record of source.records.values()) retireImage(record);
                source.records.clear(); source.container = null; source.nextScan = 0; source.idle = 0;
            }
            function release() {
                for (const source of channels) releaseChannel(source);
                root = null;
            }
            function render(record) {
                const host = parent(record.label);
                if (!record.model || !P.isAlive(host)) { retireImage(record); return true; }
                if (P.isAlive(record.image) && parent(record.image) !== host) retireImage(record);
                if (!P.isAlive(record.image)) {
                    record.image = P.create("Image", host, "InjectedChatImage_" + U.PerfNowMs() + "_" + (++imageSerial));
                    record.signature = null; record.requested = null;
                    if (!P.isAlive(record.image)) return false;
                    P.setVisible(record.image, false);
                }
                P.setClass(record.image, "InjectedChatImage", true);
                record.signature = P.syncStyles(record.image, record.model.styles, record.signature).sig;
                if (record.signature === null) return false;
                if (record.requested !== record.model.url) {
                    record.image.SetImage(record.model.url); record.requested = record.model.url;
                }
                if (record.image.visible !== true) P.setVisible(record.image, true);
                // No verified generic load-completion callback exists. Native
                // source text stays readable while the engine requests the image.
                return true;
            }
            function process(source) {
                const messages = U.FindPanelsByClass(source.container, "ChatMessage").slice(-MAX_MESSAGES), current = new Set(messages);
                let changed = false;
                for (const [message, record] of source.records) if (!current.has(message)) {
                    retireImage(record); source.records.delete(message); changed = true;
                }
                let succeeded = true;
                for (const message of messages) {
                    if (!P.isAlive(message)) continue;
                    const label = findLabel(message), text = P.isAlive(label) ? String(label.text || "").trim() : "";
                    let record = source.records.get(message);
                    if (!record) {
                        record = { message, label: null, text: null, model: null, image: null, signature: null, requested: null };
                        source.records.set(message, record);
                    }
                    if (label !== record.label || text !== record.text) {
                        changed = true;
                        retireImage(record); record.label = label; record.text = text; record.model = imageModel(text, source.bottom);
                    }
                    if (!render(record)) succeeded = false;
                }
                source.idle = changed ? 0 : Math.min(8, source.idle + 1);
                return succeeded;
            }
            function prune(source) {
                for (const [message, record] of source.records) {
                    if (!P.isAlive(message) || !message.BHasClass("ChatMessage") || !belongs(message, source.container)) {
                        retireImage(record); source.records.delete(message); source.nextScan = 0;
                    } else if (record.label && (!P.isAlive(record.label) || !belongs(record.label, message))) {
                        retireImage(record); record.label = null; record.text = null; record.model = null; source.nextScan = 0;
                    } else if (record.model && (!P.isAlive(record.image) || parent(record.image) !== parent(record.label))) {
                        retireImage(record); source.nextScan = 0;
                    }
                }
            }
            function update() {
                if (!running) return;
                const currentRoot = P.findHud($.GetContextPanel());
                if (currentRoot !== root) { release(); root = currentRoot; }
                if (!P.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud") || !model) { release(); return; }
                const core = P.findChildByClass(root, "HudCore");
                const top = P.findChildByClass(P.findChild(core, "TopBar"), "ChatContainer");
                const lines = P.findChild(P.findChild(core, "Chat"), "ChatLinesArea");
                const bottom = P.findChild(P.findChildByClass(lines, "ChatLinesWrapper"), "ChatMessages");
                const now = U.PerfNowMs();
                for (const source of channels) {
                    const current = source.bottom ? bottom : P.findChild(P.findChild(top, source.team), "Messages");
                    if (current !== source.container) { releaseChannel(source); source.container = current; }
                    prune(source);
                    if (!P.isAlive(current) || now < source.nextScan) continue;
                    if (process(source)) source.nextScan = now + Math.min(2500, 200 + source.idle * 250);
                }
            }
            function refresh() {
                model = Number(ctx.config.view().ENABLE_IMAGES_IN_CHAT) === 1;
                for (const source of channels) source.nextScan = 0;
                if (running) update();
            }
            return {
                // Native message/text replacement has no verified delivery event.
                onEnable() { running = true; refresh(); loop = QOL.core.Scheduler.createPollLoop(update, 0.2, ctx.id); },
                onSettingsChanged: refresh,
                onDisable() { running = false; if (loop) loop.stop(); loop = null; release(); model = null; }
            };
        },
        test() {
            const hud = QOL.core.panel.findHud($.GetContextPanel());
            const top = QOL.core.panel.findTraverse(hud, "Messages"), bottom = QOL.core.panel.findTraverse(hud, "ChatMessages");
            return top || bottom ? { passed: true, name: "Native chat image sources", message: "Observed current message host" } : null;
        }
    });
})();
