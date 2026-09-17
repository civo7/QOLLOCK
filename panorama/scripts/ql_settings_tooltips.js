// ql_settings_tooltips.js — Settings floating tooltip system (tooltip panel
// management, scroll suppression, positioning, performance impact display,
// section perf tooltip binding, created-by/description helpers)
// Extracted from ql_settings.js, Phase 4
(function() {
    'use strict';

    var _deps = QOL.import(["utils"]);
    var Utils = _deps.utils;
    var WarnLog = (Utils && Utils.WarnLog) ? Utils.WarnLog : function(cat, msg) { $.Msg("[QOLLock][WARN][" + cat + "] " + msg); };

    // ── Tooltip globals ──

var SETTINGS_TOOLTIP_THEME_CLASS = "QOLSettingsTooltipThemeActive";
var SETTINGS_TOOLTIP_PERF_CLASS_NONE = "QOLSettingsTooltipPerfNone";
var SETTINGS_TOOLTIP_PERF_CLASS_LOW = "QOLSettingsTooltipPerfLow";
var SETTINGS_TOOLTIP_PERF_CLASS_MEDIUM = "QOLSettingsTooltipPerfMedium";
var SETTINGS_TOOLTIP_PERF_CLASS_HIGH = "QOLSettingsTooltipPerfHigh";
var gSettingsRowFloatingTooltipPanel = null;
var gSettingsRowFloatingTooltipPerfPrefixLabel = null;
var gSettingsRowFloatingTooltipPerfValueLabel = null;
var gSettingsRowFloatingTooltipBodyLabel = null;
var gSettingsRowFloatingTooltipCreatorPrefixLabel = null;
var gSettingsRowFloatingTooltipCreatorValueLabel = null;
var gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel = null;
var gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel = null;
var gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel = null;
var gSettingsRowFloatingTooltipVoiceMetaActorValueLabel = null;
var gSettingsRowFloatingTooltipAnchor = null;
var gSettingsRowFloatingTooltipLastCursorX = NaN;
var gSettingsRowFloatingTooltipLastCursorY = NaN;
var gSettingsRowFloatingTooltipLastX = NaN;
var gSettingsRowFloatingTooltipLastY = NaN;
var gSettingsRowFloatingTooltipTrackScheduled = false;
var SETTINGS_ROW_FLOATING_TOOLTIP_TRACK_INTERVAL_SEC = 0.03;
var SETTINGS_TOOLTIP_POSITION_DEBUG = false;
var SETTINGS_TOOLTIP_POSITION_DEBUG_INTERVAL_MS = 200;
var SETTINGS_TOOLTIP_SCROLL_SUPPRESS_MS = 250;
var SETTINGS_TOOLTIP_DEFER_HIDE_SEC = 0.06;
var SETTINGS_TOOLTIP_COLD_HOVER_DELAY_SEC = 0.10;
var SETTINGS_TOOLTIP_WARM_RECENT_MS = 250;
var gSettingsTooltipDebugNextMs = 0;
var gSettingsTooltipLastListScrollY = NaN;
var gSettingsTooltipLastHostScrollY = NaN;
var gSettingsTooltipLastThumbScrollY = NaN;
var gSettingsTooltipLastAnchorLocalY = NaN;
var gSettingsTooltipSuppressUntilMs = 0;
var gSettingsTooltipHideToken = 0;
var gSettingsTooltipPendingShowToken = 0;
var gSettingsTooltipLastVisibleTimeMs = 0;
var gSettingsTooltipObservedListScrollY = NaN;
var gSettingsTooltipObservedHostScrollY = NaN;
var gSettingsTooltipObservedThumbScrollY = NaN;
var gSettingsTooltipLastScrollMoveMs = 0;
var gSettingsTooltipLastSide = "";
var gSettingsTooltipStyleToActualX = 1.0;
var gSettingsTooltipStyleToActualY = 1.0;
var gSettingsTooltipLastWrittenStyleX = NaN;
var gSettingsTooltipLastWrittenStyleY = NaN;
var gSettingsTooltipCalibrationFramesRemaining = 0;

function ReadPanelScrollOffsetY(panel) {
    if (!panel || (panel.IsValid && !panel.IsValid())) return 0;
    var y = 0;
    try {
        var sy0 = Number(panel.scrolloffset_y);
        if (isFinite(sy0)) return sy0;
    } catch(e0) {}
    try {
        var syA = Number(panel.actualscrolloffset_y);
        if (isFinite(syA)) return syA;
    } catch(eA) {}
    try {
        var sy1 = Number(panel.scrolloffsetY);
        if (isFinite(sy1)) return sy1;
    } catch(e1) {}
    try {
        var sy2 = Number(panel.ScrollOffsetY);
        if (isFinite(sy2)) return sy2;
    } catch(e2) {}
    try {
        if (typeof panel.GetScrollOffset === "function") {
            var so = panel.GetScrollOffset();
            if (so && so.length >= 2) {
                var sy3 = Number(so[1]);
                if (isFinite(sy3)) return sy3;
            }
        }
    } catch(e3) {}
    return y;
}

function SettingsTooltipDebugLog(msg, force) {
    if (!SETTINGS_TOOLTIP_POSITION_DEBUG) return;
    var now = Date.now ? Date.now() : (new Date()).getTime();
    if (!force && now < (gSettingsTooltipDebugNextMs || 0)) return;
    gSettingsTooltipDebugNextMs = now + SETTINGS_TOOLTIP_POSITION_DEBUG_INTERVAL_MS;
    $.Msg("[QOLLock][TooltipPos] " + String(msg || ""));
}

function GetSettingsTooltipNowMs() {
    return Date.now ? Date.now() : (new Date()).getTime();
}

function SuppressSettingsTooltipForMs(durationMs, reason) {
    var now = GetSettingsTooltipNowMs();
    var ms = Number(durationMs);
    if (!isFinite(ms) || ms < 0) ms = 0;
    gSettingsTooltipSuppressUntilMs = now + ms;
    if (reason) {
        SettingsTooltipDebugLog("suppress ms=" + String(Math.round(ms)) + " reason=" + String(reason), true);
    }
}

function IsSettingsTooltipSuppressed() {
    var until = Number(gSettingsTooltipSuppressUntilMs);
    if (!isFinite(until) || until <= 0) return false;
    return GetSettingsTooltipNowMs() < until;
}

function UpdateSettingsTooltipScrollMotionWatch() {
    var snap = ReadSettingsTooltipScrollSnapshot();
    var listY = Number(snap.listY);
    var hostY = Number(snap.hostY);
    var thumbY = Number(snap.thumbY);
    if (!isFinite(listY)) listY = 0;
    if (!isFinite(hostY)) hostY = 0;
    if (!isFinite(thumbY)) thumbY = 0;
    var moved = false;
    if (isFinite(gSettingsTooltipObservedListScrollY) && Math.abs(listY - gSettingsTooltipObservedListScrollY) >= 1) moved = true;
    if (isFinite(gSettingsTooltipObservedHostScrollY) && Math.abs(hostY - gSettingsTooltipObservedHostScrollY) >= 1) moved = true;
    if (isFinite(gSettingsTooltipObservedThumbScrollY) && Math.abs(thumbY - gSettingsTooltipObservedThumbScrollY) >= 1) moved = true;
    gSettingsTooltipObservedListScrollY = listY;
    gSettingsTooltipObservedHostScrollY = hostY;
    gSettingsTooltipObservedThumbScrollY = thumbY;
    if (moved) gSettingsTooltipLastScrollMoveMs = GetSettingsTooltipNowMs();
    return moved;
}

function IsSettingsTooltipInRecentScrollMotion() {
    var now = GetSettingsTooltipNowMs();
    var last = Number(gSettingsTooltipLastScrollMoveMs);
    if (!isFinite(last) || last <= 0) return false;
    return (now - last) < SETTINGS_TOOLTIP_SCROLL_SUPPRESS_MS;
}

function CancelSettingsRowFloatingTooltipHide() {
    gSettingsTooltipHideToken++;
}

function CancelPendingSettingsRowFloatingTooltipShow() {
    gSettingsTooltipPendingShowToken++;
}

function HideSettingsRowFloatingTooltipDeferred(reason) {
    CancelPendingSettingsRowFloatingTooltipShow();
    CancelSettingsRowFloatingTooltipHide();
    var token = gSettingsTooltipHideToken;
    $.Schedule(SETTINGS_TOOLTIP_DEFER_HIDE_SEC, function() {
        if (token !== gSettingsTooltipHideToken) return;
        SettingsTooltipDebugLog("hide_deferred reason=" + String(reason || ""), true);
        HideSettingsRowFloatingTooltip();
    });
}

function IsSettingsRowFloatingTooltipVisible() {
    var panel = gSettingsRowFloatingTooltipPanel;
    if (!panel || (panel.IsValid && !panel.IsValid())) return false;
    if (!panel.BHasClass) return false;
    return !!panel.BHasClass("Visible");
}

function IsDescendantOf(panel, ancestor) {
    if (!panel || !ancestor) return false;
    var cur = panel;
    var guard = 0;
    while (cur && (!cur.IsValid || cur.IsValid()) && guard < 64) {
        if (cur === ancestor) return true;
        if (!cur.GetParent) break;
        cur = cur.GetParent();
        guard++;
    }
    return false;
}

function IsPanelVisibleInList(anchorPanel, settingsList, host) {
    if (!anchorPanel || (anchorPanel.IsValid && !anchorPanel.IsValid())) return false;
    if (!settingsList || (settingsList.IsValid && !settingsList.IsValid())) return true;

    var anchorY = (typeof GetPanelYOffsetWithinAncestor === "function")
        ? Number(GetPanelYOffsetWithinAncestor(anchorPanel, host)) : NaN;
    var anchorHeight = Number(anchorPanel.actuallayoutheight);
    var listY = (typeof GetPanelYOffsetWithinAncestor === "function")
        ? Number(GetPanelYOffsetWithinAncestor(settingsList, host)) : NaN;
    var listHeight = Number(settingsList.actuallayoutheight);

    if (!isFinite(anchorY) || !isFinite(anchorHeight) || !isFinite(listY) || !isFinite(listHeight)) return true;
    if (listHeight <= 0) return true;

    if ((anchorY + anchorHeight <= listY + 4) || (anchorY >= listY + listHeight - 4)) {
        return false;
    }
    return true;
}

function TickSettingsRowFloatingTooltipPosition() {
    gSettingsRowFloatingTooltipTrackScheduled = false;
    if (!IsSettingsRowFloatingTooltipVisible()) return;
    var anchor = gSettingsRowFloatingTooltipAnchor;
    if (!anchor || (anchor.IsValid && !anchor.IsValid())) {
        HideSettingsRowFloatingTooltip();
        return;
    }

    var host = (gSettingsRowFloatingTooltipPanel && gSettingsRowFloatingTooltipPanel.GetParent)
        ? gSettingsRowFloatingTooltipPanel.GetParent()
        : null;

    var currentAnchorY = NaN;
    if (anchor && host && typeof GetPanelYOffsetWithinAncestor === "function") {
        var rawY = GetPanelYOffsetWithinAncestor(anchor, host);
        if (rawY !== null && isFinite(rawY)) currentAnchorY = Number(rawY);
    }

    var anchorMoved = isFinite(gSettingsTooltipLastAnchorLocalY) && isFinite(currentAnchorY) &&
        Math.abs(currentAnchorY - gSettingsTooltipLastAnchorLocalY) >= 1;
    var scrollChanged = DidSettingsTooltipScrollChange();

    if (anchorMoved || scrollChanged) {
        SuppressSettingsTooltipForMs(SETTINGS_TOOLTIP_SCROLL_SUPPRESS_MS, "scroll_motion");
        HideSettingsRowFloatingTooltip();
        return;
    }

    var context = $.GetContextPanel ? $.GetContextPanel() : null;
    var settingsList = null;
    try { settingsList = context ? context.FindChildTraverse("SettingsList") : null; } catch (_) {}
    if (settingsList && IsDescendantOf(anchor, settingsList)) {
        if (!IsPanelVisibleInList(anchor, settingsList, host)) {
            HideSettingsRowFloatingTooltip();
            return;
        }
    }

    PositionSettingsRowFloatingTooltip(anchor);
    gSettingsRowFloatingTooltipTrackScheduled = true;
    $.Schedule(SETTINGS_ROW_FLOATING_TOOLTIP_TRACK_INTERVAL_SEC, TickSettingsRowFloatingTooltipPosition);
}

function EnsureSettingsRowFloatingTooltipTracking() {
    if (gSettingsRowFloatingTooltipTrackScheduled) return;
    gSettingsRowFloatingTooltipTrackScheduled = true;
    $.Schedule(SETTINGS_ROW_FLOATING_TOOLTIP_TRACK_INTERVAL_SEC, TickSettingsRowFloatingTooltipPosition);
}

function ReadSettingsTooltipScrollSnapshot() {
    var context = $.GetContextPanel ? $.GetContextPanel() : null;
    if (!context) return { listY: 0, hostY: 0, thumbY: 0 };
    var settingsList = null;
    try { settingsList = context.FindChildTraverse("SettingsList"); } catch (eList) { settingsList = null; }
    var settingsContentHost = null;
    try { settingsContentHost = context.FindChildTraverse("SettingsContentHost"); } catch (eHost) { settingsContentHost = null; }

    var thumbY = 0;
    if (settingsList && settingsList.FindChildTraverse) {
        try {
            var scrollBar = settingsList.FindChildTraverse("VerticalScrollBar");
            if (scrollBar && scrollBar.FindChildTraverse) {
                var thumb = scrollBar.FindChildTraverse("ScrollThumb");
                if (thumb && (!thumb.IsValid || thumb.IsValid())) {
                    var sty = Number(thumb.scrolloffset_y);
                    if (!isFinite(sty)) sty = Number(thumb.actualscrolloffset_y);
                    if (!isFinite(sty) && typeof GetPanelYOffsetWithinAncestor === "function") {
                        sty = Number(GetPanelYOffsetWithinAncestor(thumb, scrollBar));
                    }
                    if (isFinite(sty)) thumbY = sty;
                }
            }
        } catch (_) {}
    }

    return {
        listY: ReadPanelScrollOffsetY(settingsList),
        hostY: ReadPanelScrollOffsetY(settingsContentHost),
        thumbY: isFinite(thumbY) ? thumbY : 0
    };
}

function PrimeSettingsTooltipScrollSnapshot() {
    var snap = ReadSettingsTooltipScrollSnapshot();
    gSettingsTooltipLastListScrollY = Number(snap.listY);
    gSettingsTooltipLastHostScrollY = Number(snap.hostY);
    gSettingsTooltipLastThumbScrollY = Number(snap.thumbY);
    var anchor = gSettingsRowFloatingTooltipAnchor;
    var host = (gSettingsRowFloatingTooltipPanel && gSettingsRowFloatingTooltipPanel.GetParent)
        ? gSettingsRowFloatingTooltipPanel.GetParent()
        : null;
    var currentAnchorY = NaN;
    if (anchor && host && typeof GetPanelYOffsetWithinAncestor === "function") {
        var rawY = GetPanelYOffsetWithinAncestor(anchor, host);
        if (rawY !== null && isFinite(rawY)) currentAnchorY = Number(rawY);
    }
    gSettingsTooltipLastAnchorLocalY = currentAnchorY;
}

function DidSettingsTooltipScrollChange() {
    var snap = ReadSettingsTooltipScrollSnapshot();
    var listY = Number(snap.listY);
    var hostY = Number(snap.hostY);
    var thumbY = Number(snap.thumbY);
    if (!isFinite(listY)) listY = 0;
    if (!isFinite(hostY)) hostY = 0;
    if (!isFinite(thumbY)) thumbY = 0;

    var changed = false;
    if (isFinite(gSettingsTooltipLastListScrollY) && Math.abs(listY - gSettingsTooltipLastListScrollY) >= 1) changed = true;
    if (isFinite(gSettingsTooltipLastHostScrollY) && Math.abs(hostY - gSettingsTooltipLastHostScrollY) >= 1) changed = true;
    if (isFinite(gSettingsTooltipLastThumbScrollY) && Math.abs(thumbY - gSettingsTooltipLastThumbScrollY) >= 1) changed = true;

    gSettingsTooltipLastListScrollY = listY;
    gSettingsTooltipLastHostScrollY = hostY;
    gSettingsTooltipLastThumbScrollY = thumbY;

    if (changed) {
        gSettingsTooltipLastScrollMoveMs = GetSettingsTooltipNowMs();
    }
    return changed;
}

function EnsureSettingsRowFloatingTooltipPanel() {
    var context = $.GetContextPanel();
    if (!context) return null;

    var settingsWin = null;
    try { settingsWin = context.FindChildTraverse("SettingsWindow"); } catch (e0) { settingsWin = null; }
    var host = (settingsWin && settingsWin.GetParent) ? settingsWin.GetParent() : context;
    if (!host) host = context;

    if (
        gSettingsRowFloatingTooltipPanel &&
        (!gSettingsRowFloatingTooltipPanel.IsValid || !gSettingsRowFloatingTooltipPanel.IsValid() || gSettingsRowFloatingTooltipPanel.GetParent() !== host)
    ) {
        try { gSettingsRowFloatingTooltipPanel.DeleteAsync(0); } catch(e1) { WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
        gSettingsRowFloatingTooltipPanel = null;
        gSettingsRowFloatingTooltipPerfPrefixLabel = null;
        gSettingsRowFloatingTooltipPerfValueLabel = null;
        gSettingsRowFloatingTooltipBodyLabel = null;
        gSettingsRowFloatingTooltipCreatorPrefixLabel = null;
        gSettingsRowFloatingTooltipCreatorValueLabel = null;
        gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel = null;
        gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel = null;
        gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel = null;
        gSettingsRowFloatingTooltipVoiceMetaActorValueLabel = null;
    }

    if (!gSettingsRowFloatingTooltipPanel) {
        gSettingsRowFloatingTooltipPanel = $.CreatePanel("Panel", host, "QOLSettingsRowFloatingTooltip");
        gSettingsRowFloatingTooltipPanel.AddClass("QOLCustomRowTooltip");
        gSettingsRowFloatingTooltipPanel.hittest = false;
        gSettingsRowFloatingTooltipPanel.hittestchildren = false;

        gSettingsRowFloatingTooltipBodyLabel = $.CreatePanel("Label", gSettingsRowFloatingTooltipPanel, "QOLSettingsRowFloatingTooltipText");
        gSettingsRowFloatingTooltipBodyLabel.AddClass("QOLCustomRowTooltipText");

        var perfRow = $.CreatePanel("Panel", gSettingsRowFloatingTooltipPanel, "QOLSettingsRowFloatingTooltipPerfRow");
        perfRow.AddClass("QOLCustomRowTooltipPerfRow");

        gSettingsRowFloatingTooltipPerfPrefixLabel = $.CreatePanel("Label", perfRow, "QOLSettingsRowFloatingTooltipPerfPrefix");
        gSettingsRowFloatingTooltipPerfPrefixLabel.AddClass("QOLCustomRowTooltipPerfPrefix");
        gSettingsRowFloatingTooltipPerfPrefixLabel.text = LocalizeSettingsText("FPS Impact:", true);

        gSettingsRowFloatingTooltipPerfValueLabel = $.CreatePanel("Label", perfRow, "QOLSettingsRowFloatingTooltipPerfValue");
        gSettingsRowFloatingTooltipPerfValueLabel.AddClass("QOLCustomRowTooltipPerfValue");

        var creatorRow = $.CreatePanel("Panel", gSettingsRowFloatingTooltipPanel, "QOLSettingsRowFloatingTooltipCreatorRow");
        creatorRow.AddClass("QOLCustomRowTooltipCreatorRow");

        gSettingsRowFloatingTooltipCreatorPrefixLabel = $.CreatePanel("Label", creatorRow, "QOLSettingsRowFloatingTooltipCreatorPrefix");
        gSettingsRowFloatingTooltipCreatorPrefixLabel.AddClass("QOLCustomRowTooltipCreatorPrefix");
        gSettingsRowFloatingTooltipCreatorPrefixLabel.text = LocalizeSettingsText("Created By:", true);

        gSettingsRowFloatingTooltipCreatorValueLabel = $.CreatePanel("Label", creatorRow, "QOLSettingsRowFloatingTooltipCreatorValue");
        gSettingsRowFloatingTooltipCreatorValueLabel.AddClass("QOLCustomRowTooltipCreatorValue");

        var voiceMetaAuthorRow = $.CreatePanel("Panel", gSettingsRowFloatingTooltipPanel, "QOLSettingsRowFloatingTooltipVoiceMetaAuthorRow");
        voiceMetaAuthorRow.AddClass("QOLCustomRowTooltipVoiceMetaRow");

        gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel = $.CreatePanel("Label", voiceMetaAuthorRow, "QOLSettingsRowFloatingTooltipVoiceMetaAuthorPrefix");
        gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel.AddClass("QOLCustomRowTooltipVoiceMetaPrefix");
        gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel.text = LocalizeSettingsText("Author:", true);

        gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel = $.CreatePanel("Label", voiceMetaAuthorRow, "QOLSettingsRowFloatingTooltipVoiceMetaAuthorValue");
        gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel.AddClass("QOLCustomRowTooltipVoiceMetaAuthorValue");

        var voiceMetaActorRow = $.CreatePanel("Panel", gSettingsRowFloatingTooltipPanel, "QOLSettingsRowFloatingTooltipVoiceMetaActorRow");
        voiceMetaActorRow.AddClass("QOLCustomRowTooltipVoiceMetaRow");

        gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel = $.CreatePanel("Label", voiceMetaActorRow, "QOLSettingsRowFloatingTooltipVoiceMetaActorPrefix");
        gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel.AddClass("QOLCustomRowTooltipVoiceMetaPrefix");
        gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel.text = LocalizeSettingsText("Voice Actor:", true);

        gSettingsRowFloatingTooltipVoiceMetaActorValueLabel = $.CreatePanel("Label", voiceMetaActorRow, "QOLSettingsRowFloatingTooltipVoiceMetaActorValue");
        gSettingsRowFloatingTooltipVoiceMetaActorValueLabel.AddClass("QOLCustomRowTooltipVoiceMetaActorValue");
    }
    return gSettingsRowFloatingTooltipPanel;
}

function ApplySettingsRowFloatingTooltipTier(perfTier) {
    var panel = gSettingsRowFloatingTooltipPanel;
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    var normalizedTier = NormalizePerfImpactTier(perfTier);
    panel.SetHasClass("PerfNone", normalizedTier === PERF_IMPACT_TIER_NONE);
    panel.SetHasClass("PerfLow", normalizedTier === PERF_IMPACT_TIER_LOW);
    panel.SetHasClass("PerfMedium", normalizedTier === PERF_IMPACT_TIER_MEDIUM);
    panel.SetHasClass("PerfHigh", normalizedTier === PERF_IMPACT_TIER_HIGH);
}

function NormalizeSettingsTooltipScaleFactor(value) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return 1.0;
    if (n < 0.05) return 0.05;
    if (n > 20.0) return 20.0;
    return n;
}

function GetSettingsTooltipHostAxisScale(actualSize, desiredSize) {
    var actual = Number(actualSize);
    if (!isFinite(actual) || actual <= 0) return 1.0;
    var desired = Number(desiredSize);
    if (!isFinite(desired) || desired <= 0) return 1.0;
    return NormalizeSettingsTooltipScaleFactor(actual / desired);
}

function PositionSettingsRowFloatingTooltip(anchorPanel) {
    var panel = gSettingsRowFloatingTooltipPanel;
    if (!panel || (panel.IsValid && !panel.IsValid())) return;
    if (!anchorPanel || (anchorPanel.IsValid && !anchorPanel.IsValid())) return;

    var host = panel.GetParent ? panel.GetParent() : null;
    if (!host || (host.IsValid && !host.IsValid())) return;

    var context = $.GetContextPanel ? $.GetContextPanel() : null;
    var settingsWin = null;
    try { settingsWin = context ? context.FindChildTraverse("SettingsWindow") : null; } catch (_) {}
    var settingsList = null;
    try { settingsList = context ? context.FindChildTraverse("SettingsList") : null; } catch (_) {}

    var anchorX = (typeof GetPanelXOffsetWithinAncestor === "function") ? Number(GetPanelXOffsetWithinAncestor(anchorPanel, host)) : 0;
    var anchorY = (typeof GetPanelYOffsetWithinAncestor === "function") ? Number(GetPanelYOffsetWithinAncestor(anchorPanel, host)) : 0;
    var anchorWidth = Number(anchorPanel.actuallayoutwidth);
    var anchorHeight = Number(anchorPanel.actuallayoutheight);
    var panelWidth = Number(panel.actuallayoutwidth);
    var panelHeight = Number(panel.actuallayoutheight);
    var hostWidth = Number(host.actuallayoutwidth);
    var hostHeight = Number(host.actuallayoutheight);

    if (!isFinite(anchorX) || !isFinite(anchorY) || !isFinite(anchorWidth) || !isFinite(anchorHeight) ||
        !isFinite(panelWidth) || panelWidth <= 0 || !isFinite(panelHeight) || panelHeight <= 0 ||
        !isFinite(hostWidth) || hostWidth <= 0 || !isFinite(hostHeight) || hostHeight <= 0) {
        $.Schedule(0.0, function() {
            if (!gSettingsRowFloatingTooltipAnchor || gSettingsRowFloatingTooltipAnchor !== anchorPanel) return;
            PositionSettingsRowFloatingTooltip(anchorPanel);
        });
        return;
    }

    var edgeMargin = 8;
    var gap = 8;
    var xMin = edgeMargin;
    var xMax = Math.max(xMin, Math.round(hostWidth - panelWidth - edgeMargin));

    var isInsideList = settingsList && IsDescendantOf(anchorPanel, settingsList);
    var winX = (settingsWin && (!settingsWin.IsValid || settingsWin.IsValid()) && typeof GetPanelXOffsetWithinAncestor === "function")
        ? Number(GetPanelXOffsetWithinAncestor(settingsWin, host)) : NaN;
    var winY = (settingsWin && (!settingsWin.IsValid || settingsWin.IsValid()) && typeof GetPanelYOffsetWithinAncestor === "function")
        ? Number(GetPanelYOffsetWithinAncestor(settingsWin, host)) : NaN;
    var winWidth = (settingsWin && (!settingsWin.IsValid || settingsWin.IsValid())) ? Number(settingsWin.actuallayoutwidth) : NaN;
    var winHeight = (settingsWin && (!settingsWin.IsValid || settingsWin.IsValid())) ? Number(settingsWin.actuallayoutheight) : NaN;

    var xRight, xLeft;
    if (isInsideList && isFinite(winX) && isFinite(winWidth) && winWidth > 0) {
        // Place cleanly outside SettingsWindow to the right (beyond scrollbar and border)
        xRight = Math.round(winX + winWidth + gap);
        xLeft = Math.round(winX - panelWidth - gap);
    } else {
        // Standard anchor-relative positioning
        xRight = Math.round(anchorX + anchorWidth + gap);
        xLeft = Math.round(anchorX - panelWidth - gap);
    }

    var side = "right";
    var x = xRight;
    if (xRight + panelWidth > hostWidth - edgeMargin && xLeft >= xMin) {
        side = "left";
        x = xLeft;
    } else if (xRight + panelWidth > hostWidth - edgeMargin) {
        // If neither outside fits, clamp safely within host
        x = Math.max(xMin, Math.min(xMax, xRight));
    }

    var targetY = Math.round(anchorY + (anchorHeight * 0.5) - (panelHeight * 0.5));
    var yMin = edgeMargin;
    var yMax = Math.max(yMin, Math.round(hostHeight - panelHeight - edgeMargin));

    if (isFinite(winY) && isFinite(winHeight) && winHeight > 0) {
        yMin = Math.max(yMin, Math.round(winY + 8));
        yMax = Math.min(yMax, Math.round(winY + winHeight - panelHeight - 8));
        if (yMax < yMin) yMax = yMin;
    }

    var y = Math.max(yMin, Math.min(yMax, targetY));

    // Stabilize tooltip placement: if target position is unchanged, skip re-writing style values
    if (
        isFinite(gSettingsRowFloatingTooltipLastX) &&
        isFinite(gSettingsRowFloatingTooltipLastY) &&
        gSettingsTooltipLastSide === side &&
        Math.abs(Number(gSettingsRowFloatingTooltipLastX) - Number(x)) < 0.5 &&
        Math.abs(Number(gSettingsRowFloatingTooltipLastY) - Number(y)) < 0.5
    ) {
        return;
    }

    var finalX = Math.round(x);
    var finalY = Math.round(y);

    if (panel.style) {
        panel.style.x = finalX + "px";
        panel.style.y = finalY + "px";
    }
    gSettingsTooltipLastWrittenStyleX = finalX;
    gSettingsTooltipLastWrittenStyleY = finalY;

    gSettingsRowFloatingTooltipLastX = x;
    gSettingsRowFloatingTooltipLastY = y;
    gSettingsTooltipLastSide = side;

    var anchorId = "";
    try { anchorId = String(anchorPanel.id || ""); } catch (_) { anchorId = ""; }
    SettingsTooltipDebugLog(
        "pos_simple anchor=" + (anchorId || "-") +
        " side=" + side +
        " x=" + String(finalX) +
        " y=" + String(finalY) +
        " host=" + String(Math.round(hostWidth)) + "x" + String(Math.round(hostHeight))
    );
}

function TryGetCursorScreenPosition() {
    // GameUI.GetCursorPosition confirmed absent.
    return null;
}

function ExecuteShowSettingsRowFloatingTooltip(anchorPanel, perfText, bodyText, perfTier, createdBy, options) {
    if (!anchorPanel || (anchorPanel.IsValid && !anchorPanel.IsValid())) return;
    if (!HasMeaningfulFloatingTooltipContent(perfTier, bodyText, createdBy, options)) {
        HideSettingsRowFloatingTooltip();
        return;
    }
    CancelSettingsRowFloatingTooltipHide();
    var bodyLine = LocalizeSettingsText(String(bodyText || ""), true);
    var createdByName = String(createdBy || "").trim();
    var tierKey = NormalizePerfImpactTier(perfTier);
    var voiceMetaInfo = options && options.voiceMeta ? options.voiceMeta : null;
    var voiceMetaAuthor = String(voiceMetaInfo && voiceMetaInfo.author ? voiceMetaInfo.author : "").trim();
    var voiceMetaActor = String(voiceMetaInfo && voiceMetaInfo.voiceActor ? voiceMetaInfo.voiceActor : "").trim();
    var useVoiceMetaMode = (voiceMetaAuthor.length > 0 || voiceMetaActor.length > 0);

    var panel = EnsureSettingsRowFloatingTooltipPanel();
    if (!panel || (panel.IsValid && !panel.IsValid())) return;
    if (
        !gSettingsRowFloatingTooltipPerfPrefixLabel ||
        !gSettingsRowFloatingTooltipPerfValueLabel ||
        !gSettingsRowFloatingTooltipBodyLabel ||
        !gSettingsRowFloatingTooltipCreatorPrefixLabel ||
        !gSettingsRowFloatingTooltipCreatorValueLabel ||
        !gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel ||
        !gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel ||
        !gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel ||
        !gSettingsRowFloatingTooltipVoiceMetaActorValueLabel
    ) return;

    var previousAnchor = gSettingsRowFloatingTooltipAnchor;
    gSettingsRowFloatingTooltipAnchor = anchorPanel;
    gSettingsTooltipCalibrationFramesRemaining = 2;
    gSettingsRowFloatingTooltipPerfPrefixLabel.text = LocalizeSettingsText("FPS Impact:", true);
    gSettingsRowFloatingTooltipPerfValueLabel.text = GetPerfImpactDisplayLabel(tierKey);
    gSettingsRowFloatingTooltipBodyLabel.text = bodyLine;
    gSettingsRowFloatingTooltipCreatorPrefixLabel.text = LocalizeSettingsText("Created By:", true);
    gSettingsRowFloatingTooltipCreatorValueLabel.text = createdByName;
    gSettingsRowFloatingTooltipVoiceMetaAuthorPrefixLabel.text = LocalizeSettingsText("Author:", true);
    gSettingsRowFloatingTooltipVoiceMetaAuthorValueLabel.text = voiceMetaAuthor;
    gSettingsRowFloatingTooltipVoiceMetaActorPrefixLabel.text = LocalizeSettingsText("Voice Actor:", true);
    gSettingsRowFloatingTooltipVoiceMetaActorValueLabel.text = voiceMetaActor;
    panel.SetHasClass("NoBody", bodyLine.length <= 0);
    panel.SetHasClass("NoPerf", tierKey === PERF_IMPACT_TIER_NONE);
    panel.SetHasClass("NoCreator", (createdByName.length <= 0) || useVoiceMetaMode);
    panel.SetHasClass("VoiceMetaMode", useVoiceMetaMode);
    panel.SetHasClass("NoVoiceMeta", !useVoiceMetaMode);
    panel.SetHasClass("NoVoiceMetaAuthor", voiceMetaAuthor.length <= 0);
    panel.SetHasClass("NoVoiceMetaActor", voiceMetaActor.length <= 0);
    panel.SetHasClass("FooterSaveWarningTooltip", !!(options && options.footerSaveWarning));
    ApplySettingsRowFloatingTooltipTier(tierKey);

    var wasVisible = !!(panel.BHasClass && panel.BHasClass("Visible"));
    var cursorNow = TryGetCursorScreenPosition();

    panel.SetHasClass("Visible", true);
    PositionSettingsRowFloatingTooltip(anchorPanel);
    $.Schedule(0.0, function() {
        if (!gSettingsRowFloatingTooltipAnchor || gSettingsRowFloatingTooltipAnchor !== anchorPanel) return;
        PositionSettingsRowFloatingTooltip(anchorPanel);
    });
    if (cursorNow) {
        gSettingsRowFloatingTooltipLastCursorX = cursorNow.x;
        gSettingsRowFloatingTooltipLastCursorY = cursorNow.y;
    }
    var anchorId = "";
    try { anchorId = String(anchorPanel.id || ""); } catch (eAid) { anchorId = ""; }
    var sameAnchorAsLast = !!(previousAnchor && previousAnchor === anchorPanel);
    SettingsTooltipDebugLog(
        "show anchor=" + (anchorId || "-") +
        " sameAnchor=" + (sameAnchorAsLast ? "1" : "0") +
        " wasVisible=" + (wasVisible ? "1" : "0") +
        " sameCursor=" + ((cursorNow && isFinite(gSettingsRowFloatingTooltipLastCursorX) && isFinite(gSettingsRowFloatingTooltipLastCursorY)) ? "1" : "0"),
        true
    );
    PrimeSettingsTooltipScrollSnapshot();
    EnsureSettingsRowFloatingTooltipTracking();
}

function ShowSettingsRowFloatingTooltip(anchorPanel, perfText, bodyText, perfTier, createdBy, options) {
    if (!anchorPanel || (anchorPanel.IsValid && !anchorPanel.IsValid())) return;

    if (IsSettingsTooltipSuppressed() || IsSettingsTooltipInRecentScrollMotion()) {
        return;
    }
    if (DidSettingsTooltipScrollChange()) {
        SuppressSettingsTooltipForMs(SETTINGS_TOOLTIP_SCROLL_SUPPRESS_MS, "scroll_active");
        return;
    }

    if (!HasMeaningfulFloatingTooltipContent(perfTier, bodyText, createdBy, options)) {
        HideSettingsRowFloatingTooltip();
        return;
    }

    var context = $.GetContextPanel ? $.GetContextPanel() : null;
    var settingsList = null;
    try { settingsList = context ? context.FindChildTraverse("SettingsList") : null; } catch (_) {}
    var settingsWin = null;
    try { settingsWin = context ? context.FindChildTraverse("SettingsWindow") : null; } catch (_) {}
    var host = (settingsWin && settingsWin.GetParent) ? settingsWin.GetParent() : context;

    if (settingsList && IsDescendantOf(anchorPanel, settingsList)) {
        if (!IsPanelVisibleInList(anchorPanel, settingsList, host)) {
            return;
        }
    }

    CancelSettingsRowFloatingTooltipHide();

    var isCurrentlyVisible = IsSettingsRowFloatingTooltipVisible();
    var isWarm = isCurrentlyVisible || ((GetSettingsTooltipNowMs() - gSettingsTooltipLastVisibleTimeMs) < SETTINGS_TOOLTIP_WARM_RECENT_MS);
    var forceImmediate = !!(options && options.immediate);

    if (forceImmediate || isWarm) {
        CancelPendingSettingsRowFloatingTooltipShow();
        ExecuteShowSettingsRowFloatingTooltip(anchorPanel, perfText, bodyText, perfTier, createdBy, options);
    } else {
        CancelPendingSettingsRowFloatingTooltipShow();
        var showToken = gSettingsTooltipPendingShowToken;
        $.Schedule(SETTINGS_TOOLTIP_COLD_HOVER_DELAY_SEC, function() {
            if (showToken !== gSettingsTooltipPendingShowToken) return;
            if (IsSettingsTooltipSuppressed() || IsSettingsTooltipInRecentScrollMotion()) return;
            if (DidSettingsTooltipScrollChange()) {
                SuppressSettingsTooltipForMs(SETTINGS_TOOLTIP_SCROLL_SUPPRESS_MS, "scroll_debounce");
                return;
            }
            if (!anchorPanel || (anchorPanel.IsValid && !anchorPanel.IsValid())) return;
            if (settingsList && IsDescendantOf(anchorPanel, settingsList)) {
                if (!IsPanelVisibleInList(anchorPanel, settingsList, host)) return;
            }
            ExecuteShowSettingsRowFloatingTooltip(anchorPanel, perfText, bodyText, perfTier, createdBy, options);
        });
    }
}

function HideSettingsRowFloatingTooltip() {
    CancelPendingSettingsRowFloatingTooltipShow();
    CancelSettingsRowFloatingTooltipHide();
    gSettingsTooltipLastVisibleTimeMs = GetSettingsTooltipNowMs();
    gSettingsRowFloatingTooltipAnchor = null;
    if (!gSettingsRowFloatingTooltipPanel || (gSettingsRowFloatingTooltipPanel.IsValid && !gSettingsRowFloatingTooltipPanel.IsValid())) return;
    if (gSettingsRowFloatingTooltipPanel.SetHasClass) {
        gSettingsRowFloatingTooltipPanel.SetHasClass("Visible", false);
    }
    gSettingsRowFloatingTooltipTrackScheduled = false;
    gSettingsTooltipLastAnchorLocalY = NaN;
    gSettingsRowFloatingTooltipLastX = NaN;
    gSettingsRowFloatingTooltipLastY = NaN;
    SettingsTooltipDebugLog("hide", true);
}

function SetSettingsTooltipThemeActive(isActive) {
    var root = FindRootPanel();
    if (root && root.SetHasClass) {
        root.SetHasClass(SETTINGS_TOOLTIP_THEME_CLASS, !!isActive);
        var tooltipManager = null;
        try { tooltipManager = root.FindChildTraverse ? root.FindChildTraverse("TooltipManager") : null; } catch (e0) { tooltipManager = null; }
        if (tooltipManager && tooltipManager.SetHasClass) {
            tooltipManager.SetHasClass(SETTINGS_TOOLTIP_THEME_CLASS, !!isActive);
        }
    }
}

function SetSettingsTooltipPerfTierClass(perfTier) {
    var tier = NormalizePerfImpactTier(perfTier);
    var isNone = tier === PERF_IMPACT_TIER_NONE;
    var isLow = tier === PERF_IMPACT_TIER_LOW;
    var isMedium = tier === PERF_IMPACT_TIER_MEDIUM;
    var isHigh = tier === PERF_IMPACT_TIER_HIGH;
    var root = FindRootPanel();
    if (root && root.SetHasClass) {
        root.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_NONE, isNone);
        root.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_LOW, isLow);
        root.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_MEDIUM, isMedium);
        root.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_HIGH, isHigh);
    }
    if (root && root.FindChildTraverse) {
        var tooltipManager = null;
        try { tooltipManager = root.FindChildTraverse("TooltipManager"); } catch (e0) { tooltipManager = null; }
        if (tooltipManager && tooltipManager.SetHasClass) {
            tooltipManager.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_NONE, isNone);
            tooltipManager.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_LOW, isLow);
            tooltipManager.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_MEDIUM, isMedium);
            tooltipManager.SetHasClass(SETTINGS_TOOLTIP_PERF_CLASS_HIGH, isHigh);
        }
    }
}

