"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("hideout friends-playing count occupies the current party-settings button slot", () => {
    const css = read("panorama/styles/citadel_party.css");
    const base = read("panorama/styles/base/citadel_party.css");
    const globalCss = read("panorama/styles/qollock_global.css");

    assert.equal(fs.existsSync(path.join(__dirname, "../panorama/layout/citadel_party.xml")), false);
    assert.match(css, /@import url\("s2r:\/\/panorama\/styles\/base\/citadel_party\.vcss_c"\);/);
    assert.match(base, /#JoinCreateParty\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;[^}]*margin-top:\s*30px;[^}]*margin-right:\s*2px;/s);
    assert.match(base, /\.ShowEscapeMenu #JoinCreateParty:hover:enabled/);
    assert.match(base, /\.connectedToHideout \.HasFriendsInGame \.FriendsCount/);
    assert.match(base, /@keyframes 'InviteGlow'/);
    assert.match(css, /\.FriendsCountContainer\s*\{[^}]*ignore-parent-flow:\s*true;[^}]*width:\s*36px;[^}]*height:\s*36px;[^}]*margin-top:\s*30px;[^}]*margin-right:\s*2px;[^}]*x:\s*-2px;[^}]*y:\s*-2px;[^}]*horizontal-align:\s*left;[^}]*vertical-align:\s*top;/s);
    assert.doesNotMatch(globalCss, /#CitadelPartyContainer \.FriendsCountContainer/);
});
