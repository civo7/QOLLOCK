"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { generateImages, renderReferences } = require("../scripts/generate_minimap_reference_images");

test("reference images keep map-relative anchors, outlines and underground opacity in one resource", () => {
    const svg = renderReferences([[0.25, 0.75, 0], [0.5, 0.5, 1]], "statues");
    assert.match(svg, /x="88" y="268" width="4" height="4"/);
    assert.match(svg, /rotate\(45 90 270\)/);
    assert.match(svg, /<g opacity="0.5"><rect x="178" y="178"/);
    assert.match(svg, /fill="#FACC15" stroke="#000000" stroke-width="1"/);
    assert.throws(() => renderReferences([[NaN, 0.5]], "snacks"), /Invalid minimap reference coordinate/);
});

test("shipped flattened reference resources match the current source tables", () => {
    const expectedCounts = { crates: 425, tough_crates: 74, snacks: 36, statues: 166 };
    for (const [file, svg] of Object.entries(generateImages())) {
        const kind = file.slice("minimap_references_".length, -".vsvg".length).replace(/_\d+$/, "");
        assert.equal((svg.match(/<g(?: |\>)/g) || []).length, expectedCounts[kind], kind + " reference count");
        assert.equal(fs.readFileSync(path.join(__dirname, "../panorama/images/qollock", file), "utf8").replace(/\r\n/g, "\n"), svg,
            file + " must be regenerated after source coordinates change");
    }
});
