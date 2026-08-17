// ql_feat_chattranslate.js — personal localhost Russian-to-English chat prototype
(function() {
    'use strict';
    var _featureId = "ql_feat_chattranslate";
    // DEPENDS: buildImagesInChatContainerWatermark, findChatMessageLabel, state, tryReadAccountIdFromKnownPartyPath, utils
    var _deps = QOL.import(["buildImagesInChatContainerWatermark", "findChatMessageLabel", "state", "tryReadAccountIdFromKnownPartyPath", "utils"]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var IsPanelValid = Utils.IsPanelValid;
    var PerfNowMs = Utils.PerfNowMs;
    var BuildWatermark = _deps.buildImagesInChatContainerWatermark;
    var FindChatMessageLabel = _deps.findChatMessageLabel;
    var TryReadAccountIdFromKnownPartyPath = _deps.tryReadAccountIdFromKnownPartyPath;
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
            // Legacy gates are cached by config signature. Force one rebuild so
            // a resolved non-owner stops dispatching this feature entirely.
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

    function GetContainer(root, cacheKey, panelId) {
        var panel = IsPanelValid(State.cachedPanels[cacheKey]) ? State.cachedPanels[cacheKey] : null;
        if (!panel && root && root.FindChildTraverse) {
            panel = root.FindChildTraverse(panelId);
            State.cachedPanels[cacheKey] = panel || null;
        }
        return panel;
    }

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
        // Approximate Oracle Semibold's 15px advance from the source text.
        // The server independently shrink-wraps the translated texture, while
        // this keeps the Panorama viewport compact for short chat messages.
        var logicalWidth = Math.max(80, Math.min(maxLogicalWidth, (text.length * 7) + 34));
        // The server wraps at the same logical widths. Estimate lines from the
        // source so the explicit image viewport follows the native chat row;
        // preserve-aspect scaling then downsamples the 3x texture into it.
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
        // Panorama traversal order is not chronological in either chatbox.
        // Only discard panels the engine has actually deleted; slicing either
        // end of this array can remove currently visible translated messages.
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
            // The bottom ChatMessages panel nests ChatMessage rows below direct
            // children, so its shallow watermark can remain unchanged when a
            // message arrives. The retained-row cache makes this periodic scan
            // cheap while guaranteeing both chatboxes eventually see each row.
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
        // Some HUD variants expose a duplicate/unusable `Messages` ID. Preserve
        // root-wide discovery for those layouts, but keep it off the 300ms hot
        // path now that the normal case uses the cached top-chat container.
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

    QOL.register("localChatTranslation", {
        configKeys: [],
        bucket: 7,
        phase: -1,
        requiresRoot: true,
        perfLabel: "loop.local_chat_translation",
        gate: function() { return State.localTranslationOwnerMatch !== false; },
        update: function(root, cfg, nowMs) {
            if (!ResolveOwnerMatch(root, nowMs || PerfNowMs())) return;
            UpdateLocalChatTranslation(root, nowMs || PerfNowMs());
        },
        stateKeys: ["localTranslationTopContainer", "localTranslationBottomContainer",
                    "localTranslationTopWatermark", "localTranslationBottomWatermark",
                    "localTranslationTopCache", "localTranslationBottomCache",
                    "localTranslationTopNextScanMs", "localTranslationBottomNextScanMs",
                    "localTranslationTopFallbackNextScanMs",
                    "localTranslationTopIdleMisses", "localTranslationBottomIdleMisses",
                    "localTranslationOwnerMatch", "localTranslationOwnerNextCheckMs",
                    "localTranslationOwnerResolveDeadlineMs"]
    });

    try {
        if (typeof UpdateLocalChatTranslation !== "function") throw new Error("UpdateLocalChatTranslation is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
