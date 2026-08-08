#!/usr/bin/env node
// =============================================================================
// QOLLOCK Feature Scaffold — generates correct boilerplate for new features
// =============================================================================
// Usage:
//   node tools/scaffold.js <feature_id> "Feature Name" "Description" --type=<type> [flags]
//
// Types: css-only, style-only, polling, complex
//
// Examples:
//   node tools/scaffold.js ql_zipboost "Zip Boost" "Zip boost overlay" --type=polling \
//     --poll-rate=0.6 \
//     --settings='[{"key":"ENABLE_ZIP_BOOST","type":"toggle","default":false},{"key":"ZIP_BOOST_SCALE","type":"slider","min":50,"max":200,"step":1,"default":100}]' \
//     --css
//
//   node tools/scaffold.js ql_cast_failed_hint "Cast Failed Hint" \
//     "Hides cast_failed_box" --type=css-only \
//     --settings='[{"key":"ENABLE_HIDE_FAILED_HINT","type":"toggle","default":false}]'
//
// What it generates:
//   1. panorama/scripts/features/<id>/manifest.js
//   2. Prints hud.xml <include> line to add
//   3. Optionally creates CSS stub at styles/features/<id>.css
//
// Conventions enforced (no more hyphen IDs, missing keys, broken patterns):
//   - feature_id validated against /^[a-z0-9_]+$/ (underscores only)
//   - OWNS/DOES NOT OWN/DEPENDS ON header generated
//   - Settings array with correct types (toggle/slider/dropdown/palette/text)
//   - onDisable calls logger.clearThrottle(featureId)
//   - Polling features use Scheduler.createPollLoop (not raw $.Schedule)
//   - Event-driven features apply in onEnable + onSettingsChanged
//   - Signature diffing pattern included for style features
// =============================================================================

"use strict";

var fs = require("fs");
var path = require("path");

// -- Parse args ---------------------------------------------------------------
var args = process.argv.slice(2);
var positional = [];
var flags = {};

for (var i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
        var eq = args[i].indexOf("=");
        if (eq !== -1) {
            flags[args[i].slice(2, eq)] = args[i].slice(eq + 1);
        } else {
            flags[args[i].slice(2)] = true;
        }
    } else {
        positional.push(args[i]);
    }
}

function flag(k, def) { return flags.hasOwnProperty(k) ? flags[k] : def; }

var featureId = positional[0];
var displayName = positional[1];
var description = positional[2];
var featureType = flag("type", "style-only");

if (!featureId || !displayName) {
    console.error("Usage: node tools/scaffold.js <feature_id> \"Feature Name\" \"Description\" --type=<type> [flags]");
    console.error("");
    console.error("Types: css-only, style-only, polling");
    console.error("");
    console.error("Flags:");
    console.error("  --settings='<json>'     JSON array of setting descriptors");
    console.error("  --css                   Create CSS stub file");
    console.error("  --poll-rate=<seconds>   Poll interval for polling features");
    console.error("  --enabled-by-default    Start enabled (default: false)");
    console.error("  --dry-run               Show output without writing files");
    process.exit(1);
}

// Validate ID (prevents hyphen bugs)
if (!/^[a-z0-9_]+$/.test(featureId)) {
    console.error("ERROR: feature_id must be lowercase alphanumeric + underscores.");
    console.error("       Got: " + featureId + " (does not match /^[a-z0-9_]+$/)");
    console.error("       Use: " + featureId.replace(/-/g, "_"));
    process.exit(1);
}

var VALID_TYPES = ["css-only", "style-only", "polling"];
if (VALID_TYPES.indexOf(featureType) === -1) {
    console.error("ERROR: --type must be one of: " + VALID_TYPES.join(", "));
    process.exit(1);
}

var createCss = flags.hasOwnProperty("css");
var dryRun = flags.hasOwnProperty("dry-run");
var enabled = flag("enabled-by-default", "false") !== "false";
var pollRate = parseFloat(flag("poll-rate", "0.2"));
var isPolling = featureType === "polling";
var isCssOnly = featureType === "css-only";

