// ql_feat_chattranslate.js — personal localhost Russian-to-English chat prototype
(function() {
    'use strict';
    var _featureId = "ql_feat_chattranslate";
    // DEPENDS: buildImagesInChatContainerWatermark, findChatMessageLabel, state, utils
    var _deps = QOL.import(["buildImagesInChatContainerWatermark", "findChatMessageLabel", "state", "utils"]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var IsCfgEnabled = Utils.IsCfgEnabled;
    var IsPanelValid = Utils.IsPanelValid;
    var PerfNowMs = Utils.PerfNowMs;
    var BuildWatermark = _deps.buildImagesInChatContainerWatermark;
    var FindChatMessageLabel = _deps.findChatMessageLabel;
    var ENDPOINT = "http://127.0.0.1:8765/translate.webp";
    var CYRILLIC_RE = /[\u0400-\u04FF]/;
    var MAX_TEXT_BYTES_APPROX = 480;
    var CACHE_MAX = 80;

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
        var logicalWidth = isBottom ? 390 : 215;
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
        var url = ENDPOINT + "?style=replace-v4&layout=" + layout + "&source=ru&target=en&text=" + encodeURIComponent(text);
        image.SetImage(url);
        entry.image = image;
        entry.label = label;
        try { label.style.visibility = "collapse"; } catch(eHide) { /* panel deleted mid-frame */ }
    }

    function ProcessContainer(container, cacheKey, isBottom) {
        if (!IsPanelValid(container)) return;
        var cache = State[cacheKey];
        if (!Array.isArray(cache)) {
            cache = [];
            State[cacheKey] = cache;
        }
        var messages = container.FindChildrenWithClassTraverse("ChatMessage") || [];
        for (var i = 0; i < messages.length; i++) {
            var msg = messages[i];
            if (!IsPanelValid(msg)) continue;
            var label = FindChatMessageLabel(msg);
            if (!IsPanelValid(label)) continue;
            var text = label.text ? String(label.text).trim() : "";
            var entry = FindEntry(cache, msg);
            if (entry && entry.text === text) continue;
            if (!entry) {
                entry = { panel: msg, text: "", image: null, label: null };
                cache.push(entry);
            } else {
                DeleteInjected(entry);
            }
            entry.text = text;
            if (!text || !CYRILLIC_RE.test(text) || ApproxUtf8Length(text) > MAX_TEXT_BYTES_APPROX) continue;
            InjectTranslation(msg, label, text, entry, isBottom);
        }
        while (cache.length > CACHE_MAX) {
            DeleteInjected(cache[0]);
            cache.shift();
        }
    }

    function MaybeProcess(root, containerKey, panelId, watermarkKey, cacheKey, isBottom) {
        var container = GetContainer(root, containerKey, panelId);
        if (!IsPanelValid(container)) {
            State[watermarkKey] = "";
            return;
        }
        var watermark = BuildWatermark(container);
        if (watermark === String(State[watermarkKey] || "")) return;
        State[watermarkKey] = watermark;
        ProcessContainer(container, cacheKey, isBottom);
    }

    function UpdateLocalChatTranslation(root) {
        MaybeProcess(root, "localTranslationTopContainer", "Messages", "localTranslationTopWatermark", "localTranslationTopCache", false);
        MaybeProcess(root, "localTranslationBottomContainer", "ChatMessages", "localTranslationBottomWatermark", "localTranslationBottomCache", true);
    }

    function HasActiveTranslations() {
        var top = State.localTranslationTopCache;
        var bottom = State.localTranslationBottomCache;
        return (Array.isArray(top) && top.length > 0) || (Array.isArray(bottom) && bottom.length > 0);
    }

    function ClearTranslationCache(cacheKey) {
        var cache = State[cacheKey];
        if (!Array.isArray(cache)) return;
        for (var i = 0; i < cache.length; i++) DeleteInjected(cache[i]);
        State[cacheKey] = [];
    }

    function DisableLocalChatTranslation() {
        ClearTranslationCache("localTranslationTopCache");
        ClearTranslationCache("localTranslationBottomCache");
        State.localTranslationTopWatermark = "";
        State.localTranslationBottomWatermark = "";
    }

    QOL.register("localChatTranslation", {
        configKeys: ["ENABLE_LOCAL_CHAT_TRANSLATION"],
        bucket: 7,
        phase: -1,
        requiresRoot: true,
        perfLabel: "loop.local_chat_translation",
        gate: function(cfg) { return IsCfgEnabled(cfg, "ENABLE_LOCAL_CHAT_TRANSLATION") || HasActiveTranslations(); },
        update: function(root, cfg) {
            if (!IsCfgEnabled(cfg, "ENABLE_LOCAL_CHAT_TRANSLATION")) {
                DisableLocalChatTranslation();
                return;
            }
            UpdateLocalChatTranslation(root);
        },
        stateKeys: ["localTranslationTopContainer", "localTranslationBottomContainer",
                    "localTranslationTopWatermark", "localTranslationBottomWatermark",
                    "localTranslationTopCache", "localTranslationBottomCache"]
    });

    try {
        if (typeof UpdateLocalChatTranslation !== "function") throw new Error("UpdateLocalChatTranslation is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
