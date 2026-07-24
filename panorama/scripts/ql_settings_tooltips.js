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
var SETTINGS_ROW_FLOATING_TOOLTIP_TRACK_INTERVAL_SEC = 0.05;
var SETTINGS_TOOLTIP_POSITION_DEBUG = false;
var SETTINGS_TOOLTIP_POSITION_DEBUG_INTERVAL_MS = 200;
var SETTINGS_TOOLTIP_SCROLL_SUPPRESS_MS = 180;
var SETTINGS_TOOLTIP_DEFER_HIDE_SEC = 0.06;
var gSettingsTooltipDebugNextMs = 0;
var gSettingsTooltipLastListScrollY = NaN;
var gSettingsTooltipLastHostScrollY = NaN;
var gSettingsTooltipLastAnchorLocalY = NaN;
var gSettingsTooltipSuppressUntilMs = 0;
var gSettingsTooltipHideToken = 0;
var gSettingsTooltipObservedListScrollY = NaN;
var gSettingsTooltipObservedHostScrollY = NaN;
var gSettingsTooltipLastScrollMoveMs = 0;
var gSettingsTooltipLastSide = "";
var gSettingsTooltipStyleToActualX = 1.0;
var gSettingsTooltipStyleToActualY = 1.0;
var gSettingsTooltipLastWrittenStyleX = NaN;
var gSettingsTooltipLastWrittenStyleY = NaN;
var gSettingsTooltipCalibrationFramesRemaining = 0;

