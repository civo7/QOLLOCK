"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { xmlSymbols } = require("./audit_game_update");
const { REPO_ROOT } = require("./simulator/layout");

function loadXmlEvidence({ vanilla = null, repositoryRoot = REPO_ROOT } = {}) {
    const evidence = [], overridden = new Set();
    function readLayouts(directory, source, skipOverrides) {
        if (!fs.existsSync(directory)) throw new Error("missing layout directory: " + directory);
        function visit(dir) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) visit(full);
                else if (entry.name.endsWith(".xml")) {
                    const relative = path.relative(directory, full).replace(/\\/g, "/");
                    if (skipOverrides && overridden.has(relative)) continue;
                    if (!skipOverrides) overridden.add(relative);
                    for (const symbol of xmlSymbols(fs.readFileSync(full, "utf8"))) {
                        // GlobalClassListener's classes list references external
                        // state classes; it does not assign them to that panel.
                        evidence.push({ ...symbol, file: source + "/layout/" + relative,
                            evidence: symbol.kind === "class" && symbol.type === "GlobalClassListener" ? "xml-reference" : "xml-declaration" });
                    }
                }
            }
        }
        visit(directory);
    }
    readLayouts(path.join(repositoryRoot, "panorama", "layout"), "qollock", false);
    if (vanilla) readLayouts(path.join(vanilla, "layout"), "native", true);
    return evidence;
}

function indexEvidence(evidence) {
    const index = new Map();
    for (const symbol of evidence) {
        const key = symbol.kind + ":" + symbol.token;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(symbol);
    }
    return index;
}

function sourceStatus(evidence, created = []) {
    if (evidence.some(e => e.evidence === "xml-declaration")) return "XML_DECLARED";
    if (created.length) return "MOD_CREATED";
    if (evidence.length) return "XML_REFERENCED";
    return "SOURCE_UNVERIFIED";
}

module.exports = { loadXmlEvidence, indexEvidence, sourceStatus };