function ShowSettingsTextTooltip(anchorPanel, text, perfTier) {
    if (!anchorPanel || !text) return;
    SetSettingsTooltipPerfTierClass(perfTier || PERF_IMPACT_TIER_NONE);
    $.DispatchEvent("UIShowTextTooltip", anchorPanel, text);
}

function HideSettingsTextTooltip() {
    SetSettingsTooltipPerfTierClass(PERF_IMPACT_TIER_NONE);
    $.DispatchEvent("UIHideTextTooltip");
}

function HasMeaningfulFloatingTooltipContent(perfTier, bodyText, createdBy, options) {
    var tierKey = NormalizePerfImpactTier(perfTier);
    var hasPerf = tierKey !== PERF_IMPACT_TIER_NONE;
    var hasBody = String(bodyText || "").trim().length > 0;
    var hasCreator = String(createdBy || "").trim().length > 0;
    var voiceMeta = options && options.voiceMeta ? options.voiceMeta : null;
    var hasVoiceMeta =
        String(voiceMeta && voiceMeta.author ? voiceMeta.author : "").trim().length > 0 ||
        String(voiceMeta && voiceMeta.voiceActor ? voiceMeta.voiceActor : "").trim().length > 0;
    return hasPerf || hasBody || hasCreator || hasVoiceMeta;
}

