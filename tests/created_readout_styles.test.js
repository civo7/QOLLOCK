"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { readStyleSource } = require("./helpers/style_source");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("created readout typography is available through the owning stylesheet chains", () => {
    const chain = read("panorama/styles/hud.css");
    for (const name of ["perf", "build_id", "statlocker"]) assert.ok(chain.includes("features/ql_feat_" + name + ".vcss_c"));
    const hud = read("panorama/styles/features/ql_feat_perf.css") + read("panorama/styles/features/ql_feat_build_id.css");
    assert.match(hud, /#QOL_PerfBody\s*\{[^}]*font-size:\s*12px;/);
    assert.match(hud, /#build_info\s*\{[^}]*font-size:\s*16px;/);
    assert.match(readStyleSource("panorama/styles/qol_profile_extensions.css"), /ql_feat_statlocker/);
    const profile = read("panorama/styles/features/ql_feat_statlocker.css");
    assert.match(profile, /\.QOLStatlockerLabel\s*\{[^}]*font-size:\s*14px;/);
});

test("created constant presentation has no recurring JavaScript style plan", () => {
    for (const file of ["ql_perf/overlay.js", "ql_statlocker/manifest.js", "ql_show_build_id/manifest.js"]) {
        const js = read("panorama/scripts/manifests/" + file);
        assert.doesNotMatch(js, /fontSize:|fontWeight:|fontFamily:/, file);
    }
    const mirror = read("panorama/scripts/manifests/ql_item_mirror/renderer.js");
    assert.doesNotMatch(mirror, /mirrorIcon\.style\.(?:width|height|margin)\s*!==|mirrorSlot\.style\.(?:width|height|backgroundColor)\s*!==/);
    assert.doesNotMatch(mirror, /cdText\.style\.(?:width|height)\s*=/,
        "creation-time inline dimensions must not override the CSS fit-children box");
});

test("basic cooldown shop gate and tunnel artwork belong to CSS", () => {
    const passive = read("panorama/scripts/manifests/ql_passive_cooldown/manifest.js");
    assert.doesNotMatch(passive, /HasClassInHierarchy\(panel, "gShopOpen"\)/);
    assert.match(read("panorama/styles/features/ql_feat_passive_cooldown.css"), /gShopOpen #hud_passive_items:not\(\.QOLCustomizeBasicCooldownPreview\)/);
    const minimap = read("panorama/scripts/manifests/ql_minimap_runtime/manifest.js");
    assert.doesNotMatch(minimap, /backgroundImage:.*mm_tunnel_overlay/);
    assert.match(read("panorama/styles/features/ql_feat_minimap.css"), /#tunnel_overlay\s*\{[^}]*mm_tunnel_overlay/);
});
