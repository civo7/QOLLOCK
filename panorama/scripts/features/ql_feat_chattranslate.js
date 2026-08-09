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
        if (!entry || !IsPanelValid(entry.image)) return;
        try { entry.image.DeleteAsync(0); } catch(e) { /* panel deleted mid-frame */ }
        entry.image = null;
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
        var image = $.CreatePanel("Image", parent, "QOLLocalTranslation_" + String(PerfNowMs()));
        if (!image) return;
        image.AddClass("QOLLocalChatTranslation");
        image.style.maxWidth = isBottom ? "520px" : "440px";
        image.style.maxHeight = "180px";
        image.style.marginTop = "5px";
        image.style.marginBottom = "3px";
        image.style.horizontalAlign = "left";
        var url = ENDPOINT + "?source=ru&target=en&text=" + encodeURIComponent(text);
        image.SetImage(url);
        entry.image = image;
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
                entry = { panel: msg, text: "", image: null };
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

    QOL.register("localChatTranslation", {
        configKeys: ["ENABLE_LOCAL_CHAT_TRANSLATION"],
        bucket: 7,
        phase: -1,
        requiresRoot: true,
        perfLabel: "loop.local_chat_translation",
        gate: function(cfg) { return IsCfgEnabled(cfg, "ENABLE_LOCAL_CHAT_TRANSLATION"); },
        update: function(root) { UpdateLocalChatTranslation(root); },
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
