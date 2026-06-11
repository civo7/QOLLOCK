// ql_feat_chatimg.js — Images in chat
// Extracted from ql_core.js, Phase 9 Step 2b
(function() {
    'use strict';
    var _featureId = "ql_feat_chatimg";
    var _deps = QOL.import(["buildImagesInChatContainerWatermark","clearInjectedChatImagesForMessage","findChatMessageLabel","findImagesInChatMessageCacheEntry","getCachedPanel","getImagesInChatMessageCache","injectBottomChatImage","injectTopChatImage","perfNowMs","pruneImagesInChatMessageCache","state","setCachedPanel","utils"]);
    var GetCachedPanel = _deps.getCachedPanel;
    var State = _deps.state;
    var SetCachedPanel = _deps.setCachedPanel;
    var Utils = _deps.utils;
    var IMAGES_IN_CHAT_FULL_RESCAN_MS = 4000;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var PerfNowMs = Utils.PerfNowMs;
    var BuildImagesInChatContainerWatermark = _deps.buildImagesInChatContainerWatermark;
    function ResetImagesInChatContainerState(watermarkKey, fullScanKey, cacheKey) {
        State[watermarkKey] = "";
        State[fullScanKey] = 0;
        State[cacheKey] = [];
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
        var previousWatermark = String(State[watermarkKey] || "");
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
    }

    function GetImagesInChatContainer(root, cacheKey, panelId) {
        var panel = IsPanelValid(State.cachedPanels[cacheKey]) ? State.cachedPanels[cacheKey] : null;
        if (!panel && root && root.FindChildTraverse) {
            panel = root.FindChildTraverse(panelId);
            State.cachedPanels[cacheKey] = panel || null;
        }
        return panel;
    }

    function GetImagesInChatNextDelayMs(touchedCount, idleKey) {
        if (touchedCount > 0) {
            State[idleKey] = 0;
            return 200;
        }
        var idleMisses = Number(State[idleKey]) || 0;
        idleMisses = Math.min(8, idleMisses + 1);
        State[idleKey] = idleMisses;
        return Math.min(IMAGES_IN_CHAT_IDLE_MAX_DELAY_MS, 200 + (idleMisses * 250));
    }

    function UpdateImagesInChat(root, cfg) {
        if (!cfg || Number(cfg.ENABLE_IMAGES_IN_CHAT) !== 1) return;
        var nowMs = PerfNowMs();
        if (nowMs >= State.imagesInChatTopNextSearchMs) {
            var topContainer = GetImagesInChatContainer(root, "imagesInChatTopContainer", "Messages");
            if (!IsPanelValid(topContainer)) {
                State.imagesInChatTopNextSearchMs = nowMs + 2000;
                ResetImagesInChatContainerState("imagesInChatTopWatermark", "imagesInChatTopFullScanNextMs", "imagesInChatTopMessageCache");
            } else {
                var topTouched = 0;
                if (ShouldScanImagesInChatContainer(topContainer, "imagesInChatTopWatermark", "imagesInChatTopFullScanNextMs", nowMs)) {
                    topTouched = ProcessChatContainerImages(topContainer, false, "imagesInChatTopMessageCache");
                }
                State.imagesInChatTopNextSearchMs = nowMs + GetImagesInChatNextDelayMs(topTouched, "imagesInChatTopIdleMisses");
            }
        }
        if (nowMs >= State.imagesInChatBottomNextSearchMs) {
            var bottomContainer = GetImagesInChatContainer(root, "imagesInChatBottomContainer", "ChatMessages");
            if (!IsPanelValid(bottomContainer)) {
                State.imagesInChatBottomNextSearchMs = nowMs + 2000;
                ResetImagesInChatContainerState("imagesInChatBottomWatermark", "imagesInChatBottomFullScanNextMs", "imagesInChatBottomMessageCache");
            } else {
                var bottomTouched = 0;
                if (ShouldScanImagesInChatContainer(bottomContainer, "imagesInChatBottomWatermark", "imagesInChatBottomFullScanNextMs", nowMs)) {
                    bottomTouched = ProcessChatContainerImages(bottomContainer, true, "imagesInChatBottomMessageCache");
                }
                State.imagesInChatBottomNextSearchMs = nowMs + GetImagesInChatNextDelayMs(bottomTouched, "imagesInChatBottomIdleMisses");
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
