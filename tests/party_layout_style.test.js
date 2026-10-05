"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("hideout friends-playing count occupies the party-settings button slot", () => {
    const css = read("panorama/styles/qollock_global.css");

    assert.match(css, /#CitadelPartyContainer CitadelParty\s*\{[^}]*flow-children:\s*down;/s);
    assert.match(css, /#CitadelPartyContainer \.FriendsCountContainer\s*\{[^}]*ignore-parent-flow:\s*true;[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*margin-top:\s*26px;[^}]*margin-right:\s*2px;[^}]*horizontal-align:\s*left;[^}]*vertical-align:\s*top;/s);
});
