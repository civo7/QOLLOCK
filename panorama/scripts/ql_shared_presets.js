// $.Msg wrapper — captures all [QOLLock]/[QOL-prefixed messages into a ring
// buffer for the diagnostic "Copy Logs" button. Must run FIRST — before any
// "use strict" or IIFE — so it intercepts messages in both HUD and settings
// contexts. Logs its own failure (no silent catch).
(function() {
    var _qolLogBuf = [];
    var _qolLogMax = 500;
    var _qolOrigMsg = null;
    try {
        if (typeof $ !== "undefined" && $.Msg) {
            _qolOrigMsg = $.Msg;
            $.Msg = function() {
                try {
                    var _s = "";
                    for (var _i = 0; _i < arguments.length; _i++) {
                        if (_i) _s += " ";
                        _s += String(arguments[_i]);
                    }
                    if (_s.indexOf("[QOLLock]") === 0 || _s.indexOf("[QOL ") === 0 || _s.indexOf("[QOL]") === 0) {
                        _qolLogBuf.push(_s);
                        if (_qolLogBuf.length > _qolLogMax) _qolLogBuf.shift();
                    }
                } catch(_ignore) {}
                return _qolOrigMsg.apply($, arguments);
            };
        }
    } catch(_e) {
        try { if (_qolOrigMsg) $.Msg = _qolOrigMsg; } catch(_r) {}
        try { if (typeof $ !== "undefined" && $.Msg) $.Msg("[QOLLock] $.Msg wrapper failed: " + (_e.message || String(_e))); } catch(_x) {}
    }
    try { __qolLogBuf = _qolLogBuf; } catch(_e) {}
})();

"use strict";

// Shared preset source-of-truth used by ql_settings.js and ql_core.js.
var QOL_SCHEMA_SEMVER = "3.1.4";
var QOL_SCHEMA_WIRE_VERSION = 2;

// ---- Shared storage keys ----
// Panel attribute used to persist config across sessions.
var QOL_STORAGE_KEY = "Deadlock_Mod_Settings_v1";
// Revision counter attribute — monotonically increasing, used to pick the
// most recent config when multiple panel copies exist.
var QOL_USER_EDIT_REV_ATTR = "QOL_USER_EDIT_REV";
// ID of the Hud panel — used as a secondary config storage target alongside root.
var QOL_PANEL_ID_HUD = "Hud";

// ---- Storage envelope helpers (Fix: schema-versioned config storage) ----
// Wraps a config object for storage with schema version tag.
// Produces: {"schema":"3.1.3","data":{...}}
if (typeof WrapConfigForStorage !== "function") {
    var WrapConfigForStorage = function(config) {
        return JSON.stringify({ schema: QOL_SCHEMA_SEMVER, data: config });
    };
}
// Unwraps a stored raw string. Handles both the new envelope format
// and legacy raw-JSON configs. Returns { config, schema, isEnveloped } or null.
if (typeof UnwrapConfigFromStorage !== "function") {
    var UnwrapConfigFromStorage = function(raw) {
        if (!raw || raw === "") return null;
        try {
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && typeof parsed.schema === "string" && typeof parsed.data === "object" && parsed.data !== null) {
                return { config: parsed.data, schema: parsed.schema, isEnveloped: true };
            }
            // Legacy format: the whole object IS the config
            return { config: parsed, schema: null, isEnveloped: false };
        } catch (e) {
            // JSON.parse failure — caller (SafeParseConfig) handles recovery,
            // but log here so the raw error is visible in console for diagnosis.
            if (typeof $ !== "undefined" && $.Msg) {
                var preview = String(raw || "").substring(0, 120);
                $.Msg("[QOLLock] UnwrapConfigFromStorage: JSON parse failed: " +
                    (e && e.message ? e.message : String(e || "")) +
                    " | raw preview: " + preview + (raw && raw.length > 120 ? "..." : ""));
            }
            return null;
        }
    };
}

var QOL_CODEC = (typeof QOL_CODEC === "object" && QOL_CODEC) ? QOL_CODEC : {};

if (typeof QOL_CODEC.EncodeBase64Raw !== "function") {
    QOL_CODEC.EncodeBase64Raw = function(str) {
        var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        var encoded = "";
        for (var i = 0; i < str.length; i += 3) {
            var a = str.charCodeAt(i);
            var b = i + 1 < str.length ? str.charCodeAt(i + 1) : NaN;
            var c = i + 2 < str.length ? str.charCodeAt(i + 2) : NaN;
            var b1 = (a >> 2) & 0x3F;
            var b2 = ((a & 0x3) << 4) | ((b >> 4) & 0xF);
            var b3 = ((b & 0xF) << 2) | ((c >> 6) & 0x3);
            var b4 = c & 0x3F;
            if (isNaN(b)) b3 = b4 = 64;
            else if (isNaN(c)) b4 = 64;
            encoded += chars.charAt(b1) + chars.charAt(b2) + chars.charAt(b3) + chars.charAt(b4);
        }
        return encoded;
    };
}

if (typeof QOL_CODEC.DecodeBase64 !== "function") {
    QOL_CODEC.DecodeBase64 = function(str) {
        var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        var invalid = str.replace(/\s/g, "").replace(/[^A-Za-z0-9\+\/\=]/g, "");
        var decoded = "";
        for (var i = 0; i < invalid.length; i += 4) {
            var b1 = chars.indexOf(invalid.charAt(i));
            var b2 = chars.indexOf(invalid.charAt(i + 1));
            var b3 = chars.indexOf(invalid.charAt(i + 2));
            var b4 = chars.indexOf(invalid.charAt(i + 3));
            var a = (b1 << 2) | (b2 >> 4);
            var b = ((b2 & 15) << 4) | (b3 >> 2);
            var c = ((b3 & 3) << 6) | b4;
            decoded += String.fromCharCode(a);
            if (b3 !== 64) decoded += String.fromCharCode(b);
            if (b4 !== 64) decoded += String.fromCharCode(c);
        }
        return decoded;
    };
}

if (typeof QOL_CODEC.ToBase64Url !== "function") {
    QOL_CODEC.ToBase64Url = function(binaryStr) {
        return QOL_CODEC.EncodeBase64Raw(binaryStr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    };
}

if (typeof QOL_CODEC.FromBase64Url !== "function") {
    QOL_CODEC.FromBase64Url = function(urlStr) {
        var padded = String(urlStr || "").replace(/-/g, "+").replace(/_/g, "/");
        while (padded.length % 4 !== 0) padded += "=";
        return QOL_CODEC.DecodeBase64(padded);
    };
}

if (typeof QOL_CODEC.GetStepDecimals !== "function") {
    QOL_CODEC.GetStepDecimals = function(step) {
        var s = String(step);
        var idx = s.indexOf(".");
        return idx === -1 ? 0 : s.length - idx - 1;
    };
}

if (typeof QOL_CODEC.GetFieldSlotCount !== "function") {
    QOL_CODEC.GetFieldSlotCount = function(field) {
        return Math.round((field.max - field.min) / field.step) + 1;
    };
}

if (typeof QOL_CODEC.GetFieldBitWidth !== "function") {
    QOL_CODEC.GetFieldBitWidth = function(field) {
        var slots = QOL_CODEC.GetFieldSlotCount(field);
        var bits = 0;
        while ((1 << bits) < slots) bits++;
        return bits;
    };
}

if (typeof QOL_CODEC.BuildWireToSemver !== "function") {
    QOL_CODEC.BuildWireToSemver = function(registry) {
        var out = {};
        if (!registry || typeof registry !== "object") return out;
        for (var semver in registry) {
            if (!registry.hasOwnProperty(semver)) continue;
            var entry = registry[semver];
            if (!entry) continue;
            var wireVersion = Math.max(0, Math.round(Number(entry.wireVersion) || 0));
            if (wireVersion <= 0) continue;
            out[wireVersion] = semver;
        }
        return out;
    };
}

if (typeof QOL_CODEC.ResolveSemverFromWire !== "function") {
    QOL_CODEC.ResolveSemverFromWire = function(wireToSemver, registry, wireVersion) {
        var normalized = Math.max(0, Math.round(Number(wireVersion) || 0));
        var semver = wireToSemver ? wireToSemver[normalized] : "";
        if (!semver || !registry || !registry[semver]) return "";
        return semver;
    };
}

if (typeof QOL_CODEC.SerializeCompactBinary !== "function") {
    QOL_CODEC.SerializeCompactBinary = function(config, schema, wireVersion, resolveFieldValue) {
        var safeSchema = Array.isArray(schema) ? schema : [];
        var versionByte = Math.max(0, Math.round(Number(wireVersion) || 0)) & 255;
        var bytes = [versionByte];
        var currentByte = 0;
        var bitPos = 0;

        function writeBits(value, bitCount) {
            for (var i = 0; i < bitCount; i++) {
                var bit = (value >> i) & 1;
                currentByte |= (bit << bitPos);
                bitPos++;
                if (bitPos === 8) {
                    bytes.push(currentByte & 255);
                    currentByte = 0;
                    bitPos = 0;
                }
            }
        }

        for (var f = 0; f < safeSchema.length; f++) {
            var field = safeSchema[f];
            if (!field) continue;
            var bits = QOL_CODEC.GetFieldBitWidth(field);
            var slots = QOL_CODEC.GetFieldSlotCount(field);
            var val = field.min;
            if (typeof resolveFieldValue === "function") {
                try { val = resolveFieldValue(field, config); } catch (e0) { val = field.min; }
            } else if (config && config.hasOwnProperty && config.hasOwnProperty(field.key)) {
                val = config[field.key];
            }
            if (typeof val !== "number" || !isFinite(val)) {
                val = field.min;
            }
            var idx = Math.round((val - field.min) / field.step);
            if (idx < 0) idx = 0;
            if (idx >= slots) idx = slots - 1;
            writeBits(idx, bits);
        }

        if (bitPos > 0) bytes.push(currentByte & 255);

        var checksum = 0;
        for (var i = 0; i < bytes.length; i++) checksum = (checksum + (bytes[i] & 255)) & 255;
        bytes.push(checksum);

        var out = "";
        for (var j = 0; j < bytes.length; j++) out += String.fromCharCode(bytes[j] & 255);
        return out;
    };
}

if (typeof QOL_CODEC.DeserializeCompactBinary !== "function") {
    QOL_CODEC.DeserializeCompactBinary = function(binaryStr, schema, onDecodedField, onMissingField) {
        var bytes = [];
        var source = String(binaryStr || "");
        for (var i = 0; i < source.length; i++) bytes.push(source.charCodeAt(i) & 255);
        if (bytes.length < 3) throw new Error("Compact string too short");

        var expectedChecksum = bytes[bytes.length - 1] & 255;
        var checksum = 0;
        for (var c = 0; c < bytes.length - 1; c++) checksum = (checksum + (bytes[c] & 255)) & 255;
        if (checksum !== expectedChecksum) throw new Error("Compact checksum mismatch");

        var safeSchema = Array.isArray(schema) ? schema : [];
        var byteIndex = 1;
        var bitPos = 0;

        function readBits(bitCount) {
            var value = 0;
            for (var b = 0; b < bitCount; b++) {
                if (byteIndex >= bytes.length - 1) return null;
                var bit = (bytes[byteIndex] >> bitPos) & 1;
                value |= (bit << b);
                bitPos++;
                if (bitPos === 8) {
                    bitPos = 0;
                    byteIndex++;
                }
            }
            return value;
        }

        var parsed = {};
        for (var f = 0; f < safeSchema.length; f++) {
            var field = safeSchema[f];
            if (!field) continue;
            var bits = QOL_CODEC.GetFieldBitWidth(field);
            var slots = QOL_CODEC.GetFieldSlotCount(field);
            var idx = readBits(bits);
            if (idx === null) {
                if (typeof onMissingField === "function") {
                    for (var m = f; m < safeSchema.length; m++) {
                        try { onMissingField(safeSchema[m], parsed); } catch (e1) {}
                    }
                }
                break;
            }
            if (idx < 0) idx = 0;
            if (idx >= slots) idx = slots - 1;

            var value = field.min + (idx * field.step);
            var decimals = QOL_CODEC.GetStepDecimals(field.step);
            value = decimals > 0 ? parseFloat(value.toFixed(decimals)) : Math.round(value);

            var handled = false;
            if (typeof onDecodedField === "function") {
                try { handled = (onDecodedField(field, value, parsed) === true); } catch (e2) { handled = false; }
            }
            if (!handled) {
                parsed[field.key] = value;
            }
        }
        return parsed;
    };
}

var QOL_SCHEMA_UTILS = (typeof QOL_SCHEMA_UTILS === "object" && QOL_SCHEMA_UTILS) ? QOL_SCHEMA_UTILS : {};

if (typeof QOL_SCHEMA_UTILS.ParseConfigStorageRevision !== "function") {
    QOL_SCHEMA_UTILS.ParseConfigStorageRevision = function(rawValue) {
        var n = Number(rawValue);
        if (!isFinite(n) || n < 0) return 0;
        return Math.floor(n);
    };
}

if (typeof QOL_SCHEMA_UTILS.ResolveConfigStorageTargets !== "function") {
    QOL_SCHEMA_UTILS.ResolveConfigStorageTargets = function(rootHint, panelHint) {
        function getRootPanel(panel) {
            var current = panel || null;
            while (current && current.GetParent && current.GetParent()) {
                current = current.GetParent();
            }
            return current || null;
        }

        function getTopLevelChild(root, panel) {
            var current = panel || null;
            while (current && current.GetParent && current.GetParent() !== root) {
                current = current.GetParent();
            }
            if (current && current.GetParent && current.GetParent() === root) return current;
            return null;
        }

        var contextPanel = panelHint || (($ && $.GetContextPanel) ? $.GetContextPanel() : null);
        var root = rootHint || getRootPanel(contextPanel);
        if (!root && $ && $.GetContextPanel) {
            root = getRootPanel($.GetContextPanel());
        }

        var hud = null;
        if (root && root.FindChildTraverse) {
            try { hud = root.FindChildTraverse("Hud"); } catch (e0) { hud = null; }
        }

        var panel = panelHint || null;
        if (!panel && root && root.FindChildTraverse) {
            var settingsWindow = null;
            try { settingsWindow = root.FindChildTraverse("SettingsWindow"); } catch (e1) { settingsWindow = null; }
            if (settingsWindow) {
                panel = getTopLevelChild(root, settingsWindow);
            }
        }
        if (!panel) panel = contextPanel || null;

        return {
            root: root || null,
            panel: panel || null,
            hud: hud || null
        };
    };
}

if (typeof QOL_SCHEMA_UTILS.ReadConfigStorageState !== "function") {
    QOL_SCHEMA_UTILS.ReadConfigStorageState = function(rootHint, panelHint) {
        var storageKey = "Deadlock_Mod_Settings_v1";
        var revAttr = "QOL_USER_EDIT_REV";
        var targets = QOL_SCHEMA_UTILS.ResolveConfigStorageTargets(rootHint, panelHint);
        var entries = [];

        function pushEntry(name, panel, priority) {
            if (!panel || !panel.GetAttributeString) return;
            var raw = "";
            var revision = 0;
            try { raw = String(panel.GetAttributeString(storageKey, "") || ""); } catch (e0) { raw = ""; }
            try { revision = QOL_SCHEMA_UTILS.ParseConfigStorageRevision(panel.GetAttributeString(revAttr, "")); } catch (e1) { revision = 0; }
            entries.push({
                name: String(name || ""),
                panel: panel,
                raw: raw,
                revision: revision,
                priority: Number(priority) || 0
            });
        }

        pushEntry("panel", targets.panel, 0);
        pushEntry("root", targets.root, 1);
        pushEntry("hud", targets.hud, 2);

        var chosenEntry = null;
        var maxRevision = 0;
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (entry.revision > maxRevision) maxRevision = entry.revision;
            if (!entry.raw) continue;
            if (
                !chosenEntry ||
                entry.revision > chosenEntry.revision ||
                (entry.revision === chosenEntry.revision && entry.priority > chosenEntry.priority)
            ) {
                chosenEntry = entry;
            }
        }

        return {
            raw: chosenEntry ? chosenEntry.raw : "",
            revision: chosenEntry ? chosenEntry.revision : 0,
            maxRevision: maxRevision,
            source: chosenEntry ? chosenEntry.name : "",
            targets: targets,
            entries: entries
        };
    };
}

if (typeof QOL_SCHEMA_UTILS.ReadConfigStorageRaw !== "function") {
    QOL_SCHEMA_UTILS.ReadConfigStorageRaw = function(rootHint, panelHint) {
        var state = QOL_SCHEMA_UTILS.ReadConfigStorageState(rootHint, panelHint);
        return state && state.raw ? String(state.raw) : "";
    };
}

if (typeof QOL_SCHEMA_UTILS.WriteConfigStorageRaw !== "function") {
    QOL_SCHEMA_UTILS.WriteConfigStorageRaw = function(rawText, rootHint, panelHint) {
        var storageKey = "Deadlock_Mod_Settings_v1";
        var revAttr = "QOL_USER_EDIT_REV";
        var state = QOL_SCHEMA_UTILS.ReadConfigStorageState(rootHint, panelHint);
        var nextRaw = String(rawText || "");
        var nextRevision = (Number(state && state.maxRevision) || 0) + 1;
        var uniqueTargets = [];
        var writtenTargets = [];

        function pushTarget(name, panel) {
            if (!panel || !panel.SetAttributeString) return;
            for (var i = 0; i < uniqueTargets.length; i++) {
                if (uniqueTargets[i].panel === panel) return;
            }
            uniqueTargets.push({ name: String(name || ""), panel: panel });
        }

        pushTarget("panel", state && state.targets ? state.targets.panel : null);
        pushTarget("root", state && state.targets ? state.targets.root : null);
        pushTarget("hud", state && state.targets ? state.targets.hud : null);

        for (var j = 0; j < uniqueTargets.length; j++) {
            var target = uniqueTargets[j];
            try { target.panel.SetAttributeString(storageKey, nextRaw); } catch (e0) {}
            try { target.panel.SetAttributeString(revAttr, String(nextRevision)); } catch (e1) {}
            writtenTargets.push(target);
        }

        return {
            raw: nextRaw,
            revision: nextRevision,
            count: writtenTargets.length,
            targets: state ? state.targets : null,
            entries: state ? state.entries : [],
            written: writtenTargets
        };
    };
}

if (typeof QOL_SCHEMA_UTILS.CompareSchemaSemver !== "function") {
    QOL_SCHEMA_UTILS.CompareSchemaSemver = function(a, b) {
        var aa = String(a || "").split(".");
        var bb = String(b || "").split(".");
        for (var i = 0; i < 3; i++) {
            var av = Math.max(0, Math.round(Number(aa[i]) || 0));
            var bv = Math.max(0, Math.round(Number(bb[i]) || 0));
            if (av < bv) return -1;
            if (av > bv) return 1;
        }
        return 0;
    };
}

if (typeof QOL_SCHEMA_UTILS.NormalizeNeutralCampTierConfig !== "function") {
    QOL_SCHEMA_UTILS.NormalizeNeutralCampTierConfig = function(configTarget, sourceConfig) {
        if (!configTarget) return;
        var source = sourceConfig || configTarget || {};
        var hasOwn = Object.prototype.hasOwnProperty;
        var tierKeys = ["ENABLE_ONE_TIME_TIER1", "ENABLE_ONE_TIME_TIER2", "ENABLE_ONE_TIME_TIER3"];
        var hasAnyTierInSource = false;
        for (var i = 0; i < tierKeys.length; i++) {
            if (source && hasOwn.call(source, tierKeys[i])) {
                hasAnyTierInSource = true;
                break;
            }
        }

        var legacyEnabled = Number(configTarget.ENABLE_ONE_TIME) === 1 ? 1 : 0;
        for (var j = 0; j < tierKeys.length; j++) {
            var key = tierKeys[j];
            if (hasAnyTierInSource) {
                configTarget[key] = Number(configTarget[key]) === 1 ? 1 : 0;
            } else {
                configTarget[key] = legacyEnabled;
            }
        }
        configTarget.ENABLE_ONE_TIME =
            (configTarget.ENABLE_ONE_TIME_TIER1 === 1 ||
             configTarget.ENABLE_ONE_TIME_TIER2 === 1 ||
             configTarget.ENABLE_ONE_TIME_TIER3 === 1) ? 1 : 0;
    };
}

if (typeof QOL_SCHEMA_UTILS.NormalizeAmmoScaleConfig !== "function") {
    QOL_SCHEMA_UTILS.NormalizeAmmoScaleConfig = function(configTarget, sourceConfig) {
        if (!configTarget) return;
        var source = sourceConfig || configTarget || {};
        var hasOwn = Object.prototype.hasOwnProperty;
        var hasLegacyInSource = !!(source && hasOwn.call(source, "AMMO_PANEL_SCALE"));
        var hasCurrentInSource = !!(source && hasOwn.call(source, "AMMO_CURRENT_SCALE"));
        var hasTotalInSource = !!(source && hasOwn.call(source, "AMMO_TOTAL_SCALE"));

        var legacyScale = Number(configTarget.AMMO_PANEL_SCALE);
        if (!isFinite(legacyScale)) legacyScale = 100;
        var currentScale = Number(configTarget.AMMO_CURRENT_SCALE);
        var totalScale = Number(configTarget.AMMO_TOTAL_SCALE);
        if (!isFinite(currentScale)) currentScale = NaN;
        if (!isFinite(totalScale)) totalScale = NaN;

        if (!hasCurrentInSource) {
            if (hasLegacyInSource) currentScale = legacyScale;
            else if (hasTotalInSource) currentScale = totalScale;
        }
        if (!hasTotalInSource) {
            if (hasLegacyInSource) totalScale = legacyScale;
            else if (hasCurrentInSource) totalScale = currentScale;
        }

        if (!isFinite(currentScale)) currentScale = legacyScale;
        if (!isFinite(totalScale)) totalScale = legacyScale;
        if (!isFinite(currentScale)) currentScale = 100;
        if (!isFinite(totalScale)) totalScale = 100;

        currentScale = Math.round(currentScale);
        totalScale = Math.round(totalScale);
        if (currentScale < 100) currentScale = 100;
        if (currentScale > 300) currentScale = 300;
        if (totalScale < 100) totalScale = 100;
        if (totalScale > 300) totalScale = 300;

        configTarget.AMMO_CURRENT_SCALE = currentScale;
        configTarget.AMMO_TOTAL_SCALE = totalScale;
        configTarget.AMMO_PANEL_SCALE = currentScale;
    };
}

if (typeof QOL_SCHEMA_UTILS.NormalizeItemCooldownModeConfig !== "function") {
    QOL_SCHEMA_UTILS.NormalizeItemCooldownModeConfig = function(configTarget, sourceConfig) {
        if (!configTarget) return;
        var source = sourceConfig || configTarget || {};
        var hasOwn = Object.prototype.hasOwnProperty;
        var oldYOffsetBase = 30;
        var sourceHasPassiveCooldown = !!(source && hasOwn.call(source, "ENABLE_PASSIVE_COOLDOWN"));
        var sourceHasOldMode = !!(source && hasOwn.call(source, "ENABLE_OLD_ITEM_COOLDOWNS"));

        var oldModeEnabled = Number(configTarget.ENABLE_OLD_ITEM_COOLDOWNS) === 1;
        if (oldModeEnabled && sourceHasOldMode && !sourceHasPassiveCooldown) {
            configTarget.ENABLE_PASSIVE_COOLDOWN = 1;
        }

        // Shared sliders are canonical; derive legacy fields for compatibility/export.
        var passiveSize = Number(configTarget.PASSIVE_COOLDOWN_SIZE);
        if (!isFinite(passiveSize)) passiveSize = 40;
        if (passiveSize < 30) passiveSize = 30;
        if (passiveSize > 60) passiveSize = 60;

        var passiveX = Number(configTarget.PASSIVE_COOLDOWN_X);
        if (!isFinite(passiveX)) passiveX = 0;
        if (passiveX < -50) passiveX = -50;
        if (passiveX > 50) passiveX = 50;

        var passiveY = Number(configTarget.PASSIVE_COOLDOWN_Y);
        if (!isFinite(passiveY)) passiveY = 0;
        if (passiveY < -50) passiveY = -50;
        if (passiveY > 50) passiveY = 50;

        var derivedOldScale = Math.round((passiveSize / 40) * 110);
        if (derivedOldScale < 50) derivedOldScale = 50;
        if (derivedOldScale > 200) derivedOldScale = 200;
        var derivedOldX = Math.round(passiveX * 20);
        if (derivedOldX < -1000) derivedOldX = -1000;
        if (derivedOldX > 1000) derivedOldX = 1000;
        var derivedOldY = Math.round((-passiveY) * 20);
        if (derivedOldY < -1000) derivedOldY = -1000;
        if (derivedOldY > 1000) derivedOldY = 1000;

        if (!hasOwn.call(source, "PASSIVE_COOLDOWN_SIZE") && hasOwn.call(source, "OLD_ITEM_COOLDOWNS_SCALE")) {
            // Legacy migration path if passive size was missing but old scale exists.
            passiveSize = (Number(configTarget.OLD_ITEM_COOLDOWNS_SCALE) / 110) * 40;
            if (!isFinite(passiveSize)) passiveSize = 40;
            if (passiveSize < 30) passiveSize = 30;
            if (passiveSize > 60) passiveSize = 60;
            configTarget.PASSIVE_COOLDOWN_SIZE = Math.round(passiveSize);
            derivedOldScale = Math.round((Number(configTarget.PASSIVE_COOLDOWN_SIZE) / 40) * 110);
            if (derivedOldScale < 50) derivedOldScale = 50;
            if (derivedOldScale > 200) derivedOldScale = 200;
        }

        if (!hasOwn.call(source, "PASSIVE_COOLDOWN_X") && hasOwn.call(source, "OLD_ITEM_COOLDOWNS_X_OFFSET")) {
            passiveX = Number(configTarget.OLD_ITEM_COOLDOWNS_X_OFFSET) / 20;
            if (!isFinite(passiveX)) passiveX = 0;
            if (passiveX < -50) passiveX = -50;
            if (passiveX > 50) passiveX = 50;
            configTarget.PASSIVE_COOLDOWN_X = Math.round(passiveX);
        }

        if (!hasOwn.call(source, "PASSIVE_COOLDOWN_Y") && hasOwn.call(source, "OLD_ITEM_COOLDOWNS_Y_OFFSET")) {
            passiveY = -((Number(configTarget.OLD_ITEM_COOLDOWNS_Y_OFFSET) - oldYOffsetBase) / 20);
            if (!isFinite(passiveY)) passiveY = 0;
            if (passiveY < -50) passiveY = -50;
            if (passiveY > 50) passiveY = 50;
            configTarget.PASSIVE_COOLDOWN_Y = Math.round(passiveY);
        }

        derivedOldX = Math.round(passiveX * 20);
        if (derivedOldX < -1000) derivedOldX = -1000;
        if (derivedOldX > 1000) derivedOldX = 1000;
        derivedOldY = Math.round(((-passiveY) * 20) + oldYOffsetBase);
        if (derivedOldY < -1000) derivedOldY = -1000;
        if (derivedOldY > 1000) derivedOldY = 1000;

        if (configTarget.hasOwnProperty("OLD_ITEM_COOLDOWNS_SCALE")) configTarget.OLD_ITEM_COOLDOWNS_SCALE = derivedOldScale;
        if (configTarget.hasOwnProperty("OLD_ITEM_COOLDOWNS_X_OFFSET")) configTarget.OLD_ITEM_COOLDOWNS_X_OFFSET = derivedOldX;
        if (configTarget.hasOwnProperty("OLD_ITEM_COOLDOWNS_Y_OFFSET")) configTarget.OLD_ITEM_COOLDOWNS_Y_OFFSET = derivedOldY;
    };
}

if (!QOL_SCHEMA_UTILS.ANNOUNCER_VOICE_TOKEN_BY_TYPE || typeof QOL_SCHEMA_UTILS.ANNOUNCER_VOICE_TOKEN_BY_TYPE !== "object") {
    QOL_SCHEMA_UTILS.ANNOUNCER_VOICE_TOKEN_BY_TYPE = {
        0: "Custom_Slot1",
        4: "Beep",
        5: "Custom_Slot2",
        6: "Custom_Slot3",
        7: "Custom_Slot4",
        8: "Custom_Slot5"
    };
}

if (typeof QOL_SCHEMA_UTILS.NormalizeVoiceTypeValue !== "function") {
    QOL_SCHEMA_UTILS.NormalizeVoiceTypeValue = function(rawValue) {
        var asInt = Math.round(Number(rawValue));
        if (asInt === 3) asInt = 4; // legacy beep index
        if (QOL_SCHEMA_UTILS.ANNOUNCER_VOICE_TOKEN_BY_TYPE.hasOwnProperty(asInt)) return asInt;
        return 0;
    };
}

if (typeof QOL_SCHEMA_UTILS.GetAnnouncerVoiceToken !== "function") {
    QOL_SCHEMA_UTILS.GetAnnouncerVoiceToken = function(rawValue) {
        var normalized = QOL_SCHEMA_UTILS.NormalizeVoiceTypeValue(rawValue);
        return String(QOL_SCHEMA_UTILS.ANNOUNCER_VOICE_TOKEN_BY_TYPE[normalized] || "Custom_Slot1");
    };
}

if (typeof QOL_SCHEMA_UTILS.NormalizeVoiceVolumeValue !== "function") {
    QOL_SCHEMA_UTILS.NormalizeVoiceVolumeValue = function(rawValue) {
        var asInt = Math.round(Number(rawValue));
        if (!isFinite(asInt)) asInt = 100;
        if (asInt < 0) asInt = 0;
        if (asInt > 100) asInt = 100;
        return asInt;
    };
}

if (typeof QOL_SCHEMA_UTILS.NormalizeBridgeBuffFilterConfig !== "function") {
    QOL_SCHEMA_UTILS.NormalizeBridgeBuffFilterConfig = function(configTarget) {
        if (!configTarget) return;
        var keys = ["ENABLE_BUFF_SOUND_1", "ENABLE_BUFF_SOUND_2", "ENABLE_BUFF_SOUND_3"];
        var anyEnabled = false;
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var enabled = Number(configTarget[key]) === 1 ? 1 : 0;
            configTarget[key] = enabled;
            if (enabled === 1) anyEnabled = true;
        }
        if (!anyEnabled) {
            configTarget.ENABLE_BUFF_SOUND_1 = 1;
            configTarget.ENABLE_BUFF_SOUND_2 = 1;
            configTarget.ENABLE_BUFF_SOUND_3 = 1;
        }
    };
}

