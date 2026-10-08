// OWNS: Account-restricted localhost translation images beside native chat text.
// DOES NOT OWN: Native chat text/visibility, image-load completion or the optional server.
// Sources: chat.xml and citadel_hud_top_bar_chat.xml. Account evidence comes
// from the existing core HUD party-path reader; the existing owner latch is retained.
(() => {
    "use strict";
    const ENDPOINT = "http://127.0.0.1:8765/translate.webp";
    const OWNER_ACCOUNT = "841196165", OWNER_LATCH = "QOL_LocalTranslationOwner_v1";
    const CYRILLIC = /[\u0400-\u04FF]/;
    const MAX_TEXT_BYTES_APPROX = 480, MAX_MESSAGES = 256;
    QOL.core.FeatureRegistry.register({
        id: "ql_chat_translate", enabledByDefault: true, settings: [],
        create(ctx) {
            const P = QOL.core.panel, U = QOL.utils;
            const channel = (id, bottom, ownerPath) => ({ id, bottom,
                resolver: QOL.panelCache.createIdResolver(id, { retryMs: 500, ownerPath }),
                container: null, records: new Map(), nextScan: 0, watermark: null, idle: 0 });
            const top = channel("Messages", false, [{ id: "Hud", optional: true }, { className: "HudCore" },
                "TopBar", { className: "ChatContainer" }, "Team1Chat"]);
            const bottom = channel("ChatMessages", true, [{ id: "Hud", optional: true }, { className: "HudCore" },
                "Chat", "ChatLinesArea", { className: "ChatLinesWrapper" }]);
            let root = null, hud = null, loop = null, enabled = false, owner = null;
            let ownerDeadline = null, nextOwnerCheck = 0, nextFallback = 0, imageSerial = 0;

            function parent(panel) { try { return P.isAlive(panel) ? panel.GetParent() : null; } catch (_) { return null; } }
            function belongs(panel, target) {
                for (let depth = 0; depth < 64 && P.isAlive(panel); depth++, panel = parent(panel)) if (panel === target) return true;
                return false;
            }
            function ancestorId(panel, id) {
                for (let depth = 0; depth < 32 && P.isAlive(panel); depth++, panel = parent(panel)) if (panel.id === id) return true;
                return false;
            }
            function ownerHosts() { return root === hud ? [root] : [root, hud]; }
            function readOwnerLatch() {
                for (const host of ownerHosts()) {
                    const value = U.SafeGetAttribute(host, OWNER_LATCH, "");
                    if (value === "1") return true;
                    if (value === "0") return false;
                }
                return null;
            }
            function commitOwner(match) {
                owner = match;
                const value = match ? "1" : "0";
                for (const host of ownerHosts()) if (P.isAlive(host) && U.SafeGetAttribute(host, OWNER_LATCH, "") !== value) {
                    U.SafeSetAttribute(host, OWNER_LATCH, value);
                }
                return owner;
            }
            function resolveOwner(now) {
                if (owner !== null) return owner;
                const latch = readOwnerLatch();
                if (latch !== null) { owner = latch; return owner; }
                if (ownerDeadline === null) ownerDeadline = now + 15000;
                if (now >= ownerDeadline) return commitOwner(false);
                if (now < nextOwnerCheck) return null;
                nextOwnerCheck = now + 250;
                const account = U.ParseAccountId(QOL.tryReadAccountIdFromKnownPartyPath(root));
                return account ? commitOwner(account === OWNER_ACCOUNT) : null;
            }

            const messageLabel = QOL.core.chatMessages.findLabel;
            function readText(label) { return P.isAlive(label) ? String(label.text || "").trim() : ""; }
            function approximateBytes(text) {
                let bytes = 0;
                for (let i = 0; i < text.length; i++) {
                    const code = text.charCodeAt(i);
                    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
                }
                return bytes;
            }
            function translationModel(text, isBottom) {
                if (!text || !CYRILLIC.test(text) || approximateBytes(text) > MAX_TEXT_BYTES_APPROX) return null;
                let encoded;
                try { encoded = encodeURIComponent(text); } catch (_) { return null; }
                const width = Math.max(80, Math.min(isBottom ? 390 : 215, text.length * 7 + 34));
                const lines = Math.max(1, Math.min(4, Math.ceil(text.length / (isBottom ? 48 : 26))));
                return { url: ENDPOINT + "?style=replace-v5&layout=" + (isBottom ? "bottom" : "top") + "&source=ru&target=en&text=" + encoded,
                    styles: { width: width + "px", height: (lines * 16 + 2) + "px", margin: "8px 10px 6px 12px", horizontalAlign: "left" } };
            }
            function retireImage(record) {
                if (P.isAlive(record.image)) {
                    P.setVisible(record.image, false);
                    P.delete(record.image);
                }
                record.image = null; record.signature = null; record.requested = null;
            }
            function releaseChannel(source) {
                for (const record of source.records.values()) retireImage(record);
                source.records.clear(); source.container = null; source.nextScan = 0; source.watermark = null; source.idle = 0;
                source.resolver.reset();
            }
            function release() {
                releaseChannel(top); releaseChannel(bottom);
                root = null; hud = null; owner = null; ownerDeadline = null; nextOwnerCheck = 0; nextFallback = 0;
            }
            function render(record) {
                const host = parent(record.label);
                if (!record.model || !P.isAlive(host)) { retireImage(record); return; }
                if (P.isAlive(record.image) && (parent(record.image) !== host || !record.image.BHasClass("QOLLocalChatTranslation"))) retireImage(record);
                if (!P.isAlive(record.image)) {
                    record.image = P.create("Image", host, "QOLLocalTranslation_" + U.PerfNowMs() + "_" + (++imageSerial), { scaling: "stretch-to-fit-preserve-aspect" });
                    record.signature = null; record.requested = null;
                    if (!P.isAlive(record.image)) return;
                    P.setVisible(record.image, false);
                }
                P.setClass(record.image, "QOLLocalChatTranslation", true);
                record.signature = P.syncStyles(record.image, record.model.styles, record.signature).sig;
                if (record.signature === null) return;
                if (record.requested !== record.model.url) {
                    record.image.SetImage(record.model.url);
                    record.requested = record.model.url;
                }
                if (record.image.visible !== true) P.setVisible(record.image, true);
                // SetImage acceptance is not proof that localhost returned an
                // image. Keep the native text readable without guessed load APIs.
            }
            function processMessages(source, messages, origin) {
                const current = new Set(messages);
                for (const [message, record] of source.records) if (record.origin === origin && !current.has(message)) {
                    retireImage(record); source.records.delete(message);
                }
                for (const message of messages.slice(-MAX_MESSAGES)) {
                    if (!P.isAlive(message)) continue;
                    const label = messageLabel(message), text = readText(label);
                    let record = source.records.get(message);
                    if (!record) {
                        record = { message, origin, label: null, text: null, model: null, image: null, signature: null, requested: null };
                        source.records.set(message, record);
                    }
                    record.origin = origin;
                    if (label !== record.label || text !== record.text) {
                        retireImage(record); record.label = label; record.text = text; record.model = translationModel(text, source.bottom);
                    }
                    render(record);
                }
                while (source.records.size > MAX_MESSAGES) {
                    const [message, record] = source.records.entries().next().value;
                    retireImage(record); source.records.delete(message);
                }
            }
            function watermark(container) {
                const count = container.GetChildCount(), parts = [String(count)];
                for (let i = Math.max(0, count - 3); i < count; i++) {
                    const child = container.GetChild(i);
                    parts.push(P.isAlive(child) ? String(child.id || "") : "-");
                    const text = P.isAlive(child) && child.BHasClass("ChatMessage") ? readText(messageLabel(child)) : "";
                    parts.push(text.slice(0, 160));
                }
                return parts.join("|");
            }
            function discoverContainer(source, now) {
                const current = source.resolver.resolve(root);
                if (current !== source.container) {
                    for (const [message, record] of source.records) if (record.origin === "container") {
                        retireImage(record); source.records.delete(message);
                    }
                    source.container = current; source.nextScan = 0; source.watermark = null; source.idle = 0;
                }
                if (now < source.nextScan) return;
                if (!P.isAlive(source.container)) { source.nextScan = now + 2000; return; }
                const next = watermark(source.container);
                source.idle = next === source.watermark ? Math.min(8, source.idle + 1) : 0;
                source.watermark = next;
                // Commit the scan deadline only after rendering succeeds, so
                // temporary native failures remain retryable at the active cadence.
                processMessages(source, U.FindPanelsByClass(source.container, "ChatMessage"), "container");
                source.nextScan = now + Math.min(2000, 200 + source.idle * 225);
            }
            function validRecord(source, record) {
                if (!P.isAlive(record.message) || !record.message.BHasClass("ChatMessage") || !belongs(record.message, root)) return false;
                if (record.origin === "container") return belongs(record.message, source.container);
                return !ancestorId(record.message, "ChatMessages") && !belongs(record.message, top.container);
            }
            function prune() {
                for (const source of [top, bottom]) for (const [message, record] of source.records) {
                    if (!validRecord(source, record)) {
                        retireImage(record); source.records.delete(message);
                        source.nextScan = 0; nextFallback = 0;
                    } else if (record.label && (!P.isAlive(record.label) || !belongs(record.label, message))) {
                        retireImage(record); record.label = null; record.text = null; record.model = null;
                        source.nextScan = 0; nextFallback = 0;
                    } else if (record.model && (!P.isAlive(record.image) || parent(record.image) !== parent(record.label))) {
                        retireImage(record); source.nextScan = 0; nextFallback = 0;
                    }
                }
            }
            function update() {
                if (!enabled) return;
                const currentRoot = $.GetContextPanel(), currentHud = P.findHud(currentRoot);
                if (currentRoot !== root || currentHud !== hud) { release(); root = currentRoot; hud = currentHud; }
                if (!P.isAlive(root)) return;
                const now = U.PerfNowMs(), match = resolveOwner(now);
                if (match === false) { if (loop) { loop.stop(); loop = null; } return; }
                if (match !== true) return;
                discoverContainer(top, now); discoverContainer(bottom, now); prune();
                if (now >= nextFallback) {
                    const messages = U.FindPanelsByClass(root, "ChatMessage").filter(message => P.isAlive(message) &&
                        !ancestorId(message, "ChatMessages") && !belongs(message, top.container));
                    processMessages(top, messages, "fallback");
                    nextFallback = now + 2000;
                }
            }
            return {
                onEnable() { enabled = true; loop = QOL.core.Scheduler.createPollLoop(update, 0.2, ctx.id); update(); },
                onSettingsChanged: update,
                onDisable() { enabled = false; if (loop) { loop.stop(); loop = null; } release(); }
            };
        },
        test() {
            const hud = QOL.core.panel.findHud($.GetContextPanel());
            return hud ? { passed: true, name: "Chat translation HUD context", message: "Observed current native context" } : null;
        }
    });
})();
