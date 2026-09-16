// features/ql_chat_images/manifest.js
// =============================================================================
// QOLLOCK — Images In Chat
// =============================================================================
// OWNS:        Inline chat image injection via regex URL matching.
//              Processes top (Messages) and bottom (ChatMessages) containers.
// DOES NOT OWN: Chat panels (Valve), image loading (Panorama engine)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_IMAGES_IN_CHAT
// CSS:         none
// PATTERN:     Polling (0.2Hz). Adaptive idle backoff (200ms active, up to 2500ms idle).
//              Self-throttling via imagesInChatTop/BottomNextSearchMs.
// CONFIG SRC:  ctx.config.view() (read-only hot path; has enableKey)
// PORTED FROM: features/ql_feat_chatimg.js (167 lines)
// =============================================================================

(() => {
    "use strict";
    const FR = QOL.core?.FeatureRegistry;
    if (!FR) {
        $.Msg("[QOLLock] ql_chat_images: FeatureRegistry not found — aborting");
        return;
    }

    FR.register({
        id: "ql_chat_images",
        enableKey: "ENABLE_IMAGES_IN_CHAT",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_IMAGES_IN_CHAT", type: "toggle", default: false },
            { key: "CHAT_SCALE", type: "slider", min: 50, max: 200, step: 1, default: 100, label: "Size", description: "Adjust size of the in-game chat." },
            { key: "CHAT_X_OFFSET", type: "slider", min: -1500, max: 1500, step: 5, default: 0, label: "Horizontal Offset", description: "Adjust horizontal position of the in-game chat." },
            { key: "CHAT_Y_OFFSET", type: "slider", min: -250, max: 800, step: 5, default: 0, label: "Vertical Offset", description: "Adjust vertical position of the in-game chat." }
        ],
        create(ctx) {
            const State = QOL.state || globalThis.State || {};
            const Utils = (typeof QOL_UTILS !== "undefined" ? QOL_UTILS : (QOL.utils || {}));
            const isPanelValid = (p) => QOL.core?.panel?.isAlive ? QOL.core.panel.isAlive(p) : (p != null && typeof p.IsValid === "function" && p.IsValid());
            const perfNowMs = () => Utils.PerfNowMs ? Utils.PerfNowMs() : (QOL.core?.time?.nowMs ? QOL.core.time.nowMs() : Date.now());

            const IMAGES_IN_CHAT_URL_REGEX = /^https?:\/\/\S+\.(?:png|jpg|jpeg|webp|gif)(?:\?\S*)?$/i;
            const IMAGES_IN_CHAT_MAX_W = 150;
            const IMAGES_IN_CHAT_MAX_H = 150;
            const IMAGES_IN_CHAT_CACHE_MAX_MESSAGES = 80;
            const IMAGES_IN_CHAT_FULL_RESCAN_MS = 4000;
            const IMAGES_IN_CHAT_IDLE_MAX_DELAY_MS = 2500;

            let _loop = null;
            let _root = null;

            const findChatMessageLabel = (msgPanel) => {
                if (!msgPanel) return null;
                const msgText = msgPanel.FindChildTraverse ? msgPanel.FindChildTraverse("MessageText") : null;
                if (msgText) return msgText;
                const msgContents = msgPanel.FindChildTraverse ? msgPanel.FindChildTraverse("MessageContents") : null;
                if (!msgContents || !msgContents.GetChildCount) return null;
                for (let i = 0; i < msgContents.GetChildCount(); i++) {
                    const child = msgContents.GetChild(i);
                    if (child && child.paneltype === "Label") return child;
                }
                return null;
            };

            const injectTopChatImage = (msgPanel, url) => {
                if (!msgPanel) return;
                const msgContainer = msgPanel.FindChildTraverse ? msgPanel.FindChildTraverse("MessageContents") : null;
                if (!msgContainer) return;
                const msgText = findChatMessageLabel(msgPanel);
                if (!msgText) return;
                const textContainer = msgText.GetParent ? msgText.GetParent() : null;
                if (!textContainer) return;
                textContainer.style.maxWidth = "9999px";
                const panelId = `InjectedChatImage_${perfNowMs()}`;
                const img = $.CreatePanel("Image", textContainer, panelId);
                if (!img) return;
                img.AddClass("InjectedChatImage");
                img.SetImage(`https://wsrv.nl/?url=${encodeURIComponent(url)}&w=150&h=150&fit=inside`);
                img.style.maxWidth = `${IMAGES_IN_CHAT_MAX_W}px`;
                img.style.maxHeight = `${IMAGES_IN_CHAT_MAX_H}px`;
                img.style.margin = "8px 8px 8px 8px";
                msgText.style.visibility = "collapse";
            };

            const injectBottomChatImage = (msgPanel, url) => {
                if (!msgPanel) return;
                const msgText = findChatMessageLabel(msgPanel);
                if (!msgText) return;
                const textContainer = msgText.GetParent ? msgText.GetParent() : null;
                if (!textContainer) return;
                textContainer.style.maxWidth = "9999px";
                const panelId = `InjectedChatImage_bot_${perfNowMs()}`;
                const img = $.CreatePanel("Image", textContainer, panelId);
                if (!img) return;
                img.AddClass("InjectedChatImage");
                img.SetImage(`https://wsrv.nl/?url=${encodeURIComponent(url)}&w=150&h=150&fit=inside`);
                img.style.maxWidth = `${IMAGES_IN_CHAT_MAX_W}px`;
                img.style.maxHeight = `${IMAGES_IN_CHAT_MAX_H}px`;
                img.style.margin = "4px 4px 4px 4px";
                msgText.style.visibility = "collapse";
            };

            const clearInjectedChatImagesForMessage = (msgPanel) => {
                if (!isPanelValid(msgPanel)) return;
                const msgText = findChatMessageLabel(msgPanel);
                if (msgText?.style) {
                    try { msgText.style.visibility = "visible"; } catch(e) {}
                }
                const msgContainer = msgPanel.FindChildTraverse ? msgPanel.FindChildTraverse("MessageContents") : null;
                if (msgContainer?.style) {
                    try { msgContainer.style.opacity = 1; } catch(e) {}
                }
                const textContainer = msgText?.GetParent ? msgText.GetParent() : null;
                if (textContainer?.Children) {
                    const children = textContainer.Children() || [];
                    for (let i = 0; i < children.length; i++) {
                        const child = children[i];
                        if (!child) continue;
                        const id = child.id ? String(child.id) : "";
                        const isInjected = id.startsWith("InjectedChatImage_") || (child.BHasClass && child.BHasClass("InjectedChatImage"));
                        if (isInjected && child.DeleteAsync) {
                            try { child.DeleteAsync(0); } catch(e) {}
                        }
                    }
                }
                if (msgPanel.SetHasClass) msgPanel.SetHasClass("imageProcessed", false);
                else if (msgPanel.RemoveClass) msgPanel.RemoveClass("imageProcessed");
            };

            const getImagesInChatMessageCache = (cacheKey) => {
                let cache = State[cacheKey];
                if (!Array.isArray(cache)) {
                    cache = [];
                    State[cacheKey] = cache;
                }
                return cache;
            };

            const findImagesInChatMessageCacheEntry = (cache, msgPanel) => {
                if (!cache) return null;
                for (let i = 0; i < cache.length; i++) {
                    const entry = cache[i];
                    if (!entry || !isPanelValid(entry.panel)) {
                        cache.splice(i, 1);
                        i--;
                        continue;
                    }
                    if (entry.panel === msgPanel) return entry;
                }
                return null;
            };

            const pruneImagesInChatMessageCache = (cache) => {
                if (!cache) return;
                for (let i = 0; i < cache.length; i++) {
                    const entry = cache[i];
                    if (!entry || !isPanelValid(entry.panel)) {
                        cache.splice(i, 1);
                        i--;
                    }
                }
                while (cache.length > IMAGES_IN_CHAT_CACHE_MAX_MESSAGES) {
                    cache.shift();
                }
            };

            const buildImagesInChatContainerWatermark = (container) => {
                if (!isPanelValid(container) || !container.GetChildCount) return "";
                let childCount = 0;
                try { childCount = container.GetChildCount(); } catch(e) { childCount = 0; }
                const parts = [String(childCount)];
                const start = Math.max(0, childCount - 3);
                for (let i = start; i < childCount; i++) {
                    let child = null;
                    try { child = container.GetChild(i); } catch(e) { child = null; }
                    if (!child) { parts.push("-"); continue; }
                    parts.push(String(child.id || ""));
                    const label = (child.BHasClass && child.BHasClass("ChatMessage")) ? findChatMessageLabel(child) : null;
                    let text = (label && typeof label.text === "string") ? String(label.text).trim() : "";
                    if (text.length > 160) text = text.slice(0, 160);
                    parts.push(text);
                }
                return parts.join("|");
            };

            // Expose on QOL namespace for backward compatibility
            QOL.findChatMessageLabel = findChatMessageLabel;
            QOL.injectTopChatImage = injectTopChatImage;
            QOL.injectBottomChatImage = injectBottomChatImage;
            QOL.clearInjectedChatImagesForMessage = clearInjectedChatImagesForMessage;
            QOL.getImagesInChatMessageCache = getImagesInChatMessageCache;
            QOL.findImagesInChatMessageCacheEntry = findImagesInChatMessageCacheEntry;
            QOL.pruneImagesInChatMessageCache = pruneImagesInChatMessageCache;
            QOL.buildImagesInChatContainerWatermark = buildImagesInChatContainerWatermark;

            // ── Helpers ──
            const resetImagesInChatContainerState = (watermarkKey, fullScanKey, cacheKey) => {
                State[watermarkKey] = "";
                State[fullScanKey] = 0;
                State[cacheKey] = [];
            };

            const processChatContainerImages = (container, isBottomChat, cacheKey) => {
                if (!isPanelValid(container)) return 0;
                const messages = container.FindChildrenWithClassTraverse("ChatMessage");
                if (!messages) return 0;
                let touched = 0;
                const cache = getImagesInChatMessageCache(cacheKey);
                for (let i = 0; i < messages.length; i++) {
                    const msg = messages[i];
                    if (!isPanelValid(msg)) continue;
                    const label = findChatMessageLabel(msg);
                    if (!label) continue;
                    const text = label.text ? String(label.text).trim() : "";
                    let entry = findImagesInChatMessageCacheEntry(cache, msg);
                    let alreadyProcessed = Boolean(msg.BHasClass && msg.BHasClass("imageProcessed"));
                    if (entry && entry.text === text && alreadyProcessed) continue;
                    if (entry && entry.text !== text) {
                        clearInjectedChatImagesForMessage(msg);
                        alreadyProcessed = false;
                    }
                    if (!entry) {
                        entry = { panel: msg, text: "", url: "" };
                        cache.push(entry);
                    }
                    entry.text = text;
                    const match = text ? text.match(IMAGES_IN_CHAT_URL_REGEX) : null;
                    const url = match ? match[0] : "";
                    entry.url = url;
                    if (alreadyProcessed) continue;
                    msg.AddClass("imageProcessed");
                    touched++;
                    if (!url) continue;
                    if (isBottomChat) {
                        injectBottomChatImage(msg, url);
                    } else {
                        injectTopChatImage(msg, url);
                    }
                }
                pruneImagesInChatMessageCache(cache);
                return touched;
            };

            const shouldScanImagesInChatContainer = (container, watermarkKey, fullScanKey, nowMs) => {
                const watermark = buildImagesInChatContainerWatermark(container);
                const previousWatermark = String(State[watermarkKey] || "");
                if (watermark !== previousWatermark) {
                    State[watermarkKey] = watermark;
                    State[fullScanKey] = nowMs + IMAGES_IN_CHAT_FULL_RESCAN_MS;
                    return true;
                }
                if (nowMs >= (Number(State[fullScanKey]) || 0)) {
                    State[fullScanKey] = nowMs + IMAGES_IN_CHAT_FULL_RESCAN_MS;
                    return true;
                }
                return false;
            };

            const getImagesInChatContainer = (root, cacheKey, panelId) => {
                let panel = isPanelValid(State.cachedPanels?.[cacheKey]) ? State.cachedPanels[cacheKey] : null;
                if (!panel && root?.FindChildTraverse) {
                    panel = root.FindChildTraverse(panelId);
                    if (State.cachedPanels) State.cachedPanels[cacheKey] = panel || null;
                }
                return panel;
            };

            const getImagesInChatNextDelayMs = (touchedCount, idleKey) => {
                if (touchedCount > 0) {
                    State[idleKey] = 0;
                    return 200;
                }
                let idleMisses = Number(State[idleKey]) || 0;
                idleMisses = Math.min(8, idleMisses + 1);
                State[idleKey] = idleMisses;
                return Math.min(IMAGES_IN_CHAT_IDLE_MAX_DELAY_MS, 200 + (idleMisses * 250));
            };

            // ── Main tick ──
            const _tick = () => {
                const root = _root || $.GetContextPanel();
                if (root && !_root) _root = root;
                const cfg = ctx.config.view();
                if (!cfg || Number(cfg.ENABLE_IMAGES_IN_CHAT) !== 1) return;

                const nowMs = perfNowMs();
                if (nowMs >= (State.imagesInChatTopNextSearchMs || 0)) {
                    const topContainer = getImagesInChatContainer(root, "imagesInChatTopContainer", "Messages");
                    if (!isPanelValid(topContainer)) {
                        State.imagesInChatTopNextSearchMs = nowMs + 2000;
                        resetImagesInChatContainerState("imagesInChatTopWatermark", "imagesInChatTopFullScanNextMs", "imagesInChatTopMessageCache");
                    } else {
                        let topTouched = 0;
                        if (shouldScanImagesInChatContainer(topContainer, "imagesInChatTopWatermark", "imagesInChatTopFullScanNextMs", nowMs)) {
                            topTouched = processChatContainerImages(topContainer, false, "imagesInChatTopMessageCache");
                        }
                        State.imagesInChatTopNextSearchMs = nowMs + getImagesInChatNextDelayMs(topTouched, "imagesInChatTopIdleMisses");
                    }
                }
                if (nowMs >= (State.imagesInChatBottomNextSearchMs || 0)) {
                    const bottomContainer = getImagesInChatContainer(root, "imagesInChatBottomContainer", "ChatMessages");
                    if (!isPanelValid(bottomContainer)) {
                        State.imagesInChatBottomNextSearchMs = nowMs + 2000;
                        resetImagesInChatContainerState("imagesInChatBottomWatermark", "imagesInChatBottomFullScanNextMs", "imagesInChatBottomMessageCache");
                    } else {
                        let bottomTouched = 0;
                        if (shouldScanImagesInChatContainer(bottomContainer, "imagesInChatBottomWatermark", "imagesInChatBottomFullScanNextMs", nowMs)) {
                            bottomTouched = processChatContainerImages(bottomContainer, true, "imagesInChatBottomMessageCache");
                        }
                        State.imagesInChatBottomNextSearchMs = nowMs + getImagesInChatNextDelayMs(bottomTouched, "imagesInChatBottomIdleMisses");
                    }
                }
            };

            return {
                onEnable() {
                    const S = QOL.core?.Scheduler;
                    _loop = S?.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_chat_images") : null;
                },
                onDisable() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    const S = QOL.core?.Scheduler;
                    if (S) S.cancelAllForFeature("ql_chat_images");
                    resetImagesInChatContainerState("imagesInChatTopWatermark", "imagesInChatTopFullScanNextMs", "imagesInChatTopMessageCache");
                    resetImagesInChatContainerState("imagesInChatBottomWatermark", "imagesInChatBottomFullScanNextMs", "imagesInChatBottomMessageCache");
                    State.imagesInChatTopNextSearchMs = 0;
                    State.imagesInChatBottomNextSearchMs = 0;
                    const root = _root || ($.GetContextPanel ? $.GetContextPanel() : null);
                    const resetFn = (typeof QOL !== "undefined" && (QOL.resetChatRuntime || (QOL.core?.hud?.resetChatRuntime)));
                    const livePanel = root?.FindChildTraverse ? root.FindChildTraverse("Chat") : null;
                    if (livePanel && typeof resetFn === "function") resetFn(livePanel);
                    _root = null;
                },
                onSettingsChanged() {
                    const root = _root || ($.GetContextPanel ? $.GetContextPanel() : null);
                    const updateFn = (typeof QOL !== "undefined" && (QOL.updateChatRuntime || (QOL.core?.hud?.updateChatRuntime)));
                    if (typeof updateFn === "function" && root) {
                        const cfg = ctx.config.all ? ctx.config.all() : {};
                        updateFn(root, cfg);
                    }
                }
            };
        },
        test(ctx) {
            try {
                const root = $.GetContextPanel();
                const top = root ? root.FindChildTraverse("Messages") : null;
                const bottom = root ? root.FindChildTraverse("ChatMessages") : null;
                const bothFound = Boolean(top && bottom);
                return {
                    passed: bothFound,
                    name: "Chat containers exist",
                    message: [!top ? "Messages not found" : "", !bottom ? "ChatMessages not found" : ""].filter((s) => s !== "").join(", "),
                    assertions: [
                        { passed: Boolean(top), name: "Messages (top chat) exists" },
                        { passed: Boolean(bottom), name: "ChatMessages (bottom chat) exists" }
                    ]
                };
            } catch(e) {
                return { passed: false, name: "Chat containers check", message: e?.message || String(e) };
            }
        }
    });
})();