var settings = [];
try {
    settings = JSON.parse(flag("settings", "[]"));
    if (!Array.isArray(settings)) throw new Error("not array");
} catch (e) {
    console.error("ERROR: --settings must be valid JSON array. Got: " + flag("settings", "[]"));
    process.exit(1);
}

// -- Paths --------------------------------------------------------------------
var PROJECT_ROOT = path.resolve(__dirname, "..");
var MANIFEST_DIR = path.join(PROJECT_ROOT, "features", featureId);
var MANIFEST_PATH = path.join(MANIFEST_DIR, "manifest.js");
var CSS_DIR = path.join(PROJECT_ROOT, "..", "styles", "features");
var CSS_PATH = path.join(CSS_DIR, featureId + ".css");

// -- Generate manifest ---------------------------------------------------------
function settingsBlock() {
    if (settings.length === 0) return "        settings: [],";
    var lines = settings.map(function(s, i) {
        var comma = i < settings.length - 1 ? "," : "";
        var line = '            { key: "' + s.key + '", type: "' + s.type + '"';
        if (s.type === "slider") line += ", min: " + s.min + ", max: " + s.max + ", step: " + s.step;
        if (s.type === "dropdown") line += ", options: " + JSON.stringify(s.options);
        line += ", default: " + JSON.stringify(s.default) + " }" + comma;
        return line;
    });
    return "        settings: [\n" + lines.join("\n") + "\n        ],";
}

function configKeysComment() {
    if (settings.length === 0) return "// CONFIG KEYS: none";
    var keys = settings.map(function(s) { return s.key; });
    return "// CONFIG KEYS: " + keys.join(", ");
}

function onEnableCode() {
    if (isCssOnly) {
        return '                onEnable: function() {\n' +
               '                    var hud = $.GetContextPanel().FindChildTraverse("Hud");\n' +
               '                    if (hud) hud.AddClass("' + featureId + '_active");\n' +
               '                },';
    }
    if (isPolling) {
        return '                onEnable: function() {\n' +
               '                    var S = QOL.core.Scheduler;\n' +
               '                    _loop = S && S.createPollLoop ? S.createPollLoop(_tick, ' + pollRate + ', "' + featureId + '") : null;\n' +
               '                },';
    }
    return '                onEnable: function() {\n' +
           '                    _apply(ctx.config.all());\n' +
           '                },';
}

function onDisableCode() {
    var code = '                onDisable: function() {\n';
    if (isPolling) {
        code += '                    if (_loop) { _loop.stop(); _loop = null; }\n';
        code += '                    var S = QOL.core.Scheduler;\n';
        code += '                    if (S) S.cancelAllForFeature("' + featureId + '");\n';
    }
    if (isCssOnly) {
        code += '                    var hud = $.GetContextPanel().FindChildTraverse("Hud");\n';
        code += '                    if (hud) hud.RemoveClass("' + featureId + '_active");\n';
    }
    if (!isCssOnly && !isPolling) {
        code += '                    _lastSig = "";\n';
        code += '                    _restoreDefaults();\n';
    }
    code += '                    logger.clearThrottle("' + featureId + '");\n';
    code += '                },';
    return code;
}

function tickCode() {
    if (!isPolling) return "";
    return '\n' +
           '            function _tick() {\n' +
           '                try { _update(); } catch(e) {\n' +
           '                    logger.logError("' + featureId + '", "_tick threw: " + (e.message || e));\n' +
           '                }\n' +
           '            }\n' +
           '\n' +
           '            function _update() {\n' +
           '                var cfg = _runtimeSettings;\n' +
           '                // TODO: implement polling logic\n' +
           '            }\n';
}

function styleImports() {
    if (isPolling) return '\n            var _runtimeSettings = {};\n            var _loop = null;';
    if (isCssOnly) return "";
    return '\n            var _lastSig = "";';
}

