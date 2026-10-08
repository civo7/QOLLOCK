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
            const corePath = [{ id: "Hud", optional: true }, { className: "HudCore" }];
            const channel = (id, bottom, ownerPath) => ({ bottom,
                resolver: QOL.panelCache.createIdResolver(id, { retryMs: 500, ownerPath }),
                container: null, records: new Map(), nextScan: 0, watermark: null, idle: 0 });
            const channels = [
                channel("Messages", false, [...corePath, "TopBar", { className: "ChatContainer" }, "Team1Chat"]),
                channel("Messages", false, [...corePath, "TopBar", { className: "ChatContainer" }, "Team2Chat"]),
                channel("ChatMessages", true, [...corePath, "Chat", "ChatLinesArea", { className: "ChatLinesWrapper" }])
            ];
            let running = false, model = null, root = null, loop = null, imageSerial = 0;
            let panelIds = new WeakMap(), panelSerial = 0;
            function parent(panel) { return P.isAlive(panel) ? panel.GetParent() : null; }
            function belongs(panel, owner) {
                if (!P.isAlive(owner)) return false;
                for (let depth = 0; depth < 64 && P.isAlive(panel); depth++, panel = parent(panel)) if (panel === owner) return true;
                return false;
            }
            function identity(panel) {
                if (!P.isAlive(panel)) return "-";
                if (!panelIds.has(panel)) panelIds.set(panel, ++panelSerial);
                return String(panelIds.get(panel));
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
                source.records.clear(); source.container = null; source.nextScan = 0; source.watermark = null; source.idle = 0;
                source.resolver.reset();
            }
            function release() {
                for (const source of channels) releaseChannel(source);
                root = null; panelIds = new WeakMap(); panelSerial = 0;
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
            function watermark(container) {
                const count = container.GetChildCount(), parts = [String(count)];
                for (let i = Math.max(0, count - 3); i < count; i++) {
                    const message = container.GetChild(i), label = P.isAlive(message) && message.BHasClass("ChatMessage") ? findLabel(message) : null;
                    parts.push(identity(message), identity(label), P.isAlive(label) ? String(label.text || "").trim().slice(0, 160) : "");
                }
                return parts.join("|");
            }
            function process(source) {
                const messages = U.FindPanelsByClass(source.container, "ChatMessage").slice(-MAX_MESSAGES), current = new Set(messages);
                for (const [message, record] of source.records) if (!current.has(message)) {
                    retireImage(record); source.records.delete(message);
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
                        retireImage(record); record.label = label; record.text = text; record.model = imageModel(text, source.bottom);
                    }
                    if (!render(record)) succeeded = false;
                }
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
                if (!P.isAlive(root) || !model) { release(); return; }
                const now = U.PerfNowMs(), selected = new Set();
                for (const source of channels) {
                    let current = source.resolver.resolve(root);
                    // The bounded compatibility fallback can find the first
                    // Messages host for either team. Each host has one owner.
                    if (selected.has(current)) current = null;
                    if (P.isAlive(current)) selected.add(current);
                    if (current !== source.container) { releaseChannel(source); source.container = current; }
                    prune(source);
                    if (!P.isAlive(current) || now < source.nextScan) continue;
                    const next = watermark(current);
                    source.idle = next === source.watermark ? Math.min(8, source.idle + 1) : 0;
                    source.watermark = next;
                    if (process(source)) source.nextScan = now + Math.min(2500, 200 + source.idle * 250);
                }
            }
            function refresh() {
                model = Number(ctx.config.view().ENABLE_IMAGES_IN_CHAT) === 1;
                for (const source of channels) source.nextScan = 0;
                if (running) update();
            }
            return {
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
