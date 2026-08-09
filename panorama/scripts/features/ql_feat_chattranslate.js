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
    var OWNER_IGN = "breadrollius";
    var CYRILLIC_RE = /[\u0400-\u04FF]/;
    var MAX_TEXT_BYTES_APPROX = 480;
    var TOP_RETAINED_MESSAGES = 6;
    var BOTTOM_RETAINED_MESSAGES = 10;
    var ACTIVE_SCAN_DELAY_MS = 200;
    var IDLE_SCAN_MAX_DELAY_MS = 2000;

    function ReadLocalPlayerName(root) {
        if (!root || !root.FindChildTraverse) return "";
        var partyContainer = root.FindChildTraverse("CitadelPartyContainer");
        var party = partyContainer && partyContainer.FindChildTraverse ? partyContainer.FindChildTraverse("CitadelParty") : null;
        var localPlayer = party && party.FindChildTraverse ? party.FindChildTraverse("LocalPlayer") : null;
        if (!localPlayer) return "";
        var ids = ["PlayerName", "PersonaName", "Username", "UserName"];
        for (var i = 0; i < ids.length; i++) {
            var label = localPlayer.FindChildTraverse ? localPlayer.FindChildTraverse(ids[i]) : null;
            if (label && label.text) return String(label.text).trim().toLowerCase();
        }
        return "";
    }

    function ResolveOwnerMatch(root, nowMs) {
        if (State.localTranslationOwnerMatch === true || State.localTranslationOwnerMatch === false) {
            return State.localTranslationOwnerMatch;
        }
        if (nowMs < (Number(State.localTranslationOwnerNextCheckMs) || 0)) return false;
        State.localTranslationOwnerNextCheckMs = nowMs + 2000;
        var accountId = "";
        try { accountId = String(TryReadAccountIdFromKnownPartyPath(root) || ""); } catch(eId) { accountId = ""; }
        if (accountId) {
            State.localTranslationOwnerMatch = accountId === OWNER_ACCOUNT_ID;
            return State.localTranslationOwnerMatch;
        }
        var playerName = ReadLocalPlayerName(root);
        if (playerName) {
            State.localTranslationOwnerMatch = playerName === OWNER_IGN;
            return State.localTranslationOwnerMatch;
        }
        return false;
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

    function ProcessContainer(container, cacheKey, isBottom) {
        if (!IsPanelValid(container)) return;
        var cache = State[cacheKey];
        if (!Array.isArray(cache)) {
            cache = [];
            State[cacheKey] = cache;
        }
        var messages = container.FindChildrenWithClassTraverse("ChatMessage") || [];
        var retainedCount = isBottom ? BOTTOM_RETAINED_MESSAGES : TOP_RETAINED_MESSAGES;
        var firstRetained = Math.max(0, messages.length - retainedCount);
        for (var cacheIndex = cache.length - 1; cacheIndex >= 0; cacheIndex--) {
            var retained = false;
            for (var recentIndex = firstRetained; recentIndex < messages.length; recentIndex++) {
                if (cache[cacheIndex] && cache[cacheIndex].panel === messages[recentIndex]) {
                    retained = true;
                    break;
                }
            }
            if (!retained) {
                DeleteInjected(cache[cacheIndex]);
                cache.splice(cacheIndex, 1);
            }
        }
        for (var i = firstRetained; i < messages.length; i++) {
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
        while (cache.length > retainedCount) {
            DeleteInjected(cache[0]);
            cache.shift();
        }
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
            return;
        }
        State[watermarkKey] = watermark;
        State[idleKey] = 0;
        State[nextScanKey] = nowMs + ACTIVE_SCAN_DELAY_MS;
        ProcessContainer(container, cacheKey, isBottom);
    }

    function UpdateLocalChatTranslation(root, nowMs) {
        MaybeProcess(root, "localTranslationTopContainer", "Messages", "localTranslationTopWatermark", "localTranslationTopCache",
                     "localTranslationTopNextScanMs", "localTranslationTopIdleMisses", false, nowMs);
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
                    "localTranslationTopIdleMisses", "localTranslationBottomIdleMisses",
                    "localTranslationOwnerMatch", "localTranslationOwnerNextCheckMs"]
    });

    try {
        if (typeof UpdateLocalChatTranslation !== "function") throw new Error("UpdateLocalChatTranslation is not a function");
    } catch(e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test failed: " + (e && e.message ? e.message : String(e)));
    }
})();
