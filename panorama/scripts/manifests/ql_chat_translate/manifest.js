// manifests/ql_chat_translate/manifest.js
// =============================================================================
// QOLLOCK — Local Russian Chat Translation (Personal Prototype)
// =============================================================================
// OWNS:        Translates Russian chat text to English via local server
//              (127.0.0.1:8765/translate.webp) for account 841196165.
// DOES NOT OWN: Chat panels (Valve), translation server (external)
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: none (gated by account ID 841196165)
// CSS:         none
// PATTERN:     Polling (5Hz active, backoff when idle). Self-scheduling loop.
// PORTED FROM: features/ql_feat_chattranslate.js (307 lines)
// =============================================================================

(function() {
    "use strict";

    var FR = QOL.core.FeatureRegistry;
    if (!FR) { $.Msg("[QOLLock] ql_chat_translate: FeatureRegistry not found — aborting"); return; }
    var logger = QOL.core.Logger;

    var State = QOL.state || (typeof globalThis !== "undefined" && globalThis.State) || {};
    var Utils = QOL.utils;
    var IsPanelValid = QOL.utils.IsPanelValid;
    var PerfNowMs = QOL.utils.PerfNowMs;
    var BuildWatermark = function(c) { return QOL.buildImagesInChatContainerWatermark ? QOL.buildImagesInChatContainerWatermark(c) : ""; };
    var FindChatMessageLabel = function(p) { return QOL.findChatMessageLabel ? QOL.findChatMessageLabel(p) : null; };
    var TryReadAccountIdFromKnownPartyPath = function(r) { return QOL.tryReadAccountIdFromKnownPartyPath ? QOL.tryReadAccountIdFromKnownPartyPath(r) : ""; };

    var ENDPOINT = "http://127.0.0.1:8765/translate.webp";
    var OWNER_ACCOUNT_ID = "841196165";
    var OWNER_LATCH_ATTR = "QOL_LocalTranslationOwner_v1";
    var OWNER_RESOLVE_INTERVAL_MS = 250;
    var OWNER_RESOLVE_TIMEOUT_MS = 15000;
    var CYRILLIC_RE = /[\u0400-\u04FF]/;
    var MAX_TEXT_BYTES_APPROX = 480;
    var MAX_CACHED_MESSAGE_PANELS = 256;
    var ACTIVE_SCAN_DELAY_MS = 200;
    var IDLE_SCAN_MAX_DELAY_MS = 2000;
    var TOP_FALLBACK_SCAN_INTERVAL_MS = 2000;

    function FindHudPanel(root) {
        if (typeof QOL !== "undefined" && QOL.core?.panel?.findHud) return QOL.core.panel.findHud(root);
        if (!root || !root.FindChildTraverse) return null;
        try { return root.FindChildTraverse("Hud"); } catch(e) { return null; }
    }

    function ReadPersistedOwnerLatch(root) {
        var panels = [root, FindHudPanel(root)];
        for (var i = 0; i < panels.length; i++) {
            var panel = panels[i];
            if (!panel || !panel.GetAttributeString) continue;
            var value = "";
            try { value = String(panel.GetAttributeString(OWNER_LATCH_ATTR, "") || ""); } catch(e) { value = ""; }
            if (value === "1") return true;
            if (value === "0") return false;
        }
        return null;
    }

    function WritePersistedOwnerLatch(root, enabled) {
        var value = enabled ? "1" : "0";
        var panels = [root, FindHudPanel(root)];
        for (var i = 0; i < panels.length; i++) {
            var panel = panels[i];
            if (!panel || !panel.SetAttributeString) continue;
            try { panel.SetAttributeString(OWNER_LATCH_ATTR, value); } catch(e) { /* panel deleted mid-frame */ }
        }
    }

    function CommitOwnerMatch(root, enabled, persist) {
        var resolved = !!enabled;
        if (State.localTranslationOwnerMatch !== resolved) {
            State.localTranslationOwnerMatch = resolved;
            State.runtimeGateSig = "";
        }
        if (persist) WritePersistedOwnerLatch(root, resolved);
        return resolved;
    }

    function ResolveOwnerMatch(root, nowMs) {
        if (State.localTranslationOwnerMatch === true || State.localTranslationOwnerMatch === false) {
            return State.localTranslationOwnerMatch;
        }
        var persisted = ReadPersistedOwnerLatch(root);
        if (persisted === true || persisted === false) {
            return CommitOwnerMatch(root, persisted, false);
        }
        if (!State.localTranslationOwnerResolveDeadlineMs) {
            State.localTranslationOwnerResolveDeadlineMs = nowMs + OWNER_RESOLVE_TIMEOUT_MS;
        }
        if (nowMs >= State.localTranslationOwnerResolveDeadlineMs) {
            return CommitOwnerMatch(root, false, true);
        }
        if (nowMs < (Number(State.localTranslationOwnerNextCheckMs) || 0)) return false;
        State.localTranslationOwnerNextCheckMs = nowMs + OWNER_RESOLVE_INTERVAL_MS;
        var accountId = "";
        try { accountId = String(TryReadAccountIdFromKnownPartyPath(root) || ""); } catch(eId) { accountId = ""; }
        if (!accountId) return false;
        return CommitOwnerMatch(root, accountId === OWNER_ACCOUNT_ID, true);
    }

    var GetContainer = QOL.resolveCachedPanel;

    function FindEntry(cache, panel) {
        for (var i = 0; i < cache.length; i++) {
            if (!cache[i] || !IsPanelValid(cache[i].panel)) {
                cache.splice(i, 1);
                i--;
            } else if (cache[i].panel === panel) {
                return cache[i];
            }
        }
        return null;
    }

    function HasAncestorId(panel, panelId) {
        var current = panel;
        var depth = 0;
        while (current && depth < 32) {
            try {
                if (String(current.id || "") === panelId) return true;
                current = current.GetParent ? current.GetParent() : null;
            } catch(e) {
                return false;
            }
            depth++;
        }
        return false;
    }

    function FindTopChatMessages(root) {
        if (!root || !root.FindChildrenWithClassTraverse) return [];
        var all = [];
        try { all = root.FindChildrenWithClassTraverse("ChatMessage") || []; } catch(e) { all = []; }
        var top = [];
        for (var i = 0; i < all.length; i++) {
            if (IsPanelValid(all[i]) && !HasAncestorId(all[i], "ChatMessages")) top.push(all[i]);
        }
        return top;
    }

    function DeleteInjected(entry) {
        if (!entry) return;
        if (IsPanelValid(entry.label)) {
            try { entry.label.style.visibility = "visible"; } catch(eLabel) { /* panel deleted mid-frame */ }
        }
        if (IsPanelValid(entry.image)) {
            try { entry.image.DeleteAsync(0); } catch(e) { /* panel deleted mid-frame */ }
        }
        entry.image = null;
        entry.label = null;
    }

    function ApproxUtf8Length(text) {
        var length = 0;
        for (var i = 0; i < text.length; i++) {
            var code = text.charCodeAt(i);
            if (code < 0x80) length += 1;
            else if (code < 0x800) length += 2;
            else length += 3;
        }
        return length;
    }

    function InjectTranslation(msg, label, text, entry, isBottom) {
        var parent = label.GetParent ? label.GetParent() : null;
        if (!IsPanelValid(parent)) return;
        var image = $.CreatePanel("Image", parent, "QOLLocalTranslation_" + String(PerfNowMs()), {
            scaling: "stretch-to-fit-preserve-aspect"
        });
        if (!image) return;
        image.AddClass("QOLLocalChatTranslation");
        var maxLogicalWidth = isBottom ? 390 : 215;
        var logicalWidth = Math.max(80, Math.min(maxLogicalWidth, (text.length * 7) + 34));
        var charsPerLine = isBottom ? 48 : 26;
        var estimatedLines = Math.max(1, Math.min(4, Math.ceil(text.length / charsPerLine)));
        image.style.width = logicalWidth + "px";
        image.style.height = ((estimatedLines * 16) + 2) + "px";
        image.style.margin = "8px 10px 6px 12px";
        image.style.horizontalAlign = "left";
        var layout = isBottom ? "bottom" : "top";
        var url = ENDPOINT + "?style=replace-v5&layout=" + layout + "&source=ru&target=en&text=" + encodeURIComponent(text);
        image.SetImage(url);
        entry.image = image;
        entry.label = label;
        try { label.style.visibility = "collapse"; } catch(eHide) { /* panel deleted mid-frame */ }
    }

    function ProcessMessages(messages, cacheKey, isBottom) {
        var cache = State[cacheKey];
        if (!Array.isArray(cache)) {
            cache = [];
            State[cacheKey] = cache;
        }
        messages = messages || [];
        for (var cacheIndex = cache.length - 1; cacheIndex >= 0; cacheIndex--) {
            if (!cache[cacheIndex] || !IsPanelValid(cache[cacheIndex].panel)) {
                DeleteInjected(cache[cacheIndex]);
                cache.splice(cacheIndex, 1);
            }
        }
        for (var i = 0; i < messages.length; i++) {
            var msg = messages[i];
            if (!IsPanelValid(msg)) continue;
            var label = FindChatMessageLabel(msg);
            if (!IsPanelValid(label)) continue;
            var text = label.text ? String(label.text).trim() : "";
            var entry = FindEntry(cache, msg);
            var needsTranslation = !!text && CYRILLIC_RE.test(text) && ApproxUtf8Length(text) <= MAX_TEXT_BYTES_APPROX;
            if (entry && entry.text === text && (!needsTranslation || IsPanelValid(entry.image))) continue;
            if (!entry) {
                entry = { panel: msg, text: "", image: null, label: null };
                cache.push(entry);
            } else {
                DeleteInjected(entry);
            }
            entry.text = text;
            if (!needsTranslation) continue;
            InjectTranslation(msg, label, text, entry, isBottom);
        }
        while (cache.length > MAX_CACHED_MESSAGE_PANELS) {
            DeleteInjected(cache[0]);
            cache.shift();
        }
    }

    function ProcessContainer(container, cacheKey, isBottom) {
        if (!IsPanelValid(container)) return;
        var messages = [];
        try { messages = container.FindChildrenWithClassTraverse("ChatMessage") || []; } catch(e) { messages = []; }
        ProcessMessages(messages, cacheKey, isBottom);
    }

    function MaybeProcess(root, containerKey, panelId, watermarkKey, cacheKey, nextScanKey, idleKey, isBottom, nowMs) {
        if (nowMs < (Number(State[nextScanKey]) || 0)) return;
        var container = GetContainer(root, containerKey, panelId);
        if (!IsPanelValid(container)) {
            State[watermarkKey] = "";
            State[idleKey] = 0;
            State[nextScanKey] = nowMs + IDLE_SCAN_MAX_DELAY_MS;
            return;
        }
        var watermark = BuildWatermark(container);
        if (watermark === String(State[watermarkKey] || "")) {
            var idleMisses = Math.min(8, (Number(State[idleKey]) || 0) + 1);
            State[idleKey] = idleMisses;
            State[nextScanKey] = nowMs + Math.min(IDLE_SCAN_MAX_DELAY_MS, ACTIVE_SCAN_DELAY_MS + (idleMisses * 225));
            ProcessContainer(container, cacheKey, isBottom);
            return;
        }
        State[watermarkKey] = watermark;
        State[idleKey] = 0;
        State[nextScanKey] = nowMs + ACTIVE_SCAN_DELAY_MS;
        ProcessContainer(container, cacheKey, isBottom);
    }

    function MaybeProcessTopFallback(root, nowMs) {
        if (nowMs < (Number(State.localTranslationTopFallbackNextScanMs) || 0)) return;
        ProcessMessages(FindTopChatMessages(root), "localTranslationTopCache", false);
        State.localTranslationTopFallbackNextScanMs = nowMs + TOP_FALLBACK_SCAN_INTERVAL_MS;
    }

    function UpdateLocalChatTranslation(root, nowMs) {
        MaybeProcess(root, "localTranslationTopContainer", "Messages", "localTranslationTopWatermark", "localTranslationTopCache",
                     "localTranslationTopNextScanMs", "localTranslationTopIdleMisses", false, nowMs);
        MaybeProcessTopFallback(root, nowMs);
        MaybeProcess(root, "localTranslationBottomContainer", "ChatMessages", "localTranslationBottomWatermark", "localTranslationBottomCache",
                     "localTranslationBottomNextScanMs", "localTranslationBottomIdleMisses", true, nowMs);
    }

    FR.register({
        id: "ql_chat_translate",
        enabledByDefault: true,
        settings: [],
        stateKeys: [
            "localTranslationTopContainer", "localTranslationBottomContainer",
            "localTranslationTopWatermark", "localTranslationBottomWatermark",
            "localTranslationTopCache", "localTranslationBottomCache",
            "localTranslationTopNextScanMs", "localTranslationBottomNextScanMs",
            "localTranslationTopFallbackNextScanMs",
            "localTranslationTopIdleMisses", "localTranslationBottomIdleMisses",
            "localTranslationOwnerMatch", "localTranslationOwnerNextCheckMs",
            "localTranslationOwnerResolveDeadlineMs"
        ],
        create: function(ctx) {
            var _loop = null;

            function _tick() {
                try {
                    var root = $.GetContextPanel();
                    if (!root) return;
                    var nowMs = Date.now ? Date.now() : (new Date()).getTime();
                    var match = ResolveOwnerMatch(root, nowMs);
                    if (match === false) {
                        // Non-owner detected: stop loop entirely to save CPU
                        if (_loop) { _loop.stop(); _loop = null; }
                        return;
                    }
                    if (!match) return;
                    UpdateLocalChatTranslation(root, nowMs);
                } catch(e) {
                    if (logger && logger.logError) {
                        logger.logError("ql_chat_translate", "_tick threw: " + (e.message || e));
                    }
                }
            }

            return {
                onEnable: function() {
                    var S = QOL.core.Scheduler;
                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, 0.2, "ql_chat_translate") : null;
                    _tick();
                },
                onDisable: function() {
                    if (_loop) { _loop.stop(); _loop = null; }
                    var S = QOL.core.Scheduler;
                    if (S) S.cancelAllForFeature("ql_chat_translate");
                    try {
                        var topCache = State.localTranslationTopCache || [];
                        for (var i = 0; i < topCache.length; i++) DeleteInjected(topCache[i]);
                        var btmCache = State.localTranslationBottomCache || [];
                        for (var j = 0; j < btmCache.length; j++) DeleteInjected(btmCache[j]);
                    } catch(e) {}
                },
                onSettingsChanged: function() {}
            };
        },
        test: function(ctx) {
            try {
                var root = $.GetContextPanel();
                var hud = (typeof QOL !== "undefined" && QOL.core?.panel?.findHud) ? QOL.core.panel.findHud() : (root ? root.FindChildTraverse("Hud") : null);
                return {
                    passed: !!hud,
                    name: "Hud panel check",
                    message: hud ? "" : "Hud not found",
                    assertions: [{ passed: !!hud, name: "Hud panel exists" }]
                };
            } catch(e) {
                return { passed: false, name: "Chat translate test", message: (e && e.message ? e.message : String(e)) };
            }
        }
    });
})();
