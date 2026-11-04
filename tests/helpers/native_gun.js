"use strict";

// hud.xml, element_gun.xml and the October 3 native capture share this owner path.
module.exports = ($, root) => {
    let core = root.Children().find(panel => panel.BHasClass("HudCore"));
    if (!core) { core = $.CreatePanel("Panel", root, ""); core.AddClass("HudCore"); }
    let owner = core;
    for (const id of ["gameplay_hud", "gameplay_hud_alive", "crosshair", "gun", "gun_data"]) {
        owner = owner.FindChild(id) || $.CreatePanel("Panel", owner, id);
    }
    return owner;
};