function NormalizePerfImpactTier(value) {
    var key = String(value || "").toLowerCase();
    if (PERF_IMPACT_TIER_ORDER.hasOwnProperty(key)) return key;
    return PERF_IMPACT_TIER_NONE;
}

function MaxPerfImpactTier(a, b) {
    var aa = NormalizePerfImpactTier(a);
    var bb = NormalizePerfImpactTier(b);
    return (PERF_IMPACT_TIER_ORDER[bb] > PERF_IMPACT_TIER_ORDER[aa]) ? bb : aa;
}

function GetEstimatedPerfImpactTier(configId, type, options) {
    var tier = PERF_IMPACT_TIER_NONE;
    var key = String(configId || "");
    if (key && SETTING_PERF_IMPACT_TIERS.hasOwnProperty(key)) {
        tier = MaxPerfImpactTier(tier, SETTING_PERF_IMPACT_TIERS[key]);
    }
    if (Array.isArray(options)) {
        for (var i = 0; i < options.length; i++) {
            var opt = options[i];
            if (!opt || !opt.key) continue;
            var optKey = String(opt.key || "");
            if (!optKey || !SETTING_PERF_IMPACT_TIERS.hasOwnProperty(optKey)) continue;
            tier = MaxPerfImpactTier(tier, SETTING_PERF_IMPACT_TIERS[optKey]);
        }
    }
    if (type === "runtime_slider" || type === "runtime_buttongroup") {
        tier = MaxPerfImpactTier(tier, PERF_IMPACT_TIER_NONE);
    }
    return tier;
}

