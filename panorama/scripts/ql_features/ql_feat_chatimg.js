// ql_feat_chatimg.js — Images in chat
// Extracted from ql_core.js, Phase 9 Step 2b
(function() {
    'use strict';
    var _dk = "ql_feat_chatimg";
    var _deps = QOL.import(["buildImagesInChatContainerWatermark","clearInjectedChatImagesForMessage","findChatMessageLabel","findImagesInChatMessageCacheEntry","getCachedPanel","getImagesInChatMessageCache","injectBottomChatImage","injectTopChatImage","perfNowMs","pruneImagesInChatMessageCache","state","setCachedPanel","utils"]);
    var GC = _deps.getCachedPanel;
    var S = _deps.state;
    var SC = _deps.setCachedPanel;
    var U = _deps.utils;
    function ResetImagesInChatContainerState(watermarkKey, fullScanKey, cacheKey) {
        S[watermarkKey] = "";
        S[fullScanKey] = 0;
        S[cacheKey] = [];
    }

    function ProcessChatContainerImages(container, isBottomChat, cacheKey) {
        if (!IsPanelValid(container)) return 0;
        var messages = container.FindChildrenWithClassTraverse("ChatMessage");
        if (!messages) return 0;
        var touched = 0;
        var cache = GetImagesInChatMessageCache(cacheKey);
        for (var i = 0; i < messages.length; i++) {
            var msg = messages[i];
            if (!IsPanelValid(msg)) continue;
            var label = FindChatMessageLabel(msg);
            if (!label) continue;
            var text = label.text ? String(label.text).trim() : "";
            var entry = FindImagesInChatMessageCacheEntry(cache, msg);
            var alreadyProcessed = !!(msg.BHasClass && msg.BHasClass("imageProcessed"));
            if (entry && entry.text === text && alreadyProcessed) continue;
            if (entry && entry.text !== text) {
                ClearInjectedChatImagesForMessage(msg);
                alreadyProcessed = false;
            }
            if (!entry) {
                entry = { panel: msg, text: "", url: "" };
                cache.push(entry);
            }
            entry.text = text;
            var match = text ? text.match(IMAGES_IN_CHAT_URL_REGEX) : null;
            var url = match ? match[0] : "";
            entry.url = url;
            if (alreadyProcessed) continue;
            msg.AddClass("imageProcessed");
            touched++;
            if (!url) continue;
            if (isBottomChat) {
                InjectBottomChatImage(msg, url);
            } else {
                InjectTopChatImage(msg, url);
            }
        }
        PruneImagesInChatMessageCache(cache);
        return touched;
    }

    function ShouldScanImagesInChatContainer(container, watermarkKey, fullScanKey, nowMs) {
        var watermark = BuildImagesInChatContainerWatermark(container);
        var previousWatermark = String(S[watermarkKey] || "");
        if (watermark !== previousWatermark) {
            S[watermarkKey] = watermark;
            S[fullScanKey] = nowMs + IMAGES_IN_CHAT_FULL_RESCAN_MS;
            return true;
        }
        if (nowMs >= (Number(S[fullScanKey]) || 0)) {
            S[fullScanKey] = nowMs + IMAGES_IN_CHAT_FULL_RESCAN_MS;
            return true;
        }
        return false;
    }

    function GetImagesInChatContainer(root, cacheKey, panelId) {
        var panel = IsPanelValid(S.cachedPanels[cacheKey]) ? S.cachedPanels[cacheKey] : null;
        if (!panel && root && root.FindChildTraverse) {
            panel = root.FindChildTraverse(panelId);
            S.cachedPanels[cacheKey] = panel || null;
        }
        return panel;
    }

    function GetImagesInChatNextDelayMs(touchedCount, idleKey) {
        if (touchedCount > 0) {
            S[idleKey] = 0;
            return 200;
        }
        var idleMisses = Number(S[idleKey]) || 0;
        idleMisses = Math.min(8, idleMisses + 1);
        S[idleKey] = idleMisses;
        return Math.min(IMAGES_IN_CHAT_IDLE_MAX_DELAY_MS, 200 + (idleMisses * 250));
    }

    function UpdateImagesInChat(root, cfg) {
        if (!cfg || Number(cfg.ENABLE_IMAGES_IN_CHAT) !== 1) return;
        var nowMs = PerfNowMs();
        if (nowMs >= S.imagesInChatTopNextSearchMs) {
            var topContainer = GetImagesInChatContainer(root, "imagesInChatTopContainer", "Messages");
            if (!IsPanelValid(topContainer)) {
                S.imagesInChatTopNextSearchMs = nowMs + 2000;
                ResetImagesInChatContainerState("imagesInChatTopWatermark", "imagesInChatTopFullScanNextMs", "imagesInChatTopMessageCache");
            } else {
                var topTouched = 0;
                if (ShouldScanImagesInChatContainer(topContainer, "imagesInChatTopWatermark", "imagesInChatTopFullScanNextMs", nowMs)) {
                    topTouched = ProcessChatContainerImages(topContainer, false, "imagesInChatTopMessageCache");
                }
                S.imagesInChatTopNextSearchMs = nowMs + GetImagesInChatNextDelayMs(topTouched, "imagesInChatTopIdleMisses");
            }
        }
        if (nowMs >= S.imagesInChatBottomNextSearchMs) {
            var bottomContainer = GetImagesInChatContainer(root, "imagesInChatBottomContainer", "ChatMessages");
            if (!IsPanelValid(bottomContainer)) {
                S.imagesInChatBottomNextSearchMs = nowMs + 2000;
                ResetImagesInChatContainerState("imagesInChatBottomWatermark", "imagesInChatBottomFullScanNextMs", "imagesInChatBottomMessageCache");
            } else {
                var bottomTouched = 0;
                if (ShouldScanImagesInChatContainer(bottomContainer, "imagesInChatBottomWatermark", "imagesInChatBottomFullScanNextMs", nowMs)) {
                    bottomTouched = ProcessChatContainerImages(bottomContainer, true, "imagesInChatBottomMessageCache");
                }
                S.imagesInChatBottomNextSearchMs = nowMs + GetImagesInChatNextDelayMs(bottomTouched, "imagesInChatBottomIdleMisses");
            }
        }
    }

    // ── Registration ──
    QOL.register("imagesInChat", {
        configKeys: ["ENABLE_IMAGES_IN_CHAT"],
        bucket: 7, phase: -1,
        gate: function(cfg) { return IsCfgEnabled(cfg, "ENABLE_IMAGES_IN_CHAT"); },
        update: function(root, cfg, nowMs, State, hideoutConnected) {
            UpdateImagesInChat(root, cfg);
        },
        stateKeys: ["imagesInChatTopNextSearchMs",
                    "imagesInChatBottomNextSearchMs",
                    "imagesInChatTopIdleMisses",
                    "imagesInChatBottomIdleMisses",
                    "imagesInChatTopWatermark",
                    "imagesInChatBottomWatermark",
                    "imagesInChatTopFullScanNextMs",
                    "imagesInChatBottomFullScanNextMs",
                    "imagesInChatTopMessageCache",
                    "imagesInChatBottomMessageCache"]
    });

})();
