"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8").replace(/\r\n/g, "\n");
}

function cssRules(css) {
    const normalized = css
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/@(import|define)[^;]+;/g, "");
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
    return Array.from(normalized.matchAll(rulePattern), (match) => ({
        selectors: match[1].split(",").map((candidate) => candidate.trim()),
        body: match[2]
    }));
}

function ruleBody(css, selector) {
    let body = null;
    for (const rule of cssRules(css)) {
        if (rule.selectors.includes(selector)) body = rule.body;
    }
    assert.notEqual(body, null, `missing selector: ${selector}`);
    return body;
}

test("quick-buy override preserves the current native listener and summary binding tree", () => {
    const layout = read("panorama/layout/hud_quickbuy.xml");

    assert.match(layout, /<GlobalClassListener classes="gStreetBrawl gQuickbuyShopShowQueue" \/>/);
    assert.match(layout, /<Panel id="HudMini"[^>]*>[\s\S]*?<Panel id="HudMiniContents">[\s\S]*?<CitadelHudQuickbuyEntry id="QuickbuyNext" \/>/);
    assert.match(layout, /<Panel class="QuickbuyShopSummaryContainer">[\s\S]*?<Panel id="QuickbuyShopSummary" class="QuickbuyShopSummary" onmouseactivate="CitadelQuickbuyToggleShopQueue\(\)">/);
    assert.match(layout, /<CitadelModIcon id="QuickbuyShopSummaryModIcon" class="QuickbuyShopSummaryModIcon" hittest="false" \/>/);

    for (const nativeBinding of [
        'class="quickbuy_icon"',
        'class="quickbuy_details"',
        'class="ItemsReadyLabel"',
        'class="ItemsForSell"',
        'class="sell_icon"',
        'class="ItemsSellLabel" text="{d:sell_queue_size}"'
    ]) {
        assert.ok(layout.includes(nativeBinding), `missing current quick-buy binding: ${nativeBinding}`);
    }
});

test("quick-buy styles extend refreshed native resources without stale toggle selectors", () => {
    const css = read("panorama/styles/hud_quickbuy.css");
    const base = read("panorama/styles/base/hud_quickbuy.css");
    const entry = read("panorama/styles/hud_quickbuy_entry.css");

    assert.match(css, /@import url\("s2r:\/\/panorama\/styles\/base\/hud_quickbuy\.vcss_c"\);/);
    assert.match(entry, /@import url\("s2r:\/\/panorama\/styles\/base\/hud_quickbuy_entry\.vcss_c"\);/);
    assert.doesNotMatch(css, /!important/);
    assert.doesNotMatch(entry, /!important/);
    assert.doesNotMatch(css, /#CitadelHudQuickbuy\.QuickbuyShopShowQueue\b/);

    const openQueue = ruleBody(css, ".gShopOpen #CitadelHudQuickbuy.gQuickbuyShopShowQueue .QuickbuyQueueOuter");
    assert.match(openQueue, /opacity:\s*1;/);
    const baseOpenQueue = ruleBody(base, ".gShopOpen #CitadelHudQuickbuy.gQuickbuyShopShowQueue .QuickbuyQueueOuter");
    assert.match(baseOpenQueue, /opacity:\s*1;/);

    const miniShell = ruleBody(base, "#HudMini");
    assert.match(miniShell, /width:\s*74px;/);
    assert.match(miniShell, /height:\s*94px;/);
    const miniContents = ruleBody(base, "#HudMini #HudMiniContents");
    assert.match(miniContents, /width:\s*70px;/);
    assert.match(miniContents, /height:\s*70px;/);

    assert.doesNotMatch(css, /\.QuickbuyItem\.IsBeingDragged\.isWeapon/);
    assert.match(entry, /#QuickbuyPreview2Entry/);
    assert.match(entry, /#NotifyButton/);
});
