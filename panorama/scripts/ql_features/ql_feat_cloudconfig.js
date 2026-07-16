// ql_feat_cloudconfig.js — cloud settings store over the image side-channel.
//
// Replaces the Skyrunner build-name storage hack (etap 3, Variant A). This
// feature is the HUD-side glue between:
//   • QOL.net (ql_net.js) — the image side-channel transport (save/load), and
//   • the settings UI — which lives in a SEPARATE Panorama context (escape
//     menu) and can only talk to the HUD through shared root/Hud panel
//     attributes. That cross-context isolation is why save bridges through
//     the exact same BUILD_SAVE_* attributes the old build machine used, and
//     WatchBuildSaveStatus on the settings side needs zero changes.
//
// Gated behind QOL_USE_CLOUD_CONFIG (ql_shared_presets.js). When the flag is
// off this feature no-ops and the old build path runs unchanged — flip the
// flag, repack, and the old system is back with no code deleted.
//
// LOAD  (boot):  once account-id + hideout are readable, QOL.net.load(id) ->
//                raw compact bytes -> DeserializeBuildPayloadCompact ->
//                buildAppliedConfig (merge with defaults) -> write to storage.
//                reason "empty" = nothing stored yet = defaults (success).
// SAVE  (per-tick): consume the settings-queued BUILD_SAVE_REQUEST token when
//                STATE == "pending", strip the [QOL-x-x-x]: prefix to base64url,
//                QOL.net.save(id, Date.now(), base64url), then set STATE to
//                success|failed so the settings button lights green/red.
(function() {
    'use strict';
    var _featureId = "ql_feat_cloudconfig";
    var _deps = QOL.import([
        "state", "utils",
        "getAccountIdForBuildCategoryPayload",
        "deserializeBuildPayloadCompact",
        "resolveBuildPayloadCompactSemverFromWireVersion",
        "buildAppliedConfig",
        "writeStorageConfigRawToUi",
        "isConnectedToHideout",
        "beginSettingsLoaderSession",
        "setSettingsLoaderStepState",
        "finalizeSettingsLoaderSession"
    ]);
    var State = _deps.state;
    var Utils = _deps.utils;
    var GetAccountIdForBuildCategoryPayload = _deps.getAccountIdForBuildCategoryPayload;
    var DeserializeBuildPayloadCompact = _deps.deserializeBuildPayloadCompact;
    var ResolveBuildPayloadCompactSemverFromWireVersion = _deps.resolveBuildPayloadCompactSemverFromWireVersion;
    var BuildAppliedConfig = _deps.buildAppliedConfig;
    var WriteStorageConfigRawToUi = _deps.writeStorageConfigRawToUi;
    var IsConnectedToHideout = _deps.isConnectedToHideout;
    var BeginSettingsLoaderSession = _deps.beginSettingsLoaderSession;
    var SetSettingsLoaderStepState = _deps.setSettingsLoaderStepState;
    var FinalizeSettingsLoaderSession = _deps.finalizeSettingsLoaderSession;

    // ── Bridge attribute names (same channel the old build machine used) ──
    var BUILD_SAVE_REQUEST_ATTR = "QOL_BUILD_SAVE_REQUEST";
    var BUILD_SAVE_STATE_ATTR   = "QOL_BUILD_SAVE_STATE";
    var BUILD_SAVE_MSG_ATTR     = "QOL_BUILD_SAVE_MSG";
    var BUILD_SAVE_TOKEN_ATTR   = "QOL_BUILD_SAVE_TOKEN";
    var PANEL_ID_HUD            = "Hud";

    // Full export token: [QOL-<schema>]:base64url  — capture the base64url body.
    var EXPORT_TOKEN_REGEX = /^\[QOL-\d+-\d+-\d+\]:([A-Za-z0-9\-_]+)$/;

    // WrapConfigForStorage is a bare global from ql_shared_presets.js (both contexts).
    function wrapForStorage(cfgObj) {
        if (typeof WrapConfigForStorage === "function") return WrapConfigForStorage(cfgObj);
        return JSON.stringify({ schema: (typeof QOL_SCHEMA_SEMVER === "string" ? QOL_SCHEMA_SEMVER : "3.1.9"), data: cfgObj });
    }

    function log(msg) {
        try { if (Utils && Utils.DebugLog) Utils.DebugLog("cloud", msg); } catch (e) {}
    }

    // ── Boot load state (per process session) ──
    // Loaded once per account. cloudConfigBootAccountId tracks who we loaded for
    // so a mid-session account change re-loads.
    function isEnabled() {
        return (typeof QOL_USE_CLOUD_CONFIG !== "undefined") && QOL_USE_CLOUD_CONFIG === true;
    }
    function netReady() {
        return (typeof QOL !== "undefined" && QOL.net && QOL.net.isConfigured && QOL.net.isConfigured());
    }

    // Convert the transport's byte array to the binary string the deserializer wants.
    function bytesToBinary(bytes) {
        var s = "";
        for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] & 255);
        return s;
    }

    // Decode raw cloud bytes into an applied config object (defaults + parsed +
    // schema normalizers), mirroring the old build-load apply path exactly.
    function applyLoadedBytes(root, bytes) {
        var binaryStr = bytesToBinary(bytes);
        if (!binaryStr || binaryStr.length < 1) throw new Error("empty payload bytes");
        var wireVersion = binaryStr.charCodeAt(0) & 255;
        var semver = ResolveBuildPayloadCompactSemverFromWireVersion(wireVersion);
        var parsed = DeserializeBuildPayloadCompact(binaryStr);
        var parsedResult = { ok: true, payload: "", parsed: parsed, schemaVersion: semver };
        var appliedObj = BuildAppliedConfig("", parsedResult);
        var appliedRaw = wrapForStorage(appliedObj);
        WriteStorageConfigRawToUi(root, appliedRaw);
    }

    function applyDefaults(root) {
        // Nothing stored — write a defaults envelope so the HUD stops waiting on
        // a config source and features initialize at their defaults.
        var defaults = (typeof QOL !== "undefined" && QOL.buildDefaultConfig) ? QOL.buildDefaultConfig() : {};
        WriteStorageConfigRawToUi(root, wrapForStorage(defaults));
    }

    function runBootLoad(root, nowMs) {
        if (State.cloudConfigBootInFlight) return;
        var accountId = GetAccountIdForBuildCategoryPayload(root);
        if (!accountId || accountId.length === 0) return;      // wait for account context
        if (!IsConnectedToHideout(root)) return;               // don't load into an active match
        if (String(State.cloudConfigBootAccountId || "") === accountId && State.cloudConfigBootDone) return;

        State.cloudConfigBootInFlight = true;
        State.cloudConfigBootAccountId = accountId;
        State.cloudConfigBootDone = false;

        BeginSettingsLoaderSession(accountId, nowMs);
        SetSettingsLoaderStepState("switch_airheart", "skipped", "Cloud store — no hero switch needed.");
        SetSettingsLoaderStepState("confirm_airheart", "skipped", "Cloud store — no hero switch needed.");
        SetSettingsLoaderStepState("read_payload", "active", "Fetching settings from cloud.");
        log("boot load start account=" + accountId);

        QOL.net.load(accountId, function(bytes, reason) {
            try {
                if (bytes && bytes.length > 0) {
                    SetSettingsLoaderStepState("read_payload", "done", "Cloud payload received.");
                    SetSettingsLoaderStepState("decode_payload", "active", "Decoding cloud payload.");
                    applyLoadedBytes(root, bytes);
                    SetSettingsLoaderStepState("decode_payload", "done", "Payload decoded.");
                    SetSettingsLoaderStepState("apply_config", "done", "Config applied from cloud.");
                    SetSettingsLoaderStepState("return_hero", "skipped", "No hero return needed.");
                    FinalizeSettingsLoaderSession("success", "Loaded settings from cloud.", Date.now());
                    log("boot load ok account=" + accountId);
                } else if (reason === "empty") {
                    // Nothing stored yet — first launch for this account. Defaults.
                    SetSettingsLoaderStepState("read_payload", "done", "No cloud settings yet.");
                    SetSettingsLoaderStepState("decode_payload", "skipped", "Nothing to decode.");
                    applyDefaults(root);
                    SetSettingsLoaderStepState("apply_config", "done", "Using default settings.");
                    SetSettingsLoaderStepState("return_hero", "skipped", "No hero return needed.");
                    FinalizeSettingsLoaderSession("success", "No cloud settings — defaults applied.", Date.now());
                    log("boot load empty account=" + accountId);
                } else {
                    // Network / corrupt failure — keep whatever config is present,
                    // never corrupt it. Mark the loader failed but non-fatal.
                    SetSettingsLoaderStepState("read_payload", "error", "Cloud load failed (" + String(reason || "net") + ").");
                    SetSettingsLoaderStepState("decode_payload", "skipped", "No payload decoded.");
                    SetSettingsLoaderStepState("apply_config", "skipped", "Config unchanged.");
                    FinalizeSettingsLoaderSession("failed", "Cloud load failed: " + String(reason || "net"), Date.now());
                    log("boot load fail account=" + accountId + " reason=" + String(reason));
                }
            } catch (e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] load cb: " + (e && e.message ? e.message : e) + "\n" + (e && e.stack ? e.stack : ""));
                try { FinalizeSettingsLoaderSession("failed", "Cloud load error.", Date.now()); } catch (e2) {}
            }
            State.cloudConfigBootInFlight = false;
            State.cloudConfigBootDone = true;
        });
    }

    // ── Save: consume the settings-queued request and push it to the cloud ──
    function readAttr(root, hud, name) {
        var v = "";
        try { if (root && root.GetAttributeString) v = root.GetAttributeString(name, ""); } catch (e) {}
        if (v) return v;
        try { if (hud && hud.GetAttributeString) v = hud.GetAttributeString(name, ""); } catch (e) {}
        return v || "";
    }
    function writeState(root, hud, state, msg) {
        try { if (root && root.SetAttributeString) { root.SetAttributeString(BUILD_SAVE_STATE_ATTR, state); root.SetAttributeString(BUILD_SAVE_MSG_ATTR, msg || ""); } } catch (e) {}
        try { if (hud && hud.SetAttributeString)   { hud.SetAttributeString(BUILD_SAVE_STATE_ATTR, state);  hud.SetAttributeString(BUILD_SAVE_MSG_ATTR, msg || ""); } } catch (e) {}
    }

    function runSave(root, nowMs) {
        if (State.cloudConfigSaveInFlight) return;
        var hud = null;
        try { hud = root && root.FindChildTraverse ? root.FindChildTraverse(PANEL_ID_HUD) : null; } catch (e) { hud = null; }

        var state = readAttr(root, hud, BUILD_SAVE_STATE_ATTR);
        if (state !== "pending") return;

        var token = readAttr(root, hud, BUILD_SAVE_TOKEN_ATTR);
        // Don't re-process a request we already handled (state stays "pending"
        // only until we flip it; guard against double-consume within a frame).
        if (token && token === State.cloudConfigLastSaveToken && State.cloudConfigLastSaveDone) return;

        var payload = readAttr(root, hud, BUILD_SAVE_REQUEST_ATTR);
        payload = payload ? String(payload).replace(/\s+/g, "") : "";
        var m = payload.match(EXPORT_TOKEN_REGEX);
        if (!m || !m[1]) {
            writeState(root, hud, "failed", "bad_payload");
            State.cloudConfigLastSaveToken = token;
            State.cloudConfigLastSaveDone = true;
            log("save bad payload");
            return;
        }
        var base64url = m[1];

        var accountId = GetAccountIdForBuildCategoryPayload(root);
        if (!accountId || accountId.length === 0) {
            // No account yet — leave pending; WatchBuildSaveStatus keeps waiting.
            return;
        }

        // Date.now() as revision: naturally monotonic across launches with zero
        // persisted state, which is exactly what the worker's stale-guard wants.
        var revision = Date.now ? Date.now() : (new Date()).getTime();

        State.cloudConfigSaveInFlight = true;
        State.cloudConfigLastSaveToken = token;
        State.cloudConfigLastSaveDone = false;
        writeState(root, hud, "pending", "saving");
        log("save start account=" + accountId + " rev=" + revision + " bytes=" + base64url.length);

        QOL.net.save(accountId, revision, base64url, function(ok, reason) {
            try {
                if (ok) {
                    writeState(root, hud, "success", "cloud_saved");
                    log("save ok account=" + accountId);
                } else {
                    writeState(root, hud, "failed", String(reason || "error"));
                    log("save fail account=" + accountId + " reason=" + String(reason));
                }
            } catch (e) {
                $.Msg("[QOLLock][ERROR][" + _featureId + "] save cb: " + (e && e.message ? e.message : e) + "\n");
            }
            State.cloudConfigSaveInFlight = false;
            State.cloudConfigLastSaveDone = true;
        });
    }

    // ── Update ──
    function UpdateCloudConfig(root, cfg, nowMs) {
        if (!isEnabled()) return;
        if (!root) return;
        if (!netReady()) return;
        runBootLoad(root, nowMs);
        runSave(root, nowMs);
    }

    // ── Registration ──
    QOL.register("cloudConfig", {
        configKeys: [],
        bucket: 0, phase: -1,
        requiresRoot: true,
        gate: function() { return isEnabled(); },
        update: function(root, cfg, nowMs) {
            try { UpdateCloudConfig(root, cfg, nowMs); }
            catch (e) { $.Msg("[QOLLock][ERROR][" + _featureId + "] " + e.message + "\n" + e.stack); throw e; }
        },
        stateKeys: [
            "cloudConfigBootInFlight", "cloudConfigBootDone", "cloudConfigBootAccountId",
            "cloudConfigSaveInFlight", "cloudConfigLastSaveToken", "cloudConfigLastSaveDone"
        ]
    });

    // ── Self-test ──
    try {
        if (typeof UpdateCloudConfig !== "function") throw new Error("UpdateCloudConfig missing");
        if (!BuildAppliedConfig) $.Msg("[QOLLock][WARN][" + _featureId + "] buildAppliedConfig dep missing — cloud load will fail\n");
        if (!ResolveBuildPayloadCompactSemverFromWireVersion) $.Msg("[QOLLock][WARN][" + _featureId + "] semver resolver dep missing\n");
    } catch (e) {
        $.Msg("[QOLLock][ERROR][" + _featureId + "] self-test: " + e.message + "\n");
    }
})();