function ReadPanelScrollOffsetY(panel) {
    if (!panel || !panel.IsValid || !panel.IsValid()) return 0;
    var y = 0;
    try {
        var sy0 = Number(panel.scrolloffset_y);
        if (isFinite(sy0)) return sy0;
    } catch(e0) { WarnLog("settings", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
    try {
        var sy1 = Number(panel.scrolloffsetY);
        if (isFinite(sy1)) return sy1;
    } catch(e1) { WarnLog("settings", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
    try {
        var sy2 = Number(panel.ScrollOffsetY);
        if (isFinite(sy2)) return sy2;
    } catch(e2) { WarnLog("settings", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
    try {
        if (typeof panel.GetScrollOffset === "function") {
            var so = panel.GetScrollOffset();
            if (so && so.length >= 2) {
                var sy3 = Number(so[1]);
                if (isFinite(sy3)) return sy3;
            }
        }
    } catch(e3) { WarnLog("settings", "op failed: " + (e3 && e3.message ? e3.message : String(e3 || ""))); }
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
    if (!isFinite(listY)) listY = 0;
    if (!isFinite(hostY)) hostY = 0;
    var moved = false;
    if (isFinite(gSettingsTooltipObservedListScrollY) && Math.abs(listY - gSettingsTooltipObservedListScrollY) >= 1) moved = true;
    if (isFinite(gSettingsTooltipObservedHostScrollY) && Math.abs(hostY - gSettingsTooltipObservedHostScrollY) >= 1) moved = true;
    gSettingsTooltipObservedListScrollY = listY;
    gSettingsTooltipObservedHostScrollY = hostY;
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

function HideSettingsRowFloatingTooltipDeferred(reason) {
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
    if (!panel || !panel.IsValid || !panel.IsValid()) return false;
    if (!panel.BHasClass) return false;
    return !!panel.BHasClass("Visible");
}

function TickSettingsRowFloatingTooltipPosition() {
    gSettingsRowFloatingTooltipTrackScheduled = false;
    if (!IsSettingsRowFloatingTooltipVisible()) return;
    var anchor = gSettingsRowFloatingTooltipAnchor;
    if (!anchor || !anchor.IsValid || !anchor.IsValid()) {
        HideSettingsRowFloatingTooltip();
        return;
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
    var context = $.GetContextPanel();
    if (!context) return { listY: 0, hostY: 0 };
    var settingsList = null;
    try { settingsList = context.FindChildTraverse("SettingsList"); } catch (eList) { settingsList = null; }
    var settingsContentHost = null;
    try { settingsContentHost = context.FindChildTraverse("SettingsContentHost"); } catch (eHost) { settingsContentHost = null; }
    return {
        listY: ReadPanelScrollOffsetY(settingsList),
        hostY: ReadPanelScrollOffsetY(settingsContentHost)
    };
}

function PrimeSettingsTooltipScrollSnapshot() {
    var snap = ReadSettingsTooltipScrollSnapshot();
    gSettingsTooltipLastListScrollY = Number(snap.listY);
    gSettingsTooltipLastHostScrollY = Number(snap.hostY);
    var anchor = gSettingsRowFloatingTooltipAnchor;
    var host = gSettingsRowFloatingTooltipPanel && gSettingsRowFloatingTooltipPanel.GetParent
        ? gSettingsRowFloatingTooltipPanel.GetParent()
        : null;
    gSettingsTooltipLastAnchorLocalY = Number(GetPanelYOffsetWithinAncestor(anchor, host));
}

function DidSettingsTooltipScrollChange() {
    var snap = ReadSettingsTooltipScrollSnapshot();
    var listY = Number(snap.listY);
    var hostY = Number(snap.hostY);
    if (!isFinite(listY)) listY = 0;
    if (!isFinite(hostY)) hostY = 0;
    var hasBaseline = isFinite(gSettingsTooltipLastListScrollY) && isFinite(gSettingsTooltipLastHostScrollY);
    var changed = false;
    if (hasBaseline) {
        changed =
            Math.abs(listY - gSettingsTooltipLastListScrollY) >= 1 ||
            Math.abs(hostY - gSettingsTooltipLastHostScrollY) >= 1;
    }
    gSettingsTooltipLastListScrollY = listY;
    gSettingsTooltipLastHostScrollY = hostY;
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
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
    if (!anchorPanel || !anchorPanel.IsValid || !anchorPanel.IsValid()) return;

    var host = panel.GetParent ? panel.GetParent() : null;
    if (!host || !host.IsValid || !host.IsValid()) return;

    var anchorX = Number(GetPanelXOffsetWithinAncestor(anchorPanel, host));
    var anchorY = Number(GetPanelYOffsetWithinAncestor(anchorPanel, host));
    var anchorWidth = Number(anchorPanel.actuallayoutwidth);
    var anchorHeight = Number(anchorPanel.actuallayoutheight);
    var panelWidth = Number(panel.actuallayoutwidth);
    var panelHeight = Number(panel.actuallayoutheight);
    var hostWidth = Number(host.actuallayoutwidth);
    var hostHeight = Number(host.actuallayoutheight);
    var hostDesiredWidth = Number(host.desiredlayoutwidth);
    var hostDesiredHeight = Number(host.desiredlayoutheight);

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
    var gap = 4;
    var attachNudgeLeft = 12;
    var xMin = edgeMargin;
    var xMax = Math.max(xMin, Math.round(hostWidth - panelWidth - edgeMargin));
    var xRight = Math.round(anchorX + anchorWidth + gap - attachNudgeLeft);
    var xLeft = Math.round(anchorX - panelWidth - gap);

    var side = "right";
    var x = xRight;
    if (xRight + panelWidth > hostWidth - edgeMargin && xLeft >= xMin) {
        side = "left";
        x = xLeft;
    }
    x = Math.max(xMin, Math.min(xMax, x));

    var yMin = edgeMargin;
    var yMax = Math.max(yMin, Math.round(hostHeight - panelHeight - edgeMargin));
    var y = Math.round(anchorY + (anchorHeight * 0.5) - (panelHeight * 0.5));
    y = Math.max(yMin, Math.min(yMax, y));

    // Stabilize tooltip placement: if target anchor position is unchanged, skip
    // re-writing style values to avoid visible oscillation on some rows.
    if (
        isFinite(gSettingsRowFloatingTooltipLastX) &&
        isFinite(gSettingsRowFloatingTooltipLastY) &&
        gSettingsTooltipLastSide === side &&
        Math.abs(Number(gSettingsRowFloatingTooltipLastX) - Number(x)) < 0.5 &&
        Math.abs(Number(gSettingsRowFloatingTooltipLastY) - Number(y)) < 0.5
    ) {
        return;
    }

    var hostScaleX = GetSettingsTooltipHostAxisScale(hostWidth, hostDesiredWidth);
    var hostScaleY = GetSettingsTooltipHostAxisScale(hostHeight, hostDesiredHeight);
    var styleToActualX = NormalizeSettingsTooltipScaleFactor(gSettingsTooltipStyleToActualX);
    var styleToActualY = NormalizeSettingsTooltipScaleFactor(gSettingsTooltipStyleToActualY);

    var styleX = Number(x) / (hostScaleX * styleToActualX);
    var styleY = Number(y) / (hostScaleY * styleToActualY);
    if (!isFinite(styleX) || !isFinite(styleY)) {
        styleX = Number(x);
        styleY = Number(y);
    }

    panel.style.x = String(Math.round(styleX)) + "px";
    panel.style.y = String(Math.round(styleY)) + "px";
    gSettingsTooltipLastWrittenStyleX = styleX;
    gSettingsTooltipLastWrittenStyleY = styleY;

    if ((Number(gSettingsTooltipCalibrationFramesRemaining) || 0) > 0) {
        var appliedActualX = Number(GetPanelXOffsetWithinAncestor(panel, host));
        var appliedActualY = Number(GetPanelYOffsetWithinAncestor(panel, host));
        if (isFinite(appliedActualX) && Math.abs(styleX) >= 8) {
            var measuredX = appliedActualX / (styleX * hostScaleX);
            if (isFinite(measuredX) && measuredX > 0.05 && measuredX < 20.0) {
                gSettingsTooltipStyleToActualX = (gSettingsTooltipStyleToActualX * 0.7) + (measuredX * 0.3);
            }
        }
        if (isFinite(appliedActualY) && Math.abs(styleY) >= 8) {
            var measuredY = appliedActualY / (styleY * hostScaleY);
            if (isFinite(measuredY) && measuredY > 0.05 && measuredY < 20.0) {
                gSettingsTooltipStyleToActualY = (gSettingsTooltipStyleToActualY * 0.7) + (measuredY * 0.3);
            }
        }
        gSettingsTooltipCalibrationFramesRemaining = Math.max(0, (Number(gSettingsTooltipCalibrationFramesRemaining) || 0) - 1);
    }
    gSettingsRowFloatingTooltipLastX = x;
    gSettingsRowFloatingTooltipLastY = y;
    gSettingsTooltipLastSide = side;

    var anchorId = "";
    try { anchorId = String(anchorPanel.id || ""); } catch (eAid) { anchorId = ""; }
    SettingsTooltipDebugLog(
        "pos_simple anchor=" + (anchorId || "-") +
        " side=" + side +
        " x=" + String(Math.round(x)) +
        " y=" + String(Math.round(y)) +
        " style=" + String(Math.round(styleX)) + "," + String(Math.round(styleY)) +
        " host=" + String(Math.round(hostWidth)) + "x" + String(Math.round(hostHeight)) +
        " hScale=" + hostScaleX.toFixed(3) + "," + hostScaleY.toFixed(3) +
        " s2a=" + gSettingsTooltipStyleToActualX.toFixed(3) + "," + gSettingsTooltipStyleToActualY.toFixed(3)
    );
}

function TryGetCursorScreenPosition() {
    // GameUI.GetCursorPosition confirmed absent.
    return null;
}

function ShowSettingsRowFloatingTooltip(anchorPanel, perfText, bodyText, perfTier, createdBy, options) {
    if (!anchorPanel || !anchorPanel.IsValid || !anchorPanel.IsValid()) return;
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
    if (!panel || !panel.IsValid || !panel.IsValid()) return;
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

function HideSettingsRowFloatingTooltip() {
    CancelSettingsRowFloatingTooltipHide();
    gSettingsRowFloatingTooltipAnchor = null;
    if (!gSettingsRowFloatingTooltipPanel || !gSettingsRowFloatingTooltipPanel.IsValid || !gSettingsRowFloatingTooltipPanel.IsValid()) return;
    gSettingsRowFloatingTooltipPanel.SetHasClass("Visible", false);
    gSettingsRowFloatingTooltipTrackScheduled = false;
    gSettingsTooltipLastListScrollY = NaN;
    gSettingsTooltipLastHostScrollY = NaN;
    gSettingsTooltipLastAnchorLocalY = NaN;
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
