"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scripts = ["ql_utils.js", "core/ql_panel_helpers.js", "ui/renderer.js"].map((name) => ({
    filename: path.resolve(__dirname, "../panorama/scripts", name),
    source: fs.readFileSync(path.resolve(__dirname, "../panorama/scripts", name), "utf8"),
}));

// Load the production dependency layer instead of reproducing its helpers in tests.
module.exports = function loadUiHelpers(context) {
    if (context.globalThis && context.globalThis !== context) Object.assign(context, context.globalThis);
    context.globalThis = context;
    context.QOL = context.QOL || {};
    context.QOL.core = context.QOL.core || {};
    context.QOL.ui = context.QOL.ui || {};
    for (const script of scripts) vm.runInNewContext(script.source, context, { filename: script.filename });
};