if (typeof QOL_SCHEMA_UTILS.NormalizeVoiceTypeConfig !== "function") {
    QOL_SCHEMA_UTILS.NormalizeVoiceTypeConfig = function(configTarget) {
        if (!configTarget) return;
        configTarget.VOICE_TYPE = QOL_SCHEMA_UTILS.NormalizeVoiceTypeValue(configTarget.VOICE_TYPE);
        configTarget.VOICE_VOLUME = QOL_SCHEMA_UTILS.NormalizeVoiceVolumeValue(configTarget.VOICE_VOLUME);
        QOL_SCHEMA_UTILS.NormalizeBridgeBuffFilterConfig(configTarget);
    };
}

if (typeof QOL_SCHEMA_UTILS.NormalizeShopItemNotificationsConfig !== "function") {
    QOL_SCHEMA_UTILS.NormalizeShopItemNotificationsConfig = function(configTarget, sourceConfig) {
        if (!configTarget) return;
        var source = sourceConfig || configTarget || {};
        var hasOwn = Object.prototype.hasOwnProperty;
        // One-time migration: old key → new key, only when new key is absent
        if (hasOwn.call(source, "ENABLE_SHOP_CLICK_TO_NOTIFY") &&
            !hasOwn.call(source, "ENABLE_SHOP_ITEM_NOTIFICATIONS")) {
            configTarget.ENABLE_SHOP_ITEM_NOTIFICATIONS = source.ENABLE_SHOP_CLICK_TO_NOTIFY;
        }
        // Keep old key in sync for compact-schema backward compatibility
        configTarget.ENABLE_SHOP_CLICK_TO_NOTIFY = configTarget.ENABLE_SHOP_ITEM_NOTIFICATIONS;
    };
}

if (typeof QOL_SCHEMA_UTILS.NormalizeHealthbarTypeValue !== "function") {
    QOL_SCHEMA_UTILS.NormalizeHealthbarTypeValue = function(rawValue) {
        var asInt = Math.round(Number(rawValue));
        if (asInt !== 1 && asInt !== 2 && asInt !== 3 && asInt !== 4 && asInt !== 5) return 0;
        return asInt;
    };
}

if (typeof QOL_SCHEMA_UTILS.NormalizeHealthbarTypeConfig !== "function") {
    QOL_SCHEMA_UTILS.NormalizeHealthbarTypeConfig = function(configTarget, sourceConfig) {
        if (!configTarget) return;
        var source = sourceConfig || configTarget || {};
        var hasOwn = Object.prototype.hasOwnProperty;
        var hasTypeInSource = !!(source && hasOwn.call(source, "HEALTHBAR_TYPE"));
        var normalizedType = 0;
        if (hasTypeInSource) {
            normalizedType = QOL_SCHEMA_UTILS.NormalizeHealthbarTypeValue(configTarget.HEALTHBAR_TYPE);
        } else {
            var legacyMinimal = Number(configTarget.ENABLE_MINIMALIST_HEALTHBAR) === 1;
            var legacyFg = Number(configTarget.ENABLE_FG_HEALTHBAR) === 1;
            normalizedType = legacyMinimal ? 1 : (legacyFg ? 2 : 0);
        }
        configTarget.HEALTHBAR_TYPE = normalizedType;
        configTarget.ENABLE_MINIMALIST_HEALTHBAR = (normalizedType === 1) ? 1 : 0;
        configTarget.ENABLE_FG_HEALTHBAR = (normalizedType === 2) ? 1 : 0;
    };
}

// ── Healthbar warning threshold normalizer factory (deduplicates 5 near-identical functions)
(function() {
    function _make(thresholdPrefix, legacyKey) {
        return function(configTarget, sourceConfig) {
            if (!configTarget) return;
            var source = sourceConfig || configTarget || {};
            var hasOwn = Object.prototype.hasOwnProperty;
            var thresholdKeys = [thresholdPrefix + "25", thresholdPrefix + "65", thresholdPrefix + "75"];
            var hasAnyThresholdInSource = false;
            for (var i = 0; i < thresholdKeys.length; i++) {
                if (source && hasOwn.call(source, thresholdKeys[i])) {
                    hasAnyThresholdInSource = true;
                    break;
                }
            }
            var legacyEnabled = Number(configTarget[legacyKey]) === 1 ? 1 : 0;
            for (var j = 0; j < thresholdKeys.length; j++) {
                var key = thresholdKeys[j];
                if (hasAnyThresholdInSource) {
                    configTarget[key] = Number(configTarget[key]) === 1 ? 1 : 0;
                } else {
                    configTarget[key] = legacyEnabled;
                }
            }
            configTarget[legacyKey] =
                (configTarget[thresholdKeys[0]] === 1 ||
                 configTarget[thresholdKeys[1]] === 1 ||
                 configTarget[thresholdKeys[2]] === 1) ? 1 : 0;
        };
    }

    if (typeof QOL_SCHEMA_UTILS.NormalizeColorWarningConfig !== "function") {
        QOL_SCHEMA_UTILS.NormalizeColorWarningConfig = _make("ENABLE_COLOR_WARNING_", "ENABLE_COLORED_HEALTHBAR");
    }
    if (typeof QOL_SCHEMA_UTILS.NormalizeEnemyColorWarningConfig !== "function") {
        QOL_SCHEMA_UTILS.NormalizeEnemyColorWarningConfig = _make("ENABLE_ENEMY_COLOR_WARNING_", "ENABLE_ENEMY_COLORED_HEALTHBAR");
    }
    if (typeof QOL_SCHEMA_UTILS.NormalizeAllyColorWarningConfig !== "function") {
        QOL_SCHEMA_UTILS.NormalizeAllyColorWarningConfig = _make("ENABLE_ALLY_COLOR_WARNING_", "ENABLE_ALLY_COLORED_HEALTHBAR");
    }
    if (typeof QOL_SCHEMA_UTILS.NormalizeTopbarEnemyHpWarningConfig !== "function") {
        QOL_SCHEMA_UTILS.NormalizeTopbarEnemyHpWarningConfig = _make("ENABLE_TOPBAR_ENEMY_HP_WARNING_", "ENABLE_TOPBAR_ENEMY_HP_WARNING");
    }
    if (typeof QOL_SCHEMA_UTILS.NormalizeTopbarAllyHpWarningConfig !== "function") {
        QOL_SCHEMA_UTILS.NormalizeTopbarAllyHpWarningConfig = _make("ENABLE_TOPBAR_ALLY_HP_WARNING_", "ENABLE_TOPBAR_ALLY_HP_WARNING");
    }
})();

if (typeof QOL_SCHEMA_UTILS.MigrateSplitZoomKeys !== "function") {
    QOL_SCHEMA_UTILS.MigrateSplitZoomKeys = function(configTarget, sourceConfig) {
        if (!configTarget) return;
        var source = sourceConfig || configTarget;
        var hasOwn = Object.prototype.hasOwnProperty;

        function assignIfMissing(newKey, legacyKey) {
            var hasNewInSource = source && hasOwn.call(source, newKey);
            var hasLegacyInTarget = configTarget[legacyKey] !== undefined && configTarget[legacyKey] !== null;
            if (!hasLegacyInTarget) return;
            if (hasNewInSource && configTarget[newKey] !== undefined && configTarget[newKey] !== null) return;
            configTarget[newKey] = configTarget[legacyKey];
        }

        assignIfMissing("MINIMAP_LARGE_SIZE_ALT", "MINIMAP_LARGE_SIZE");
        assignIfMissing("ZOOM_X_OFFSET_ALT", "ZOOM_X_OFFSET");
        assignIfMissing("ZOOM_Y_OFFSET_ALT", "ZOOM_Y_OFFSET");
        assignIfMissing("MINIMAP_LARGE_SIZE_TAB", "MINIMAP_LARGE_SIZE");
        assignIfMissing("ZOOM_X_OFFSET_TAB", "ZOOM_X_OFFSET");
        assignIfMissing("ZOOM_Y_OFFSET_TAB", "ZOOM_Y_OFFSET");
    };
}

// ==========================================================================
// QOL_COMPACT_SCHEMA — shared compact schema definitions
// ==========================================================================
// Single source of truth for the compact binary schema used by:
//   - ql_settings.js  (export/import serialization)
//   - ql_core.js      (build category payload serialization)
//
// SCHEMA VERSIONING RULES:
//   - Never silently change the meaning of a released schema version.
//   - Add new fields by creating a new semver entry in the registry.
//   - Bump QOL_SCHEMA_SEMVER when adding or reinterpreting fields.
//   - Run scripts/validate_compact_schema.js after any schema change.
//
// Current semver: see QOL_SCHEMA_SEMVER (top of file)
// ==========================================================================

var QOL_COMPACT_SCHEMA_UTILS = {};

// Wire version constants for the compact binary format.
// Wire version 1 = schema 2.0.0 only; wire version 2 = all later versions.
var QOL_COMPACT_WIRE_VERSION_2_0_0 = 1;
var QOL_COMPACT_WIRE_VERSION_2_0_1 = 2;

// Hero index field used by compact schema serialization.
// The key name must match what serialize/deserialize callbacks check for.
var QOL_COMPACT_DEFAULT_HERO_FIELD = "DEFAULT_HERO_INDEX";
// Default hero options — used to compute the schema field's max value.
// Consumers (ql_settings.js, ql_core.js) may override this with their own
// hero option lists before the schema is used for serialization.
var QOL_COMPACT_DEFAULT_HERO_OPTIONS = [
    "hero_inferno", "hero_gigawatt", "hero_hornet", "hero_ghost", "hero_atlas",
    "hero_wraith", "hero_forge", "hero_chrono", "hero_dynamo", "hero_kelvin",
    "hero_haze", "hero_astro", "hero_bebop", "hero_nano", "hero_orion",
    "hero_krill", "hero_shiv", "hero_tengu", "hero_warden", "hero_yamato",
    "hero_lash", "hero_viscous", "hero_synth", "hero_mirage", "hero_viper",
    "hero_magician", "hero_vampirebat", "hero_drifter", "hero_priest", "hero_frank",
    "hero_bookworm", "hero_doorman", "hero_punkgoat", "hero_necro", "hero_fencer",
    "hero_familiar", "hero_werewolf", "hero_unicorn"
];

