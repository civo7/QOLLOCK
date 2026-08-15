// ql_update_checker.js — public GitHub marker check for QOLLOCK releases.
// Panorama has no fetch/XMLHttpRequest. It can load an image and report its
// dimensions, so a square GitHub marker means current and a wide one outdated.
(function() {
    "use strict";

    if (typeof QOL === "undefined") return;

    // Increment this for every public QOLLOCK release, independently from the
    // Settings schema/version. Publish the same number through qollock-updates.
    var QOL_UPDATE_MARKER = 1;
    var MARKER_BASE_URL = "https://raw.githubusercontent.com/Predi-i/qollock-updates/main/markers/";
    var CURRENT_MAX_RATIO = 1.35;
    var OUTDATED_MIN_RATIO = 4.0;
    var POLL_INTERVAL_SEC = 0.10;
    var TIMEOUT_SEC = 8.0;

    var autoCheckStarted = false;
    var updateAvailable = false;
    var requestToken = 0;
    var popupLayer = null;

    function IsValid(panel) {
        try { return !!(panel && panel.IsValid && panel.IsValid()); } catch(e) { return false; }
    }

    function FindRoot() {
        var root = null;
        try { root = $.GetContextPanel(); } catch(e) { root = null; }
        return root;
    }

    function IsSettingsOpen() {
        var root = FindRoot();
        var win = null;
        try { win = root && root.FindChildTraverse ? root.FindChildTraverse("SettingsWindow") : null; } catch(e) { win = null; }
        try { return !!(win && win.BHasClass && win.BHasClass("Visible")); } catch(e2) { return false; }
    }

    function ClassifyMarker(width, height) {
        width = Number(width);
        height = Number(height);
        if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) return "invalid";
        var ratio = Math.max(width, height) / Math.min(width, height);
        if (ratio <= CURRENT_MAX_RATIO) return "current";
        if (ratio >= OUTDATED_MIN_RATIO) return "outdated";
        return "invalid";
    }

    function EnsurePopup() {
        if (IsValid(popupLayer)) return popupLayer;
        var root = FindRoot();
        if (!root) return null;

        var existing = root.FindChildTraverse ? root.FindChildTraverse("QOLUpdatePopupLayer") : null;
        if (IsValid(existing)) {
            popupLayer = existing;
            return popupLayer;
        }

        var layer = $.CreatePanel("Panel", root, "QOLUpdatePopupLayer");
        if (!layer) return null;
        layer.AddClass("QOLUpdatePopupLayer");

        var popup = $.CreatePanel("Panel", layer, "QOLUpdatePopup");
        popup.AddClass("QOLUpdatePopup");
        var header = $.CreatePanel("Panel", popup, "");
        header.AddClass("QOLUpdatePopupHeader");
        var title = $.CreatePanel("Label", header, "");
        title.AddClass("QOLUpdatePopupTitle");
        title.text = "UPDATE AVAILABLE";
        var spacer = $.CreatePanel("Panel", header, "");
        spacer.AddClass("QOLUpdatePopupSpacer");
        var close = $.CreatePanel("Button", header, "QOLUpdatePopupClose");
        close.AddClass("QOLUpdatePopupClose");
        var closeLabel = $.CreatePanel("Label", close, "");
        closeLabel.text = "X";
        var body = $.CreatePanel("Label", popup, "QOLUpdatePopupBody");
        body.AddClass("QOLUpdatePopupBody");
        body.text = "A newer QOLLOCK update is available. Please download the latest release from GitHub or Discord.";
        close.SetPanelEvent("onactivate", function() {
            if (IsValid(layer)) layer.RemoveClass("UpdateAvailable");
        });

        popupLayer = layer;
        return popupLayer;
    }

    function ShowPopupIfSettingsOpen() {
        if (!updateAvailable || !IsSettingsOpen()) return;
        var layer = EnsurePopup();
        if (IsValid(layer)) layer.AddClass("UpdateAvailable");
    }

    function DeleteProbe(host, image) {
        try { if (image && image.SetImage) image.SetImage(""); } catch(e0) {}
        try { if (image && image.DeleteAsync) image.DeleteAsync(0); } catch(e1) {}
        try { if (host && host.DeleteAsync) host.DeleteAsync(0); } catch(e2) {}
    }

    function CheckForUpdate() {
        var root = FindRoot();
        if (!root) return;
        var token = ++requestToken;
        var host = $.CreatePanel("Panel", root, "QOLUpdateMarkerProbeHost");
        if (!host) return;

        // Keep the loader on-screen and non-zero-opacity. Panorama skips remote
        // image loads for collapsed/fully transparent panels.
        host.AddClass("QOLUpdateMarkerProbeHost");
        host.SetAttributeString("hittest", "false");
        host.SetAttributeString("hittestchildren", "false");
        var image = $.CreatePanel("Image", host, "QOLUpdateMarkerProbe");
        if (!image) {
            DeleteProbe(host, null);
            return;
        }

        try {
            image.SetImage(MARKER_BASE_URL + QOL_UPDATE_MARKER + ".png?cache=" + Math.random());
        } catch(eSetImage) {
            DeleteProbe(host, image);
            return;
        }

        var elapsed = 0;
        function poll() {
            if (token !== requestToken || !IsValid(image)) {
                DeleteProbe(host, image);
                return;
            }
            var width = 0;
            var height = 0;
            try { width = Number(image.actuallayoutwidth) || 0; } catch(eWidth) {}
            try { height = Number(image.actuallayoutheight) || 0; } catch(eHeight) {}
            if (width > 0 && height > 0) {
                var state = ClassifyMarker(width, height);
                DeleteProbe(host, image);
                if (state === "outdated") {
                    updateAvailable = true;
                    ShowPopupIfSettingsOpen();
                }
                return;
            }
            elapsed += POLL_INTERVAL_SEC;
            if (elapsed < TIMEOUT_SEC) $.Schedule(POLL_INTERVAL_SEC, poll);
            else DeleteProbe(host, image);
        }
        $.Schedule(POLL_INTERVAL_SEC, poll);
    }

    QOL.updateChecker = {
        marker: QOL_UPDATE_MARKER,
        onSettingsOpened: function() {
            ShowPopupIfSettingsOpen();
            if (autoCheckStarted) return;
            autoCheckStarted = true;
            CheckForUpdate();
        },
        classifyMarker: ClassifyMarker
    };
})();
