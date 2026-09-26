// FG portrait shares the native bar's scale/offset ancestry.
(function() {
    'use strict';
    var U = QOL.utils;
    var moved = null;
    var originalParent = null;
    var originalIndex = -1;
    var heroImage = null;
    var portraitSig = null;
    var heroSig = null;
    // Reparented native panels retain their original layout's stylesheet scope.
    // Apply owned geometry explicitly instead of relying on a HUD CSS selector
    // to override gold's collapsed #LevelAmount and half-scale #HeroImage.
    // Hexagon center: (1850 / 2048 - 0.5) * 400 = 161px from frame center.
    var portraitStyles = {
        visibility: "visible", opacity: "1", ignoreParentFlow: "true",
        flowChildren: "none", horizontalAlign: "center", verticalAlign: "center",
        x: "0px", y: "161px", margin: "0px", width: "48px", height: "48px",
        uiScale: "100%", transform: "rotateZ(-90deg)", borderRadius: "50%",
        overflow: "clip", backgroundImage: "none", zIndex: "105"
    };
    var heroStyles = {
        visibility: "visible", opacity: "1", margin: "0px", width: "100%",
        height: "100%", maxWidth: "100%", maxHeight: "100%",
        uiScale: "100%", overflow: "clip"
    };

    function clearOwned(panel, styles) {
        if (!U.IsPanelValid(panel)) return;
        Object.keys(styles).forEach(function(key) { U.ClearStyleSafe(panel, key); });
    }

    function restore() {
        clearOwned(heroImage, heroStyles);
        clearOwned(moved, portraitStyles);
        if (U.IsPanelValid(moved)) {
            moved.RemoveClass("qol_fg_portrait");
            if (U.IsPanelValid(originalParent)) {
                moved.SetParent(originalParent);
                var sibling = originalParent.GetChild(originalIndex);
                if (sibling && sibling !== moved) originalParent.MoveChildBefore(moved, sibling);
            }
        }
        moved = null;
        originalParent = null;
        originalIndex = -1;
        heroImage = null;
        portraitSig = null;
        heroSig = null;
        QOL.state.fgHeroImageMoved = false;
    }

    function update(root, cfg) {
        var enabled = Number(cfg && cfg.HEALTHBAR_TYPE) === 2;
        if (!enabled || !U.IsPanelValid(root) || root.BHasClass("InHideout")) {
            restore();
            return;
        }
        var health = root.FindChildTraverse("health_and_abilities_container");
        var bars = health && health.FindChildTraverse("hud_health_bars");
        var anchor = U.FindFirstPanelByClass(bars, "health_bar_border");
        if (U.IsPanelValid(moved) && (!U.IsPanelValid(anchor) ||
            moved.GetParent() !== anchor)) {
            restore();
        }
        if (!U.IsPanelValid(anchor)) return;
        if (!U.IsPanelValid(moved)) {
            // Gold and its native PlayerLevel both contain LevelAmount/HeroImage.
            // Resolve only when unattached; a second source is not a replacement
            // for the live portrait we already own (that caused 20Hz swapping).
            var gold = root.FindChildTraverse("gold_and_ap_container");
            var source = gold && gold.FindChildTraverse("LevelAmount");
            if (!U.IsPanelValid(source)) return;
            originalParent = source.GetParent();
            originalIndex = originalParent.Children().indexOf(source);
            moved = source;
            moved.SetParent(anchor);
            moved.AddClass("qol_fg_portrait");
            portraitSig = null;
            heroSig = null;
            QOL.state.fgHeroImageMoved = true;
        }
        var nextHero = moved.FindChildTraverse("HeroImage");
        if (nextHero !== heroImage) {
            clearOwned(heroImage, heroStyles);
            heroImage = nextHero;
            heroSig = null;
        }
        portraitSig = QOL.core.panel.syncStyles(moved, portraitStyles, portraitSig).sig;
        if (U.IsPanelValid(heroImage)) {
            heroSig = QOL.core.panel.syncStyles(heroImage, heroStyles, heroSig).sig;
        }
    }

    QOL.healthbar.fg = { update: update };
})();
