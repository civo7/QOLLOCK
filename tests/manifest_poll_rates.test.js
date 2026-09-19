// tests/manifest_poll_rates.test.js
// =============================================================================
// Rate Guard: Enforces that high-frequency poll loops (< 0.2s / > 5Hz)
// cannot be added without an explicit, reviewed "// rate-exempt: <reason>" comment.
// This prevents CPU drain and accidental 20Hz polling across feature manifests.
// =============================================================================

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const MANIFESTS_DIR = path.resolve(__dirname, "../panorama/scripts/manifests");

function findManifestFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findManifestFiles(fullPath));
        } else if (entry.isFile() && entry.name === "manifest.js") {
            results.push(fullPath);
        }
    }
    return results;
}

test("Rate Guard: all manifest poll loops with rate < 0.2s have explicit rate-exempt documentation", () => {
    const files = findManifestFiles(MANIFESTS_DIR);
    assert.ok(files.length >= 30, `Expected at least 30 manifest files, found ${files.length}`);

    const violations = [];

    for (const filePath of files) {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split(/\r?\n/);
        const relPath = path.relative(path.resolve(__dirname, ".."), filePath).replace(/\\/g, "/");

        // Collect constants defined in this file (e.g. var FOO = 0.05;)
        const constants = new Map();
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const constMatch = line.match(/(?:var|let|const)\s+([A-Za-z0-9_]+)\s*=\s*([0-9.]+)\s*;/);
            if (constMatch) {
                const name = constMatch[1];
                const val = parseFloat(constMatch[2]);
                const prevLine = i > 0 ? lines[i - 1] : "";
                const hasExempt = line.includes("rate-exempt:") || prevLine.includes("rate-exempt:");
                constants.set(name, { value: val, lineIndex: i, hasExempt });
            }
        }

        // Find createPollLoop calls
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(/createPollLoop\s*\(\s*[^,]+,\s*([^,)]+)/);
            if (!match) continue;

            const rateExpr = match[1].trim();
            let rateVal = parseFloat(rateExpr);
            let isConst = false;
            let constExempt = false;

            if (isNaN(rateVal) && constants.has(rateExpr)) {
                const c = constants.get(rateExpr);
                rateVal = c.value;
                isConst = true;
                constExempt = c.hasExempt;
            }

            // If rate is determined to be < 0.2s (e.g. 0.05s / 20Hz, 0.1s / 10Hz, 0.16s)
            if (!isNaN(rateVal) && rateVal < 0.2) {
                // Check if this line or any of the 3 preceding lines has rate-exempt comment
                let hasExemptComment = constExempt || line.includes("rate-exempt:");
                if (!hasExemptComment) {
                    for (let back = 1; back <= 3 && (i - back) >= 0; back++) {
                        if (lines[i - back].includes("rate-exempt:")) {
                            hasExemptComment = true;
                            break;
                        }
                    }
                }

                if (!hasExemptComment) {
                    violations.push({
                        file: relPath,
                        line: i + 1,
                        rateExpr: isConst ? `${rateExpr} (${rateVal}s)` : `${rateVal}s`,
                        code: line.trim()
                    });
                }
            }
        }
    }

    if (violations.length > 0) {
        const msg = violations.map(v =>
            `  - ${v.file}:${v.line} uses rate ${v.rateExpr} without '// rate-exempt: <reason>'\n    Code: ${v.code}`
        ).join("\n");
        assert.fail(
            `Found ${violations.length} unexempted high-frequency poll loop(s) (< 0.2s / > 5Hz):\n${msg}\n\n` +
            `Rule: Every poll loop with rate < 0.2s must have an explicit '// rate-exempt: <reason>' comment\n` +
            `explaining why high frequency is strictly required.`
        );
    }
});
