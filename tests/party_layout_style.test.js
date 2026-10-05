"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("hideout friends-playing count occupies the current party-settings button slot", () => {
    const layout = read("panorama/layout/citadel_party.xml");
    const css = read("panorama/styles/qollock_party.css");
    const globalCss = read("panorama/styles/qollock_global.css");

    assert.match(layout, /<include src="s2r:\/\/panorama\/styles\/citadel_party\.vcss_c" \/>[\s\S]*<include src="s2r:\/\/panorama\/styles\/qollock_party\.vcss_c" \/>/);
    assert.match(layout, /<Button id="JoinCreateParty"[^>]*oncontextmenu="CitadelCopyPartyCode\(\)" \/>/);
    assert.match(css, /\.FriendsCountContainer\s*\{[^}]*ignore-parent-flow:\s*true;[^}]*width:\s*36px;[^}]*height:\s*36px;[^}]*margin-top:\s*30px;[^}]*margin-right:\s*2px;[^}]*horizontal-align:\s*left;[^}]*vertical-align:\s*top;/s);
    assert.doesNotMatch(globalCss, /#CitadelPartyContainer \.FriendsCountContainer/);
});