var QOL_COMPACT_SCHEMA_V2 = [
    { key: "MINIMAP_SMALL_SIZE", min: 200, max: 1000, step: 5 },
    { key: "MINIMAP_BASE_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "MINIMAL_MINIMAP", min: 0, max: 1, step: 1 },
    { key: "MINIMAP_X_OFFSET", min: -1500, max: 1500, step: 5 },
    { key: "MINIMAP_Y_OFFSET", min: -100, max: 1000, step: 5 },
    { key: "MINIMAP_LARGE_SIZE", min: 400, max: 1200, step: 10 },
    { key: "ZOOM_X_OFFSET", min: -1000, max: 1000, step: 5 },
    { key: "ZOOM_Y_OFFSET", min: -1000, max: 1000, step: 5 },
    { key: "ENABLE_ALT_ZOOM", min: 0, max: 1, step: 1 },
    { key: "ALT_ZOOM_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "ENABLE_TAB_ZOOM", min: 0, max: 1, step: 1 },
    { key: "TAB_ZOOM_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "ENABLE_ONE_TIME", min: 0, max: 1, step: 1 },
    { key: "ENABLE_INTERVAL", min: 0, max: 1, step: 1 },
    { key: "BRIDGE_BUFF_START", min: 0, max: 60, step: 1 },
    { key: "ENABLE_AMMO_STATUS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_PASSIVE_COOLDOWN", min: 0, max: 1, step: 1 },
    { key: "PASSIVE_COOLDOWN_SIZE", min: 30, max: 60, step: 1 },
    { key: "PASSIVE_COOLDOWN_Y", min: -50, max: 50, step: 1 },
    { key: "PASSIVE_COOLDOWN_X", min: -50, max: 50, step: 1 },
    { key: "PASSIVE_COOLDOWN_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "ITEM_FILTER_DEF_PASSIVE", min: 0, max: 1, step: 1 },
    { key: "ITEM_FILTER_OFF_PASSIVE", min: 0, max: 1, step: 1 },
    { key: "ITEM_FILTER_DEF_ACTIVE", min: 0, max: 1, step: 1 },
    { key: "ITEM_FILTER_OFF_ACTIVE", min: 0, max: 1, step: 1 },
    { key: "VOICE_TYPE", min: 0, max: 8, step: 1 },
    { key: "ENABLE_COMPASS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_SIMPLIFY_COMPASS", min: 0, max: 1, step: 1 },
    { key: "COMPASS_SCALE", min: 50, max: 200, step: 1 },
    { key: "COMPASS_X_OFFSET", min: -2000, max: 2000, step: 5 },
    { key: "COMPASS_Y_OFFSET", min: -1000, max: 300, step: 5 },
    { key: "ENABLE_KEYBOARD_OVERLAY", min: 0, max: 1, step: 1 },
    { key: "ENABLE_FULL_KEYBOARD_LAYOUT", min: 0, max: 1, step: 1 },
    { key: "KEYBOARD_OVERLAY_SCALE", min: 70, max: 150, step: 1 },
    { key: "KEYBOARD_OVERLAY_X_OFFSET", min: -1500, max: 1500, step: 5 },
    { key: "KEYBOARD_OVERLAY_Y_OFFSET", min: -400, max: 1000, step: 5 },
    { key: "ENABLE_MINIMAP_REMINDER", min: 0, max: 1, step: 1 },
    { key: "MINIMAP_REMINDER_INTERVAL", min: 5, max: 60, step: 1 },
    { key: "DISABLE_DAMAGE_REPORT", min: 0, max: 1, step: 1 },
    { key: "DISABLE_QUICK_BUY", min: 0, max: 1, step: 1 },
    { key: "ENABLE_HUD_SHIFT", min: 0, max: 1, step: 1 },
    { key: "SUPPORT_4_3", min: 0, max: 1, step: 1 },
    { key: "ENABLE_UNSPENT_SOULS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_MIN_SOULS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_OBJ_DMG", min: 0, max: 1, step: 1 },
    { key: "ENABLE_OBJ_MAP", min: 0, max: 1, step: 1 },
    { key: "ENABLE_URN_DIFF", min: 0, max: 1, step: 1 },
    { key: "ENABLE_MISSING_HERO", min: 0, max: 1, step: 1 },
    { key: "ENABLE_CUMULATIVE_DMG", min: 0, max: 1, step: 1 },
    { key: "ENABLE_SHOP_STATS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_SIMPLIFY_SHOP", min: 0, max: 1, step: 1 },
    { key: "DAMAGE_NUMBER_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "ENABLE_ZIP_BOOST", min: 0, max: 1, step: 1 },
    { key: "ZIP_BOOST_X_OFFSET", min: -2000, max: 2000, step: 5 },
    { key: "ZIP_BOOST_Y_OFFSET", min: 0, max: 1000, step: 5 },
    { key: "ENABLE_CLEAN_STACKS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_CENTER_ESC", min: 0, max: 1, step: 1 },
    { key: "HUD_INDICATOR_SIZE", min: 10, max: 60, step: 1 },
    { key: "ENABLE_RED_DIAMOND", min: 0, max: 1, step: 1 },
    { key: "UNIT_TARGET_SIZE", min: 50, max: 300, step: 5 },
    { key: "UNIT_TARGET_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "ENABLE_HERO_SCENE_PANEL", min: 0, max: 1, step: 1 },
    { key: "ENABLE_HIDE_FAILED_HINT", min: 0, max: 1, step: 1 },
    { key: "ENABLE_HIDE_ABILITY_SUGGESTION", min: 0, max: 1, step: 1 },
    { key: "ENABLE_SIMPLIFY_ABILITY_ICONS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_HIDE_BEHAVIOR_SUMMARY", min: 0, max: 1, step: 1 },
    { key: "ENABLE_BUFF_HUD", min: 0, max: 1, step: 1 },
    { key: "ENABLE_REJUV_HUD", min: 0, max: 1, step: 1 },
    { key: "ENABLE_COLORED_HEALTHBAR", min: 0, max: 1, step: 1 }
];

var QOL_COMPACT_SCHEMA_V3 = QOL_COMPACT_SCHEMA_V2.concat([
    { key: "ENABLE_COMPASS_SPEED", min: 0, max: 1, step: 1 },
    { key: "COMPASS_STRETCH_X", min: 50, max: 200, step: 1 },
    { key: "COMPASS_STRETCH_Y", min: 50, max: 200, step: 1 },
    { key: "ZIP_BOOST_SCALE", min: 50, max: 200, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V4 = QOL_COMPACT_SCHEMA_V3.concat([
    { key: "ENABLE_SIMPLIFY_ITEMS", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V5 = QOL_COMPACT_SCHEMA_V4.concat([
    { key: "MINIMAP_LARGE_SIZE_ALT", min: 400, max: 1200, step: 10 },
    { key: "ZOOM_X_OFFSET_ALT", min: -1500, max: 1500, step: 5 },
    { key: "ZOOM_Y_OFFSET_ALT", min: -1000, max: 1000, step: 5 },
    { key: "MINIMAP_LARGE_SIZE_TAB", min: 400, max: 1200, step: 10 },
    { key: "ZOOM_X_OFFSET_TAB", min: -1500, max: 1500, step: 5 },
    { key: "ZOOM_Y_OFFSET_TAB", min: -1000, max: 1000, step: 5 }
]);

var QOL_COMPACT_SCHEMA_V6 = QOL_COMPACT_SCHEMA_V5.concat([
    { key: "SUPPORT_16_10", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V7 = QOL_COMPACT_SCHEMA_V6.concat([
    { key: "DISABLE_SHOP_BLUE", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V8 = QOL_COMPACT_SCHEMA_V7.concat([
    { key: "SHOP_OFFSET_X", min: -500, max: 500, step: 5 }
]);

var QOL_COMPACT_SCHEMA_V9 = QOL_COMPACT_SCHEMA_V8.concat([
    { key: "ENABLE_HIDE_SMALL_NUMBERS", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V10 = QOL_COMPACT_SCHEMA_V9.concat([
    { key: "ENABLE_HIDE_MAGAZINE", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V11 = QOL_COMPACT_SCHEMA_V10.concat([
    { key: "AMMO_PANEL_SCALE", min: 100, max: 300, step: 1 },
    { key: "AMMO_PANEL_X_OFFSET", min: -200, max: 200, step: 5 },
    { key: "AMMO_PANEL_Y_OFFSET", min: -200, max: 200, step: 5 }
]);

var QOL_COMPACT_SCHEMA_V12 = QOL_COMPACT_SCHEMA_V11;

var QOL_COMPACT_SCHEMA_V13 = QOL_COMPACT_SCHEMA_V12.concat([
    { key: "ENABLE_ON_DEATH_GAMES", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V14 = QOL_COMPACT_SCHEMA_V13.concat([
    { key: "ENABLE_RELOAD_COOLDOWN", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V15 = QOL_COMPACT_SCHEMA_V14.concat([
    { key: "ENABLE_HIDE_RELOAD_ICON", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V16 = QOL_COMPACT_SCHEMA_V15.concat([
    { key: "ENABLE_HIDE_RELOAD_CIRCLE", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V17 = QOL_COMPACT_SCHEMA_V16.concat([
    { key: "RELOAD_COOLDOWN_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "RELOAD_COOLDOWN_SIZE", min: 16, max: 60, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V18 = QOL_COMPACT_SCHEMA_V17.concat([
    { key: "TAB_ZOOM_DRAW_OVER_UI", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V19 = QOL_COMPACT_SCHEMA_V18.concat([
    { key: "ALT_ZOOM_DRAW_OVER_UI", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V20 = QOL_COMPACT_SCHEMA_V19.concat([
    { key: "ENABLE_HIDE_TROOPER_DAMAGE", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V21 = QOL_COMPACT_SCHEMA_V20.concat([
    { key: "MINIMAP_ROTATE_WITH_PLAYER", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V22 = QOL_COMPACT_SCHEMA_V21.concat([
    { key: "ENABLE_STAT_BONUSES", min: 0, max: 1, step: 1 },
    { key: "STAT_BONUSES_SCALE", min: 50, max: 200, step: 1 },
    { key: "STAT_BONUSES_X_OFFSET", min: -1000, max: 1000, step: 5 },
    { key: "STAT_BONUSES_Y_OFFSET", min: 0, max: 1000, step: 5 }
]);

var QOL_COMPACT_SCHEMA_V23 = QOL_COMPACT_SCHEMA_V22.concat([
    { key: "ENABLE_UNSECURED_SOUL_TIMER", min: 0, max: 1, step: 1 },
    { key: "UNSECURED_SOUL_TIMER_SCALE", min: 50, max: 200, step: 1 },
    { key: "UNSECURED_SOUL_TIMER_X_OFFSET", min: -1500, max: 1500, step: 5 },
    { key: "UNSECURED_SOUL_TIMER_Y_OFFSET", min: -100, max: 1000, step: 5 }
]);

// NOTE: V24 adds ENABLE_COLORED_HEALTHBAR as a duplicate — it already exists
// in V2 (the base schema). The decode overwrite is harmless (same value wins)
// but costs 2 wasted bits per compact payload. Not fixed for binary compat.
var QOL_COMPACT_SCHEMA_V24 = QOL_COMPACT_SCHEMA_V23.concat([
    { key: "ENABLE_COLORED_HEALTHBAR", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V25 = QOL_COMPACT_SCHEMA_V24;

var QOL_COMPACT_SCHEMA_V26 = QOL_COMPACT_SCHEMA_V25.concat([
    { key: "ENABLE_MINIMALIST_HEALTHBAR", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V27 = QOL_COMPACT_SCHEMA_V26.concat([
    { key: "ENABLE_FORCE_TESTING_TOOLS", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V28 = QOL_COMPACT_SCHEMA_V27.concat([
    { key: "RELOAD_COOLDOWN_X_OFFSET", min: -75, max: 75, step: 1 },
    { key: "RELOAD_COOLDOWN_Y_OFFSET", min: -75, max: 75, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V29 = QOL_COMPACT_SCHEMA_V28.concat([
    { key: "UNSECURED_SOULS_HUD_SCALE", min: 50, max: 200, step: 1 },
    { key: "UNSECURED_SOULS_HUD_X_OFFSET", min: -1000, max: 2000, step: 5 },
    { key: "UNSECURED_SOULS_HUD_Y_OFFSET", min: 800, max: 2000, step: 5 }
]);

var QOL_COMPACT_SCHEMA_V30 = QOL_COMPACT_SCHEMA_V29;

var QOL_COMPACT_SCHEMA_V31 = QOL_COMPACT_SCHEMA_V30.concat([
    { key: "ENABLE_BETTER_UNSECURED", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V32 = QOL_COMPACT_SCHEMA_V31.concat([
    { key: "ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V33 = QOL_COMPACT_SCHEMA_V32.concat([
    { key: "ENABLE_BETTER_UNSECURED_SHOW_ICON", min: 0, max: 1, step: 1 },
    { key: "ENABLE_BETTER_UNSECURED_SHOW_TEXT", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V34 = QOL_COMPACT_SCHEMA_V33.concat([
    { key: "ENABLE_ULT_COOLDOWNS", min: 0, max: 1, step: 1 },
    { key: "ULT_COOLDOWN_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "ULT_COOLDOWN_SIZE", min: 10, max: 32, step: 1 },
    { key: "ULT_COOLDOWN_X_OFFSET", min: -60, max: 60, step: 1 },
    { key: "ULT_COOLDOWN_Y_OFFSET", min: -60, max: 60, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V35 = QOL_COMPACT_SCHEMA_V34.concat([
    { key: "LANGUAGE", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V36 = QOL_COMPACT_SCHEMA_V35.concat([
    { key: "MINIMALIST_HEALTHBAR_X_OFFSET", min: -300, max: 300, step: 1 },
    { key: "MINIMALIST_HEALTHBAR_Y_OFFSET", min: -300, max: 300, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V37 = QOL_COMPACT_SCHEMA_V36.concat([
    { key: "ENABLE_HIDE_TESTING_TOOLS", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V38 = QOL_COMPACT_SCHEMA_V37.concat([
    { key: "ENABLE_HIDE_COSMETIC_ABILITY", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V39 = QOL_COMPACT_SCHEMA_V38.concat([
    { key: "DAMAGE_REPORT_X_OFFSET", min: -1500, max: 1500, step: 5 },
    { key: "DAMAGE_REPORT_Y_OFFSET", min: -1500, max: 200, step: 5 }
]);

var QOL_COMPACT_SCHEMA_V40 = QOL_COMPACT_SCHEMA_V39.concat([
    { key: "ENABLE_HIDE_AMMO_ALL", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V41 = QOL_COMPACT_SCHEMA_V40;

var QOL_COMPACT_SCHEMA_V42 = QOL_COMPACT_SCHEMA_V41.concat([
    { key: QOL_COMPACT_DEFAULT_HERO_FIELD, min: 0, max: Math.max(0, QOL_COMPACT_DEFAULT_HERO_OPTIONS.length - 1), step: 1 }
]);

var QOL_COMPACT_SCHEMA_V43 = QOL_COMPACT_SCHEMA_V42.concat([
    { key: "ENABLE_OLD_ITEM_COOLDOWNS", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V44 = QOL_COMPACT_SCHEMA_V43.concat([
    { key: "OLD_ITEM_COOLDOWNS_SCALE", min: 50, max: 200, step: 1 },
    { key: "OLD_ITEM_COOLDOWNS_X_OFFSET", min: -1000, max: 1000, step: 5 },
    { key: "OLD_ITEM_COOLDOWNS_Y_OFFSET", min: -1000, max: 1000, step: 5 }
]);

var QOL_COMPACT_SCHEMA_V45 = QOL_COMPACT_SCHEMA_V44;

var QOL_COMPACT_SCHEMA_V46 = QOL_COMPACT_SCHEMA_V45.concat([
    { key: "ENABLE_LANE_WITH_PARTY", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V47 = QOL_COMPACT_SCHEMA_V46.concat([
    { key: "ENABLE_ONE_TIME_TIER1", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ONE_TIME_TIER2", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ONE_TIME_TIER3", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V48 = QOL_COMPACT_SCHEMA_V47.concat([
    { key: "ENABLE_FG_HEALTHBAR", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V49 = QOL_COMPACT_SCHEMA_V48.concat([
    { key: "HEALTHBAR_TYPE", min: 0, max: 4, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V50 = QOL_COMPACT_SCHEMA_V49.concat([
    { key: "ENABLE_COLOR_WARNING_25", min: 0, max: 1, step: 1 },
    { key: "ENABLE_COLOR_WARNING_65", min: 0, max: 1, step: 1 },
    { key: "ENABLE_COLOR_WARNING_75", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V51 = QOL_COMPACT_SCHEMA_V50.concat([
    { key: "ENABLE_MINIMAP_BUFF_TIMER", min: 0, max: 1, step: 1 },
    { key: "ENABLE_MINIMAP_REJUV_TIMER", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V52 = QOL_COMPACT_SCHEMA_V51.concat([
    { key: "AMMO_CURRENT_SCALE", min: 100, max: 300, step: 1 },
    { key: "AMMO_TOTAL_SCALE", min: 100, max: 300, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V53 = QOL_COMPACT_SCHEMA_V52.concat([
    { key: "ENABLE_IMPROVED_HINT", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V54 = QOL_COMPACT_SCHEMA_V53.concat([
    { key: "ENABLE_COMBAT_STATUS", min: 0, max: 1, step: 1 },
    { key: "COMBAT_STATUS_SCALE", min: 50, max: 200, step: 1 },
    { key: "COMBAT_STATUS_X_OFFSET", min: -1000, max: 1000, step: 5 },
    { key: "COMBAT_STATUS_Y_OFFSET", min: -1000, max: 1000, step: 5 },
    { key: "ENABLE_ENEMY_ULT_INDICATOR", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V55 = QOL_COMPACT_SCHEMA_V54.concat([
    { key: "ENABLE_NICKNAMES", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V56 = QOL_COMPACT_SCHEMA_V55.concat([
    { key: "MINIMAL_MINIMAP_OPACITY", min: 0, max: 1, step: 0.05 }
]);

var QOL_COMPACT_SCHEMA_V57 = QOL_COMPACT_SCHEMA_V56.concat([
    { key: "ENABLE_DAMAGE_FOUNTAIN", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V58 = QOL_COMPACT_SCHEMA_V57.concat([
    { key: "PLAYER_HEALTHBAR_X_OFFSET", min: -1000, max: 1000, step: 5 },
    { key: "PLAYER_HEALTHBAR_Y_OFFSET", min: -1000, max: 1000, step: 5 }
]);

var QOL_COMPACT_SCHEMA_V59 = QOL_COMPACT_SCHEMA_V58.concat([
    { key: "PLAYER_HEALTHBAR_SCALE", min: 50, max: 200, step: 1 },
    { key: "PLAYER_HEALTHBAR_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "VOICE_VOLUME", min: 0, max: 100, step: 1 },
    { key: "ENABLE_BUFF_SOUND_1", min: 0, max: 1, step: 1 },
    { key: "ENABLE_BUFF_SOUND_2", min: 0, max: 1, step: 1 },
    { key: "ENABLE_BUFF_SOUND_3", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_V60 = QOL_COMPACT_SCHEMA_V59.concat([
    { key: "ENABLE_ENEMY_COLORED_HEALTHBAR", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ENEMY_COLOR_WARNING_25", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ENEMY_COLOR_WARNING_65", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ENEMY_COLOR_WARNING_75", min: 0, max: 1, step: 1 },
    { key: "ENABLE_URN_COLORS", min: 0, max: 1, step: 1 }
]);

var QOL_COMPACT_SCHEMA_2_0_1_EXTRA_FIELDS = [
    { key: "ENABLE_ENEMY_V2_ENHANCED", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ENEMY_V2_ULT_INDICATOR", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ENEMY_V2_LEVEL", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_MINESWEEPER", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_BLACKJACK", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_FLAPPY_BAT", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_GRAVES_TRAINER", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_ZERGGY_MANIA", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_WHACK_A_REM", min: 0, max: 1, step: 1 }
];

QOL_COMPACT_SCHEMA_UTILS.BuildSchemaWithLanguageMax = function(baseSchema, maxLanguageValue) {
    var out = [];
    var langMax = Math.max(1, Math.round(Number(maxLanguageValue) || 1));
    for (var i = 0; i < baseSchema.length; i++) {
        var field = baseSchema[i];
        if (!field) continue;
        var copy = {
            key: field.key,
            min: field.min,
            max: field.max,
            step: field.step
        };
        if (copy.key === "LANGUAGE") copy.max = langMax;
        out.push(copy);
    }
    return out;
}

QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields = function(baseSchema, extraFields) {
    var out = Array.isArray(baseSchema) ? baseSchema.slice() : [];
    if (!Array.isArray(extraFields) || extraFields.length <= 0) return out;
    var seen = {};
    for (var iSeen = 0; iSeen < out.length; iSeen++) {
        var existing = out[iSeen];
        if (existing && existing.key) seen[String(existing.key)] = true;
    }
    for (var iExtra = 0; iExtra < extraFields.length; iExtra++) {
        var field = extraFields[iExtra];
        if (!field || !field.key) continue;
        var key = String(field.key);
        if (seen[key]) continue;
        out.push({
            key: field.key,
            min: field.min,
            max: field.max,
            step: field.step
        });
        seen[key] = true;
    }
    return out;
}

QOL_COMPACT_SCHEMA_UTILS.CloneSchemaWithFieldOverrides = function(baseSchema, overrideFields) {
    var out = [];
    var overrides = {};
    var i;
    if (Array.isArray(overrideFields)) {
        for (i = 0; i < overrideFields.length; i++) {
            var overrideField = overrideFields[i];
            if (!overrideField || !overrideField.key) continue;
            overrides[String(overrideField.key)] = overrideField;
        }
    }
    if (!Array.isArray(baseSchema)) return out;
    for (i = 0; i < baseSchema.length; i++) {
        var field = baseSchema[i];
        if (!field || !field.key) continue;
        var key = String(field.key);
        var sourceField = overrides[key] || field;
        out.push({
            key: sourceField.key,
            min: sourceField.min,
            max: sourceField.max,
            step: sourceField.step
        });
    }
    return out;
}

QOL_COMPACT_SCHEMA_UTILS.CloneSchemaWithoutFields = function(baseSchema, fieldKeys) {
    var out = [];
    var blocked = {};
    var i;
    if (Array.isArray(fieldKeys)) {
        for (i = 0; i < fieldKeys.length; i++) {
            if (fieldKeys[i] === undefined || fieldKeys[i] === null) continue;
            blocked[String(fieldKeys[i])] = true;
        }
    }
    if (!Array.isArray(baseSchema)) return out;
    for (i = 0; i < baseSchema.length; i++) {
        var field = baseSchema[i];
        if (!field || !field.key) continue;
        if (blocked[String(field.key)]) continue;
        out.push({
            key: field.key,
            min: field.min,
            max: field.max,
            step: field.step
        });
    }
    return out;
}

var QOL_COMPACT_SCHEMA_2_0_0 = QOL_COMPACT_SCHEMA_V60;
var QOL_COMPACT_SCHEMA_2_0_1= QOL_COMPACT_SCHEMA_UTILS.BuildSchemaWithLanguageMax(QOL_COMPACT_SCHEMA_2_0_0, 2);
for (var iSchemaExtra = 0; iSchemaExtra < QOL_COMPACT_SCHEMA_2_0_1_EXTRA_FIELDS.length; iSchemaExtra++) {
    QOL_COMPACT_SCHEMA_2_0_1.push(QOL_COMPACT_SCHEMA_2_0_1_EXTRA_FIELDS[iSchemaExtra]);
}
var QOL_COMPACT_SCHEMA_2_1_1 = QOL_COMPACT_SCHEMA_2_0_1;
var QOL_COMPACT_SCHEMA_2_1_2_EXTRA_FIELDS = [
    { key: "ENABLE_CENTER_FRIENDS_LIST", min: 0, max: 1, step: 1 }
];
var QOL_COMPACT_SCHEMA_2_1_2 = QOL_COMPACT_SCHEMA_2_1_1.concat(QOL_COMPACT_SCHEMA_2_1_2_EXTRA_FIELDS);
var QOL_COMPACT_SCHEMA_2_2_0_EXTRA_FIELDS = [
    { key: "ENABLE_GAME_AUDIO", min: 0, max: 1, step: 1 },
    { key: "GAME_DEFAULT_DIFFICULTY", min: 0, max: 2, step: 1 },
    { key: "ON_DEATH_GAME_MINESWEEPER", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_BLACKJACK", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_FLAPPY_BAT", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_GRAVES_TRAINER", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_ZERGGY_MANIA", min: 0, max: 1, step: 1 },
    { key: "ON_DEATH_GAME_WHACK_A_REM", min: 0, max: 1, step: 1 },
    { key: "ENABLE_STATLOCKER", min: 0, max: 1, step: 1 },
    { key: "CHAT_SCALE", min: 50, max: 200, step: 1 },
    { key: "CHAT_X_OFFSET", min: -1500, max: 1500, step: 5 },
    { key: "CHAT_Y_OFFSET", min: -1000, max: 1000, step: 5 }
];
var QOL_COMPACT_SCHEMA_2_2_0= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(QOL_COMPACT_SCHEMA_2_1_2, QOL_COMPACT_SCHEMA_2_2_0_EXTRA_FIELDS);
var QOL_COMPACT_SCHEMA_2_2_1_OVERRIDE_FIELDS = [
    { key: "CHAT_Y_OFFSET", min: -250, max: 800, step: 5 }
];
var QOL_COMPACT_SCHEMA_2_2_1_EXTRA_FIELDS = [
    { key: "ENABLE_CHAT", min: 0, max: 1, step: 1 }
];
var QOL_COMPACT_SCHEMA_2_2_1= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_UTILS.CloneSchemaWithFieldOverrides(QOL_COMPACT_SCHEMA_2_2_0, QOL_COMPACT_SCHEMA_2_2_1_OVERRIDE_FIELDS),
    QOL_COMPACT_SCHEMA_2_2_1_EXTRA_FIELDS
);
var QOL_COMPACT_SCHEMA_2_2_2_EXTRA_FIELDS = [
    { key: "ENABLE_LEGACY_COOLDOWNS", min: 0, max: 1, step: 1 }
];
var QOL_COMPACT_SCHEMA_2_2_2= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(QOL_COMPACT_SCHEMA_2_2_1, QOL_COMPACT_SCHEMA_2_2_2_EXTRA_FIELDS);
var QOL_COMPACT_SCHEMA_2_2_3_OVERRIDE_FIELDS = [
    { key: "LANGUAGE", min: 0, max: 3, step: 1 }
];
var QOL_COMPACT_SCHEMA_2_2_3= QOL_COMPACT_SCHEMA_UTILS.CloneSchemaWithFieldOverrides(QOL_COMPACT_SCHEMA_2_2_2, QOL_COMPACT_SCHEMA_2_2_3_OVERRIDE_FIELDS);
var QOL_COMPACT_SCHEMA_2_2_4_OVERRIDE_FIELDS = [
    { key: "LANGUAGE", min: 0, max: 4, step: 1 }
];
var QOL_COMPACT_SCHEMA_2_2_4= QOL_COMPACT_SCHEMA_UTILS.CloneSchemaWithFieldOverrides(QOL_COMPACT_SCHEMA_2_2_3, QOL_COMPACT_SCHEMA_2_2_4_OVERRIDE_FIELDS);
var QOL_COMPACT_SCHEMA_2_2_5_OVERRIDE_FIELDS = [
    { key: "LANGUAGE", min: 0, max: 5, step: 1 }
];
var QOL_COMPACT_SCHEMA_2_2_5= QOL_COMPACT_SCHEMA_UTILS.CloneSchemaWithFieldOverrides(QOL_COMPACT_SCHEMA_2_2_4, QOL_COMPACT_SCHEMA_2_2_5_OVERRIDE_FIELDS);
var QOL_COMPACT_SCHEMA_2_2_6_OVERRIDE_FIELDS = [
    { key: "LANGUAGE", min: 0, max: 6, step: 1 }
];
var QOL_COMPACT_SCHEMA_2_2_6= QOL_COMPACT_SCHEMA_UTILS.CloneSchemaWithFieldOverrides(QOL_COMPACT_SCHEMA_2_2_5, QOL_COMPACT_SCHEMA_2_2_6_OVERRIDE_FIELDS);
var QOL_COMPACT_SCHEMA_2_2_7= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_2_2_6,
    [{ key: "MINIMAP_FLIP", min: 0, max: 1, step: 1 }]
);
var QOL_COMPACT_SCHEMA_2_2_10= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_2_2_7,
    [
        { key: "ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS", min: 0, max: 1, step: 1 },
        { key: "ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE", min: 0, max: 1, step: 1 }
    ]
);
var QOL_COMPACT_SCHEMA_2_3_1= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_2_2_10,
    [
        { key: "ENABLE_BHOP", min: 0, max: 1, step: 1 }
    ]
);
var QOL_COMPACT_SCHEMA_2_3_3 = QOL_COMPACT_SCHEMA_2_3_1;
var QOL_COMPACT_SCHEMA_2_3_4= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_UTILS.CloneSchemaWithFieldOverrides(
        QOL_COMPACT_SCHEMA_2_3_1,
        [{ key: "HEALTHBAR_TYPE", min: 0, max: 5, step: 1 }]
    ),
    [
        { key: "ENABLE_IMAGES_IN_CHAT", min: 0, max: 1, step: 1 },
        { key: "ENABLE_MINECRAFT_HEALTH_NUMBERS", min: 0, max: 1, step: 1 }
    ]
);
const TOPBAR_HP_WARNING_SCHEMA_FIELDS = [
    { key: "ENABLE_TOPBAR_ENEMY_HP_WARNING", min: 0, max: 1, step: 1 },
    { key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_25", min: 0, max: 1, step: 1 },
    { key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_65", min: 0, max: 1, step: 1 },
    { key: "ENABLE_TOPBAR_ENEMY_HP_WARNING_75", min: 0, max: 1, step: 1 },
    { key: "ENABLE_TOPBAR_ALLY_HP_WARNING", min: 0, max: 1, step: 1 },
    { key: "ENABLE_TOPBAR_ALLY_HP_WARNING_25", min: 0, max: 1, step: 1 },
    { key: "ENABLE_TOPBAR_ALLY_HP_WARNING_65", min: 0, max: 1, step: 1 },
    { key: "ENABLE_TOPBAR_ALLY_HP_WARNING_75", min: 0, max: 1, step: 1 }
];
const HUD_BAR_AND_SHOP_SCHEMA_FIELDS = [
    { key: "TOP_BAR_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "TOP_BAR_X_OFFSET", min: -1500, max: 1500, step: 5 },
    { key: "TOP_BAR_Y_OFFSET", min: -500, max: 500, step: 5 },
    { key: "BOTTOM_BAR_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "BOTTOM_BAR_X_OFFSET", min: -1500, max: 1500, step: 5 },
    { key: "BOTTOM_BAR_Y_OFFSET", min: -500, max: 500, step: 5 },
    { key: "SHOP_OFFSET_Y", min: -500, max: 500, step: 5 },
    { key: "SHOP_OPACITY", min: 0, max: 1, step: 0.05 }
];
const HUD_SECTION_AND_PANEL_SCHEMA_FIELDS = [
    { key: "HUD_TOP_BAR_ENABLED", min: 0, max: 1, step: 1 },
    { key: "HUD_BOTTOM_BAR_ENABLED", min: 0, max: 1, step: 1 },
    { key: "HUD_ITEMS_ENABLED", min: 0, max: 1, step: 1 },
    { key: "HUD_SOULS_ENABLED", min: 0, max: 1, step: 1 },
    { key: "HUD_SHOP_ENABLED", min: 0, max: 1, step: 1 },
    { key: "ITEMS_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "ITEMS_X_OFFSET", min: -1500, max: 1500, step: 5 },
    { key: "ITEMS_Y_OFFSET", min: -500, max: 500, step: 5 },
    { key: "SOULS_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "SOULS_X_OFFSET", min: -1500, max: 1500, step: 5 },
    { key: "SOULS_Y_OFFSET", min: -500, max: 500, step: 5 }
];
const MINIMAP_CRATE_OVERLAY_SCHEMA_FIELDS = [
    { key: "ENABLE_MINIMAP_CRATE_OVERLAY", min: 0, max: 1, step: 1 }
];
const MINIMAP_REM_TUNNELS_SCHEMA_FIELDS = [
    { key: "ENABLE_MINIMAP_REM_TUNNELS", min: 0, max: 1, step: 1 },
    { key: "MINIMAP_REM_TUNNELS_OPACITY", min: 0, max: 1, step: 0.05 }
];
const MINIMAP_ELEVATION_MARKERS_SCHEMA_FIELDS = [
    { key: "ENABLE_MINIMAP_ELEVATION_MARKERS", min: 0, max: 1, step: 1 }
];
const HUD_BAR_AND_SHOP_SCALE_SCHEMA_FIELDS = [
    { key: "TOP_BAR_SCALE", min: 0.5, max: 1.5, step: 0.05 },
    { key: "BOTTOM_BAR_SCALE", min: 0.5, max: 1.5, step: 0.05 },
    { key: "SHOP_SCALE", min: 0.5, max: 1.5, step: 0.05 }
];
const ZOOM_REM_TUNNELS_SCHEMA_FIELDS = [
    { key: "ENABLE_ALT_ZOOM_REM_TUNNELS", min: 0, max: 1, step: 1 },
    { key: "ALT_ZOOM_REM_TUNNELS_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "ENABLE_TAB_ZOOM_REM_TUNNELS", min: 0, max: 1, step: 1 },
    { key: "TAB_ZOOM_REM_TUNNELS_OPACITY", min: 0, max: 1, step: 0.05 }
];
const DAMAGE_IMPACT_SCHEMA_FIELDS = [
    { key: "ENABLE_DAMAGE_IMPACT", min: 0, max: 1, step: 1 },
    { key: "DAMAGE_IMPACT_SCALE", min: 0.5, max: 2.0, step: 0.05 },
    { key: "DAMAGE_IMPACT_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "DAMAGE_IMPACT_X_OFFSET", min: -1000, max: 1000, step: 5 },
    { key: "DAMAGE_IMPACT_Y_OFFSET", min: -1000, max: 1000, step: 5 }
];
const SETTINGS_THEME_SCHEMA_FIELDS = [
    { key: "SETTINGS_THEME", min: 0, max: 5, step: 1 }
];
const SETTINGS_THEME_SCHEMA_FIELDS_3_0_5 = [
    { key: "SETTINGS_THEME", min: 0, max: 6, step: 1 }
];
const PALETTE_PICKER_SCHEMA_FIELDS = [
    { key: "ITEMS_WASH_COLOR", min: 0, max: 29, step: 1 },
    { key: "PLAYER_HEALTHBAR_ACCENT_COLOR", min: 0, max: 29, step: 1 },
    { key: "BOTTOM_BAR_WASH_COLOR", min: 0, max: 29, step: 1 },
    { key: "KEYBOARD_OVERLAY_WASH_COLOR", min: 0, max: 29, step: 1 },
    { key: "STAMINA_CHARGE_COLOR", min: 0, max: 29, step: 1 },
    { key: "AMMO_TEXT_COLOR", min: 0, max: 29, step: 1 },
    { key: "MINIMAP_ICON_COLOR", min: 0, max: 29, step: 1 }
];
const PALETTE_PICKER_SCHEMA_FIELDS_2_5_4 = [
    { key: "ITEMS_WASH_COLOR", min: 0, max: 25, step: 1 },
    { key: "PLAYER_HEALTHBAR_ACCENT_COLOR", min: 0, max: 25, step: 1 },
    { key: "BOTTOM_BAR_WASH_COLOR", min: 0, max: 25, step: 1 },
    { key: "KEYBOARD_OVERLAY_WASH_COLOR", min: 0, max: 25, step: 1 },
    { key: "STAMINA_CHARGE_COLOR", min: 0, max: 25, step: 1 },
    { key: "AMMO_TEXT_COLOR", min: 0, max: 25, step: 1 }
];
const COMBAT_INDICATOR_SCHEMA_FIELDS = [
    { key: "ENABLE_COMBAT_INDICATOR", min: 0, max: 1, step: 1 }
];
const STAMINA_CHARGE_SCHEMA_FIELDS = [
    { key: "STAMINA_CHARGE_ANGLE", min: 0, max: 360, step: 1 }
];
const CLEAN_DAMAGE_INDICATORS_SCHEMA_FIELDS = [
    { key: "ENABLE_CLEAN_DAMAGE_INDICATORS", min: 0, max: 1, step: 1 }
];
const SHOP_STATS_MINIMALIST_SCHEMA_FIELDS = [
    { key: "ENABLE_SIMPLIFY_SHOP_STATS", min: 0, max: 1, step: 1 }
];
const ENHANCED_QUICKBUY_SCHEMA_FIELDS = [
    { key: "ENABLE_ENHANCED_QUICKBUY", min: 0, max: 1, step: 1 }
];
const ENHANCED_QUICKBUY_COUNT_SCHEMA_FIELDS = [
    { key: "ENHANCED_QUICKBUY_COUNT", min: 1, max: 5, step: 1 }
];
const SHOP_PURCHASE_FEATURE_SCHEMA_FIELDS = [
    { key: "ENABLE_SHOP_CLICK_TO_NOTIFY", min: 0, max: 1, step: 1 },
    { key: "ENABLE_SHOP_RECENT_PURCHASES", min: 0, max: 1, step: 1 }
];
const RECENT_PURCHASES_QUICK_SCHEMA_FIELDS = [
    { key: "RECENT_PURCHASES_QUICK_MAX",         min: 1,    max: 5,   step: 1    },
    { key: "RECENT_PURCHASES_QUICK_DISPLAY_SEC", min: 3,    max: 15,  step: 1    },
    { key: "RECENT_PURCHASES_QUICK_X_OFFSET",    min: -500, max: 500, step: 5    },
    { key: "RECENT_PURCHASES_QUICK_Y_OFFSET",    min: -500, max: 500, step: 5    },
    { key: "RECENT_PURCHASES_QUICK_REJUV",       min: 0,    max: 1,   step: 1    },
    { key: "RECENT_PURCHASES_QUICK_SCOREBOARD",  min: 0,    max: 1,   step: 1    },
    { key: "RECENT_PURCHASES_QUICK_SCALE",       min: 0.5,  max: 1.5, step: 0.05 },
    { key: "RECENT_PURCHASES_PANEL_X_OFFSET",    min: -500, max: 500, step: 5    },
    { key: "RECENT_PURCHASES_PANEL_Y_OFFSET",    min: -500, max: 500, step: 5    },
    { key: "RECENT_PURCHASES_PANEL_SCALE",       min: 0.5,  max: 2.0, step: 0.05 }
];
const RECENT_PURCHASES_OPACITY_SCHEMA_FIELDS = [
    { key: "RECENT_PURCHASES_QUICK_OPACITY", min: 0, max: 1, step: 0.05 },
    { key: "RECENT_PURCHASES_PANEL_OPACITY", min: 0, max: 1, step: 0.05 }
];
const HERO_PURCHASE_POPUPS_SCHEMA_FIELDS = [
    { key: "ENABLE_HERO_PURCHASE_POPUPS", min: 0, max: 1, step: 1 }
];
const SHOW_BUILD_ID_SCHEMA_FIELDS = [
    { key: "ENABLE_SHOW_BUILD_ID", min: 0, max: 1, step: 1 },
    { key: "ENABLE_SHOW_BUILD_ID_TITLE", min: 0, max: 1, step: 1 }
];
const DL4D_REMINDER_SCHEMA_FIELDS = [
    { key: "ENABLE_DL4D_REMINDERS", min: 0, max: 1, step: 1 },
    { key: "DL4D_VOLUME", min: 0, max: 100, step: 1 },
    { key: "ENABLE_DL4D_CAPTIONS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_DL4D_SMALL_CAMPS_BOXES", min: 0, max: 1, step: 1 },
    { key: "ENABLE_DL4D_RUNE_MELEE_TROOPERS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_DL4D_MEDIUM_CAMPS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_DL4D_BIG_CAMPS_SINNERS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_DL4D_MIDBOSS_URN_GOLD_RUNE", min: 0, max: 1, step: 1 },
    { key: "ENABLE_DL4D_LANE_GUARDIAN_WEAK", min: 0, max: 1, step: 1 },
    { key: "ENABLE_DL4D_RUNE", min: 0, max: 1, step: 1 },
    { key: "ENABLE_DL4D_WALKER_WEAK", min: 0, max: 1, step: 1 },
    { key: "ENABLE_DL4D_RUNE_FAST_TROOPERS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_DL4D_RUNE_GOLD_BUFFS", min: 0, max: 1, step: 1 },
    { key: "ENABLE_DL4D_RUNE_TROOPERS20_HP", min: 0, max: 1, step: 1 }
];
const QUICKBUY_CLICK_TO_NOTIFY_SCHEMA_FIELDS = [
    { key: "ENABLE_QUICKBUY_CLICK_TO_NOTIFY", min: 0, max: 1, step: 1 }
];
var QOL_COMPACT_SCHEMA_2_3_5= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_2_3_4,
    [
        { key: "DISABLE_PLAYER_NAME_BLUR", min: 0, max: 1, step: 1 }
    ]
);
var QOL_COMPACT_SCHEMA_2_3_6 = QOL_COMPACT_SCHEMA_2_3_5;
var QOL_COMPACT_SCHEMA_2_3_7 = QOL_COMPACT_SCHEMA_2_3_6;
var QOL_COMPACT_SCHEMA_2_4_0= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
        QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
            QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
                QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
                    QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
                        QOL_COMPACT_SCHEMA_2_3_7,
                        TOPBAR_HP_WARNING_SCHEMA_FIELDS
                    ),
                    COMBAT_INDICATOR_SCHEMA_FIELDS
                ),
                HUD_BAR_AND_SHOP_SCHEMA_FIELDS
            ),
            HUD_SECTION_AND_PANEL_SCHEMA_FIELDS
        ),
        MINIMAP_CRATE_OVERLAY_SCHEMA_FIELDS
    ),
    QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
        SHOP_STATS_MINIMALIST_SCHEMA_FIELDS,
        ENHANCED_QUICKBUY_SCHEMA_FIELDS
    )
);
var QOL_COMPACT_SCHEMA_2_5_0= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_2_4_0,
    QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
        SHOP_PURCHASE_FEATURE_SCHEMA_FIELDS,
        MINIMAP_REM_TUNNELS_SCHEMA_FIELDS
    )
);
var QOL_COMPACT_SCHEMA_2_5_1= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_2_5_0,
    MINIMAP_ELEVATION_MARKERS_SCHEMA_FIELDS
);
var QOL_COMPACT_SCHEMA_2_5_2= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_2_5_1,
    QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
        QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
            HUD_BAR_AND_SHOP_SCALE_SCHEMA_FIELDS,
            ZOOM_REM_TUNNELS_SCHEMA_FIELDS
        ),
        DAMAGE_IMPACT_SCHEMA_FIELDS
    )
);
var QOL_COMPACT_SCHEMA_2_5_3= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_2_5_2,
    SETTINGS_THEME_SCHEMA_FIELDS
);
var QOL_COMPACT_SCHEMA_2_5_4= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_2_5_3,
    QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
        QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
            PALETTE_PICKER_SCHEMA_FIELDS_2_5_4,
            STAMINA_CHARGE_SCHEMA_FIELDS
        ),
        CLEAN_DAMAGE_INDICATORS_SCHEMA_FIELDS
    )
);
var QOL_COMPACT_SCHEMA_2_5_5= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_UTILS.CloneSchemaWithFieldOverrides(
        QOL_COMPACT_SCHEMA_2_5_4,
        PALETTE_PICKER_SCHEMA_FIELDS
    ),
    PALETTE_PICKER_SCHEMA_FIELDS
);
var QOL_COMPACT_SCHEMA_2_5_6 = QOL_COMPACT_SCHEMA_2_5_5;
var QOL_COMPACT_SCHEMA_2_5_7= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(QOL_COMPACT_SCHEMA_2_5_6, RECENT_PURCHASES_QUICK_SCHEMA_FIELDS);
var QOL_COMPACT_SCHEMA_2_5_8= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(QOL_COMPACT_SCHEMA_2_5_7, SHOW_BUILD_ID_SCHEMA_FIELDS);
var QOL_COMPACT_SCHEMA_2_5_9= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(QOL_COMPACT_SCHEMA_2_5_8, DL4D_REMINDER_SCHEMA_FIELDS);
var QOL_COMPACT_SCHEMA_2_5_10= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(QOL_COMPACT_SCHEMA_2_5_9, QUICKBUY_CLICK_TO_NOTIFY_SCHEMA_FIELDS);
var QOL_COMPACT_SCHEMA_2_5_11= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(QOL_COMPACT_SCHEMA_2_5_10, RECENT_PURCHASES_OPACITY_SCHEMA_FIELDS);
var QOL_COMPACT_SCHEMA_2_6_0 = QOL_COMPACT_SCHEMA_2_5_11;
var QOL_COMPACT_SCHEMA_2_6_1 = QOL_COMPACT_SCHEMA_2_6_0;
var QOL_COMPACT_SCHEMA_3_0_0 = QOL_COMPACT_SCHEMA_2_6_1;
var QOL_COMPACT_SCHEMA_3_0_2= QOL_COMPACT_SCHEMA_UTILS.CloneSchemaWithFieldOverrides(
    QOL_COMPACT_SCHEMA_3_0_0,
    [{ key: "LANGUAGE", min: 0, max: 10, step: 1 }]
);
var QOL_COMPACT_SCHEMA_3_0_3= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_3_0_2,
    ENHANCED_QUICKBUY_COUNT_SCHEMA_FIELDS
);
var QOL_COMPACT_SCHEMA_3_0_4= QOL_COMPACT_SCHEMA_UTILS.CloneSchemaWithFieldOverrides(
    QOL_COMPACT_SCHEMA_3_0_3,
    [{ key: "LANGUAGE", min: 0, max: 11, step: 1 }]
);
var QOL_COMPACT_SCHEMA_3_0_5= QOL_COMPACT_SCHEMA_UTILS.CloneSchemaWithFieldOverrides(
    QOL_COMPACT_SCHEMA_3_0_4,
    SETTINGS_THEME_SCHEMA_FIELDS_3_0_5
);
var QOL_COMPACT_SCHEMA_3_1_0 = QOL_COMPACT_SCHEMA_3_0_5;
var QOL_COMPACT_SCHEMA_3_1_1= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_3_1_0,
    HERO_PURCHASE_POPUPS_SCHEMA_FIELDS
);
// Fix: ENABLE_SHOP_ITEM_NOTIFICATIONS was missing from the compact schema.
// The legacy key ENABLE_SHOP_CLICK_TO_NOTIFY was included but not the canonical key.
const SHOP_ITEM_NOTIFICATION_SCHEMA_FIELDS = [
    { key: "ENABLE_SHOP_ITEM_NOTIFICATIONS", min: 0, max: 1, step: 1 }
];
var QOL_COMPACT_SCHEMA_3_1_2= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_3_1_1,
    SHOP_ITEM_NOTIFICATION_SCHEMA_FIELDS
);
// 3.1.3: Add ally healthbar, perf debug, specials, drag, and previews keys
// that were defined in QOL_DEFAULT_CONFIG but missing from compact serialization.
var QOL_COMPACT_SCHEMA_3_0_6_MISSING_FIELDS = [
    { key: "ENABLE_ALLY_COLORED_HEALTHBAR", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ALLY_COLOR_WARNING_25", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ALLY_COLOR_WARNING_65", min: 0, max: 1, step: 1 },
    { key: "ENABLE_ALLY_COLOR_WARNING_75", min: 0, max: 1, step: 1 },
    { key: "ENABLE_PERF_DEBUG", min: 0, max: 1, step: 1 },
    { key: "ENABLE_PERF_DEBUG_DETAIL", min: 0, max: 1, step: 1 },
    { key: "ENABLE_PERF_OVERLAY", min: 0, max: 1, step: 1 },
    { key: "PERF_ALERT_THRESHOLD_MS", min: 1, max: 50, step: 1 },
    { key: "PERF_OVERLAY_OPACITY", min: 0.3, max: 1.0, step: 0.05 },
    { key: "ENABLE_SPECIALS", min: 0, max: 1, step: 1 },
    { key: "DRAG_ENABLED", min: 0, max: 1, step: 1 },
    { key: "PREVIEWS_ENABLED", min: 0, max: 1, step: 1 }
];
// 3.0.6: Full schema including the missing fields that were added as 3.0.6.
// Reconstructed for backward compatibility — saves encoded with 3.0.6 must decode.
var QOL_COMPACT_SCHEMA_3_0_6= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_3_0_5,
    QOL_COMPACT_SCHEMA_3_0_6_MISSING_FIELDS
);
var QOL_COMPACT_SCHEMA_3_1_3= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_3_1_2,
    QOL_COMPACT_SCHEMA_3_0_6_MISSING_FIELDS
);
var QOL_COMPACT_SCHEMA_3_1_4_EXTRA_FIELDS = [
    { key: "UNIT_TARGET_HINT_SIZE", min: 50, max: 200, step: 5 }
];
var QOL_COMPACT_SCHEMA_3_1_4= QOL_COMPACT_SCHEMA_UTILS.AppendUniqueSchemaFields(
    QOL_COMPACT_SCHEMA_3_1_3,
    QOL_COMPACT_SCHEMA_3_1_4_EXTRA_FIELDS
);
var QOL_LATEST_COMPACT_SEMVER = QOL_SCHEMA_SEMVER;

// ==========================================================================
// Compact schema version history
// ==========================================================================
// 2.0.0        Initial compact schema (wire version 1, 69 fields from V60).
// 2.0.1        Wire version 2. Added on-death games, DL4D, enemy V2, and
//              quickbuy notification fields.
// 2.1.x        Language max, friends list, center ESC, HUD shift, build ID.
// 2.2.0        Large batch: passive cooldowns, keyboard overlay, zip boost,
//              unsecured souls, minimap rotate/flip, topbar HP warnings, urn.
// 2.2.1-2.2.6  Chat, legacy cooldowns, LANGUAGE max progression (3→6).
// 2.2.7-2.2.10 Minimap additions: flip, mid boss, buff timers on bridge.
// 2.3.x        BHOP, healthbar type (0–5), images in chat, Minecraft numbers,
//              player name blur toggle.
// 2.4.0        Topbar HP warnings, combat indicator, HUD bar/shop toggles,
//              minimap crate overlay, shop stats simplification, quickbuy.
// 2.5.x        Progressive additions: recent purchases, minimap tunnels,
//              elevation markers, zoom tunnels, damage impact, settings theme,
//              palette picker, stamina charge, damage numbers, DL4D, show build
//              ID. Each minor version added 1–3 fields.
// 2.6.x        Aliases for 2.5.11.
// 3.0.0        Major version bump (alias for 2.6.1).
// 3.0.1-3.0.6  LANGUAGE max →10→11, SETTINGS_THEME max→6, 12 missing fields
//              (ally healthbar, perf debug, specials, drag, previews).
// 3.1.0-3.1.4  Hero purchase popups, shop item notifications fix, 12-field
//              reconstruction, UNIT_TARGET_HINT_SIZE (current).
// ==========================================================================
// Known issue: ENABLE_COLORED_HEALTHBAR appears twice in V24+ schemas
// (once from V2 base, once from V24 concat). Harmless — the decode
// overwrite produces the same value — but costs 2 bits per payload.
// Not fixed to preserve binary compatibility with existing exports.
// ==========================================================================
var QOL_COMPACT_SCHEMA_REGISTRY = {
    // 2.0.0: Initial compact schema (wire version 1)
    "2.0.0": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_0,
        schema: QOL_COMPACT_SCHEMA_2_0_0
    },
    "2.0.1": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_0_1
    },
    "2.1.0": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_1_1
    },
    "2.1.1": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_1_1
    },
    "2.1.2": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_1_2
    },
    "2.2.0": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_2_0
    },
    "2.2.1": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_2_1
    },
    "2.2.2": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_2_2
    },
    "2.2.3": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_2_3
    },
    "2.2.4": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_2_4
    },
    "2.2.5": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_2_5
    },
    "2.2.6": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_2_6
    },
    "2.2.7": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_2_7
    },
    "2.2.8": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_2_7
    },
    "2.2.9": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_2_7
    },
    "2.2.10": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_2_10
    },
    "2.3.0": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_2_10
    },
    "2.3.1": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_3_1
    },
    "2.3.2": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_3_1
    },
    "2.3.3": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_3_3
    },
    "2.3.4": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_3_4
    },
    "2.3.5": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_3_5
    },
    "2.3.6": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_3_6
    },
    "2.3.7": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_3_7
    },
    "2.4.0": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_4_0
    },
    "2.5.0": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_5_0
    },
    "2.5.1": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_5_1
    },
    "2.5.2": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_5_2
    },
    "2.5.3": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_5_3
    },
    "2.5.4": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_5_4
    },
    "2.5.5": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_5_5
    },
    "2.5.6": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_5_6
    },
    "2.5.7": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_5_7
    },
    "2.5.8": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_5_8
    },
    "2.5.9": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_5_9
    },
    "2.5.10": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_5_10
    },
    "2.5.11": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_5_11
    },
    "2.6.0": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_6_0
    },
    "2.6.1": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_2_6_1
    },
    "3.0.0": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_3_0_0
    },
    "3.0.1": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_3_0_0
    },
    "3.0.2": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_3_0_2
    },
    "3.0.3": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_3_0_3
    },
    "3.0.4": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_3_0_4
    },
    "3.0.5": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_3_0_5
    },
    "3.0.6": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_3_0_6
    },
    "3.1.0": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_3_1_0
    },
    "3.1.1": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_3_1_1
    },
    "3.1.2": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_3_1_2
    },
    "3.1.3": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_3_1_3
    },
    "3.1.4": {
        wireVersion: QOL_COMPACT_WIRE_VERSION_2_0_1,
        schema: QOL_COMPACT_SCHEMA_3_1_4
    }
};
var QOL_COMPACT_SCHEMA_WIRE_TO_SEMVER = (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.BuildWireToSemver === "function")
    ? QOL_CODEC.BuildWireToSemver(QOL_COMPACT_SCHEMA_REGISTRY)
    : {};

QOL_COMPACT_SCHEMA_UTILS.GetSchema = function(semver) {
    var key = String(semver || "");
    var entry = QOL_COMPACT_SCHEMA_REGISTRY[key];
    if (!entry || !Array.isArray(entry.schema)) throw new Error("Unsupported compact schema semver");
    return entry.schema;
}

QOL_COMPACT_SCHEMA_UTILS.GetWireVersion = function(semver) {
    var key = String(semver || "");
    var entry = QOL_COMPACT_SCHEMA_REGISTRY[key];
    if (!entry) throw new Error("Unsupported compact schema semver");
    var wireVersion = Math.max(0, Math.round(Number(entry.wireVersion) || 0));
    if (wireVersion <= 0) throw new Error("Invalid compact schema wire version");
    return wireVersion;
}

QOL_COMPACT_SCHEMA_UTILS.ResolveSemverFromWire = function(wireVersion) {
    var semver = (typeof QOL_CODEC === "object" && QOL_CODEC && typeof QOL_CODEC.ResolveSemverFromWire === "function")
        ? QOL_CODEC.ResolveSemverFromWire(QOL_COMPACT_SCHEMA_WIRE_TO_SEMVER, QOL_COMPACT_SCHEMA_REGISTRY, wireVersion)
        : "";
    if (!semver || !QOL_COMPACT_SCHEMA_REGISTRY[semver]) throw new Error("Unsupported compact schema wire version");
    return semver;
}

QOL_COMPACT_SCHEMA_UTILS.AreSemversWireCompatible = function(expectedSemver, resolvedSemver) {
    var expected = String(expectedSemver || "");
    var resolved = String(resolvedSemver || "");
    if (!expected || !resolved) return false;
    if (expected === resolved) return true;
    if (!QOL_COMPACT_SCHEMA_REGISTRY.hasOwnProperty(expected)) return false;
    if (!QOL_COMPACT_SCHEMA_REGISTRY.hasOwnProperty(resolved)) return false;
    try {
        return GetCompactWireVersion(expected) === GetCompactWireVersion(resolved);
    } catch (eWire) {
        return false;
    }
}

// ==========================================================================
// QOL_FEATURE_REGISTRY — feature registration for the core dispatch loop
// ==========================================================================
// Each QOLLOCK feature registers itself via QOL_REGISTER_FEATURE(name, descriptor).
// The core loop (ql_core.js) iterates the registry to determine which features
// to run each tick, assign them to scheduler phases and offset buckets, and
// dispatch them with per-feature error isolation.
//
// Descriptor shape:
//   {
//     configKeys: string[],  // config keys this feature reads (for gate caching)
//     bucket: number,        // 0-7, which FEATURE_OFFSET_BUCKET_N_MS slot
//     phase: number,         // 0-4 for 5-phase scheduler, -1 for always-run
//     gate: function(cfg, hideoutConnected, featureState) → bool,
//     update: function(root, cfg, nowMs, State, hideoutConnected),
//     cleanup: function(root, cfg, State) | null,  // optional on→off cleanup
//     stateKeys: string[]    // which State fields this feature initializes/owns
//   }
//
// Registration is idempotent — calling twice with the same name is a no-op.
// Features that haven't been extracted yet can register inline from ql_core.js
// using the same interface, participating in registry-based dispatch while
// still living in the main file.
// ==========================================================================
var QOL_FEATURE_REGISTRY = {};
var QOL_REGISTER_FEATURE = function(name, descriptor) {
    if (!name || typeof name !== "string") {
        if (typeof $ !== "undefined" && $.Msg) {
            $.Msg("[QOLLock] ERROR: QOL_REGISTER_FEATURE called without a valid name");
        }
        return;
    }
    if (QOL_FEATURE_REGISTRY.hasOwnProperty(name)) return; // idempotent
    if (!descriptor || typeof descriptor !== "object") {
        if (typeof $ !== "undefined" && $.Msg) {
            $.Msg("[QOLLock] ERROR: QOL_REGISTER_FEATURE('" + name + "') missing descriptor");
        }
        return;
    }
    if (!Array.isArray(descriptor.configKeys)) {
        if (typeof $ !== "undefined" && $.Msg) {
            $.Msg("[QOLLock] ERROR: QOL_REGISTER_FEATURE('" + name + "') missing configKeys array");
        }
        return;
    }
    if (typeof descriptor.update !== "function") {
        if (typeof $ !== "undefined" && $.Msg) {
            $.Msg("[QOLLock] ERROR: QOL_REGISTER_FEATURE('" + name + "') missing update function");
        }
        return;
    }
    var bucket = Number(descriptor.bucket);
    if (!isFinite(bucket) || bucket < 0 || bucket > 7) bucket = 0;
    var phase = Number(descriptor.phase);
    if (!isFinite(phase) || phase < -1) phase = -1;

    QOL_FEATURE_REGISTRY[name] = {
        configKeys: descriptor.configKeys.slice(),
        bucket: bucket,
        phase: phase,
        gate: (typeof descriptor.gate === "function") ? descriptor.gate : function() { return true; },
        update: descriptor.update,
        cleanup: (typeof descriptor.cleanup === "function") ? descriptor.cleanup : null,
        stateKeys: Array.isArray(descriptor.stateKeys) ? descriptor.stateKeys.slice() : [],
        requiresRoot: descriptor.requiresRoot === true,
        gateKey: (typeof descriptor.gateKey === "string" && descriptor.gateKey.length > 0) ? descriptor.gateKey : name,
        perfLabel: (typeof descriptor.perfLabel === "string" && descriptor.perfLabel.length > 0) ? descriptor.perfLabel : ("loop." + name),
        postUpdate: (typeof descriptor.postUpdate === "function") ? descriptor.postUpdate : null
    };
};

// ==========================================================================
// QOL bridge namespace — shared module system
// ==========================================================================
// ql_utils.js publishes to QOL.utils
// ql_core.js publishes State + ~85 shared functions as QOL.* properties
// Feature files use QOL.import(["state","utils",...]) instead of typeof guards
// ==========================================================================
var QOL = (typeof QOL !== "undefined") ? QOL : {};

// Re-home the feature registry on the namespace
QOL.featureRegistry = QOL_FEATURE_REGISTRY;
QOL.register = QOL_REGISTER_FEATURE;

// Attach QOL_UTILS (loaded before us by ql_utils.js) to the namespace
if (typeof QOL_UTILS !== "undefined") {
    QOL.utils = QOL_UTILS;
}

// ── Publish same-context symbols for QOL.import() access (Phase 6c) ──
// These bare vars live in the same compilation unit as ql_settings.js
// but are not yet on the QOL namespace. Publishing them enables
// ql_settings.js to use QOL.import() instead of typeof guards.
if (typeof QOL_DEFAULT_CONFIG === "object") QOL.defaultConfig = QOL_DEFAULT_CONFIG;
if (typeof QOL_PRESETS === "object") QOL.presets = QOL_PRESETS;
if (typeof QOL_SCHEMA_SEMVER === "string") QOL.schemaSemver = QOL_SCHEMA_SEMVER;
if (typeof QOL_CODEC === "object") QOL.codec = QOL_CODEC;
if (typeof QOL_DumpDiagnostics === "function") QOL.dumpDiagnostics = QOL_DumpDiagnostics;

// Keep bare var globals for backward compat during migration
// (removed in cleanup step)

// Dependency import helper — resolves named symbols from QOL namespace.
// Logs a single consolidated warning listing ALL missing dependencies.
QOL.import = function(names) {
    var out = {};
    var missing = [];
    for (var i = 0; i < names.length; i++) {
        var key = names[i];
        var val = QOL[key];
        if (val !== undefined) {
            out[key] = val;
        } else {
            out[key] = undefined;
            missing.push("QOL." + key);
        }
    }
    if (missing.length > 0) {
        if (typeof $ !== "undefined" && $.Msg) {
            $.Msg("[QOLLock][BRIDGE] missing " + missing.length + " dependency(s): " + missing.join(", "));
        }
    }
    return out;
};

// Publish namespace to global scope
try { if (typeof window !== "undefined") window.QOL = QOL; } catch(e) {}
try { if (typeof globalThis !== "undefined") globalThis.QOL = QOL; } catch(e) {}

// ── Diagnostic dump function ──
// Reads HUD state + captured logs from Hud panel attribute "QOL_Diag"
// (written by ql_core.js each tick via the cross-context panel bridge).
var QOL_DumpDiagnostics = function() {
    var lines = [];
    lines.push("=== QOLLOCK Diagnostics ===");
    lines.push("Version: " + (typeof MOD_DISPLAY_VERSION !== "undefined" ? MOD_DISPLAY_VERSION : "?"));
    lines.push("Schema: " + (typeof QOL_SCHEMA_SEMVER !== "undefined" ? QOL_SCHEMA_SEMVER : "?"));
    lines.push("");

    var _diag = null;
    try {
        var _ctx = $.GetContextPanel();
        while (_ctx && _ctx.GetParent && _ctx.GetParent()) { _ctx = _ctx.GetParent(); }
        var _hud = _ctx && _ctx.FindChildTraverse ? _ctx.FindChildTraverse("Hud") : null;
        if (_hud && _hud.GetAttributeString) {
            var _raw = _hud.GetAttributeString("QOL_Diag", "");
            if (_raw) { try { _diag = JSON.parse(_raw); } catch(e) { $.Msg("[QOLLock][WARN][diag] Diagnostic JSON parse failed: " + (e && e.message ? e.message : String(e || "")) + " | preview=" + String(_raw || "").substring(0, 100)); } }
        }
    } catch(e) {}

    if (_diag) {
        lines.push("--- Loaded Features (" + (_diag.features ? _diag.features.length : 0) + ") ---");
        if (_diag.features) {
            for (var _fi = 0; _fi < _diag.features.length; _fi++) {
                lines.push("  + " + _diag.features[_fi]);
            }
        }
        lines.push("");
        lines.push("--- Auto-Disabled Features ---");
        if (_diag.disabled && _diag.disabled.length > 0) {
            for (var _di = 0; _di < _diag.disabled.length; _di++) {
                var _dn = _diag.disabled[_di];
                var _dc = (_diag.errors && _diag.errors[_dn]) ? (" (" + _diag.errors[_dn] + " errors)") : "";
                lines.push("  " + _dn + _dc);
            }
        } else {
            lines.push("  (none)");
        }
        lines.push("");
        // Merge HUD-side logs (from panel attribute) with settings-side logs
        // (from local __qolLogBuf, captured by the $.Msg wrapper in this file).
        var _allLogs = [];
        if (_diag.logs && _diag.logs.length > 0) {
            for (var _li = 0; _li < _diag.logs.length; _li++) { _allLogs.push(_diag.logs[_li]); }
        }
        try {
            if (typeof __qolLogBuf !== "undefined" && __qolLogBuf && __qolLogBuf.length > 0) {
                for (var _lj = 0; _lj < __qolLogBuf.length; _lj++) {
                    var _entry = __qolLogBuf[_lj];
                    // Deduplicate — HUD-side buffer may share entries written before
                    // the contexts diverged
                    if (_allLogs.indexOf(_entry) === -1) _allLogs.push(_entry);
                }
            }
        } catch(e) {}
        lines.push("--- QOL Console Logs (" + _allLogs.length + " messages) ---");
        if (_allLogs.length > 0) {
            for (var _lk = 0; _lk < _allLogs.length; _lk++) {
                lines.push(_allLogs[_lk]);
            }
        } else {
            lines.push("  (no logs captured yet)");
        }
    } else {
        lines.push("--- HUD Runtime State ---");
        lines.push("  (not available — ql_core.js may not be loaded or no data written yet)");
    }
    return lines.join("\n");
};

var QOL_DEFAULT_CONFIG = {
    SETTINGS_THEME: 0,
    MINIMAP_SMALL_SIZE: 400,
        MINIMAP_BASE_OPACITY: 1.0,
        MINIMAL_MINIMAP: 0,
        MINIMAL_MINIMAP_OPACITY: 0.9,
        MINIMAP_FLIP: 0,
        MINIMAP_ROTATE_WITH_PLAYER: 0,
        ENABLE_URN_COLORS: 0,
        ENABLE_MINIMAP_BUFF_TIMER: 0,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 0,
        ENABLE_MINIMAP_REJUV_TIMER: 0,
        ENABLE_MINIMAP_CRATE_OVERLAY: 0,
        ENABLE_MINIMAP_REM_TUNNELS: 0,
        MINIMAP_REM_TUNNELS_OPACITY: 0.75,
        ENABLE_MINIMAP_ELEVATION_MARKERS: 0,
        MINIMAP_ICON_COLOR: 0,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 0,
        MINIMAP_X_OFFSET: 0,
        MINIMAP_Y_OFFSET: 0,
        MINIMAP_LARGE_SIZE: 750,
        ZOOM_X_OFFSET: 0,
        ZOOM_Y_OFFSET: 0,
        MINIMAP_LARGE_SIZE_ALT: 750,
        ZOOM_X_OFFSET_ALT: 0,
        ZOOM_Y_OFFSET_ALT: 0,
        MINIMAP_LARGE_SIZE_TAB: 750,
        ZOOM_X_OFFSET_TAB: 0,
        ZOOM_Y_OFFSET_TAB: 0,
        ENABLE_ALT_ZOOM: 0,
        ALT_ZOOM_OPACITY: 0.95,
        ALT_ZOOM_DRAW_OVER_UI: 0,
        ENABLE_ALT_ZOOM_REM_TUNNELS: 0,
        ALT_ZOOM_REM_TUNNELS_OPACITY: 0.75,
        ENABLE_TAB_ZOOM: 0,
        TAB_ZOOM_OPACITY: 0.70,
        TAB_ZOOM_DRAW_OVER_UI: 0,
        ENABLE_TAB_ZOOM_REM_TUNNELS: 0,
        TAB_ZOOM_REM_TUNNELS_OPACITY: 0.75,
        ENABLE_ONE_TIME: 0,
        ENABLE_ONE_TIME_TIER1: 0,
        ENABLE_ONE_TIME_TIER2: 0,
        ENABLE_ONE_TIME_TIER3: 0,
        ENABLE_INTERVAL: 0,
        ENABLE_BUFF_SOUND_1: 1,
        ENABLE_BUFF_SOUND_2: 1,
        ENABLE_BUFF_SOUND_3: 1,
        BRIDGE_BUFF_START: 30,
        ENABLE_AMMO_STATUS: 0,
        ENABLE_HIDE_AMMO_ALL: 0,
        ENABLE_HIDE_MAGAZINE: 0,
        AMMO_PANEL_SCALE: 100,
        AMMO_CURRENT_SCALE: 100,
        AMMO_TOTAL_SCALE: 100,
        AMMO_PANEL_X_OFFSET: 0,
        AMMO_PANEL_Y_OFFSET: 0,
        AMMO_TEXT_COLOR: 0,
        ENABLE_RELOAD_COOLDOWN: 0,
        RELOAD_COOLDOWN_OPACITY: 0.6,
        RELOAD_COOLDOWN_SIZE: 28,
        RELOAD_COOLDOWN_X_OFFSET: 0,
        RELOAD_COOLDOWN_Y_OFFSET: 0,
        ENABLE_HIDE_RELOAD_ICON: 0,
        ENABLE_HIDE_RELOAD_CIRCLE: 0,
        ENABLE_COMBAT_STATUS: 0,
        COMBAT_STATUS_SCALE: 100,
        COMBAT_STATUS_X_OFFSET: 0,
        COMBAT_STATUS_Y_OFFSET: 0,
        ENABLE_ULT_COOLDOWNS: 0,
        ULT_COOLDOWN_OPACITY: 0.9,
        ULT_COOLDOWN_SIZE: 13,
        ENABLE_PASSIVE_COOLDOWN: 0,
        ENABLE_OLD_ITEM_COOLDOWNS: 1,
        OLD_ITEM_COOLDOWNS_SCALE: 110,
        OLD_ITEM_COOLDOWNS_X_OFFSET: 0,
        OLD_ITEM_COOLDOWNS_Y_OFFSET: 30,
        PASSIVE_COOLDOWN_SIZE: 40,
        PASSIVE_COOLDOWN_Y: 0,
        PASSIVE_COOLDOWN_X: 0,
        PASSIVE_COOLDOWN_OPACITY: 0.5,
        ITEM_FILTER_DEF_PASSIVE: 1,
        ITEM_FILTER_OFF_PASSIVE: 1,
        ITEM_FILTER_DEF_ACTIVE: 0,
        ITEM_FILTER_OFF_ACTIVE: 0,
        VOICE_TYPE: 4,
        VOICE_VOLUME: 100,
        ENABLE_COMPASS: 0,
        ENABLE_SIMPLIFY_COMPASS: 0,
        ENABLE_COMPASS_SPEED: 0,
        COMPASS_SCALE: 100,
        COMPASS_STRETCH_X: 100,
        COMPASS_STRETCH_Y: 100,
        COMPASS_X_OFFSET: 0,
        COMPASS_Y_OFFSET: 120,
        ENABLE_KEYBOARD_OVERLAY: 0,
        ENABLE_FULL_KEYBOARD_LAYOUT: 0,
        KEYBOARD_OVERLAY_SCALE: 100,
        KEYBOARD_OVERLAY_X_OFFSET: 0,
        KEYBOARD_OVERLAY_Y_OFFSET: 0,
        KEYBOARD_OVERLAY_WASH_COLOR: 0,
        ENABLE_MINIMAP_REMINDER: 0,
        MINIMAP_REMINDER_INTERVAL: 15,
        ENABLE_DL4D_REMINDERS: 0,
        DL4D_VOLUME: 100,
        ENABLE_DL4D_CAPTIONS: 1,
        ENABLE_DL4D_SMALL_CAMPS_BOXES: 1,
        ENABLE_DL4D_RUNE_MELEE_TROOPERS: 1,
        ENABLE_DL4D_MEDIUM_CAMPS: 1,
        ENABLE_DL4D_BIG_CAMPS_SINNERS: 1,
        ENABLE_DL4D_MIDBOSS_URN_GOLD_RUNE: 1,
        ENABLE_DL4D_LANE_GUARDIAN_WEAK: 1,
        ENABLE_DL4D_RUNE: 1,
        ENABLE_DL4D_WALKER_WEAK: 1,
        ENABLE_DL4D_RUNE_FAST_TROOPERS: 1,
        ENABLE_DL4D_RUNE_GOLD_BUFFS: 1,
        ENABLE_DL4D_RUNE_TROOPERS20_HP: 1,
        DISABLE_DAMAGE_REPORT: 0,
        DAMAGE_REPORT_X_OFFSET: 0,
        DAMAGE_REPORT_Y_OFFSET: 0,
        DISABLE_QUICK_BUY: 0,
        ENABLE_ENHANCED_QUICKBUY: 0,
        ENHANCED_QUICKBUY_COUNT: 3,
        ENABLE_QUICKBUY_CLICK_TO_NOTIFY: 0,
        ENABLE_SHOP_ITEM_NOTIFICATIONS: 0,
        ENABLE_SHOP_CLICK_TO_NOTIFY: 0,
        ENABLE_SHOP_RECENT_PURCHASES: 0,
        RECENT_PURCHASES_QUICK_MAX: 3,
        RECENT_PURCHASES_QUICK_DISPLAY_SEC: 10,
        RECENT_PURCHASES_QUICK_X_OFFSET: 0,
        RECENT_PURCHASES_QUICK_Y_OFFSET: 0,
        RECENT_PURCHASES_QUICK_REJUV: 1,
        RECENT_PURCHASES_QUICK_SCOREBOARD: 1,
        RECENT_PURCHASES_QUICK_OPACITY: 1,
        RECENT_PURCHASES_QUICK_SCALE: 1,
        RECENT_PURCHASES_PANEL_X_OFFSET: 0,
        RECENT_PURCHASES_PANEL_Y_OFFSET: 0,
        RECENT_PURCHASES_PANEL_OPACITY: 1,
        RECENT_PURCHASES_PANEL_SCALE: 1,
        ENABLE_HERO_PURCHASE_POPUPS: 0,
        ENABLE_SHOW_BUILD_ID: 0,
        ENABLE_SHOW_BUILD_ID_TITLE: 0,
        ENABLE_HUD_SHIFT: 0,
        ENABLE_LANE_WITH_PARTY: 0,
        SUPPORT_16_10: 0,
        SUPPORT_4_3: 0,
        ENABLE_UNSPENT_SOULS: 0,
        UNSECURED_SOULS_HUD_SCALE: 120,
        UNSECURED_SOULS_HUD_X_OFFSET: 120,
        UNSECURED_SOULS_HUD_Y_OFFSET: 925,
        ENABLE_BETTER_UNSECURED: 0,
        ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT: 0,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 0,
        ENABLE_BETTER_UNSECURED_SHOW_TEXT: 1,
        ENABLE_MIN_SOULS: 0,
        ENABLE_OBJ_DMG: 0,
        ENABLE_OBJ_MAP: 0,
        ENABLE_URN_DIFF: 0,
        ENABLE_MISSING_HERO: 0,
        ENABLE_NICKNAMES: 0,
        HUD_TOP_BAR_ENABLED: 1,
        DISABLE_PLAYER_NAME_BLUR: 0,
        TOP_BAR_OPACITY: 1.0,
        TOP_BAR_SCALE: 1.0,
        TOP_BAR_X_OFFSET: 0,
        TOP_BAR_Y_OFFSET: 0,
        ENABLE_CUMULATIVE_DMG: 1,
        ENABLE_CLEAN_DAMAGE_INDICATORS: 0,
        ENABLE_DAMAGE_FOUNTAIN: 0,
        ENABLE_HIDE_SMALL_NUMBERS: 0,
        ENABLE_HIDE_TROOPER_DAMAGE: 0,
        ENABLE_DAMAGE_IMPACT: 1,
        DAMAGE_IMPACT_SCALE: 1.0,
        DAMAGE_IMPACT_OPACITY: 1.0,
        DAMAGE_IMPACT_X_OFFSET: 0,
        DAMAGE_IMPACT_Y_OFFSET: 0,
        ENABLE_GAME_AUDIO: 1,
        GAME_DEFAULT_DIFFICULTY: 1,
        ENABLE_BHOP: 0,
        ENABLE_ON_DEATH_GAMES: 0,
        ON_DEATH_GAME_MINESWEEPER: 0,
        ON_DEATH_GAME_BLACKJACK: 0,
        ON_DEATH_GAME_FLAPPY_BAT: 0,
        ON_DEATH_GAME_GRAVES_TRAINER: 0,
        ON_DEATH_GAME_ZERGGY_MANIA: 0,
        ON_DEATH_GAME_WHACK_A_REM: 0,
        ENABLE_SHOP_STATS: 0,
        ENABLE_SIMPLIFY_SHOP_STATS: 0,
        HUD_SHOP_ENABLED: 1,
        DISABLE_SHOP_BLUE: 0,
        SHOP_OFFSET_X: 0,
        SHOP_OFFSET_Y: 0,
        SHOP_OPACITY: 1.0,
        SHOP_SCALE: 1.0,
        ENABLE_SIMPLIFY_SHOP: 0,
        HUD_ITEMS_ENABLED: 1,
        ITEMS_OPACITY: 1.0,
        ITEMS_X_OFFSET: 0,
        ITEMS_Y_OFFSET: 0,
        ITEMS_WASH_COLOR: 0,
        ENABLE_SIMPLIFY_ITEMS: 0,
        DAMAGE_NUMBER_OPACITY: 1.0,
        ENABLE_ZIP_BOOST: 0,
        ZIP_BOOST_SCALE: 100,
        ZIP_BOOST_X_OFFSET: 0,
        ZIP_BOOST_Y_OFFSET: 0,
        ENABLE_UNSECURED_SOUL_TIMER: 0,
        UNSECURED_SOUL_TIMER_SCALE: 100,
        UNSECURED_SOUL_TIMER_X_OFFSET: -850,
        UNSECURED_SOUL_TIMER_Y_OFFSET: 40,
        ENABLE_STAT_BONUSES: 0,
        STAT_BONUSES_SCALE: 100,
        STAT_BONUSES_X_OFFSET: 0,
        STAT_BONUSES_Y_OFFSET: 0,
        ENABLE_CLEAN_STACKS: 0,
        ENABLE_CENTER_ESC: 0,
        ENABLE_CENTER_FRIENDS_LIST: 0,
        ENABLE_LEGACY_COOLDOWNS: 0,
        ENABLE_STATLOCKER: 0,
        ENABLE_CHAT: 1,
        ENABLE_IMAGES_IN_CHAT: 0,
        CHAT_SCALE: 100,
        CHAT_X_OFFSET: 0,
        CHAT_Y_OFFSET: 0,
        ENABLE_FORCE_TESTING_TOOLS: 0,
        ENABLE_HIDE_TESTING_TOOLS: 0,
        HUD_INDICATOR_SIZE: 18,
        ENABLE_RED_DIAMOND: 0,
        ENABLE_IMPROVED_HINT: 0,
        STAMINA_CHARGE_ANGLE: 45,
        STAMINA_CHARGE_COLOR: 0,
        UNIT_TARGET_SIZE: 150,
        UNIT_TARGET_OPACITY: 1.0,
        UNIT_TARGET_HINT_SIZE: 100,
        ENABLE_HERO_SCENE_PANEL: 1,
        HUD_BOTTOM_BAR_ENABLED: 1,
        ENABLE_HIDE_FAILED_HINT: 0,
        ENABLE_HIDE_ABILITY_SUGGESTION: 0,
        ENABLE_HIDE_COSMETIC_ABILITY: 0,
        BOTTOM_BAR_OPACITY: 1.0,
        BOTTOM_BAR_SCALE: 1.0,
        BOTTOM_BAR_X_OFFSET: 0,
        BOTTOM_BAR_Y_OFFSET: 0,
        BOTTOM_BAR_WASH_COLOR: 0,
        HUD_SOULS_ENABLED: 1,
        SOULS_OPACITY: 1.0,
        SOULS_X_OFFSET: 0,
        SOULS_Y_OFFSET: 0,
        ENABLE_SIMPLIFY_ABILITY_ICONS: 0,
        ENABLE_HIDE_BEHAVIOR_SUMMARY: 0,
        ENABLE_BUFF_HUD: 0,
        ENABLE_REJUV_HUD: 0,
        ENABLE_COMBAT_INDICATOR: 0,
        ENABLE_COLORED_HEALTHBAR: 0,
        ENABLE_COLOR_WARNING_25: 0,
        ENABLE_COLOR_WARNING_65: 0,
        ENABLE_COLOR_WARNING_75: 0,
        ENABLE_ENEMY_COLORED_HEALTHBAR: 0,
        ENABLE_ENEMY_COLOR_WARNING_25: 0,
        ENABLE_ENEMY_COLOR_WARNING_65: 0,
        ENABLE_ENEMY_COLOR_WARNING_75: 0,
        ENABLE_ALLY_COLORED_HEALTHBAR: 0,
        ENABLE_ALLY_COLOR_WARNING_25: 0,
        ENABLE_ALLY_COLOR_WARNING_65: 0,
        ENABLE_ALLY_COLOR_WARNING_75: 0,
        ENABLE_TOPBAR_ENEMY_HP_WARNING: 0,
        ENABLE_TOPBAR_ENEMY_HP_WARNING_25: 0,
        ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 0,
        ENABLE_TOPBAR_ENEMY_HP_WARNING_75: 0,
        ENABLE_TOPBAR_ALLY_HP_WARNING: 0,
        ENABLE_TOPBAR_ALLY_HP_WARNING_25: 0,
        ENABLE_TOPBAR_ALLY_HP_WARNING_65: 0,
        ENABLE_TOPBAR_ALLY_HP_WARNING_75: 0,
        ENABLE_FG_HEALTHBAR: 0,
        ENABLE_MINIMALIST_HEALTHBAR: 0,
        HEALTHBAR_TYPE: 0,
        ENABLE_MINECRAFT_HEALTH_NUMBERS: 0,
        PLAYER_HEALTHBAR_SCALE: 100,
        PLAYER_HEALTHBAR_OPACITY: 1.0,
        PLAYER_HEALTHBAR_X_OFFSET: 0,
        PLAYER_HEALTHBAR_Y_OFFSET: 0,
        PLAYER_HEALTHBAR_ACCENT_COLOR: 0,
        ENABLE_ENEMY_V2_ENHANCED: 0,
        ENABLE_ENEMY_V2_ULT_INDICATOR: 1,
        ENABLE_ENEMY_V2_LEVEL: 1,
        ENABLE_ENEMY_ULT_INDICATOR: 0,
        MINIMALIST_HEALTHBAR_X_OFFSET: 0,
        MINIMALIST_HEALTHBAR_Y_OFFSET: 0,
        ENABLE_PERF_DEBUG: 0,
        ENABLE_PERF_DEBUG_DETAIL: 0,
        ENABLE_PERF_OVERLAY: 0,
        PERF_ALERT_THRESHOLD_MS: 10,
        PERF_OVERLAY_OPACITY: 0.75,
        ENABLE_SPECIALS: 0,
        LANGUAGE: 0,
        DEFAULT_HERO: "hero_werewolf",
        DRAG_ENABLED: 1,
        PREVIEWS_ENABLED: 1
};

var QOL_PRESETS = {
    "Sneed": {
        MINIMAP_SMALL_SIZE: 480,
        MINIMAP_BASE_OPACITY: 0.8,
        MINIMAL_MINIMAP: 1,
        MINIMAP_X_OFFSET: -35,
        MINIMAP_Y_OFFSET: 255,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_AMMO_STATUS: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        VOICE_TYPE: 6,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 41,
        UNIT_TARGET_SIZE: 100,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_HIDE_MAGAZINE: 1,
        AMMO_PANEL_SCALE: 239,
        AMMO_PANEL_X_OFFSET: -80,
        AMMO_PANEL_Y_OFFSET: -150,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        DEFAULT_HERO: "hero_drifter",
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        AMMO_CURRENT_SCALE: 239,
        AMMO_TOTAL_SCALE: 239,
        ENABLE_DAMAGE_FOUNTAIN: 1,
        PLAYER_HEALTHBAR_SCALE: 123
    },
    "iKaritzu": {
        MINIMAL_MINIMAP: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        BRIDGE_BUFF_START: 20,
        ENABLE_PASSIVE_COOLDOWN: 1,
        PASSIVE_COOLDOWN_SIZE: 37,
        VOICE_TYPE: 0,
        ENABLE_FULL_KEYBOARD_LAYOUT: 1,
        KEYBOARD_OVERLAY_SCALE: 80,
        KEYBOARD_OVERLAY_X_OFFSET: 270,
        KEYBOARD_OVERLAY_Y_OFFSET: 110,
        ENABLE_HUD_SHIFT: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        DEFAULT_HERO: "hero_vampirebat",
        ENABLE_ZIP_BOOST: 1,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 22,
        UNIT_TARGET_SIZE: 100,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        DISABLE_SHOP_BLUE: 1,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        RELOAD_COOLDOWN_OPACITY: 1,
        RELOAD_COOLDOWN_SIZE: 18,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        UNSECURED_SOUL_TIMER_SCALE: 84
    },
    "Scuffed": {
        DISABLE_SHOP_BLUE: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_CENTER_ESC: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_DAMAGE_FOUNTAIN: 1,
        ENABLE_FG_HEALTHBAR: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_KEYBOARD_OVERLAY: 1,
        ENABLE_LEGACY_COOLDOWNS: 1,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        HEALTHBAR_TYPE: 2,
        HUD_INDICATOR_SIZE: 22,
        KEYBOARD_OVERLAY_SCALE: 70,
        KEYBOARD_OVERLAY_X_OFFSET: -115,
        KEYBOARD_OVERLAY_Y_OFFSET: -90,
        MINIMAL_MINIMAP: 1,
        MINIMAP_SMALL_SIZE: 500,
        RELOAD_COOLDOWN_OPACITY: 0.8,
        RELOAD_COOLDOWN_SIZE: 20,
        UNIT_TARGET_OPACITY: 0.5,
        UNIT_TARGET_SIZE: 100,
        VOICE_TYPE: 8,
        ZIP_BOOST_SCALE: 110
    },
    "Gyzeh": {
        MINIMAP_SMALL_SIZE: 345,
        MINIMAP_Y_OFFSET: 55,
        ENABLE_INTERVAL: 1,
        BRIDGE_BUFF_START: 15,
        ULT_COOLDOWN_SIZE: 11,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        OLD_ITEM_COOLDOWNS_SCALE: 102,
        PASSIVE_COOLDOWN_SIZE: 37,
        PASSIVE_COOLDOWN_OPACITY: 0.45,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        VOICE_VOLUME: 45,
        ENABLE_KEYBOARD_OVERLAY: 1,
        KEYBOARD_OVERLAY_SCALE: 74,
        KEYBOARD_OVERLAY_X_OFFSET: -105,
        KEYBOARD_OVERLAY_Y_OFFSET: -95,
        DISABLE_DAMAGE_REPORT: 1,
        SUPPORT_4_3: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_HIDE_TROOPER_DAMAGE: 1,
        DISABLE_SHOP_BLUE: 1,
        SHOP_OFFSET_X: 45,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 15,
        ENABLE_RED_DIAMOND: 1,
        ENABLE_IMPROVED_HINT: 1,
        UNIT_TARGET_SIZE: 75,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_HIDE_COSMETIC_ABILITY: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        DEFAULT_HERO: "hero_vampirebat"
    },
    "Bread": {
        MINIMAP_SMALL_SIZE: 460,
        MINIMAL_MINIMAP: 1,
        MINIMAL_MINIMAP_OPACITY: 0.7,
        ENABLE_MINIMAP_ELEVATION_MARKERS: 1,
        MINIMAP_Y_OFFSET: 375,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        VOICE_TYPE: 0,
        DISABLE_QUICK_BUY: 1,
        ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
        ENABLE_SHOP_RECENT_PURCHASES: 1,
        RECENT_PURCHASES_QUICK_DISPLAY_SEC: 5,
        RECENT_PURCHASES_QUICK_Y_OFFSET: -20,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_NICKNAMES: 1,
        DISABLE_PLAYER_NAME_BLUR: 1,
        GAME_DEFAULT_DIFFICULTY: 2,
        DISABLE_SHOP_BLUE: 1,
        SHOP_OFFSET_Y: -60,
        ENABLE_SIMPLIFY_SHOP: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        DAMAGE_NUMBER_OPACITY: 0.5,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_CLEAN_STACKS: 1,
        ENABLE_LEGACY_COOLDOWNS: 1,
        ENABLE_STATLOCKER: 1,
        HUD_INDICATOR_SIZE: 10,
        UNIT_TARGET_SIZE: 100,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        DEFAULT_HERO: "hero_atlas"
    },
    "Vegas": {
        MINIMAP_SMALL_SIZE: 465,
        MINIMAL_MINIMAP: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        VOICE_TYPE: 1,
        DISABLE_QUICK_BUY: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 16,
        UNIT_TARGET_SIZE: 100,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_ABILITY_SUGGESTION: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1
    },
    "Goober": {
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_KEYBOARD_OVERLAY: 1,
        ENABLE_FULL_KEYBOARD_LAYOUT: 1,
        KEYBOARD_OVERLAY_X_OFFSET: -50,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1
    },
    "Hoot": {
        MINIMAP_SMALL_SIZE: 500,
        MINIMAL_MINIMAP: 1,
        RELOAD_COOLDOWN_OPACITY: 0.4,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        PASSIVE_COOLDOWN_SIZE: 30,
        VOICE_TYPE: 0,
        ENABLE_KEYBOARD_OVERLAY: 1,
        ENABLE_FULL_KEYBOARD_LAYOUT: 1,
        KEYBOARD_OVERLAY_SCALE: 70,
        KEYBOARD_OVERLAY_X_OFFSET: -50,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        DISABLE_SHOP_BLUE: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 22,
        UNIT_TARGET_SIZE: 100,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1
    },
    "Basil": {
        MINIMAP_SMALL_SIZE: 415,
        ENABLE_ALT_ZOOM: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        PASSIVE_COOLDOWN_SIZE: 42,
        PASSIVE_COOLDOWN_Y: -5,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        ENABLE_KEYBOARD_OVERLAY: 1,
        KEYBOARD_OVERLAY_SCALE: 75,
        KEYBOARD_OVERLAY_X_OFFSET: -70,
        KEYBOARD_OVERLAY_Y_OFFSET: -100,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_ZIP_BOOST: 1,
        ZIP_BOOST_X_OFFSET: -370,
        ENABLE_RED_DIAMOND: 1,
        UNIT_TARGET_SIZE: 65,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        ZIP_BOOST_SCALE: 80
    },
    "Panini": {
        ENABLE_TAB_ZOOM: 1,
        TAB_ZOOM_DRAW_OVER_UI: 1,
        TAB_ZOOM_OPACITY: 0.95,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        MINIMAP_LARGE_SIZE_TAB: 420,
        ZOOM_Y_OFFSET_TAB: 300
    },
    "SunnyD": {
        MINIMAP_SMALL_SIZE: 450,
        MINIMAL_MINIMAP: 1,
        MINIMAP_X_OFFSET: 70,
        PASSIVE_COOLDOWN_SIZE: 32,
        PASSIVE_COOLDOWN_Y: -6,
        ITEM_FILTER_OFF_PASSIVE: 0,
        ITEM_FILTER_OFF_ACTIVE: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_CENTER_ESC: 1,
        UNIT_TARGET_SIZE: 50,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        DISABLE_SHOP_BLUE: 1,
        SHOP_OFFSET_X: -135,
        ENABLE_HIDE_SMALL_NUMBERS: 1,
        ENABLE_HIDE_RELOAD_ICON: 1
    },
    "Piggy": {
        MINIMAP_SMALL_SIZE: 550,
        MINIMAL_MINIMAP: 1,
        MINIMAL_MINIMAP_OPACITY: 0.45,
        MINIMAP_X_OFFSET: 50,
        MINIMAP_Y_OFFSET: -40,
        AMMO_TEXT_COLOR: 2,
        ENABLE_HIDE_RELOAD_ICON: 1,
        COMBAT_STATUS_SCALE: 75,
        COMBAT_STATUS_X_OFFSET: -500,
        COMBAT_STATUS_Y_OFFSET: -500,
        ENABLE_ULT_COOLDOWNS: 1,
        ULT_COOLDOWN_OPACITY: 1,
        ULT_COOLDOWN_SIZE: 18,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        OLD_ITEM_COOLDOWNS_SCALE: 91,
        OLD_ITEM_COOLDOWNS_Y_OFFSET: -50,
        PASSIVE_COOLDOWN_SIZE: 33,
        PASSIVE_COOLDOWN_Y: 4,
        PASSIVE_COOLDOWN_OPACITY: 0.3,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_NICKNAMES: 1,
        ENABLE_CLEAN_DAMAGE_INDICATORS: 1,
        DAMAGE_IMPACT_OPACITY: 0.75,
        DAMAGE_IMPACT_Y_OFFSET: 80,
        GAME_DEFAULT_DIFFICULTY: 0,
        ENABLE_SHOP_STATS: 1,
        DISABLE_SHOP_BLUE: 1,
        SHOP_OFFSET_X: 50,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_ZIP_BOOST: 1,
        ZIP_BOOST_X_OFFSET: -225,
        ZIP_BOOST_Y_OFFSET: 10,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_HIDE_COSMETIC_ABILITY: 1,
        ENABLE_HIDE_BEHAVIOR_SUMMARY: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_TOPBAR_ALLY_HP_WARNING: 1,
        ENABLE_TOPBAR_ALLY_HP_WARNING_25: 1,
        PLAYER_HEALTHBAR_ACCENT_COLOR: 29,
        ENABLE_ENEMY_V2_ENHANCED: 1,
        ENABLE_ENEMY_V2_LEVEL: 0,
        MINIMALIST_HEALTHBAR_X_OFFSET: -150,
        MINIMALIST_HEALTHBAR_Y_OFFSET: -150,
        DEFAULT_HERO: "hero_hornet"
    },
    "NKD": {
        ENABLE_ALT_ZOOM: 1,
        ALT_ZOOM_OPACITY: 0.85,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        VOICE_TYPE: 0,
        ENABLE_KEYBOARD_OVERLAY: 1,
        ENABLE_FULL_KEYBOARD_LAYOUT: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 22,
        UNIT_TARGET_SIZE: 100,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1
    },
    "Ranger": {
        MINIMAP_BASE_OPACITY: 0.9,
        MINIMAL_MINIMAP: 1,
        ENABLE_ALT_ZOOM: 1,
        ALT_ZOOM_OPACITY: 0.65,
        ENABLE_PASSIVE_COOLDOWN: 1,
        PASSIVE_COOLDOWN_SIZE: 30,
        PASSIVE_COOLDOWN_OPACITY: 0.25,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        VOICE_TYPE: 0,
        ENABLE_KEYBOARD_OVERLAY: 1,
        KEYBOARD_OVERLAY_SCALE: 79,
        KEYBOARD_OVERLAY_X_OFFSET: 40,
        KEYBOARD_OVERLAY_Y_OFFSET: -35,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_SHOP_STATS: 1,
        DAMAGE_NUMBER_OPACITY: 0.15,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 15,
        UNIT_TARGET_SIZE: 100,
        UNIT_TARGET_OPACITY: 0.2,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        DISABLE_SHOP_BLUE: 1
    },
    "BSQTT": {
        MINIMAP_SMALL_SIZE: 570,
        MINIMAP_BASE_OPACITY: 0.8,
        MINIMAL_MINIMAP: 1,
        MINIMAP_X_OFFSET: -45,
        VOICE_TYPE: 0,
        SUPPORT_4_3: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        DEFAULT_HERO: "hero_vampirebat",
        DAMAGE_NUMBER_OPACITY: 0.75,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 29,
        UNIT_TARGET_SIZE: 100,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        SHOP_OFFSET_X: 90,
        RELOAD_COOLDOWN_OPACITY: 0.25,
        RELOAD_COOLDOWN_SIZE: 18
    },
    "Obikym": {
        MINIMAP_SMALL_SIZE: 455,
        MINIMAP_BASE_OPACITY: 0.95,
        MINIMAL_MINIMAP: 1,
        MINIMAP_X_OFFSET: -50,
        ENABLE_PASSIVE_COOLDOWN: 1,
        PASSIVE_COOLDOWN_SIZE: 30,
        PASSIVE_COOLDOWN_Y: -6,
        PASSIVE_COOLDOWN_OPACITY: 0.45,
        VOICE_TYPE: 0,
        ENABLE_SIMPLIFY_COMPASS: 1,
        KEYBOARD_OVERLAY_X_OFFSET: -50,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_ZIP_BOOST: 1,
        ZIP_BOOST_X_OFFSET: -450,
        ENABLE_CLEAN_STACKS: 1,
        UNIT_TARGET_SIZE: 50,
        UNIT_TARGET_OPACITY: 0.3,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        ZIP_BOOST_SCALE: 50,
        ENABLE_SIMPLIFY_ITEMS: 1,
        DISABLE_SHOP_BLUE: 1,
        ENABLE_HIDE_SMALL_NUMBERS: 1
    },
    "Haste": {
        MINIMAP_SMALL_SIZE: 500,
        MINIMAL_MINIMAP: 1,
        MINIMAP_X_OFFSET: -60,
        ENABLE_ALT_ZOOM: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_AMMO_STATUS: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        PASSIVE_COOLDOWN_SIZE: 36,
        VOICE_TYPE: 0,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 24,
        UNIT_TARGET_SIZE: 100,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1
    },
    "Clean": {
        MINIMAP_SMALL_SIZE: 600,
        MINIMAP_BASE_OPACITY: 0.9,
        MINIMAL_MINIMAP: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MINIMAP_ELEVATION_MARKERS: 1,
        MINIMAP_Y_OFFSET: 220,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_AMMO_STATUS: 1,
        ENABLE_HIDE_MAGAZINE: 1,
        AMMO_PANEL_SCALE: 150,
        AMMO_CURRENT_SCALE: 150,
        AMMO_TOTAL_SCALE: 150,
        AMMO_PANEL_X_OFFSET: 25,
        AMMO_PANEL_Y_OFFSET: -5,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        OLD_ITEM_COOLDOWNS_SCALE: 83,
        PASSIVE_COOLDOWN_SIZE: 30,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        VOICE_TYPE: 6,
        ENABLE_ENHANCED_QUICKBUY: 1,
        ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
        ENABLE_SHOP_RECENT_PURCHASES: 1,
        ENABLE_UNSPENT_SOULS: 1,
        UNSECURED_SOULS_HUD_X_OFFSET: 1000,
        UNSECURED_SOULS_HUD_Y_OFFSET: 930,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_HIDE_SMALL_NUMBERS: 1,
        ENABLE_HIDE_TROOPER_DAMAGE: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_SIMPLIFY_SHOP: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_ZIP_BOOST: 1,
        ZIP_BOOST_SCALE: 60,
        ZIP_BOOST_X_OFFSET: 630,
        ZIP_BOOST_Y_OFFSET: 940,
        UNSECURED_SOUL_TIMER_X_OFFSET: -800,
        UNSECURED_SOUL_TIMER_Y_OFFSET: 50,
        ENABLE_CLEAN_STACKS: 1,
        ENABLE_CENTER_ESC: 1,
        HUD_INDICATOR_SIZE: 26,
        UNIT_TARGET_SIZE: 100,
        UNIT_TARGET_OPACITY: 0.3,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_COSMETIC_ABILITY: 1,
        ENABLE_HIDE_BEHAVIOR_SUMMARY: 1,
        ENABLE_COMBAT_INDICATOR: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_COLOR_WARNING_75: 1,
        ENABLE_TOPBAR_ALLY_HP_WARNING: 1,
        ENABLE_TOPBAR_ALLY_HP_WARNING_25: 1,
        ENABLE_TOPBAR_ALLY_HP_WARNING_65: 1,
        ENABLE_TOPBAR_ALLY_HP_WARNING_75: 1,
        PLAYER_HEALTHBAR_SCALE: 125,
        PLAYER_HEALTHBAR_X_OFFSET: 150,
        DEFAULT_HERO: "hero_bookworm"
    },
    "Enhanced": {
        MINIMAP_SMALL_SIZE: 460,
        ENABLE_ALT_ZOOM: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1
    },
    "Maximum": {
        MINIMAP_SMALL_SIZE: 500,
        MINIMAL_MINIMAP: 1,
        ENABLE_ALT_ZOOM: 1,
        ENABLE_TAB_ZOOM: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_AMMO_STATUS: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        VOICE_TYPE: 0,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_SIMPLIFY_SHOP: 1,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 22,
        ENABLE_RED_DIAMOND: 1,
        UNIT_TARGET_SIZE: 100,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_SIMPLIFY_ABILITY_ICONS: 1,
        ENABLE_HIDE_BEHAVIOR_SUMMARY: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1
    },
    "billyyy": {
        MINIMAP_SMALL_SIZE: 500,
        MINIMAL_MINIMAP: 1,
        MINIMAP_Y_OFFSET: 150,
        TAB_ZOOM_OPACITY: 0.9,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_AMMO_STATUS: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        VOICE_TYPE: 1,
        ENABLE_KEYBOARD_OVERLAY: 1,
        KEYBOARD_OVERLAY_SCALE: 81,
        KEYBOARD_OVERLAY_Y_OFFSET: -180,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_SIMPLIFY_SHOP: 1,
        DAMAGE_NUMBER_OPACITY: 0.45,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_CLEAN_STACKS: 1,
        ENABLE_CENTER_ESC: 1,
        HUD_INDICATOR_SIZE: 35,
        ENABLE_RED_DIAMOND: 1,
        UNIT_TARGET_SIZE: 120,
        UNIT_TARGET_OPACITY: 0.8,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1
    },
    "Zer0": {
        MINIMAP_SMALL_SIZE: 465,
        MINIMAL_MINIMAP: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_AMMO_STATUS: 1,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        ENABLE_MINIMAP_REMINDER: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 22,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1
    },
    "Pops": {
        MINIMAP_SMALL_SIZE: 450,
        MINIMAP_BASE_OPACITY: 0.95,
        MINIMAL_MINIMAP: 1,
        MINIMAL_MINIMAP_OPACITY: 0.3,
        ENABLE_URN_COLORS: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_INTERVAL: 1,
        AMMO_PANEL_SCALE: 150,
        AMMO_CURRENT_SCALE: 150,
        ENABLE_RELOAD_COOLDOWN: 1,
        RELOAD_COOLDOWN_SIZE: 24,
        ENABLE_HIDE_RELOAD_ICON: 1,
        COMBAT_STATUS_SCALE: 178,
        COMBAT_STATUS_X_OFFSET: -940,
        COMBAT_STATUS_Y_OFFSET: -875,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        OLD_ITEM_COOLDOWNS_SCALE: 96,
        OLD_ITEM_COOLDOWNS_Y_OFFSET: 810,
        PASSIVE_COOLDOWN_SIZE: 35,
        PASSIVE_COOLDOWN_Y: -39,
        PASSIVE_COOLDOWN_OPACITY: 0.65,
        VOICE_TYPE: 0,
        ENABLE_COMPASS: 1,
        COMPASS_SCALE: 70,
        COMPASS_STRETCH_X: 200,
        COMPASS_STRETCH_Y: 70,
        COMPASS_Y_OFFSET: -675,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_UNSPENT_SOULS: 1,
        UNSECURED_SOULS_HUD_SCALE: 105,
        UNSECURED_SOULS_HUD_Y_OFFSET: 930,
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_SHOP_STATS: 1,
        DISABLE_SHOP_BLUE: 1,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        UNSECURED_SOUL_TIMER_SCALE: 75,
        UNSECURED_SOUL_TIMER_X_OFFSET: -1135,
        UNSECURED_SOUL_TIMER_Y_OFFSET: 20,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 22,
        UNIT_TARGET_SIZE: 100,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_SIMPLIFY_ABILITY_ICONS: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_ENEMY_COLORED_HEALTHBAR: 1,
        ENABLE_ENEMY_COLOR_WARNING_65: 1,
        ENABLE_ENEMY_COLOR_WARNING_75: 1,
        HEALTHBAR_TYPE: 4,
        PLAYER_HEALTHBAR_SCALE: 200,
        PLAYER_HEALTHBAR_OPACITY: 0.6,
        PLAYER_HEALTHBAR_X_OFFSET: -910,
        PLAYER_HEALTHBAR_Y_OFFSET: -875,
        ENABLE_ENEMY_V2_ENHANCED: 1,
        ENABLE_ENEMY_V2_ULT_INDICATOR: 0,
        ENABLE_ENEMY_V2_LEVEL: 0,
        ENABLE_ENEMY_ULT_INDICATOR: 1,
        ON_DEATH_GAME_FLAPPY_BAT: 1,
        ON_DEATH_GAME_ZERGGY_MANIA: 1,
        ON_DEATH_GAME_WHACK_A_REM: 1
    },
    "Wouwei": {
        MINIMAP_SMALL_SIZE: 500,
        MINIMAL_MINIMAP: 1,
        MINIMAP_X_OFFSET: -15,
        ENABLE_INTERVAL: 1,
        BRIDGE_BUFF_START: 35,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_LEGACY_COOLDOWNS: 1,
        OLD_ITEM_COOLDOWNS_SCALE: 107,
        OLD_ITEM_COOLDOWNS_X_OFFSET: 40,
        OLD_ITEM_COOLDOWNS_Y_OFFSET: 70,
        PASSIVE_COOLDOWN_SIZE: 39,
        PASSIVE_COOLDOWN_Y: -2,
        PASSIVE_COOLDOWN_X: 2,
        ENABLE_SIMPLIFY_COMPASS: 1,
        ENABLE_FULL_KEYBOARD_LAYOUT: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_CUMULATIVE_DMG: 0,
        ENABLE_GAME_AUDIO: 0,
        ENABLE_SHOP_STATS: 1,
        DAMAGE_NUMBER_OPACITY: 0.55,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_HIDE_SMALL_NUMBERS: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1
    },
    "Nairshark": {
        DEFAULT_HERO: "hero_shiv",
        ENABLE_AMMO_STATUS: 1,
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_CUMULATIVE_DMG: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_NICKNAMES: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_RED_DIAMOND: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        HUD_INDICATOR_SIZE: 20,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        KEYBOARD_OVERLAY_X_OFFSET: -115,
        MINIMAL_MINIMAP: 1,
        MINIMAP_X_OFFSET: -20,
        UNIT_TARGET_SIZE: 60,
        VOICE_TYPE: 5,
        ZIP_BOOST_SCALE: 90,
        ZIP_BOOST_X_OFFSET: -730,
        ZIP_BOOST_Y_OFFSET: 120
    },
    "bonclide": {
        MINIMAP_SMALL_SIZE: 450,
        MINIMAL_MINIMAP: 1,
        MINIMAP_X_OFFSET: -20,
        MINIMAP_Y_OFFSET: 15,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_INTERVAL: 1,
        BRIDGE_BUFF_START: 20,
        ENABLE_RELOAD_COOLDOWN: 1,
        RELOAD_COOLDOWN_OPACITY: 0.2,
        RELOAD_COOLDOWN_SIZE: 18,
        RELOAD_COOLDOWN_X_OFFSET: 2,
        RELOAD_COOLDOWN_Y_OFFSET: -40,
        COMBAT_STATUS_X_OFFSET: -800,
        COMBAT_STATUS_Y_OFFSET: -150,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        OLD_ITEM_COOLDOWNS_Y_OFFSET: -90,
        PASSIVE_COOLDOWN_Y: 6,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_DAMAGE_FOUNTAIN: 1,
        ENABLE_SHOP_STATS: 1,
        DISABLE_SHOP_BLUE: 1,
        ENABLE_SIMPLIFY_SHOP: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        DAMAGE_NUMBER_OPACITY: 0.6,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_CLEAN_STACKS: 1,
        ENABLE_CENTER_ESC: 1,
        HUD_INDICATOR_SIZE: 40,
        ENABLE_RED_DIAMOND: 1,
        ENABLE_IMPROVED_HINT: 1,
        UNIT_TARGET_SIZE: 100,
        UNIT_TARGET_OPACITY: 0.5,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_HIDE_COSMETIC_ABILITY: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        HEALTHBAR_TYPE: 4,
        PLAYER_HEALTHBAR_Y_OFFSET: 45
    },
    "Satanael": {
        MINIMAP_SMALL_SIZE: 430,
        MINIMAP_BASE_OPACITY: 0.95,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        BRIDGE_BUFF_START: 15,
        ENABLE_AMMO_STATUS: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        VOICE_TYPE: 1,
        ENABLE_COMPASS: 1,
        ENABLE_COMPASS_SPEED: 1,
        COMPASS_SCALE: 50,
        ENABLE_HUD_SHIFT: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_SHOP_STATS: 1,
        DISABLE_SHOP_BLUE: 1,
        DAMAGE_NUMBER_OPACITY: 0.9,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 24,
        UNIT_TARGET_SIZE: 100,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1
    },
    "Kr1stux": {
        MINIMAP_SMALL_SIZE: 520,
        MINIMAL_MINIMAP: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        PASSIVE_COOLDOWN_SIZE: 30,
        PASSIVE_COOLDOWN_Y: -8,
        PASSIVE_COOLDOWN_OPACITY: 0.25,
        ENABLE_KEYBOARD_OVERLAY: 1,
        KEYBOARD_OVERLAY_SCALE: 90,
        KEYBOARD_OVERLAY_X_OFFSET: 1000,
        KEYBOARD_OVERLAY_Y_OFFSET: -200,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 22,
        UNIT_TARGET_SIZE: 100,
        ENABLE_REJUV_HUD: 1
    },
    "Wrvth": {
        MINIMAP_SMALL_SIZE: 560,
        MINIMAP_LARGE_SIZE: 700,
        ZOOM_X_OFFSET: 1000,
        ZOOM_Y_OFFSET: 190,
        TAB_ZOOM_OPACITY: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        PASSIVE_COOLDOWN_SIZE: 35,
        PASSIVE_COOLDOWN_Y: 1,
        PASSIVE_COOLDOWN_OPACITY: 0.55,
        VOICE_TYPE: 0,
        ENABLE_COMPASS: 1,
        ENABLE_SIMPLIFY_COMPASS: 1,
        ENABLE_COMPASS_SPEED: 1,
        COMPASS_SCALE: 89,
        COMPASS_STRETCH_X: 50,
        COMPASS_STRETCH_Y: 50,
        COMPASS_X_OFFSET: -900,
        COMPASS_Y_OFFSET: 300,
        ENABLE_KEYBOARD_OVERLAY: 1,
        KEYBOARD_OVERLAY_SCALE: 76,
        KEYBOARD_OVERLAY_X_OFFSET: 420,
        KEYBOARD_OVERLAY_Y_OFFSET: -295,
        DISABLE_QUICK_BUY: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        DISABLE_SHOP_BLUE: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        DAMAGE_NUMBER_OPACITY: 0.95,
        ENABLE_HIDE_SMALL_NUMBERS: 1,
        ENABLE_ZIP_BOOST: 1,
        ZIP_BOOST_X_OFFSET: 520,
        ZIP_BOOST_Y_OFFSET: 920,
        ENABLE_CLEAN_STACKS: 1,
        ENABLE_CENTER_ESC: 1,
        HUD_INDICATOR_SIZE: 36,
        UNIT_TARGET_SIZE: 105,
        UNIT_TARGET_OPACITY: 0.8,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_HIDE_BEHAVIOR_SUMMARY: 1,
        ENABLE_REJUV_HUD: 1,
        MINIMAP_LARGE_SIZE_ALT: 700,
        ZOOM_X_OFFSET_ALT: 1000,
        ZOOM_Y_OFFSET_ALT: 190,
        MINIMAP_LARGE_SIZE_TAB: 710,
        ZOOM_X_OFFSET_TAB: 1000,
        ZOOM_Y_OFFSET_TAB: 485,
        AMMO_PANEL_Y_OFFSET: 5
    },
    "Jared": {
        ENABLE_BUFF_HUD: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_INTERVAL: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        HUD_INDICATOR_SIZE: 16,
        MINIMAL_MINIMAP: 1,
        MINIMAP_SMALL_SIZE: 465,
        OLD_ITEM_COOLDOWNS_SCALE: 83,
        PASSIVE_COOLDOWN_SIZE: 30,
        UNIT_TARGET_SIZE: 100,
        VOICE_TYPE: 8
    },
    "Bubsito": {
        MINIMAP_SMALL_SIZE: 410,
        MINIMAL_MINIMAP: 1,
        MINIMAP_X_OFFSET: 15,
        MINIMAP_Y_OFFSET: 10,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        VOICE_TYPE: 0,
        ENABLE_SIMPLIFY_COMPASS: 1,
        ENABLE_FULL_KEYBOARD_LAYOUT: 1,
        ENABLE_MINIMAP_REMINDER: 1,
        MINIMAP_REMINDER_INTERVAL: 25,
        DISABLE_QUICK_BUY: 1,
        ENABLE_HUD_SHIFT: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_SIMPLIFY_SHOP: 1,
        ENABLE_ZIP_BOOST: 1,
        ZIP_BOOST_X_OFFSET: -215,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 20,
        ENABLE_RED_DIAMOND: 1,
        UNIT_TARGET_SIZE: 75,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_ABILITY_SUGGESTION: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        ZIP_BOOST_SCALE: 108,
        ENABLE_SIMPLIFY_ITEMS: 1
    },
    "Wirdly": {
        ENABLE_BUFF_HUD: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        HUD_INDICATOR_SIZE: 22,
        MINIMAL_MINIMAP: 1,
        MINIMAL_MINIMAP_OPACITY: 1,
        UNIT_TARGET_SIZE: 100,
        VOICE_TYPE: 0
    },
    "Radiant": {
        ENABLE_AMMO_STATUS: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_CENTER_ESC: 1,
        ENABLE_CENTER_FRIENDS_LIST: 1,
        ENABLE_DAMAGE_FOUNTAIN: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_URN_DIFF: 1,
        MINIMAL_MINIMAP: 1,
        MINIMAP_SMALL_SIZE: 720,
        VOICE_TYPE: 8
    },
    "Chumba": {
        DEFAULT_HERO: "hero_doorman",
        ENABLE_DAMAGE_FOUNTAIN: 1,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        MINIMAL_MINIMAP: 1,
        MINIMAP_SMALL_SIZE: 450,
        OLD_ITEM_COOLDOWNS_SCALE: 83,
        PASSIVE_COOLDOWN_OPACITY: 0.25,
        PASSIVE_COOLDOWN_SIZE: 30
    },
    "FakeThread": {
        DEFAULT_HERO: "hero_familiar",
        DISABLE_SHOP_BLUE: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_DAMAGE_FOUNTAIN: 1,
        ENABLE_GAME_AUDIO: 0,
        ENABLE_HIDE_COSMETIC_ABILITY: 1,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SIMPLIFY_ABILITY_ICONS: 1,
        ENABLE_URN_DIFF: 1,
        MINIMAL_MINIMAP: 1,
        MINIMAP_SMALL_SIZE: 550
    },
    "7eventy7": {
        DEFAULT_HERO: "hero_familiar",
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
        ENABLE_HIDE_TESTING_TOOLS: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_TAB_ZOOM: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        MINIMAL_MINIMAP: 1,
        MINIMAP_LARGE_SIZE_TAB: 500,
        MINIMAP_REMINDER_INTERVAL: 30,
        TAB_ZOOM_OPACITY: 1,
        UNSECURED_SOUL_TIMER_SCALE: 90,
        ZOOM_X_OFFSET_TAB: 1355,
        ZOOM_Y_OFFSET_TAB: -480
    },
    "XD_HECTICC": {
        ENABLE_BUFF_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_COLOR_WARNING_75: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_ABILITY_SUGGESTION: 1,
        ENABLE_HIDE_SMALL_NUMBERS: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        HUD_INDICATOR_SIZE: 30,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        MINIMAL_MINIMAP: 1,
        MINIMAP_SMALL_SIZE: 465,
        UNIT_TARGET_SIZE: 100,
        VOICE_TYPE: 0
    },
    "Enova": {
        DEFAULT_HERO: "hero_forge",
        ENABLE_ALT_ZOOM: 1,
        ENABLE_AMMO_STATUS: 1,
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_COLOR_WARNING_75: 1,
        ENABLE_DAMAGE_FOUNTAIN: 1,
        ENABLE_FULL_KEYBOARD_LAYOUT: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_IMPROVED_HINT: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_KEYBOARD_OVERLAY: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_NICKNAMES: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_RED_DIAMOND: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_SIMPLIFY_ABILITY_ICONS: 1,
        ENABLE_SIMPLIFY_COMPASS: 1,
        ENABLE_SIMPLIFY_SHOP: 1,
        ENABLE_TAB_ZOOM: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        MINIMAL_MINIMAP: 1,
        MINIMAP_LARGE_SIZE_ALT: 650,
        MINIMAP_LARGE_SIZE_TAB: 550,
        PLAYER_HEALTHBAR_X_OFFSET: 115,
        TAB_ZOOM_DRAW_OVER_UI: 1,
        TAB_ZOOM_OPACITY: 0.8,
        VOICE_TYPE: 0,
        ZOOM_X_OFFSET_ALT: 1270,
        ZOOM_X_OFFSET_TAB: 1365,
        ZOOM_Y_OFFSET_ALT: -485,
        ZOOM_Y_OFFSET_TAB: -585
    },
    "Boredom": {
        DEFAULT_HERO: "hero_haze",
        DISABLE_DAMAGE_REPORT: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_CUMULATIVE_DMG: 0,
        ENABLE_GAME_AUDIO: 0,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_COSMETIC_ABILITY: 1,
        ENABLE_HIDE_SMALL_NUMBERS: 1,
        ENABLE_HIDE_TROOPER_DAMAGE: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        VOICE_VOLUME: 50
    },
    "PrivateProf": {
        ENABLE_AMMO_STATUS: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_COLOR_WARNING_75: 1,
        ENABLE_DAMAGE_FOUNTAIN: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_TESTING_TOOLS: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MINIMAP_REMINDER: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_URN_DIFF: 1,
        MINIMAP_REMINDER_INTERVAL: 30
    },
    "Munfins": {
        SETTINGS_THEME: 6,
        AMMO_PANEL_X_OFFSET: 15,
        ENABLE_ALT_ZOOM: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_MAGAZINE: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_SIMPLIFY_ABILITY_ICONS: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_SIMPLIFY_SHOP: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        MINIMAL_MINIMAP: 1,
        MINIMAP_SMALL_SIZE: 460
    },
    "Gmanc2": {
        DISABLE_SHOP_BLUE: 1,
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_IMPROVED_HINT: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_NICKNAMES: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_RED_DIAMOND: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        VOICE_TYPE: 5,
        VOICE_VOLUME: 85,
        ZIP_BOOST_SCALE: 110
    },
    "Keta": {
        DEFAULT_HERO: "hero_haze",
        DISABLE_SHOP_BLUE: 1,
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_GAME_AUDIO: 0,
        ENABLE_HIDE_COSMETIC_ABILITY: 1,
        ENABLE_HIDE_SMALL_NUMBERS: 1,
        ENABLE_HIDE_TROOPER_DAMAGE: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        HUD_INDICATOR_SIZE: 16,
        MINIMAL_MINIMAP: 1,
        MINIMAP_SMALL_SIZE: 465,
        UNIT_TARGET_SIZE: 100
    },
    "Torque": {
        BRIDGE_BUFF_START: 15,
        DEFAULT_HERO: "hero_punkgoat",
        DISABLE_SHOP_BLUE: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_GAME_AUDIO: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_HUD_SHIFT: 1,
        ENABLE_IMPROVED_HINT: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_NICKNAMES: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_RED_DIAMOND: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        VOICE_TYPE: 7
    },
    "iMicro": {
        BRIDGE_BUFF_START: 15,
        DEFAULT_HERO: "hero_vampirebat",
        DISABLE_SHOP_BLUE: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_GAME_AUDIO: 0,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_COSMETIC_ABILITY: 1,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_IMPROVED_HINT: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_RED_DIAMOND: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_SIMPLIFY_ABILITY_ICONS: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        MINIMAL_MINIMAP: 1,
        MINIMAP_REMINDER_INTERVAL: 5,
        MINIMAP_SMALL_SIZE: 460
    },
    "TW1G": {
        AMMO_CURRENT_SCALE: 300,
        AMMO_PANEL_SCALE: 300,
        AMMO_PANEL_X_OFFSET: 50,
        BRIDGE_BUFF_START: 15,
        DAMAGE_NUMBER_OPACITY: 0.35,
        DEFAULT_HERO: "hero_vampirebat",
        DISABLE_SHOP_BLUE: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_COLOR_WARNING_75: 1,
        ENABLE_DAMAGE_FOUNTAIN: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_RED_DIAMOND: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_SIMPLIFY_SHOP: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_UNSPENT_SOULS: 1,
        HEALTHBAR_TYPE: 3,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        MINIMAP_BASE_OPACITY: 0.9,
        MINIMAP_SMALL_SIZE: 450,
        OLD_ITEM_COOLDOWNS_Y_OFFSET: -30,
        PASSIVE_COOLDOWN_OPACITY: 0.6,
        PASSIVE_COOLDOWN_Y: 3,
        PLAYER_HEALTHBAR_OPACITY: 0.85,
        PLAYER_HEALTHBAR_SCALE: 125,
        RELOAD_COOLDOWN_OPACITY: 1,
        ULT_COOLDOWN_OPACITY: 0.25,
        ULT_COOLDOWN_SIZE: 20,
        VOICE_TYPE: 5
    },
    "Veradox": {
        ALT_ZOOM_DRAW_OVER_UI: 1,
        DISABLE_SHOP_BLUE: 1,
        ENABLE_AMMO_STATUS: 1,
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_COLOR_WARNING_75: 1,
        ENABLE_FULL_KEYBOARD_LAYOUT: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_IMPROVED_HINT: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_KEYBOARD_OVERLAY: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MINIMAP_REMINDER: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_NICKNAMES: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_RED_DIAMOND: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_TAB_ZOOM: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        KEYBOARD_OVERLAY_SCALE: 70,
        KEYBOARD_OVERLAY_X_OFFSET: -50,
        MINIMAL_MINIMAP_OPACITY: 0.65,
        MINIMAP_BASE_OPACITY: 0.65,
        MINIMAP_LARGE_SIZE_TAB: 560,
        MINIMAP_REMINDER_INTERVAL: 20,
        MINIMAP_SMALL_SIZE: 570,
        PLAYER_HEALTHBAR_OPACITY: 0.55,
        PLAYER_HEALTHBAR_SCALE: 132,
        TAB_ZOOM_OPACITY: 0.8
    },
    "Gambler": {
        MINIMAP_SMALL_SIZE: 350,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_AMMO_STATUS: 1,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        VOICE_TYPE: 0,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_ZIP_BOOST: 1,
        ZIP_BOOST_SCALE: 80,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 22,
        UNIT_TARGET_SIZE: 100,
        ENABLE_REJUV_HUD: 1
    },
    "Tuna": {
        MINIMAP_SMALL_SIZE: 460,
        MINIMAL_MINIMAP: 1,
        ENABLE_ALT_ZOOM: 1,
        ALT_ZOOM_OPACITY: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        BRIDGE_BUFF_START: 25,
        ENABLE_AMMO_STATUS: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        PASSIVE_COOLDOWN_Y: -5,
        VOICE_TYPE: 0,
        ENABLE_KEYBOARD_OVERLAY: 1,
        ENABLE_FULL_KEYBOARD_LAYOUT: 1,
        KEYBOARD_OVERLAY_SCALE: 104,
        KEYBOARD_OVERLAY_X_OFFSET: -55,
        ENABLE_MINIMAP_REMINDER: 1,
        DISABLE_QUICK_BUY: 1,
        ENABLE_HUD_SHIFT: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_ZIP_BOOST: 1,
        ZIP_BOOST_X_OFFSET: -105,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 50,
        UNIT_TARGET_SIZE: 125,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_SIMPLIFY_ABILITY_ICONS: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ZIP_BOOST_SCALE: 92,
        ENABLE_SIMPLIFY_ITEMS: 1,
        MINIMAP_LARGE_SIZE_ALT: 930,
        DISABLE_SHOP_BLUE: 1,
        ENABLE_HIDE_SMALL_NUMBERS: 1,
        ALT_ZOOM_DRAW_OVER_UI: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        UNSECURED_SOUL_TIMER_SCALE: 80,
        UNSECURED_SOULS_HUD_SCALE: 119,
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1
    },
    "Hikyo": {
        MINIMAL_MINIMAP: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        PASSIVE_COOLDOWN_SIZE: 30,
        PASSIVE_COOLDOWN_Y: -6,
        PASSIVE_COOLDOWN_OPACITY: 0.2,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        VOICE_TYPE: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_SIMPLIFY_SHOP: 1,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 22,
        UNIT_TARGET_SIZE: 100,
        ENABLE_SIMPLIFY_ABILITY_ICONS: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1
    },
    "Chjcago": {
        MINIMAP_BASE_OPACITY: 0.85,
        MINIMAL_MINIMAP: 1,
        MINIMAP_LARGE_SIZE_TAB: 400,
        TAB_ZOOM_OPACITY: 0.75,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        PASSIVE_COOLDOWN_Y: -2,
        PASSIVE_COOLDOWN_OPACITY: 0.25,
        ITEM_FILTER_DEF_ACTIVE: 1,
        VOICE_TYPE: 0,
        ENABLE_MINIMAP_REMINDER: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        DISABLE_SHOP_BLUE: 1,
        ENABLE_SIMPLIFY_SHOP: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 20,
        UNIT_TARGET_SIZE: 100,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1
    },
    "16:10": {
        MINIMAP_SMALL_SIZE: 360,
        MINIMAL_MINIMAP: 1,
        MINIMAP_X_OFFSET: -10,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        VOICE_TYPE: 0,
        ENABLE_SIMPLIFY_COMPASS: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        SUPPORT_16_10: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_SHOP_STATS: 1,
        DISABLE_SHOP_BLUE: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_ZIP_BOOST: 1,
        ZIP_BOOST_SCALE: 119,
        ZIP_BOOST_X_OFFSET: -320,
        ZIP_BOOST_Y_OFFSET: 30,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 22,
        ENABLE_RED_DIAMOND: 1,
        ENABLE_IMPROVED_HINT: 1,
        UNIT_TARGET_SIZE: 100,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_HIDE_COSMETIC_ABILITY: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_COLOR_WARNING_75: 1
    },
    "Starjadian": {
        MINIMAP_SMALL_SIZE: 500,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_ALT_ZOOM: 1,
        ALT_ZOOM_DRAW_OVER_UI: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_HIDE_MAGAZINE: 1,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        VOICE_TYPE: 0,
        ENABLE_KEYBOARD_OVERLAY: 1,
        ENABLE_FULL_KEYBOARD_LAYOUT: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_NICKNAMES: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_SIMPLIFY_SHOP: 1,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        ENABLE_LEGACY_COOLDOWNS: 1,
        ENABLE_RED_DIAMOND: 1,
        ENABLE_IMPROVED_HINT: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_HIDE_BEHAVIOR_SUMMARY: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_COLOR_WARNING_75: 1,
        ENABLE_MINIMALIST_HEALTHBAR: 1,
        HEALTHBAR_TYPE: 1,
        DISABLE_SHOP_BLUE: 1,
        DEFAULT_HERO_INDEX: 33
    },
    "Antetheosis": {
        DEFAULT_HERO: "hero_vampirebat",
        DISABLE_SHOP_BLUE: 1,
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_DAMAGE_FOUNTAIN: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_COSMETIC_ABILITY: 1,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_KEYBOARD_OVERLAY: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_NICKNAMES: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        KEYBOARD_OVERLAY_X_OFFSET: -110,
        MINIMAL_MINIMAP: 1,
        MINIMAP_SMALL_SIZE: 710,
        MINIMAP_X_OFFSET: 15,
        MINIMAP_Y_OFFSET: -30,
        OLD_ITEM_COOLDOWNS_SCALE: 91,
        OLD_ITEM_COOLDOWNS_Y_OFFSET: -50,
        PASSIVE_COOLDOWN_OPACITY: 0.3,
        PASSIVE_COOLDOWN_SIZE: 33,
        PASSIVE_COOLDOWN_Y: 4,
        ULT_COOLDOWN_OPACITY: 1,
        ULT_COOLDOWN_SIZE: 18,
        VOICE_TYPE: 0,
        VOICE_VOLUME: 80,
        ZIP_BOOST_SCALE: 81,
        ZIP_BOOST_X_OFFSET: -170,
        ZIP_BOOST_Y_OFFSET: 110
    },
    "k49": {
        DEFAULT_HERO: "hero_vampirebat",
        ENABLE_BUFF_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_COLOR_WARNING_75: 1,
        ENABLE_HIDE_COSMETIC_ABILITY: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_HIDE_SMALL_NUMBERS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_NICKNAMES: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        MINIMAL_MINIMAP: 1,
        MINIMAP_SMALL_SIZE: 495
    },
    "ninjabladeJr": {
        AMMO_CURRENT_SCALE: 125,
        AMMO_PANEL_SCALE: 125,
        AMMO_PANEL_X_OFFSET: 10,
        AMMO_PANEL_Y_OFFSET: 50,
        BRIDGE_BUFF_START: 25,
        DAMAGE_NUMBER_OPACITY: 0.25,
        DISABLE_SHOP_BLUE: 1,
        ENABLE_AMMO_STATUS: 1,
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BETTER_UNSECURED_SHOW_TEXT: 0,
        ENABLE_BUFF_HUD: 1,
        ENABLE_BUFF_SOUND_1: 0,
        ENABLE_BUFF_SOUND_3: 0,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_COLOR_WARNING_75: 1,
        ENABLE_DAMAGE_FOUNTAIN: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_MAGAZINE: 1,
        ENABLE_HIDE_RELOAD_CIRCLE: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_HIDE_TROOPER_DAMAGE: 1,
        ENABLE_IMPROVED_HINT: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_SIMPLIFY_SHOP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        HUD_INDICATOR_SIZE: 29,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        MINIMAL_MINIMAP: 1,
        OLD_ITEM_COOLDOWNS_SCALE: 165,
        PASSIVE_COOLDOWN_OPACITY: 0.9,
        PASSIVE_COOLDOWN_SIZE: 60,
        RELOAD_COOLDOWN_OPACITY: 1,
        RELOAD_COOLDOWN_SIZE: 31,
        RELOAD_COOLDOWN_Y_OFFSET: -25,
        SHOP_OFFSET_X: 90,
        ULT_COOLDOWN_SIZE: 25,
        UNIT_TARGET_OPACITY: 0.7,
        UNIT_TARGET_SIZE: 100,
        UNSECURED_SOULS_HUD_SCALE: 200,
        UNSECURED_SOUL_TIMER_SCALE: 200,
        UNSECURED_SOUL_TIMER_X_OFFSET: 530,
        UNSECURED_SOUL_TIMER_Y_OFFSET: 325,
        VOICE_TYPE: 0,
        VOICE_VOLUME: 46,
        ZIP_BOOST_SCALE: 165,
        ZIP_BOOST_X_OFFSET: -125
    },
    "FlintSnow": {
        ALT_ZOOM_DRAW_OVER_UI: 1,
        COMBAT_STATUS_SCALE: 75,
        COMBAT_STATUS_X_OFFSET: -500,
        COMBAT_STATUS_Y_OFFSET: -500,
        DEFAULT_HERO: "hero_gigawatt",
        DISABLE_SHOP_BLUE: 1,
        ENABLE_ALT_ZOOM: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_CLEAN_STACKS: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_COLOR_WARNING_75: 1,
        ENABLE_COMBAT_INDICATOR: 1,
        ENABLE_ENEMY_ULT_INDICATOR: 1,
        ENABLE_ENEMY_V2_ENHANCED: 1,
        ENABLE_ENEMY_V2_LEVEL: 0,
        ENABLE_ENHANCED_QUICKBUY: 1,
        ENABLE_KEYBOARD_OVERLAY: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_NICKNAMES: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SIMPLIFY_ABILITY_ICONS: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_TOPBAR_ALLY_HP_WARNING: 1,
        ENABLE_TOPBAR_ALLY_HP_WARNING_25: 1,
        ENABLE_TOPBAR_ALLY_HP_WARNING_65: 1,
        ENABLE_TOPBAR_ALLY_HP_WARNING_75: 1,
        ENABLE_TOPBAR_ENEMY_HP_WARNING: 1,
        ENABLE_TOPBAR_ENEMY_HP_WARNING_25: 1,
        ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 1,
        ENABLE_TOPBAR_ENEMY_HP_WARNING_75: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        GAME_DEFAULT_DIFFICULTY: 0,
        MINIMALIST_HEALTHBAR_X_OFFSET: -150,
        MINIMALIST_HEALTHBAR_Y_OFFSET: -150,
        MINIMAL_MINIMAP: 1,
        MINIMAL_MINIMAP_OPACITY: 1,
        VOICE_VOLUME: 0
    },
    "Steqdyy": {
        DEFAULT_HERO: "hero_shiv",
        ENABLE_BUFF_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_DAMAGE_FOUNTAIN: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_NICKNAMES: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        HUD_INDICATOR_SIZE: 25,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        MINIMAL_MINIMAP: 1,
        MINIMAP_SMALL_SIZE: 465,
        SUPPORT_16_10: 1,
        UNIT_TARGET_SIZE: 100,
        VOICE_TYPE: 7
    },
    "Synthronix": {
        BRIDGE_BUFF_START: 15,
        COMBAT_STATUS_SCALE: 75,
        COMBAT_STATUS_X_OFFSET: -500,
        COMBAT_STATUS_Y_OFFSET: -500,
        DEFAULT_HERO: "hero_haze",
        ENABLE_BUFF_HUD: 1,
        ENABLE_DAMAGE_FOUNTAIN: 1,
        ENABLE_ENEMY_ULT_INDICATOR: 1,
        ENABLE_ENEMY_V2_ENHANCED: 1,
        ENABLE_ENEMY_V2_LEVEL: 0,
        ENABLE_HIDE_BEHAVIOR_SUMMARY: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_NICKNAMES: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        GAME_DEFAULT_DIFFICULTY: 0,
        MINIMALIST_HEALTHBAR_X_OFFSET: -150,
        MINIMALIST_HEALTHBAR_Y_OFFSET: -150,
        MINIMAL_MINIMAP: 1,
        VOICE_TYPE: 0
    },
    "Synapses_": {
        DISABLE_SHOP_BLUE: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_FULL_KEYBOARD_LAYOUT: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_KEYBOARD_OVERLAY: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        KEYBOARD_OVERLAY_SCALE: 86,
        MINIMAL_MINIMAP: 1,
        MINIMAP_SMALL_SIZE: 320,
        OLD_ITEM_COOLDOWNS_SCALE: 94,
        PASSIVE_COOLDOWN_SIZE: 34,
        VOICE_TYPE: 8
    },
    "Gerglee": {
        DEFAULT_HERO: "hero_doorman",
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_COSMETIC_ABILITY: 1,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_COLORS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        MINIMAL_MINIMAP: 1,
        MINIMAP_SMALL_SIZE: 505,
        ULT_COOLDOWN_SIZE: 18,
        UNSECURED_SOULS_HUD_SCALE: 115,
        UNSECURED_SOUL_TIMER_SCALE: 91,
        VOICE_TYPE: 7,
        ZIP_BOOST_SCALE: 76
    },
    "Dappa": {
        ALT_ZOOM_DRAW_OVER_UI: 1,
        DISABLE_QUICK_BUY: 1,
        DISABLE_SHOP_BLUE: 1,
        ENABLE_ALT_ZOOM: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_BEHAVIOR_SUMMARY: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1
    },
    "Seyer": {
        DEFAULT_HERO: "hero_vampirebat",
        DISABLE_QUICK_BUY: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_INTERVAL: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        HUD_INDICATOR_SIZE: 16,
        MINIMAL_MINIMAP: 1,
        MINIMAP_SMALL_SIZE: 465,
        UNIT_TARGET_SIZE: 100,
        VOICE_TYPE: 5
    },
    "Shark": {
        MINIMAP_SMALL_SIZE: 450,
        MINIMAP_BASE_OPACITY: 0.95,
        MINIMAP_X_OFFSET: 235,
        ENABLE_ALT_ZOOM: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        VOICE_TYPE: 0,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 22,
        UNIT_TARGET_SIZE: 100,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        ZOOM_Y_OFFSET_ALT: -235,
        DISABLE_SHOP_BLUE: 1,
        SHOP_OFFSET_X: 125
    },
    "Neonvoid": {
        MINIMAP_LARGE_SIZE_TAB: 400,
        ZOOM_Y_OFFSET_TAB: 15,
        ENABLE_TAB_ZOOM: 1,
        TAB_ZOOM_OPACITY: 1,
        TAB_ZOOM_DRAW_OVER_UI: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_INTERVAL: 1,
        BRIDGE_BUFF_START: 15,
        ENABLE_AMMO_STATUS: 1,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        VOICE_TYPE: 0,
        ENABLE_SIMPLIFY_COMPASS: 1,
        COMPASS_SCALE: 50,
        COMPASS_Y_OFFSET: 240,
        ENABLE_HUD_SHIFT: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 22,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_MINIMALIST_HEALTHBAR: 1
    },
    "Fenmore": {
        MINIMAP_SMALL_SIZE: 495,
        MINIMAL_MINIMAP: 1,
        MINIMAP_LARGE_SIZE_ALT: 570,
        ZOOM_X_OFFSET_ALT: -500,
        ZOOM_Y_OFFSET_ALT: 780,
        MINIMAP_LARGE_SIZE_TAB: 570,
        ZOOM_X_OFFSET_TAB: -500,
        ZOOM_Y_OFFSET_TAB: -500,
        ENABLE_AMMO_STATUS: 1,
        ENABLE_RELOAD_COOLDOWN: 1,
        RELOAD_COOLDOWN_OPACITY: 0.3,
        RELOAD_COOLDOWN_SIZE: 54,
        RELOAD_COOLDOWN_X_OFFSET: 75,
        RELOAD_COOLDOWN_Y_OFFSET: -38,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ULT_COOLDOWN_SIZE: 20,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        PASSIVE_COOLDOWN_SIZE: 32,
        PASSIVE_COOLDOWN_Y: -4,
        PASSIVE_COOLDOWN_OPACITY: 0.6,
        VOICE_TYPE: 0,
        COMPASS_STRETCH_X: 75,
        COMPASS_STRETCH_Y: 75,
        DISABLE_QUICK_BUY: 1,
        ENABLE_UNSPENT_SOULS: 1,
        UNSECURED_SOULS_HUD_SCALE: 166,
        UNSECURED_SOULS_HUD_X_OFFSET: 115,
        UNSECURED_SOULS_HUD_Y_OFFSET: 920,
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON_TEXT: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        SHOP_OFFSET_X: 70,
        ENABLE_SIMPLIFY_ITEMS: 1,
        DAMAGE_NUMBER_OPACITY: 0.9,
        ENABLE_ZIP_BOOST: 1,
        ZIP_BOOST_X_OFFSET: 10,
        ZIP_BOOST_Y_OFFSET: 5,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        UNSECURED_SOUL_TIMER_SCALE: 75,
        UNSECURED_SOUL_TIMER_X_OFFSET: -845,
        UNSECURED_SOUL_TIMER_Y_OFFSET: 25,
        STAT_BONUSES_SCALE: 75,
        STAT_BONUSES_X_OFFSET: -500,
        STAT_BONUSES_Y_OFFSET: 640,
        ENABLE_CLEAN_STACKS: 1,
        HUD_INDICATOR_SIZE: 24,
        ENABLE_RED_DIAMOND: 1,
        UNIT_TARGET_SIZE: 195,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_HIDE_COSMETIC_ABILITY: 1,
        ENABLE_HIDE_BEHAVIOR_SUMMARY: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_MINIMALIST_HEALTHBAR: 1,
        MINIMALIST_HEALTHBAR_Y_OFFSET: -125,
        DEFAULT_HERO: "hero_familiar"
    },
    "Deethirty": {
        MINIMAP_SMALL_SIZE: 560,
        MINIMAL_MINIMAP: 1,
        MINIMAP_LARGE_SIZE_ALT: 520,
        ZOOM_X_OFFSET_ALT: -825,
        ZOOM_Y_OFFSET_ALT: -750,
        MINIMAP_LARGE_SIZE_TAB: 900,
        ZOOM_X_OFFSET_TAB: -825,
        ZOOM_Y_OFFSET_TAB: -750,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_HIDE_MAGAZINE: 1,
        AMMO_PANEL_SCALE: 112,
        AMMO_CURRENT_SCALE: 112,
        AMMO_TOTAL_SCALE: 112,
        AMMO_PANEL_X_OFFSET: -200,
        RELOAD_COOLDOWN_OPACITY: 0.1,
        RELOAD_COOLDOWN_SIZE: 16,
        ENABLE_HIDE_RELOAD_CIRCLE: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        VOICE_TYPE: 0,
        COMPASS_STRETCH_X: 158,
        COMPASS_STRETCH_Y: 75,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_MISSING_HERO: 1,
        ON_DEATH_GAME_MINESWEEPER: 1,
        ON_DEATH_GAME_BLACKJACK: 1,
        ON_DEATH_GAME_FLAPPY_BAT: 1,
        ON_DEATH_GAME_GRAVES_TRAINER: 1,
        ON_DEATH_GAME_ZERGGY_MANIA: 1,
        ON_DEATH_GAME_WHACK_A_REM: 1,
        DISABLE_SHOP_BLUE: 1,
        SHOP_OFFSET_X: -120,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ZIP_BOOST_SCALE: 75,
        ZIP_BOOST_X_OFFSET: -480,
        ZIP_BOOST_Y_OFFSET: 250,
        UNSECURED_SOUL_TIMER_SCALE: 56,
        UNSECURED_SOUL_TIMER_X_OFFSET: -680,
        UNSECURED_SOUL_TIMER_Y_OFFSET: 1000,
        ENABLE_STAT_BONUSES: 1,
        STAT_BONUSES_SCALE: 99,
        STAT_BONUSES_X_OFFSET: -680,
        STAT_BONUSES_Y_OFFSET: 655,
        HUD_INDICATOR_SIZE: 42,
        UNIT_TARGET_SIZE: 110,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_SIMPLIFY_ABILITY_ICONS: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_COLOR_WARNING_75: 1
    },
    "Jerboa": {
        MINIMAL_MINIMAP: 1,
        MINIMAL_MINIMAP_OPACITY: 0.3,
        ENABLE_URN_COLORS: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_BUFF_SOUND_1: 0,
        ENABLE_BUFF_SOUND_3: 0,
        ENABLE_AMMO_STATUS: 1,
        ENABLE_HIDE_AMMO_ALL: 1,
        ENABLE_HIDE_MAGAZINE: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        COMBAT_STATUS_SCALE: 178,
        COMBAT_STATUS_X_OFFSET: -940,
        COMBAT_STATUS_Y_OFFSET: -875,
        ENABLE_PASSIVE_COOLDOWN: 1,
        VOICE_VOLUME: 40,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_HIDE_TROOPER_DAMAGE: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_CLEAN_STACKS: 1,
        ENABLE_CENTER_ESC: 1,
        HUD_INDICATOR_SIZE: 24,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_HIDE_COSMETIC_ABILITY: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_ENEMY_COLORED_HEALTHBAR: 1,
        ENABLE_ENEMY_COLOR_WARNING_25: 1,
        ENABLE_ENEMY_COLOR_WARNING_65: 1,
        ENABLE_ENEMY_COLOR_WARNING_75: 1,
        ENABLE_FG_HEALTHBAR: 1,
        HEALTHBAR_TYPE: 2,
        PLAYER_HEALTHBAR_SCALE: 200,
        PLAYER_HEALTHBAR_OPACITY: 0.35,
        PLAYER_HEALTHBAR_X_OFFSET: -750,
        PLAYER_HEALTHBAR_Y_OFFSET: 405,
        ENABLE_ENEMY_V2_ENHANCED: 1,
        ENABLE_ENEMY_V2_ULT_INDICATOR: 0,
        ENABLE_ENEMY_V2_LEVEL: 0,
        ENABLE_ENEMY_ULT_INDICATOR: 1,
        ON_DEATH_GAME_ZERGGY_MANIA: 1,
        ON_DEATH_GAME_WHACK_A_REM: 1
    },
    "Poshy": {
        MINIMAP_SMALL_SIZE: 600,
        MINIMAL_MINIMAP: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_CLEAN_STACKS: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1
    },
    "Saintmxsm": {
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_INTERVAL: 1,
        RELOAD_COOLDOWN_OPACITY: 0.4,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        OLD_ITEM_COOLDOWNS_SCALE: 96,
        PASSIVE_COOLDOWN_SIZE: 35,
        PASSIVE_COOLDOWN_OPACITY: 0.75,
        KEYBOARD_OVERLAY_SCALE: 70,
        KEYBOARD_OVERLAY_X_OFFSET: -50,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_MISSING_HERO: 1,
        DISABLE_SHOP_BLUE: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_ZIP_BOOST: 1,
        ENABLE_LEGACY_COOLDOWNS: 1,
        HUD_INDICATOR_SIZE: 22,
        UNIT_TARGET_SIZE: 100,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_REJUV_HUD: 1,
        LANGUAGE: 1,
        DEFAULT_HERO: "hero_orion"
    },
    "RiChew": {
        BRIDGE_BUFF_START: 20,
        DEFAULT_HERO: "hero_priest",
        ENABLE_BUFF_HUD: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_INTERVAL: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_SIMPLIFY_SHOP: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        HUD_INDICATOR_SIZE: 28,
        MINIMAP_SMALL_SIZE: 510,
        VOICE_TYPE: 0
    },
    "Soramikali": {
        DEFAULT_HERO: "hero_ghost",
        ENABLE_BUFF_HUD: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_DAMAGE_FOUNTAIN: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MIN_SOULS: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_NICKNAMES: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_OLD_ITEM_COOLDOWNS: 0,
        ENABLE_ONE_TIME: 1,
        ENABLE_ONE_TIME_TIER1: 1,
        ENABLE_ONE_TIME_TIER2: 1,
        ENABLE_ONE_TIME_TIER3: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        ENABLE_UNSPENT_SOULS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        HUD_INDICATOR_SIZE: 20,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        OLD_ITEM_COOLDOWNS_SCALE: 102,
        OLD_ITEM_COOLDOWNS_Y_OFFSET: -70,
        PASSIVE_COOLDOWN_OPACITY: 0.75,
        PASSIVE_COOLDOWN_SIZE: 37,
        PASSIVE_COOLDOWN_Y: 5,
        VOICE_TYPE: 0
    },
    "Joey": {
        DEFAULT_HERO: "hero_lash",
        DISABLE_SHOP_BLUE: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_CLEAN_STACKS: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_COSMETIC_ABILITY: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_URN_DIFF: 1,
        MINIMAP_BASE_OPACITY: 0.85
    },
    "Jaundice": {
        DAMAGE_REPORT_X_OFFSET: 25,
        DAMAGE_REPORT_Y_OFFSET: 105,
        DEFAULT_HERO: "hero_lash",
        ENABLE_BUFF_HUD: 1,
        ENABLE_CENTER_ESC: 1,
        ENABLE_CLEAN_STACKS: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_COLOR_WARNING_75: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_HIDE_TROOPER_DAMAGE: 1,
        ENABLE_IMPROVED_HINT: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_RED_DIAMOND: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_TOPBAR_ALLY_HP_WARNING: 1,
        ENABLE_TOPBAR_ALLY_HP_WARNING_25: 1,
        ENABLE_TOPBAR_ALLY_HP_WARNING_65: 1,
        ENABLE_TOPBAR_ENEMY_HP_WARNING: 1,
        ENABLE_TOPBAR_ENEMY_HP_WARNING_25: 1,
        ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_URN_DIFF: 1,
        HEALTHBAR_TYPE: 3,
        HUD_INDICATOR_SIZE: 32,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        MINIMAL_MINIMAP: 1,
        MINIMAL_MINIMAP_OPACITY: 0.4,
        MINIMAP_SMALL_SIZE: 455,
        OLD_ITEM_COOLDOWNS_Y_OFFSET: 130,
        PASSIVE_COOLDOWN_Y: -5,
        PLAYER_HEALTHBAR_OPACITY: 0.6,
        PLAYER_HEALTHBAR_SCALE: 84,
        PLAYER_HEALTHBAR_Y_OFFSET: 45,
        ULT_COOLDOWN_OPACITY: 0.65
    },
    "Xavier": {
        ENABLE_BUFF_HUD: 1,
        ENABLE_INTERVAL: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1
    },
    "Spookyy": {
        DEFAULT_HERO: "hero_priest",
        DISABLE_SHOP_BLUE: 1,
        ENABLE_BETTER_UNSECURED: 1,
        ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_HERO_SCENE_PANEL: 0,
        ENABLE_HIDE_BEHAVIOR_SUMMARY: 1,
        ENABLE_HIDE_FAILED_HINT: 1,
        ENABLE_HIDE_RELOAD_ICON: 1,
        ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MINIMAP_REJUV_TIMER: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_OBJ_MAP: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_RELOAD_COOLDOWN: 1,
        ENABLE_SHOP_STATS: 1,
        ENABLE_SIMPLIFY_ITEMS: 1,
        ENABLE_SIMPLIFY_SHOP: 1,
        ENABLE_URN_DIFF: 1,
        ENABLE_ZIP_BOOST: 1,
        HUD_INDICATOR_SIZE: 12,
        ITEM_FILTER_DEF_ACTIVE: 1,
        ITEM_FILTER_OFF_ACTIVE: 1,
        MINIMAL_MINIMAP: 1,
        MINIMAP_SMALL_SIZE: 465,
        OLD_ITEM_COOLDOWNS_SCALE: 83,
        PASSIVE_COOLDOWN_SIZE: 30,
        UNIT_TARGET_SIZE: 100,
        VOICE_TYPE: 0,
        VOICE_VOLUME: 0
    },
    "Zyartic": {
        DEFAULT_HERO: "hero_orion",
        ENABLE_AMMO_STATUS: 1,
        ENABLE_BUFF_HUD: 1,
        ENABLE_CLEAN_STACKS: 1,
        ENABLE_COLORED_HEALTHBAR: 1,
        ENABLE_COLOR_WARNING_25: 1,
        ENABLE_COLOR_WARNING_65: 1,
        ENABLE_HIDE_ABILITY_SUGGESTION: 1,
        ENABLE_LANE_WITH_PARTY: 1,
        ENABLE_MINIMAP_BUFF_TIMER: 1,
        ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
        ENABLE_MISSING_HERO: 1,
        ENABLE_NICKNAMES: 1,
        ENABLE_OBJ_DMG: 1,
        ENABLE_PASSIVE_COOLDOWN: 1,
        ENABLE_REJUV_HUD: 1,
        ENABLE_ULT_COOLDOWNS: 1,
        ENABLE_UNSECURED_SOUL_TIMER: 1,
        ENABLE_ZIP_BOOST: 1,
        HEALTHBAR_TYPE: 3,
        HUD_INDICATOR_SIZE: 20,
        OLD_ITEM_COOLDOWNS_SCALE: 118,
        OLD_ITEM_COOLDOWNS_Y_OFFSET: 130,
        PASSIVE_COOLDOWN_OPACITY: 0.6,
        PASSIVE_COOLDOWN_SIZE: 43,
        PASSIVE_COOLDOWN_Y: -5,
        PLAYER_HEALTHBAR_SCALE: 128,
        PLAYER_HEALTHBAR_X_OFFSET: -210,
        PLAYER_HEALTHBAR_Y_OFFSET: 330,
        ULT_COOLDOWN_SIZE: 12,
        ZIP_BOOST_SCALE: 67,
        ZIP_BOOST_X_OFFSET: -195
    },
    "Special": {
        ENABLE_SPECIALS: 1
    },
    "4:3": {
        SUPPORT_4_3: 1,
        DISABLE_DAMAGE_REPORT: 1
    },
};

// Community presets migrated from settings strings. Keep these as hardcoded
// setting objects so preset application never depends on import-code paths.
QOL_PRESETS["Sneed"] = {
    AMMO_CURRENT_SCALE: 239,
    AMMO_PANEL_SCALE: 239,
    AMMO_PANEL_X_OFFSET: -80,
    AMMO_PANEL_Y_OFFSET: -150,
    AMMO_TOTAL_SCALE: 239,
    DEFAULT_HERO: "hero_drifter",
    ENABLE_AMMO_STATUS: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_DAMAGE_FOUNTAIN: 1,
    ENABLE_ENHANCED_QUICKBUY: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_HIDE_FAILED_HINT: 1,
    ENABLE_HIDE_MAGAZINE: 1,
    ENABLE_HIDE_RELOAD_ICON: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_OLD_ITEM_COOLDOWNS: 0,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER2: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_RELOAD_COOLDOWN: 1,
    ENABLE_SHOP_CLICK_TO_NOTIFY: 1,
    ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
    ENABLE_SHOP_RECENT_PURCHASES: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    HUD_INDICATOR_SIZE: 41,
    MINIMAL_MINIMAP: 1,
    MINIMAP_BASE_OPACITY: 0.8,
    MINIMAP_SMALL_SIZE: 480,
    MINIMAP_X_OFFSET: -35,
    MINIMAP_Y_OFFSET: 255,
    PLAYER_HEALTHBAR_SCALE: 123,
    RECENT_PURCHASES_QUICK_DISPLAY_SEC: 5,
    RECENT_PURCHASES_QUICK_MAX: 2,
    UNIT_TARGET_SIZE: 100,
    VOICE_TYPE: 6
};
QOL_PRESETS["Vegas"] = {
    DISABLE_QUICK_BUY: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_HIDE_ABILITY_SUGGESTION: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER2: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    HUD_INDICATOR_SIZE: 16,
    MINIMAL_MINIMAP: 1,
    MINIMAP_SMALL_SIZE: 465,
    UNIT_TARGET_SIZE: 100,
    VOICE_TYPE: 0
};
QOL_PRESETS["Piggy"] = {
    AMMO_TEXT_COLOR: 2,
    COMBAT_STATUS_SCALE: 75,
    COMBAT_STATUS_X_OFFSET: -500,
    COMBAT_STATUS_Y_OFFSET: -500,
    DAMAGE_IMPACT_OPACITY: 0.75,
    DAMAGE_IMPACT_Y_OFFSET: 80,
    DEFAULT_HERO: "hero_hornet",
    DISABLE_SHOP_BLUE: 1,
    ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
    ENABLE_CLEAN_DAMAGE_INDICATORS: 1,
    ENABLE_ENEMY_V2_ENHANCED: 1,
    ENABLE_ENEMY_V2_LEVEL: 0,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_HIDE_BEHAVIOR_SUMMARY: 1,
    ENABLE_HIDE_COSMETIC_ABILITY: 1,
    ENABLE_HIDE_FAILED_HINT: 1,
    ENABLE_HIDE_RELOAD_ICON: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_NICKNAMES: 1,
    ENABLE_OLD_ITEM_COOLDOWNS: 0,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_SIMPLIFY_ITEMS: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_25: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    GAME_DEFAULT_DIFFICULTY: 0,
    MINIMALIST_HEALTHBAR_X_OFFSET: -150,
    MINIMALIST_HEALTHBAR_Y_OFFSET: -150,
    MINIMAL_MINIMAP: 1,
    MINIMAL_MINIMAP_OPACITY: 0.45,
    MINIMAP_SMALL_SIZE: 550,
    MINIMAP_X_OFFSET: 50,
    MINIMAP_Y_OFFSET: -40,
    OLD_ITEM_COOLDOWNS_SCALE: 91,
    OLD_ITEM_COOLDOWNS_Y_OFFSET: -50,
    PASSIVE_COOLDOWN_OPACITY: 0.3,
    PASSIVE_COOLDOWN_SIZE: 33,
    PASSIVE_COOLDOWN_Y: 4,
    PLAYER_HEALTHBAR_ACCENT_COLOR: 29,
    SHOP_OFFSET_X: 50,
    ULT_COOLDOWN_OPACITY: 1,
    ULT_COOLDOWN_SIZE: 18,
    ZIP_BOOST_X_OFFSET: -225,
    ZIP_BOOST_Y_OFFSET: 10
};
QOL_PRESETS["bonclide"] = {
    AMMO_CURRENT_SCALE: 140,
    AMMO_PANEL_SCALE: 140,
    BOTTOM_BAR_OPACITY: 0.75,
    BOTTOM_BAR_SCALE: 0.9,
    BOTTOM_BAR_Y_OFFSET: 10,
    BRIDGE_BUFF_START: 20,
    CHAT_SCALE: 85,
    CHAT_X_OFFSET: 400,
    DAMAGE_IMPACT_OPACITY: 0.5,
    DAMAGE_IMPACT_SCALE: 0.95,
    DAMAGE_IMPACT_Y_OFFSET: -450,
    DAMAGE_NUMBER_OPACITY: 0.35,
    DAMAGE_REPORT_Y_OFFSET: -175,
    DEFAULT_HERO: "hero_atlas",
    DISABLE_PLAYER_NAME_BLUR: 1,
    DISABLE_SHOP_BLUE: 1,
    ENABLE_BETTER_UNSECURED: 1,
    ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COLORED_HEALTHBAR: 1,
    ENABLE_COLOR_WARNING_25: 1,
    ENABLE_COLOR_WARNING_65: 1,
    ENABLE_COMBAT_INDICATOR: 1,
    ENABLE_DAMAGE_FOUNTAIN: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_HIDE_COSMETIC_ABILITY: 1,
    ENABLE_HIDE_FAILED_HINT: 1,
    ENABLE_HIDE_RELOAD_ICON: 1,
    ENABLE_IMPROVED_HINT: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_LEGACY_COOLDOWNS: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_RED_DIAMOND: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_RELOAD_COOLDOWN: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_SIMPLIFY_ABILITY_ICONS: 1,
    ENABLE_SIMPLIFY_ITEMS: 1,
    ENABLE_SIMPLIFY_SHOP: 1,
    ENABLE_SIMPLIFY_SHOP_STATS: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_25: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    HEALTHBAR_TYPE: 3,
    HUD_INDICATOR_SIZE: 36,
    ITEMS_OPACITY: 0.75,
    MINIMAL_MINIMAP: 1,
    MINIMAL_MINIMAP_OPACITY: 0.5,
    MINIMAP_BASE_OPACITY: 0.9,
    MINIMAP_REM_TUNNELS_OPACITY: 0.05,
    MINIMAP_SMALL_SIZE: 450,
    MINIMAP_Y_OFFSET: 30,
    OLD_ITEM_COOLDOWNS_Y_OFFSET: 130,
    PASSIVE_COOLDOWN_Y: -5,
    PLAYER_HEALTHBAR_OPACITY: 0.75,
    PLAYER_HEALTHBAR_SCALE: 110,
    PLAYER_HEALTHBAR_X_OFFSET: -335,
    PLAYER_HEALTHBAR_Y_OFFSET: 50,
    RELOAD_COOLDOWN_SIZE: 16,
    SHOP_OFFSET_X: 175,
    SHOP_OPACITY: 0.8,
    SHOP_SCALE: 0.9,
    SOULS_OPACITY: 0.5,
    SUPPORT_4_3: 1,
    TOP_BAR_OPACITY: 0.5,
    UNIT_TARGET_OPACITY: 0.45,
    UNSECURED_SOULS_HUD_X_OFFSET: 40,
    VOICE_VOLUME: 20,
    ZIP_BOOST_X_OFFSET: -285,
    ZIP_BOOST_Y_OFFSET: 120
};
QOL_PRESETS["Starjadian"] = {
    ALT_ZOOM_DRAW_OVER_UI: 1,
    DEFAULT_HERO: "hero_necro",
    DISABLE_SHOP_BLUE: 1,
    ENABLE_ALT_ZOOM: 1,
    ENABLE_ALT_ZOOM_REM_TUNNELS: 1,
    ENABLE_BETTER_UNSECURED: 1,
    ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_DAMAGE_INDICATORS: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COLORED_HEALTHBAR: 1,
    ENABLE_COLOR_WARNING_25: 1,
    ENABLE_COLOR_WARNING_65: 1,
    ENABLE_COLOR_WARNING_75: 1,
    ENABLE_COMBAT_INDICATOR: 1,
    ENABLE_DL4D_REMINDERS: 1,
    ENABLE_ENHANCED_QUICKBUY: 1,
    ENABLE_FULL_KEYBOARD_LAYOUT: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_HIDE_BEHAVIOR_SUMMARY: 1,
    ENABLE_HIDE_COSMETIC_ABILITY: 1,
    ENABLE_HIDE_FAILED_HINT: 1,
    ENABLE_HIDE_MAGAZINE: 1,
    ENABLE_HIDE_RELOAD_ICON: 1,
    ENABLE_IMPROVED_HINT: 1,
    ENABLE_KEYBOARD_OVERLAY: 1,
    ENABLE_LEGACY_COOLDOWNS: 1,
    ENABLE_MINIMALIST_HEALTHBAR: 1,
    ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
    ENABLE_MINIMAP_ELEVATION_MARKERS: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_NICKNAMES: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_OLD_ITEM_COOLDOWNS: 0,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_QUICKBUY_CLICK_TO_NOTIFY: 1,
    ENABLE_RED_DIAMOND: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_RELOAD_COOLDOWN: 1,
    ENABLE_SHOP_CLICK_TO_NOTIFY: 1,
    ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_SHOW_BUILD_ID: 1,
    ENABLE_SIMPLIFY_ITEMS: 1,
    ENABLE_SIMPLIFY_SHOP: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_25: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_65: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_75: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_25: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_75: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_UNSECURED_SOUL_TIMER: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    HEALTHBAR_TYPE: 1,
    MINIMAP_SMALL_SIZE: 500,
    RECENT_PURCHASES_QUICK_Y_OFFSET: -30,
    VOICE_TYPE: 0
};
QOL_PRESETS["Synthronix"] = {
    BRIDGE_BUFF_START: 15,
    DEFAULT_HERO: "hero_haze",
    ENABLE_BUFF_HUD: 1,
    ENABLE_DAMAGE_FOUNTAIN: 1,
    ENABLE_ENHANCED_QUICKBUY: 1,
    ENABLE_HIDE_BEHAVIOR_SUMMARY: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_OLD_ITEM_COOLDOWNS: 0,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER2: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SHOP_CLICK_TO_NOTIFY: 1,
    ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    MINIMAL_MINIMAP: 1,
    RECENT_PURCHASES_QUICK_SCALE: 0.9,
    RECENT_PURCHASES_QUICK_SCOREBOARD: 0,
    VOICE_TYPE: 0
};
QOL_PRESETS["Soramikali"] = {
    AMMO_TEXT_COLOR: 13,
    DEFAULT_HERO: "hero_ghost",
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COLORED_HEALTHBAR: 1,
    ENABLE_COLOR_WARNING_65: 1,
    ENABLE_COMBAT_INDICATOR: 1,
    ENABLE_DAMAGE_FOUNTAIN: 1,
    ENABLE_ENHANCED_QUICKBUY: 1,
    ENABLE_IMAGES_IN_CHAT: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
    ENABLE_MINIMAP_ELEVATION_MARKERS: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_NICKNAMES: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_OLD_ITEM_COOLDOWNS: 0,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER2: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_QUICKBUY_CLICK_TO_NOTIFY: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SHOP_CLICK_TO_NOTIFY: 1,
    ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_65: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_UNSECURED_SOUL_TIMER: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    HUD_INDICATOR_SIZE: 20,
    ITEM_FILTER_DEF_ACTIVE: 1,
    ITEM_FILTER_OFF_ACTIVE: 1,
    OLD_ITEM_COOLDOWNS_SCALE: 102,
    OLD_ITEM_COOLDOWNS_Y_OFFSET: -70,
    PASSIVE_COOLDOWN_OPACITY: 0.75,
    PASSIVE_COOLDOWN_SIZE: 37,
    PASSIVE_COOLDOWN_Y: 5,
    PLAYER_HEALTHBAR_ACCENT_COLOR: 16,
    RECENT_PURCHASES_QUICK_Y_OFFSET: -45,
    SETTINGS_THEME: 3,
    STAMINA_CHARGE_COLOR: 13,
    VOICE_TYPE: 0
};
QOL_PRESETS["Jaundice"] = {
    AMMO_TEXT_COLOR: 28,
    BOTTOM_BAR_WASH_COLOR: 28,
    DAMAGE_REPORT_X_OFFSET: 25,
    DAMAGE_REPORT_Y_OFFSET: 105,
    DEFAULT_HERO: "hero_lash",
    DL4D_VOLUME: 20,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CENTER_ESC: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COLORED_HEALTHBAR: 1,
    ENABLE_COLOR_WARNING_25: 1,
    ENABLE_COLOR_WARNING_65: 1,
    ENABLE_COLOR_WARNING_75: 1,
    ENABLE_DL4D_REMINDERS: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_HIDE_RELOAD_ICON: 1,
    ENABLE_HIDE_TROOPER_DAMAGE: 1,
    ENABLE_IMAGES_IN_CHAT: 1,
    ENABLE_IMPROVED_HINT: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_CRATE_OVERLAY: 1,
    ENABLE_MINIMAP_REM_TUNNELS: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_RED_DIAMOND: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_RELOAD_COOLDOWN: 1,
    ENABLE_SHOP_CLICK_TO_NOTIFY: 1,
    ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
    ENABLE_SHOP_RECENT_PURCHASES: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_25: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_65: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_25: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_URN_DIFF: 1,
    HEALTHBAR_TYPE: 3,
    HUD_INDICATOR_SIZE: 32,
    ITEMS_WASH_COLOR: 28,
    ITEM_FILTER_DEF_ACTIVE: 1,
    ITEM_FILTER_OFF_ACTIVE: 1,
    MINIMAL_MINIMAP: 1,
    MINIMAL_MINIMAP_OPACITY: 0.4,
    MINIMAP_ICON_COLOR: 28,
    MINIMAP_SMALL_SIZE: 455,
    OLD_ITEM_COOLDOWNS_Y_OFFSET: 130,
    PASSIVE_COOLDOWN_Y: -5,
    PLAYER_HEALTHBAR_ACCENT_COLOR: 28,
    PLAYER_HEALTHBAR_OPACITY: 0.6,
    PLAYER_HEALTHBAR_SCALE: 84,
    PLAYER_HEALTHBAR_Y_OFFSET: 45,
    RECENT_PURCHASES_PANEL_X_OFFSET: 340,
    RECENT_PURCHASES_PANEL_Y_OFFSET: -295,
    SETTINGS_THEME: 3,
    SHOP_OFFSET_X: 90,
    STAMINA_CHARGE_ANGLE: 89,
    STAMINA_CHARGE_COLOR: 28,
    ULT_COOLDOWN_OPACITY: 0.65
};
QOL_PRESETS["7eventy7"] = {
    AMMO_TEXT_COLOR: 2,
    BOTTOM_BAR_SCALE: 0.9,
    BOTTOM_BAR_WASH_COLOR: 2,
    BOTTOM_BAR_Y_OFFSET: 10,
    DEFAULT_HERO: "hero_familiar",
    ENABLE_BETTER_UNSECURED: 1,
    ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_HIDE_RELOAD_ICON: 1,
    ENABLE_HIDE_TESTING_TOOLS: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_RELOAD_COOLDOWN: 1,
    ENABLE_SIMPLIFY_ITEMS: 1,
    ENABLE_TAB_ZOOM: 1,
    ENABLE_UNSECURED_SOUL_TIMER: 1,
    MINIMAL_MINIMAP: 1,
    MINIMAP_LARGE_SIZE_TAB: 500,
    MINIMAP_REMINDER_INTERVAL: 30,
    PLAYER_HEALTHBAR_ACCENT_COLOR: 29,
    PLAYER_HEALTHBAR_SCALE: 95,
    STAMINA_CHARGE_COLOR: 2,
    TAB_ZOOM_OPACITY: 1,
    TOP_BAR_SCALE: 0.9,
    TOP_BAR_Y_OFFSET: 55,
    UNSECURED_SOUL_TIMER_SCALE: 90,
    ZOOM_X_OFFSET_TAB: 1355,
    ZOOM_Y_OFFSET_TAB: -480
};
QOL_PRESETS["Munfins"] = {
    ALT_ZOOM_DRAW_OVER_UI: 1,
    AMMO_PANEL_X_OFFSET: 15,
    DEFAULT_HERO: "hero_lash",
    DISABLE_QUICK_BUY: 1,
    DISABLE_SHOP_BLUE: 1,
    ENABLE_ALT_ZOOM: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COLORED_HEALTHBAR: 1,
    ENABLE_COLOR_WARNING_25: 1,
    ENABLE_COLOR_WARNING_65: 1,
    ENABLE_COLOR_WARNING_75: 1,
    ENABLE_COMBAT_INDICATOR: 1,
    ENABLE_HERO_PURCHASE_POPUPS: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_HIDE_MAGAZINE: 1,
    ENABLE_IMAGES_IN_CHAT: 1,
    ENABLE_IMPROVED_HINT: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_LEGACY_COOLDOWNS: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_OLD_ITEM_COOLDOWNS: 0,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER2: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_RED_DIAMOND: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SHOP_CLICK_TO_NOTIFY: 1,
    ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
    ENABLE_SHOP_RECENT_PURCHASES: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_SIMPLIFY_ABILITY_ICONS: 1,
    ENABLE_SIMPLIFY_ITEMS: 1,
    ENABLE_SIMPLIFY_SHOP: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    HUD_INDICATOR_SIZE: 32,
    ITEM_FILTER_DEF_ACTIVE: 1,
    ITEM_FILTER_OFF_ACTIVE: 1,
    MINIMAL_MINIMAP: 1,
    MINIMAP_SMALL_SIZE: 595,
    RECENT_PURCHASES_PANEL_X_OFFSET: 500,
    RECENT_PURCHASES_PANEL_Y_OFFSET: -85,
    SETTINGS_THEME: 6,
    SHOP_OFFSET_X: 170,
    SHOP_SCALE: 0.8,
    UNIT_TARGET_SIZE: 65,
    VOICE_VOLUME: 39
};
QOL_PRESETS["Keta"] = {
    DEFAULT_HERO: "hero_haze",
    DISABLE_SHOP_BLUE: 1,
    ENABLE_BETTER_UNSECURED: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_DAMAGE_INDICATORS: 1,
    ENABLE_COMBAT_INDICATOR: 1,
    ENABLE_ENHANCED_QUICKBUY: 1,
    ENABLE_GAME_AUDIO: 0,
    ENABLE_HIDE_COSMETIC_ABILITY: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER2: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    HUD_INDICATOR_SIZE: 16,
    MINIMAL_MINIMAP: 1,
    MINIMAP_SMALL_SIZE: 650,
    SETTINGS_THEME: 3,
    SHOP_OFFSET_X: 90,
    UNIT_TARGET_SIZE: 100
};
QOL_PRESETS["Veradox"] = {
    ALT_ZOOM_DRAW_OVER_UI: 1,
    DISABLE_SHOP_BLUE: 1,
    ENABLE_AMMO_STATUS: 1,
    ENABLE_BETTER_UNSECURED: 1,
    ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_DAMAGE_INDICATORS: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COLORED_HEALTHBAR: 1,
    ENABLE_COLOR_WARNING_25: 1,
    ENABLE_COLOR_WARNING_65: 1,
    ENABLE_COLOR_WARNING_75: 1,
    ENABLE_COMBAT_INDICATOR: 1,
    ENABLE_COMPASS_SPEED: 1,
    ENABLE_DL4D_REMINDERS: 1,
    ENABLE_ENHANCED_QUICKBUY: 1,
    ENABLE_FULL_KEYBOARD_LAYOUT: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_HIDE_ABILITY_SUGGESTION: 1,
    ENABLE_IMAGES_IN_CHAT: 1,
    ENABLE_IMPROVED_HINT: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_KEYBOARD_OVERLAY: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
    ENABLE_MINIMAP_ELEVATION_MARKERS: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MINIMAP_REMINDER: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_NICKNAMES: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_OLD_ITEM_COOLDOWNS: 0,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER2: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_QUICKBUY_CLICK_TO_NOTIFY: 1,
    ENABLE_RED_DIAMOND: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_RELOAD_COOLDOWN: 1,
    ENABLE_SHOP_CLICK_TO_NOTIFY: 1,
    ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
    ENABLE_SHOP_RECENT_PURCHASES: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_SIMPLIFY_SHOP_STATS: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_25: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_65: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_75: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_25: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_75: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_UNSECURED_SOUL_TIMER: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    ITEM_FILTER_DEF_ACTIVE: 1,
    ITEM_FILTER_OFF_ACTIVE: 1,
    KEYBOARD_OVERLAY_SCALE: 70,
    KEYBOARD_OVERLAY_X_OFFSET: -50,
    MINIMAL_MINIMAP_OPACITY: 0.65,
    MINIMAP_BASE_OPACITY: 0.65,
    MINIMAP_LARGE_SIZE_TAB: 560,
    MINIMAP_REMINDER_INTERVAL: 20,
    MINIMAP_REM_TUNNELS_OPACITY: 0.1,
    MINIMAP_SMALL_SIZE: 570,
    PLAYER_HEALTHBAR_OPACITY: 0.55,
    PLAYER_HEALTHBAR_SCALE: 132,
    SHOP_OFFSET_X: 90,
    TAB_ZOOM_OPACITY: 0.8
};
QOL_PRESETS["k49"] = {
    AMMO_TEXT_COLOR: 28,
    BOTTOM_BAR_WASH_COLOR: 28,
    DAMAGE_IMPACT_OPACITY: 0.7,
    DEFAULT_HERO: "hero_vampirebat",
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COLORED_HEALTHBAR: 1,
    ENABLE_COLOR_WARNING_25: 1,
    ENABLE_COLOR_WARNING_65: 1,
    ENABLE_COLOR_WARNING_75: 1,
    ENABLE_COMBAT_INDICATOR: 1,
    ENABLE_DAMAGE_FOUNTAIN: 1,
    ENABLE_DL4D_BIG_CAMPS_SINNERS: 0,
    ENABLE_DL4D_MIDBOSS_URN_GOLD_RUNE: 0,
    ENABLE_ENHANCED_QUICKBUY: 1,
    ENABLE_HIDE_COSMETIC_ABILITY: 1,
    ENABLE_HIDE_RELOAD_ICON: 1,
    ENABLE_HIDE_SMALL_NUMBERS: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
    ENABLE_MINIMAP_CRATE_OVERLAY: 1,
    ENABLE_MINIMAP_ELEVATION_MARKERS: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_NICKNAMES: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER2: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_RELOAD_COOLDOWN: 1,
    ENABLE_SIMPLIFY_ITEMS: 1,
    ENABLE_SIMPLIFY_SHOP_STATS: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_25: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_65: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_75: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_25: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_75: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_UNSECURED_SOUL_TIMER: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    HUD_INDICATOR_SIZE: 24,
    ITEMS_WASH_COLOR: 28,
    MINIMAL_MINIMAP: 1,
    MINIMAP_ICON_COLOR: 28,
    MINIMAP_LARGE_SIZE_TAB: 550,
    MINIMAP_SMALL_SIZE: 495,
    PLAYER_HEALTHBAR_ACCENT_COLOR: 3,
    SETTINGS_THEME: 5,
    STAMINA_CHARGE_COLOR: 21,
    TAB_ZOOM_OPACITY: 0.9,
    VOICE_TYPE: 0
};
QOL_PRESETS["ninjabladeJr"] = {
    AMMO_CURRENT_SCALE: 140,
    AMMO_PANEL_SCALE: 140,
    AMMO_PANEL_X_OFFSET: 15,
    AMMO_PANEL_Y_OFFSET: 50,
    AMMO_TOTAL_SCALE: 122,
    BRIDGE_BUFF_START: 25,
    DAMAGE_NUMBER_OPACITY: 0.25,
    DEFAULT_HERO: "hero_werewolf",
    DISABLE_SHOP_BLUE: 1,
    ENABLE_AMMO_STATUS: 1,
    ENABLE_BETTER_UNSECURED: 1,
    ENABLE_BETTER_UNSECURED_SHOW_TEXT: 0,
    ENABLE_BUFF_HUD: 1,
    ENABLE_BUFF_SOUND_1: 0,
    ENABLE_BUFF_SOUND_3: 0,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COLORED_HEALTHBAR: 1,
    ENABLE_COLOR_WARNING_25: 1,
    ENABLE_COLOR_WARNING_65: 1,
    ENABLE_COMBAT_INDICATOR: 1,
    ENABLE_DAMAGE_FOUNTAIN: 1,
    ENABLE_ENHANCED_QUICKBUY: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_HIDE_MAGAZINE: 1,
    ENABLE_HIDE_RELOAD_CIRCLE: 1,
    ENABLE_HIDE_RELOAD_ICON: 1,
    ENABLE_HIDE_TROOPER_DAMAGE: 1,
    ENABLE_IMPROVED_HINT: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
    ENABLE_MINIMAP_ELEVATION_MARKERS: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_OLD_ITEM_COOLDOWNS: 0,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER2: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SIMPLIFY_ITEMS: 1,
    ENABLE_SIMPLIFY_SHOP: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_URN_DIFF: 1,
    HUD_INDICATOR_SIZE: 29,
    ITEM_FILTER_DEF_ACTIVE: 1,
    ITEM_FILTER_OFF_ACTIVE: 1,
    MINIMAL_MINIMAP: 1,
    MINIMAP_SMALL_SIZE: 550,
    OLD_ITEM_COOLDOWNS_SCALE: 165,
    PASSIVE_COOLDOWN_OPACITY: 0.9,
    PASSIVE_COOLDOWN_SIZE: 60,
    RELOAD_COOLDOWN_OPACITY: 1,
    RELOAD_COOLDOWN_SIZE: 31,
    RELOAD_COOLDOWN_Y_OFFSET: -25,
    SHOP_SCALE: 0.5,
    ULT_COOLDOWN_SIZE: 25,
    ULT_COOLDOWN_X_OFFSET: 0,
    ULT_COOLDOWN_Y_OFFSET: 0,
    UNSECURED_SOULS_HUD_SCALE: 200,
    UNSECURED_SOUL_TIMER_SCALE: 200,
    UNSECURED_SOUL_TIMER_X_OFFSET: 530,
    UNSECURED_SOUL_TIMER_Y_OFFSET: 325,
    VOICE_TYPE: 0,
    VOICE_VOLUME: 46,
    ZIP_BOOST_SCALE: 165,
    ZIP_BOOST_X_OFFSET: -125
};
QOL_PRESETS["FlintSnow"] = {
    ALT_ZOOM_DRAW_OVER_UI: 1,
    COMBAT_STATUS_SCALE: 75,
    COMBAT_STATUS_X_OFFSET: -500,
    COMBAT_STATUS_Y_OFFSET: -500,
    DEFAULT_HERO: "hero_gigawatt",
    DISABLE_SHOP_BLUE: 1,
    ENABLE_ALT_ZOOM: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_DAMAGE_INDICATORS: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COLORED_HEALTHBAR: 1,
    ENABLE_COLOR_WARNING_25: 1,
    ENABLE_COLOR_WARNING_65: 1,
    ENABLE_COLOR_WARNING_75: 1,
    ENABLE_COMBAT_INDICATOR: 1,
    ENABLE_ENEMY_ULT_INDICATOR: 1,
    ENABLE_ENEMY_V2_ENHANCED: 1,
    ENABLE_ENEMY_V2_LEVEL: 0,
    ENABLE_ENHANCED_QUICKBUY: 1,
    ENABLE_KEYBOARD_OVERLAY: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_ELEVATION_MARKERS: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_NICKNAMES: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_OLD_ITEM_COOLDOWNS: 0,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_QUICKBUY_CLICK_TO_NOTIFY: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SHOP_CLICK_TO_NOTIFY: 1,
    ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
    ENABLE_SHOW_BUILD_ID: 1,
    ENABLE_SHOW_BUILD_ID_TITLE: 1,
    ENABLE_SIMPLIFY_ABILITY_ICONS: 1,
    ENABLE_SIMPLIFY_ITEMS: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_25: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_65: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_75: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_25: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_75: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    GAME_DEFAULT_DIFFICULTY: 0,
    KEYBOARD_OVERLAY_SCALE: 80,
    KEYBOARD_OVERLAY_X_OFFSET: -20,
    KEYBOARD_OVERLAY_Y_OFFSET: -100,
    MINIMALIST_HEALTHBAR_X_OFFSET: -150,
    MINIMALIST_HEALTHBAR_Y_OFFSET: -150,
    MINIMAL_MINIMAP: 1,
    MINIMAL_MINIMAP_OPACITY: 1,
    PLAYER_HEALTHBAR_OPACITY: 0.7,
    RECENT_PURCHASES_QUICK_Y_OFFSET: -50,
    SETTINGS_THEME: 3,
    VOICE_VOLUME: 0
};
QOL_PRESETS["Steqdyy"] = {
    DEFAULT_HERO: "hero_shiv",
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COLORED_HEALTHBAR: 1,
    ENABLE_COLOR_WARNING_25: 1,
    ENABLE_DAMAGE_FOUNTAIN: 1,
    ENABLE_ENHANCED_QUICKBUY: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_NICKNAMES: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_OLD_ITEM_COOLDOWNS: 0,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER2: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SHOP_CLICK_TO_NOTIFY: 1,
    ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
    ENABLE_SHOP_RECENT_PURCHASES: 1,
    ENABLE_SHOW_BUILD_ID: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    HUD_INDICATOR_SIZE: 25,
    ITEM_FILTER_DEF_ACTIVE: 1,
    ITEM_FILTER_OFF_ACTIVE: 1,
    MINIMAL_MINIMAP: 1,
    MINIMAP_SMALL_SIZE: 465,
    SETTINGS_THEME: 4,
    SHOP_OFFSET_X: 50,
    SHOP_SCALE: 0.85,
    SUPPORT_16_10: 1,
    UNIT_TARGET_SIZE: 100,
    VOICE_TYPE: 7
};
QOL_PRESETS["Seyer"] = {
    DISABLE_PLAYER_NAME_BLUR: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_DL4D_REMINDERS: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_SIMPLIFY_ITEMS: 1,
    ENABLE_SIMPLIFY_SHOP: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    HUD_INDICATOR_SIZE: 16,
    MINIMAL_MINIMAP: 1,
    MINIMAP_SMALL_SIZE: 465,
    SETTINGS_THEME: 3,
    SHOP_OFFSET_X: 90,
    UNIT_TARGET_SIZE: 100,
    VOICE_TYPE: 5,
    VOICE_VOLUME: 0
};
QOL_PRESETS["T1FF4NNY"] = {
    BRIDGE_BUFF_START: 20,
    ENABLE_BUFF_HUD: 1,
    ENABLE_COLORED_HEALTHBAR: 1,
    ENABLE_COLOR_WARNING_25: 1,
    ENABLE_COMBAT_INDICATOR: 1,
    ENABLE_ENHANCED_QUICKBUY: 1,
    ENABLE_IMAGES_IN_CHAT: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SHOP_CLICK_TO_NOTIFY: 1,
    ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
    ENABLE_SHOP_RECENT_PURCHASES: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    SETTINGS_THEME: 3,
    SHOP_OFFSET_X: 90
};
QOL_PRESETS["mituu"] = {
    ALT_ZOOM_DRAW_OVER_UI: 1,
    DEFAULT_HERO: "hero_hornet",
    ENABLE_AMMO_STATUS: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_DAMAGE_INDICATORS: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_IMPROVED_HINT: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_NICKNAMES: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_OLD_ITEM_COOLDOWNS: 0,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER2: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_RED_DIAMOND: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SHOP_CLICK_TO_NOTIFY: 1,
    ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    HUD_INDICATOR_SIZE: 25,
    MINIMAL_MINIMAP: 1,
    MINIMAP_SMALL_SIZE: 695
};
QOL_PRESETS["qlt"] = {
    DEFAULT_HERO: "hero_astro",
    DISABLE_SHOP_BLUE: 1,
    ENABLE_AMMO_STATUS: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COMPASS_SPEED: 1,
    ENABLE_FULL_KEYBOARD_LAYOUT: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_HIDE_MAGAZINE: 1,
    ENABLE_KEYBOARD_OVERLAY: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_LEGACY_COOLDOWNS: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_SIMPLIFY_ABILITY_ICONS: 1,
    ENABLE_SIMPLIFY_SHOP: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_ZIP_BOOST: 1,
    KEYBOARD_OVERLAY_X_OFFSET: -95,
    KEYBOARD_OVERLAY_Y_OFFSET: 285
};
QOL_PRESETS["munchkinman"] = {
    BOTTOM_BAR_WASH_COLOR: 17,
    BRIDGE_BUFF_START: 10,
    DEFAULT_HERO: "hero_gigawatt",
    DISABLE_SHOP_BLUE: 1,
    DL4D_VOLUME: 0,
    ENABLE_AMMO_STATUS: 1,
    ENABLE_BETTER_UNSECURED: 1,
    ENABLE_BETTER_UNSECURED_SHOW_ICON: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_DAMAGE_INDICATORS: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COLORED_HEALTHBAR: 1,
    ENABLE_COLOR_WARNING_25: 1,
    ENABLE_COLOR_WARNING_65: 1,
    ENABLE_COLOR_WARNING_75: 1,
    ENABLE_COMBAT_INDICATOR: 1,
    ENABLE_DL4D_BIG_CAMPS_SINNERS: 0,
    ENABLE_DL4D_MEDIUM_CAMPS: 0,
    ENABLE_DL4D_MIDBOSS_URN_GOLD_RUNE: 0,
    ENABLE_DL4D_REMINDERS: 1,
    ENABLE_DL4D_RUNE: 0,
    ENABLE_DL4D_RUNE_MELEE_TROOPERS: 0,
    ENABLE_ENHANCED_QUICKBUY: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_IMAGES_IN_CHAT: 1,
    ENABLE_IMPROVED_HINT: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
    ENABLE_MINIMAP_ELEVATION_MARKERS: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MINIMAP_REM_TUNNELS: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER2: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_QUICKBUY_CLICK_TO_NOTIFY: 1,
    ENABLE_RED_DIAMOND: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SHOP_CLICK_TO_NOTIFY: 1,
    ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
    ENABLE_SHOP_RECENT_PURCHASES: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_SIMPLIFY_ABILITY_ICONS: 1,
    ENABLE_SIMPLIFY_SHOP: 1,
    ENABLE_SIMPLIFY_SHOP_STATS: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_25: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_65: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_75: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_25: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_75: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    MINIMAL_MINIMAP: 1,
    MINIMAP_REM_TUNNELS_OPACITY: 0.15,
    PLAYER_HEALTHBAR_ACCENT_COLOR: 26,
    RECENT_PURCHASES_PANEL_X_OFFSET: 500,
    RECENT_PURCHASES_PANEL_Y_OFFSET: -195,
    RECENT_PURCHASES_QUICK_X_OFFSET: -500,
    RECENT_PURCHASES_QUICK_Y_OFFSET: -500,
    SETTINGS_THEME: 3,
    SHOP_OFFSET_X: 90,
    STAMINA_CHARGE_COLOR: 26,
    ULT_COOLDOWN_OPACITY: 0.25,
    ULT_COOLDOWN_SIZE: 10,
    VOICE_TYPE: 0,
    ZIP_BOOST_X_OFFSET: -755,
    ZIP_BOOST_Y_OFFSET: 115
};
QOL_PRESETS["Blank2762"] = {
    DEFAULT_HERO: "hero_priest",
    ENABLE_BETTER_UNSECURED: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_COLORED_HEALTHBAR: 1,
    ENABLE_COLOR_WARNING_25: 1,
    ENABLE_COLOR_WARNING_65: 1,
    ENABLE_COLOR_WARNING_75: 1,
    ENABLE_COMBAT_INDICATOR: 1,
    ENABLE_COMPASS_SPEED: 1,
    ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
    ENABLE_MINIMAP_ELEVATION_MARKERS: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_NICKNAMES: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SHOP_RECENT_PURCHASES: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_25: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_65: 1,
    ENABLE_TOPBAR_ALLY_HP_WARNING_75: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_25: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_65: 1,
    ENABLE_TOPBAR_ENEMY_HP_WARNING_75: 1,
    ENABLE_UNSECURED_SOUL_TIMER: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    SETTINGS_THEME: 3,
    SHOP_OFFSET_X: 90
};
QOL_PRESETS["Valerie"] = {
    AMMO_PANEL_Y_OFFSET: 50,
    AMMO_TOTAL_SCALE: 109,
    DEFAULT_HERO: "hero_bookworm",
    DISABLE_SHOP_BLUE: 1,
    ENABLE_AMMO_STATUS: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CENTER_ESC: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COLORED_HEALTHBAR: 1,
    ENABLE_COLOR_WARNING_25: 1,
    ENABLE_COLOR_WARNING_65: 1,
    ENABLE_COMBAT_INDICATOR: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_HIDE_AMMO_ALL: 1,
    ENABLE_HIDE_MAGAZINE: 1,
    ENABLE_HIDE_RELOAD_ICON: 1,
    ENABLE_IMPROVED_HINT: 1,
    ENABLE_KEYBOARD_OVERLAY: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_OLD_ITEM_COOLDOWNS: 0,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_RED_DIAMOND: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_RELOAD_COOLDOWN: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_SIMPLIFY_SHOP: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    HEALTHBAR_TYPE: 4,
    HUD_INDICATOR_SIZE: 30,
    ITEM_FILTER_DEF_ACTIVE: 1,
    ITEM_FILTER_OFF_ACTIVE: 1,
    MINIMAL_MINIMAP: 1,
    OLD_ITEM_COOLDOWNS_Y_OFFSET: -170,
    PASSIVE_COOLDOWN_OPACITY: 1,
    PASSIVE_COOLDOWN_Y: 10,
    PLAYER_HEALTHBAR_OPACITY: 0.7,
    PLAYER_HEALTHBAR_SCALE: 59,
    PLAYER_HEALTHBAR_X_OFFSET: -20,
    PLAYER_HEALTHBAR_Y_OFFSET: 85,
    SETTINGS_THEME: 3,
    VOICE_TYPE: 7
};
QOL_PRESETS["Rosalia"] = {
    BRIDGE_BUFF_START: 0,
    DEFAULT_HERO: "hero_forge",
    DISABLE_SHOP_BLUE: 1,
    ENABLE_BETTER_UNSECURED: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COMPASS_SPEED: 1,
    ENABLE_HIDE_FAILED_HINT: 1,
    ENABLE_HIDE_RELOAD_CIRCLE: 1,
    ENABLE_HIDE_RELOAD_ICON: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_OLD_ITEM_COOLDOWNS: 0,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER2: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SIMPLIFY_ITEMS: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    HUD_INDICATOR_SIZE: 15,
    ITEM_FILTER_DEF_ACTIVE: 1,
    MINIMAL_MINIMAP: 1,
    MINIMAL_MINIMAP_OPACITY: 1,
    MINIMAP_SMALL_SIZE: 580,
    OLD_ITEM_COOLDOWNS_X_OFFSET: 300,
    OLD_ITEM_COOLDOWNS_Y_OFFSET: -270,
    PASSIVE_COOLDOWN_X: 15,
    PASSIVE_COOLDOWN_Y: 15,
    UNIT_TARGET_SIZE: 100,
    VOICE_TYPE: 0,
    VOICE_VOLUME: 0
};
QOL_PRESETS["notah"] = {
    AMMO_CURRENT_SCALE: 165,
    AMMO_PANEL_SCALE: 165,
    AMMO_TOTAL_SCALE: 173,
    BOTTOM_BAR_SCALE: 1.15,
    BOTTOM_BAR_X_OFFSET: -25,
    BOTTOM_BAR_Y_OFFSET: 35,
    DEFAULT_HERO: "hero_ghost",
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COLORED_HEALTHBAR: 1,
    ENABLE_COLOR_WARNING_25: 1,
    ENABLE_COMBAT_INDICATOR: 1,
    ENABLE_DAMAGE_FOUNTAIN: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_HIDE_RELOAD_ICON: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_MINIMAP_ALWAYS_ON_MID_BOSS: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
    ENABLE_MINIMAP_ELEVATION_MARKERS: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_OLD_ITEM_COOLDOWNS: 0,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER2: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_RELOAD_COOLDOWN: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    HUD_INDICATOR_SIZE: 35,
    ITEM_FILTER_DEF_ACTIVE: 1,
    ITEM_FILTER_OFF_ACTIVE: 1,
    MINIMAL_MINIMAP: 1,
    MINIMAL_MINIMAP_OPACITY: 1,
    MINIMAP_SMALL_SIZE: 690,
    MINIMAP_X_OFFSET: 55,
    OLD_ITEM_COOLDOWNS_SCALE: 126,
    PASSIVE_COOLDOWN_OPACITY: 1,
    PASSIVE_COOLDOWN_SIZE: 46,
    PLAYER_HEALTHBAR_SCALE: 111,
    ZIP_BOOST_SCALE: 148,
    ZIP_BOOST_X_OFFSET: -380
};
QOL_PRESETS["Anguish"] = {
    ENABLE_BETTER_UNSECURED: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_ULT_COOLDOWNS: 1,
    ENABLE_UNSPENT_SOULS: 1,
    PLAYER_HEALTHBAR_ACCENT_COLOR: 26,
    PLAYER_HEALTHBAR_SCALE: 63,
    UNSECURED_SOULS_HUD_SCALE: 65
};
QOL_PRESETS["_ZODUK_"] = {
    BRIDGE_BUFF_START: 21,
    CHAT_SCALE: 115,
    DAMAGE_NUMBER_OPACITY: 0.95,
    DEFAULT_HERO: "hero_warden",
    DISABLE_SHOP_BLUE: 1,
    ENABLE_AMMO_STATUS: 1,
    ENABLE_BETTER_UNSECURED: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_DL4D_LANE_GUARDIAN_WEAK: 0,
    ENABLE_DL4D_RUNE: 0,
    ENABLE_DL4D_RUNE_FAST_TROOPERS: 0,
    ENABLE_DL4D_RUNE_GOLD_BUFFS: 0,
    ENABLE_DL4D_RUNE_TROOPERS20_HP: 0,
    ENABLE_DL4D_WALKER_WEAK: 0,
    ENABLE_ENHANCED_QUICKBUY: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_HIDE_ABILITY_SUGGESTION: 1,
    ENABLE_HIDE_COSMETIC_ABILITY: 1,
    ENABLE_HIDE_RELOAD_ICON: 1,
    ENABLE_IMPROVED_HINT: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_LEGACY_COOLDOWNS: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_BUFF_TIMER_ON_BRIDGE: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_NICKNAMES: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OLD_ITEM_COOLDOWNS: 0,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_RED_DIAMOND: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_RELOAD_COOLDOWN: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_SIMPLIFY_COMPASS: 1,
    ENABLE_SIMPLIFY_ITEMS: 1,
    ENABLE_UNSECURED_SOUL_TIMER: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    HUD_INDICATOR_SIZE: 22,
    ITEM_FILTER_DEF_ACTIVE: 1,
    ITEM_FILTER_OFF_ACTIVE: 1,
    MINIMAL_MINIMAP: 1,
    MINIMAL_MINIMAP_OPACITY: 0.85,
    MINIMAP_BASE_OPACITY: 0.85,
    MINIMAP_REMINDER_INTERVAL: 5,
    MINIMAP_X_OFFSET: -115,
    MINIMAP_Y_OFFSET: 25,
    OLD_ITEM_COOLDOWNS_SCALE: 102,
    OLD_ITEM_COOLDOWNS_Y_OFFSET: -10,
    PASSIVE_COOLDOWN_OPACITY: 0.8,
    PASSIVE_COOLDOWN_SIZE: 37,
    PASSIVE_COOLDOWN_Y: 2,
    PLAYER_HEALTHBAR_SCALE: 120,
    PLAYER_HEALTHBAR_X_OFFSET: 140,
    RELOAD_COOLDOWN_OPACITY: 0.65,
    RELOAD_COOLDOWN_SIZE: 32,
    SHOP_OFFSET_X: 90,
    UNSECURED_SOULS_HUD_SCALE: 200,
    UNSECURED_SOULS_HUD_X_OFFSET: 900,
    UNSECURED_SOULS_HUD_Y_OFFSET: 1095,
    UNSECURED_SOUL_TIMER_SCALE: 150,
    UNSECURED_SOUL_TIMER_X_OFFSET: 500,
    UNSECURED_SOUL_TIMER_Y_OFFSET: 140,
    VOICE_TYPE: 5,
    ZIP_BOOST_SCALE: 150,
    ZIP_BOOST_X_OFFSET: 1055,
    ZIP_BOOST_Y_OFFSET: 50
};
QOL_PRESETS["nkonin.me"] = {
    DEFAULT_HERO: "hero_chrono",
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_ENHANCED_QUICKBUY: 1,
    ENABLE_HERO_PURCHASE_POPUPS: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_MINIMAP_BUFF_TIMER: 1,
    ENABLE_MINIMAP_REJUV_TIMER: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_NICKNAMES: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SHOP_CLICK_TO_NOTIFY: 1,
    ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    MINIMAL_MINIMAP: 1,
    MINIMAP_SMALL_SIZE: 600,
    RECENT_PURCHASES_QUICK_REJUV: 0,
    RECENT_PURCHASES_QUICK_SCOREBOARD: 0,
    VOICE_TYPE: 7
};
QOL_PRESETS["ani"] = {
    DEFAULT_HERO: "hero_yamato",
    DISABLE_QUICK_BUY: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_IMAGES_IN_CHAT: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_MIN_SOULS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_OBJ_DMG: 1,
    ENABLE_OBJ_MAP: 1,
    ENABLE_ONE_TIME: 1,
    ENABLE_ONE_TIME_TIER1: 1,
    ENABLE_ONE_TIME_TIER2: 1,
    ENABLE_ONE_TIME_TIER3: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_SHOP_CLICK_TO_NOTIFY: 1,
    ENABLE_SHOP_ITEM_NOTIFICATIONS: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_UNSPENT_SOULS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    HUD_INDICATOR_SIZE: 16,
    MINIMAL_MINIMAP: 1,
    MINIMAP_SMALL_SIZE: 465,
    RECENT_PURCHASES_QUICK_DISPLAY_SEC: 3,
    RECENT_PURCHASES_QUICK_SCALE: 0.6,
    UNIT_TARGET_SIZE: 100,
    VOICE_TYPE: 8
};
QOL_PRESETS["leah"] = {
    BOTTOM_BAR_WASH_COLOR: 1,
    DEFAULT_HERO: "hero_astro",
    DISABLE_SHOP_BLUE: 1,
    ENABLE_BUFF_HUD: 1,
    ENABLE_CENTER_ESC: 1,
    ENABLE_CLEAN_DAMAGE_INDICATORS: 1,
    ENABLE_CLEAN_STACKS: 1,
    ENABLE_COMPASS_SPEED: 1,
    ENABLE_HERO_SCENE_PANEL: 0,
    ENABLE_HIDE_COSMETIC_ABILITY: 1,
    ENABLE_HIDE_RELOAD_ICON: 1,
    ENABLE_HIDE_TROOPER_DAMAGE: 1,
    ENABLE_IMAGES_IN_CHAT: 1,
    ENABLE_INTERVAL: 1,
    ENABLE_LANE_WITH_PARTY: 1,
    ENABLE_LEGACY_COOLDOWNS: 1,
    ENABLE_MINIMAP_ELEVATION_MARKERS: 1,
    ENABLE_MISSING_HERO: 1,
    ENABLE_PASSIVE_COOLDOWN: 1,
    ENABLE_QUICKBUY_CLICK_TO_NOTIFY: 1,
    ENABLE_REJUV_HUD: 1,
    ENABLE_RELOAD_COOLDOWN: 1,
    ENABLE_SHOP_RECENT_PURCHASES: 1,
    ENABLE_SHOP_STATS: 1,
    ENABLE_URN_DIFF: 1,
    ENABLE_ZIP_BOOST: 1,
    GAME_DEFAULT_DIFFICULTY: 2,
    HUD_INDICATOR_SIZE: 32,
    MINIMAL_MINIMAP: 1,
    MINIMAL_MINIMAP_OPACITY: 1,
    OLD_ITEM_COOLDOWNS_Y_OFFSET: 230,
    PASSIVE_COOLDOWN_Y: -10,
    RELOAD_COOLDOWN_OPACITY: 0.75,
    SETTINGS_THEME: 3,
    STAMINA_CHARGE_COLOR: 10,
    ULT_COOLDOWN_X_OFFSET: 0,
    ULT_COOLDOWN_Y_OFFSET: 0
};

var QOL_ACCOUNT_PRESET_BINDINGS = {};

