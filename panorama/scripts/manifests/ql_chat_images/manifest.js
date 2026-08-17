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

(function() {
    "use strict";
    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_chat_images: FeatureRegistry not found — aborting"); return; }

    FR.register({
        id: "ql_chat_images",
        enableKey: "ENABLE_IMAGES_IN_CHAT",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_IMAGES_IN_CHAT", type: "toggle", default: false }
        ],
        create: function(ctx) {
            // ── QOL.import deps (verbatim from old feature) ──
            var _deps = QOL.import(["buildImagesInChatContainerWatermark","clearInjectedChatImagesForMessage","findChatMessageLabel","findImagesInChatMessageCacheEntry","getCachedPanel","getImagesInChatMessageCache","injectBottomChatImage","injectTopChatImage","pruneImagesInChatMessageCache","state","setCachedPanel","utils"]);
            var GetCachedPanel = _deps.getCachedPanel;
            var State = _deps.state;
            var SetCachedPanel = _deps.setCachedPanel;
            var Utils = _deps.utils;
            var IsCfgEnabled = Utils.IsCfgEnabled;
            var IsPanelValid = Utils.IsPanelValid;
            var PerfNowMs = Utils.PerfNowMs;
            var BuildImagesInChatContainerWatermark = _deps.buildImagesInChatContainerWatermark;
            var GetImagesInChatMessageCache = _deps.getImagesInChatMessageCache;
            var FindImagesInChatMessageCacheEntry = _deps.findImagesInChatMessageCacheEntry;
            var PruneImagesInChatMessageCache = _deps.pruneImagesInChatMessageCache;
            var ClearInjectedChatImagesForMessage = _deps.clearInjectedChatImagesForMessage;
            var FindChatMessageLabel = _deps.findChatMessageLabel;
            var InjectTopChatImage = _deps.injectTopChatImage;
            var InjectBottomChatImage = _deps.injectBottomChatImage;

            var _loop = null;
            var _root = null;

            // ── Constants (verbatim from old feature) ──
            var IMAGES_IN_CHAT_URL_REGEX = /^https?:\/\/\S+\.(?:png|jpg|jpeg|webp|gif)(?:\?\S*)?$/i;
            var IMAGES_IN_CHAT_FULL_RESCAN_MS = 4000;
            var IMAGES_IN_CHAT_IDLE_MAX_DELAY_MS = 2500;

            // ── Helpers (verbatim from old feature) ──
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

            // ── Main tick (adapted from UpdateImagesInChat) ──
            function _tick() {
                var root = _root || $.GetContextPanel(); if (root && !_root) _root = root;
                var cfg = ctx.config.view();
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

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_chat_images") : null;
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler; if (S) S.cancelAllForFeature("ql_chat_images");
                    // Clear dynamic State keys used for chat image tracking
                    ResetImagesInChatContainerState("imagesInChatTopWatermark", "imagesInChatTopFullScanNextMs", "imagesInChatTopMessageCache");
                    ResetImagesInChatContainerState("imagesInChatBottomWatermark", "imagesInChatBottomFullScanNextMs", "imagesInChatBottomMessageCache");
                    State.imagesInChatTopNextSearchMs = 0;
                    State.imagesInChatBottomNextSearchMs = 0;
                    State.imagesInChatTopIdleMisses = 0;
                    State.imagesInChatBottomIdleMisses = 0;
                    _root = null;
                },
                onSettingsChanged: function() {}
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var top = root ? root.FindChildTraverse("Messages") : null;
                var bottom = root ? root.FindChildTraverse("ChatMessages") : null;
                var bothFound = !!(top && bottom);
                return {
                    passed: bothFound,
                    name: "Chat containers exist",
                    message: [ !top ? "Messages not found" : "", !bottom ? "ChatMessages not found" : "" ].filter(function(s) { return s !== ""; }).join(", "),
                    assertions: [
                        { passed: !!top, name: "Messages (top chat) exists" },
                        { passed: !!bottom, name: "ChatMessages (bottom chat) exists" }
                    ]
                };
            } catch(e) { return { passed: false, name: "Chat containers check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
