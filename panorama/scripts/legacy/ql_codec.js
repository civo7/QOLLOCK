// ==========================================================================
// ql_codec.js — QOLLOCK Codec (base64 + compact binary encoding)
// ==========================================================================
// OWNS:        QOL_CODEC — base64 encode/decode, compact binary serialization
// DOES NOT OWN: Config storage format, schema definitions, feature dispatch
// DEPENDS ON:  Nothing beyond JS built-ins
// USED BY:     ql_shared_presets.js (compact schema), Settings export/import
// LOAD ORDER:  Before ql_shared_presets.js
//
// Extracted from ql_shared_presets.js (Phase 2).
// Coexists with original — double-init guard prevents conflicts.
// ==========================================================================


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
                        try { onMissingField(safeSchema[m], parsed); } catch(e1) { if (typeof $ !== "undefined" && $.Msg) $.Msg("[QOLLock][WARN][presets] op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
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