function GetPerfImpactWeightForTier(tier) {
    var normalized = NormalizePerfImpactTier(tier);
    if (!PERF_IMPACT_TIER_ORDER.hasOwnProperty(normalized)) return 0;
    return Number(PERF_IMPACT_TIER_ORDER[normalized]) || 0;
}

function IsPerfImpactConfigKeyEnabled(configKey) {
    var key = String(configKey || "");
    if (!key || !MOD_CONFIG || !MOD_CONFIG.hasOwnProperty(key)) return false;
    var value = MOD_CONFIG[key];
    if (value === null || value === undefined) return false;
    if (typeof value === "boolean") return value === true;
    if (typeof value === "number") return Number(value) > 0;
    if (typeof value === "string") {
        var normalized = String(value).trim().toLowerCase();
        if (!normalized) return false;
        if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "none") return false;
        return true;
    }
    return !!value;
}

function GetSummedPerfImpactTierForConfigKeys(configKeys) {
    if (!Array.isArray(configKeys) || configKeys.length <= 0) return PERF_IMPACT_TIER_NONE;
    var totalWeight = 0;
    var maxTier = PERF_IMPACT_TIER_NONE;
    var seen = {};
    for (var i = 0; i < configKeys.length; i++) {
        var key = String(configKeys[i] || "");
        if (!key || seen[key]) continue;
        seen[key] = true;
        if (!SETTING_PERF_IMPACT_TIERS.hasOwnProperty(key)) continue;
        if (!IsPerfImpactConfigKeyEnabled(key)) continue;
        var tier = NormalizePerfImpactTier(SETTING_PERF_IMPACT_TIERS[key]);
        totalWeight += GetPerfImpactWeightForTier(tier);
        maxTier = MaxPerfImpactTier(maxTier, tier);
    }

    if (totalWeight <= 0) return PERF_IMPACT_TIER_NONE;

    var sumTier = PERF_IMPACT_TIER_LOW;
    if (totalWeight >= 4) sumTier = PERF_IMPACT_TIER_HIGH;
    else if (totalWeight >= 2) sumTier = PERF_IMPACT_TIER_MEDIUM;

    return MaxPerfImpactTier(maxTier, sumTier);
}

