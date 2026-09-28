"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

// Decode this shipped RGBA8 PNG to measure its actual transparent opening.
// This checks source geometry, not Panorama layout or native progress behavior.
function framePixels() {
    const png = fs.readFileSync(path.join(__dirname, "../panorama/images/qollock/qol_fg_healthbar_border_png.png"));
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert.deepEqual([...png.subarray(24, 29)], [8, 6, 0, 0, 0]);
    const chunks = [];
    for (let offset = 8; offset < png.length;) {
        const size = png.readUInt32BE(offset);
        if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") {
            chunks.push(png.subarray(offset + 8, offset + 8 + size));
        }
        offset += 12 + size;
    }
    const raw = zlib.inflateSync(Buffer.concat(chunks));
    const stride = width * 4;
    const pixels = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        assert.ok(filter <= 4);
        for (let x = 0; x < stride; x++) {
            const index = y * stride + x;
            const a = x >= 4 ? pixels[index - 4] : 0;
            const b = y ? pixels[index - stride] : 0;
            const c = y && x >= 4 ? pixels[index - stride - 4] : 0;
            const p = a + b - c;
            const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
            const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            const predictor = [0, a, b, Math.floor((a + b) / 2), paeth][filter];
            pixels[index] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
        }
    }
    return { width, height, pixels };
}

test("FG full fill covers the alpha opening; reported partial HP retains an empty tip", () => {
    const css = fs.readFileSync(path.join(__dirname, "../panorama/styles/hud_health.css"), "utf8").replace(/\r\n/g, "\n");
    function rule(id) {
        const start = css.indexOf(`.fg_healthbar_active:not(.minimalist_healthbar_active) #${id}\n{`);
        assert.ok(start >= 0);
        return css.slice(start, css.indexOf("}", start));
    }
    function px(ruleText, property) {
        const match = ruleText.match(new RegExp(`\\n\\s*${property}: (-?[\\d.]+)px;`));
        assert.ok(match, property);
        return Number(match[1]);
    }
    const frameRule = rule("health_bar_frame");
    const fillRule = rule("health_bar");
    const frameHeight = px(frameRule, "height");
    const frameWidth = px(frameRule, "width");
    const length = px(fillRule, "height"), offset = px(fillRule, "y");
    const fillWidth = px(fillRule, "width");
    for (const id of ["health_bar", "pending_incoming_heal", "pending_incoming_damage"]) {
        const track = rule(id);
        assert.equal(px(track, "margin"), 0, "native margins must not shift the centered track");
        assert.equal(px(track, "height"), length);
        assert.equal(px(track, "width"), fillWidth);
        assert.equal(px(track, "y"), offset);
    }
    assert.match(frameRule, /background-position: center;/);
    const { width, height, pixels } = framePixels();
    const scale = Math.max(frameWidth / width, frameHeight / height); // background-size: cover
    const opening = [];
    // Interior window excludes the transparent outside of the frame/hexagon.
    for (let y = 540; y < 1720; y++) {
        for (let x = 140; x < 249; x++) {
            if (pixels[(y * width + x) * 4 + 3] < 128) {
                opening.push({ x: (x + 0.5 - width / 2) * scale, y: (y + 0.5 - height / 2) * scale });
            }
        }
    }
    assert.ok(opening.length > 100000);
    function covered(fraction) {
        const bottom = offset + length / 2;
        const top = bottom - length * fraction;
        return opening.filter(p => Math.abs(p.x) <= fillWidth / 2 && p.y >= top && p.y <= bottom).length / opening.length;
    }
    assert.equal(covered(0), 0);
    assert.equal(covered(1), 1, "full HP must reach the entire portrait-side slant without a gap");
    assert.ok(covered(1870 / 1946) < 0.99, "96.1% HP must not disappear behind the frame as full");
    assert.ok(covered(1150 / 1374) < 0.9);
    assert.ok(covered(0.5) > 0.47 && covered(0.5) < 0.53);
});
