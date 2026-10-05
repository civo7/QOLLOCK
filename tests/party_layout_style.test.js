"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("hideout friends-playing count sits left of and aligned with the party slots", () => {
    const css = read("panorama/styles/qollock_global.css");

    assert.match(css, /#CitadelPartyContainer CitadelParty\s*\{[^}]*flow-children:\s*left;/s);
    assert.match(css, /#CitadelPartyContainer \.FriendsCountContainer\s*\{[^}]*vertical-align:\s*center;[^}]*y:\s*20px;[^}]*margin:\s*0px 16px 0px 0px;/s);
});