function BuildPerfImpactLineForTier(tier) {
    var normalizedTier = NormalizePerfImpactTier(tier);
    return "FPS Impact: " + GetPerfImpactDisplayLabel(normalizedTier);
}

function GetPerfImpactDisplayLabel(tier) {
    var normalizedTier = NormalizePerfImpactTier(tier);
    var raw = PERF_IMPACT_LABEL_BY_TIER.hasOwnProperty(normalizedTier)
        ? PERF_IMPACT_LABEL_BY_TIER[normalizedTier]
        : PERF_IMPACT_LABEL_BY_TIER[PERF_IMPACT_TIER_NONE];
    return LocalizeSettingsText(raw, true);
}

function GetSettingCreatedBy(configId, label) {
    var key = String(configId || "");
    if (key && SETTING_CREATED_BY_BY_CONFIG.hasOwnProperty(key)) {
        return String(SETTING_CREATED_BY_BY_CONFIG[key] || "");
    }
    var labelKey = String(label || "");
    if (labelKey && SETTING_CREATED_BY_BY_LABEL.hasOwnProperty(labelKey)) {
        return String(SETTING_CREATED_BY_BY_LABEL[labelKey] || "");
    }
    return "";
}

function GetSectionCreatedBy(title) {
    var key = String(title || "");
    if (!key) return "";
    if (!SECTION_CREATED_BY_BY_TITLE.hasOwnProperty(key)) return "";
    return String(SECTION_CREATED_BY_BY_TITLE[key] || "");
}

