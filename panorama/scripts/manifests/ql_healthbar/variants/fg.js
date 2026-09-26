// FG portrait shares the native bar's scale/offset ancestry.
(function() {
    'use strict';
    var U = QOL.utils;
    var moved = null;
    var originalParent = null;
    var originalIndex = -1;

    function restore() {
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
        var gold = root.FindChildTraverse("gold_and_ap_container");
        var source = gold && gold.FindChildTraverse("LevelAmount");
        if (U.IsPanelValid(moved) && (!U.IsPanelValid(anchor) ||
            moved.GetParent() !== anchor || (U.IsPanelValid(source) && source !== moved))) {
            restore();
        }
        if (!U.IsPanelValid(anchor)) return;
        if (!U.IsPanelValid(moved)) {
            if (!U.IsPanelValid(source)) return;
            originalParent = source.GetParent();
            originalIndex = originalParent.Children().indexOf(source);
            moved = source;
            moved.SetParent(anchor);
            moved.AddClass("qol_fg_portrait");
            QOL.state.fgHeroImageMoved = true;
        }
    }

    QOL.healthbar.fg = { update: update };
})();