var manifest = [
    '// features/' + featureId + '/manifest.js',
    '// =============================================================================',
    '// QOLLOCK — ' + displayName,
    '// =============================================================================',
    '// OWNS:        ' + (description || "TODO: describe what this feature owns"),
    '// DOES NOT OWN: TODO',
    '// DEPENDS ON:  QOL.core.FeatureRegistry' + (isPolling ? ', QOL.core.Scheduler' : ''),
    configKeysComment(),
    (createCss ? '// CSS:         styles/features/' + featureId + '.css' : '// CSS:         none'),
    '// PATTERN:     ' + (isPolling ? 'Polling (' + pollRate + 'Hz). Self-scheduling via Scheduler.' :
                         isCssOnly ? 'CSS-only. Class toggle on Hud root.' :
                         'Event-driven. Style apply with signature diffing.'),
    '// =============================================================================',
    '',
    '(function() {',
    '    "use strict";',
    '',
    '    var FR = QOL.core.FeatureRegistry;',
    '    if (!FR) { $.Msg("[QOLLock] ' + featureId + ': FeatureRegistry not found — aborting"); return; }',
    '    var logger = QOL.core.Logger;',
    '',
    '    FR.register({',
    '        id: "' + featureId + '",',
    '        enabledByDefault: ' + enabled + ',',
    settingsBlock(),
    '        create: function(ctx) {' + styleImports(),
    '',
    tickCode(),
    (isPolling ? '' : (isCssOnly ? '' :
    '            function _hasNonDefault(cfg) {\n' +
    '                // TODO: return true if any setting is non-default\n' +
    '                return false;\n' +
    '            }\n' +
    '\n' +
    '            function _apply(cfg) {\n' +
    '                // TODO: implement style application\n' +
    '            }\n' +
    '\n' +
    '            function _restoreDefaults() {\n' +
    '                // TODO: restore default styles/state\n' +
    '            }\n')),
    '',
    '            return {',
    onEnableCode(),
    onDisableCode(),
    '                onSettingsChanged: function() {}',
    '            };',
    '        }',
    '    });',
    '})();',
    ''
].join('\n');

// -- Output -------------------------------------------------------------------
if (dryRun) {
    console.log("=== DRY RUN — would create: ===");
    console.log(MANIFEST_PATH);
    if (createCss) console.log(CSS_PATH);
    console.log("");
    console.log("=== Manifest preview: ===");
    console.log(manifest);
    console.log("");
    console.log("=== Add to hud.xml <scripts> block (before app.vjs_c): ===");
    console.log('  <include src="s2r://panorama/scripts/features/' + featureId + '/manifest.vjs_c" />');
    if (createCss) {
        console.log("=== Add to the appropriate game CSS manifest (@import): ===");
        console.log('  @import url("s2r://panorama/styles/features/' + featureId + '.vcss_c");');
    }
    process.exit(0);
}

// Write manifest
if (!fs.existsSync(MANIFEST_DIR)) fs.mkdirSync(MANIFEST_DIR, { recursive: true });
fs.writeFileSync(MANIFEST_PATH, manifest);
console.log("Created: " + MANIFEST_PATH);

// Write CSS stub
if (createCss) {
    if (!fs.existsSync(CSS_DIR)) fs.mkdirSync(CSS_DIR, { recursive: true });
    var css = '/* ' + featureId + '.css — ' + displayName + ' */\n' +
              '/* Feature active class: .' + featureId + '_active */\n' +
              '\n';
    fs.writeFileSync(CSS_PATH, css);
    console.log("Created: " + CSS_PATH);
}

console.log("");
console.log("=== Add to hud.xml <scripts> block (before app.vjs_c): ===");
console.log('  <include src="s2r://panorama/scripts/features/' + featureId + '/manifest.vjs_c" />');
if (createCss) {
    console.log("=== Add to the appropriate game CSS manifest (@import): ===");
    console.log('  @import url("s2r://panorama/styles/features/' + featureId + '.vcss_c");');
}
console.log("");
console.log("Done. Edit " + MANIFEST_PATH + " to fill in TODO sections.");