function GetCurrentSettingsCategoryKey() {
    var tabName = String(currentTab || "");
    if (!tabName) return "";
    var sectionName = String(gCurrentSettingsSectionTitle || "");
    if (sectionName) return tabName + " / " + sectionName;
    return tabName;
}

function GetSectionDescriptionOverride(tabName, title, fallbackDescription) {
    var tabKey = String(tabName || "");
    var titleKey = String(title || "");
    if (tabKey && titleKey) {
        var key = tabKey + "|" + titleKey;
        if (SECTION_DESCRIPTION_OVERRIDE_BY_TAB_TITLE.hasOwnProperty(key)) {
            return String(SECTION_DESCRIPTION_OVERRIDE_BY_TAB_TITLE[key] || "");
        }
    }
    return String(fallbackDescription || "");
}

function GetCreatedByFromConfigKeys(configKeys) {
    if (!Array.isArray(configKeys) || configKeys.length <= 0) return "";
    var seen = {};
    var names = [];
    for (var i = 0; i < configKeys.length; i++) {
        var key = String(configKeys[i] || "");
        if (!key || seen[key]) continue;
        seen[key] = true;
        if (!SETTING_CREATED_BY_BY_CONFIG.hasOwnProperty(key)) continue;
        var name = String(SETTING_CREATED_BY_BY_CONFIG[key] || "").trim();
        if (!name) continue;
        if (names.indexOf(name) === -1) names.push(name);
    }
    return names.join(", ");
}

function GetSettingDescriptionOverride(configId, label, fallbackDescription, categoryKey) {
    var catKey = String(categoryKey || "");
    var labelKey = String(label || "");
    var key = String(configId || "");
    var rowOverride = "";

    if (catKey && labelKey) {
        var rowKey = catKey + "|" + labelKey;
        if (SETTING_DESCRIPTION_OVERRIDE_BY_CATEGORY_ROW.hasOwnProperty(rowKey)) {
            rowOverride = String(SETTING_DESCRIPTION_OVERRIDE_BY_CATEGORY_ROW[rowKey] || "");
        }
    }

    if (key === "VOICE_TYPE") {
        var baseVoiceDesc = rowOverride;
        if (!baseVoiceDesc && SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG.hasOwnProperty(key)) {
            baseVoiceDesc = String(SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG[key] || "");
        }
        if (!baseVoiceDesc) baseVoiceDesc = String(fallbackDescription || "");
        return BuildCustomAnnouncerVoiceDescription(baseVoiceDesc, MOD_CONFIG && MOD_CONFIG.VOICE_TYPE);
    }

    if (rowOverride) return rowOverride;

    if (labelKey === "Size") return "Scales the element.";
    if (labelKey === "Opacity") return "Changes the element's transparency.";
    if (labelKey === "Horizontal Offset") return "Moves the element horizontally.";
    if (labelKey === "Vertical Offset") return "Moves the element vertically.";
    if (key && SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG.hasOwnProperty(key)) {
        return String(SETTING_DESCRIPTION_OVERRIDE_BY_CONFIG[key] || "");
    }
    return String(fallbackDescription || "");
}

function BuildPerfImpactTooltipLine(configId, type, options) {
    var tier = GetEstimatedPerfImpactTier(configId, type, options);
    return {
        tier: tier,
        line: BuildPerfImpactLineForTier(tier)
    };
}

function BuildSectionPerfImpactTooltipLineFromTitleRow(titleRow, enableConfigId, enableType, enableOptions) {
    var tier = PERF_IMPACT_TIER_NONE;
    var key = String(enableConfigId || "");
    if (key) {
        tier = GetEstimatedPerfImpactTier(key, enableType || "toggle", enableOptions || null);
    }
    return {
        tier: tier,
        line: BuildPerfImpactLineForTier(tier)
    };
}

function BindSectionPerfTooltip(titleRow, titleName, fallbackDescription, tabName, enableConfigId, enableType, enableOptions) {
    if (!titleRow || !titleRow.SetPanelEvent) return;
    var sectionCreatedBy = GetSectionCreatedBy(titleName);
    var sectionDescription = GetSectionDescriptionOverride(tabName, titleName, fallbackDescription || "");
    titleRow.SetPanelEvent("onmouseover", function() {
        CancelSettingsRowFloatingTooltipHide();
        var info = BuildSectionPerfImpactTooltipLineFromTitleRow(titleRow, enableConfigId, enableType, enableOptions);
        var createdBy = sectionCreatedBy;
        var localizedDescription = LocalizeSettingsText(sectionDescription || "");
        var sectionTier = (info && info.tier) ? info.tier : PERF_IMPACT_TIER_NONE;
        if (!HasMeaningfulFloatingTooltipContent(sectionTier, localizedDescription || "", createdBy)) {
            HideSettingsRowFloatingTooltip();
            return;
        }
        ShowSettingsRowFloatingTooltip(
            titleRow,
            "",
            localizedDescription || "",
            sectionTier,
            createdBy
        );
    });
    titleRow.SetPanelEvent("onmouseout", function() {
        HideSettingsRowFloatingTooltipDeferred("section_mouseout");
    });
}

    // ── Public API ──
    QOL.tooltip = {
        // Show/hide tooltip — called from CreateRow, BindSectionPerfTooltip, etc.
        showRowTooltip: ShowSettingsRowFloatingTooltip,
        hideRowTooltip: HideSettingsRowFloatingTooltip,
        hideTooltipDeferred: HideSettingsRowFloatingTooltipDeferred,
        cancelHide: CancelSettingsRowFloatingTooltipHide,
        isVisible: IsSettingsRowFloatingTooltipVisible,
        // Text tooltip (used by preview toggle)
        showTextTooltip: ShowSettingsTextTooltip,
        hideTextTooltip: HideSettingsTextTooltip,
        // Theme
        setThemeActive: SetSettingsTooltipThemeActive,
        // Perf impact helpers
        buildPerfImpactLine: BuildPerfImpactTooltipLine,
        buildSectionPerfLine: BuildSectionPerfImpactTooltipLineFromTitleRow,
        bindSectionPerfTooltip: BindSectionPerfTooltip,
        hasMeaningfulContent: HasMeaningfulFloatingTooltipContent,
        getSettingCreatedBy: GetSettingCreatedBy,
        getSectionCreatedBy: GetSectionCreatedBy,
        getSectionDescriptionOverride: GetSectionDescriptionOverride,
        getSettingDescriptionOverride: GetSettingDescriptionOverride,
        getCurrentCategoryKey: GetCurrentSettingsCategoryKey,
        getEstimatedPerfTier: GetEstimatedPerfImpactTier,
        getSummedPerfTier: GetSummedPerfImpactTierForConfigKeys,
        normalizePerfTier: NormalizePerfImpactTier,
        maxPerfTier: MaxPerfImpactTier,
        buildPerfLineForTier: BuildPerfImpactLineForTier,
        getPerfDisplayLabel: GetPerfImpactDisplayLabel,
        isPerfConfigEnabled: IsPerfImpactConfigKeyEnabled,
        getCreatedByFromConfigKeys: GetCreatedByFromConfigKeys,
        getPerfWeightForTier: GetPerfImpactWeightForTier,
        // Tooltip scroll/position helpers (used externally)
        suppressForMs: SuppressSettingsTooltipForMs,
        isSuppressed: IsSettingsTooltipSuppressed,
        // Perf tier constants (string literals — cannot reference ql_settings.js consts at load time)
        TIER_NONE: "none",
        TIER_LOW: "low",
        TIER_MEDIUM: "medium",
        TIER_HIGH: "high"
    };
})();
