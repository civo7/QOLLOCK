// ql_net.js — image side-channel client for the QOLLOCK cloud settings store.
//
// Panorama UI has no fetch / AsyncWebRequest / websockets. The only way to read
// data back from a server is the intrinsic pixel size of an <Image>: we set the
// image src (data goes UP via URL query params — unlimited) and poll
// actuallayoutwidth/height to read the response, which the worker encoded as the
// image's (width, height). This is the same transport the Minigames mod uses
// (panorama/scripts/mg_net.js) — see server/README.md for the protocol.
//
// QOLLOCK's use is asymmetric and one-shot, not real-time:
//   • SAVE  — one image GET. The whole config rides up in the query string.
//   • LOAD  — a manifest image (chunk 0) then N data images, fetched in a
//             PARALLEL batch, reassembled, and integrity-checked with a crc16.
//             Missing/garbled chunks are re-requested point-wise, never all.
//
// Everything hangs off QOL.net so both ql_core (HUD) and ql_settings can use it.
//
// NOTE: timing/parallelism figures here are a DESIGN for in-game testing, not
// verified facts — this cannot be rendered outside the game. BATCH_WIDTH is
// deliberately conservative and self-tuning so a wedge degrades, never deadlocks.
(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // CONFIG: after `npx wrangler deploy` (see server/), paste the workers.dev URL.
    var BASE_URL = "https://qollock-settings.predi.workers.dev";
    // ─────────────────────────────────────────────────────────────────────────

    // Must match the server's downlink STEP (dim = byte*STEP + 1).
    var STEP = 1;

    var REQ_TIMEOUT_MS = 8000;
    var POLL_STEP = 0.05;   // seconds between dimension checks

    // Parallel load batch. Start conservative; grow on clean batches, shrink on any
    // stall. Panorama's image loader is known to wedge when too many <Image> loads
    // are in flight at once (mg_net.js runs strictly serial for that reason), so the
    // ceiling is intentionally low until in-game testing establishes a safe max.
    var BATCH_WIDTH_START = 6;
    var BATCH_WIDTH_MIN = 1;
    var BATCH_WIDTH_MAX = 24;
    var _batchWidth = BATCH_WIDTH_START;

    // ── Debug logging (ships OFF; routes through QOL_UTILS when present) ──
    var DEBUG = false;
    function log(msg) {
        if (!DEBUG) return;
        try {
            if (typeof QOL_UTILS !== "undefined" && QOL_UTILS && QOL_UTILS.DebugLog) {
                QOL_UTILS.DebugLog("net", msg);
            } else if (typeof $ !== "undefined" && $.Msg) {
                $.Msg("[QOLLock][net] " + msg + "\n");
            }
        } catch (e) {}
    }
    function setDebug(on) { DEBUG = !!on; }

    // ── Invisible host panel that carries the request images ──
    // Must be on-screen and not culled (an off-screen / zero-opacity / occluded
    // panel makes Panorama skip the image load entirely), and larger than the
    // biggest response image (the 600x1000 probe) so a clamped probe can't
    // mis-calibrate. Rendered at 2% opacity with input passed through, so its
    // footprint is invisible and never steals menu hover.
    var host = null;
    function ensureHost() {
        if (host && host.IsValid && host.IsValid()) return host;
        try {
            var ctx = $.GetContextPanel();
            host = $.CreatePanel("Panel", ctx, "QOL_NetHost");
            host.style.position = "2px 2px 0px";
            host.style.width = "640px";
            host.style.height = "1020px";
            host.style.opacity = "0.02";
            host.style.zIndex = "99999";
            host.SetAttributeString("hittest", "false");
            host.SetAttributeString("hittestchildren", "false");
        } catch (e) { log("host style exc: " + (e && e.message ? e.message : e)); }
        return host;
    }
    function releaseHost() {
        if (!host) return;
        try { host.DeleteAsync(0); } catch (e) {}
        host = null;
    }

    var reqCounter = 0;
    var inFlight = 0; // number of live rawRequestNow images (for host teardown)

    // Fire one image request; call onDone(rawW, rawH) with the pixel dimensions.
    // Once started a request ALWAYS completes (dims or timeout) — never abort
    // silently, which could latch load state forever.
    function rawRequestNow(path, params, onDone, onError) {
        var img;
        inFlight++;
        try {
            var h = ensureHost();
            img = $.CreatePanel("Image", h, "qolreq_" + (reqCounter++));
            // Do NOT set width/height/scaling: any explicit size overrides the
            // intrinsic pixel size we need to read. Left unset, the Image lays out
            // at the PNG's real dimensions.
            img.style.position = "0px 0px 0px";

            var qs = "rnd=" + Math.random() + "x" + reqCounter;
            if (params) {
                for (var k in params) {
                    if (params.hasOwnProperty(k)) {
                        qs += "&" + k + "=" + encodeURIComponent(params[k]);
                    }
                }
            }
            // Panorama's image loader keys off the URL extension — it silently
            // refuses a URL that doesn't look like an image, so paths end ".png".
            img.SetImage(BASE_URL + path + ".png?" + qs);
        } catch (e) {
            inFlight--;
            log("EXC sending " + path + ": " + (e && e.message ? e.message : e));
            if (onError) onError("exception");
            return;
        }

        var elapsed = 0;
        var finished = false;
        function cleanup() {
            inFlight--;
            try { img.SetImage(""); } catch (e) {}
            try { img.DeleteAsync(0); } catch (e) {}
            if (inFlight <= 0) releaseHost();
        }
        function check() {
            if (finished) return;
            var w = 0, hh = 0;
            try { w = img.actuallayoutwidth; hh = img.actuallayoutheight; } catch (e) {}
            if (w > 0 && hh > 0) {
                finished = true;
                cleanup();
                onDone(w, hh);
                return;
            }
            elapsed += POLL_STEP * 1000;
            if (elapsed >= REQ_TIMEOUT_MS) {
                finished = true;
                cleanup();
                if (onError) onError("timeout");
                return;
            }
            $.Schedule(POLL_STEP, check);
        }
        $.Schedule(POLL_STEP, check);
    }

    // ── Calibration from /api/probe (known 600x1000) ──
    // A LARGE reference makes the derived scale precise, so small returned byte
    // values decode without rounding drift. Also detects whether the engine
    // reports width/height swapped. NEVER fall back to scale=1 on a scaled UI —
    // that decodes garbage.
    var PROBE_W = 600, PROBE_H = 1000;
    var swap = false, scaleX = 1, scaleY = 1, calibrated = false, calibrating = false;
    var calibWaiters = [];
    var PROBE_ATTEMPTS = 3;

    function finishCalib() {
        calibrated = true; calibrating = false;
        var ws = calibWaiters; calibWaiters = [];
        for (var i = 0; i < ws.length; i++) { try { ws[i].go(); } catch (e) {} }
    }
    function failCalib() {
        calibrating = false;
        var ws = calibWaiters; calibWaiters = [];
        for (var i = 0; i < ws.length; i++) { try { if (ws[i].fail) ws[i].fail("calibration"); } catch (e) {} }
    }
    function calibrate(cb, fail) {
        if (calibrated) { if (cb) cb(); return; }
        if (cb) calibWaiters.push({ go: cb, fail: fail });
        if (calibrating) return;
        calibrating = true;
        probeOnce(1);
    }
    function probeOnce(attempt) {
        function retryOrFail(why) {
            if (attempt < PROBE_ATTEMPTS) { log("probe " + attempt + " " + why + "; retry"); probeOnce(attempt + 1); return; }
            log("probe failed " + PROBE_ATTEMPTS + "x; giving up"); failCalib();
        }
        rawRequestNow("/api/probe", null, function (w, hh) {
            var sw = false;
            if (w > hh) { sw = true; var t = w; w = hh; hh = t; }
            var sx = w / PROBE_W, sy = hh / PROBE_H;
            // Uniform UI scale => sx ≈ sy. Divergence means the probe was clamped to
            // a wrong-aspect container; reject and retry rather than latch garbage.
            var lo = Math.min(sx, sy), hi = Math.max(sx, sy);
            if (!(lo > 0.05) || (hi - lo) / hi > 0.15) { retryOrFail("distorted"); return; }
            swap = sw; scaleX = sx; scaleY = sy;
            log("calibrated swap=" + swap + " sx=" + scaleX.toFixed(3) + " sy=" + scaleY.toFixed(3));
            finishCalib();
        }, function () { retryOrFail("failed"); });
    }

    // Decode a raw (w,h) image back to the two logical numbers the worker encoded.
    function decodeWH(w, hh) {
        if (swap) { var t = w; w = hh; hh = t; }
        return { w: Math.round(w / scaleX), h: Math.round(hh / scaleY) };
    }
    // A data chunk's two bytes: logical dim = byte*STEP + 1  =>  byte = (dim-1)/STEP.
    function decodeByte(dim) { return Math.round((dim - 1) / STEP); }

    // ── crc16 (CCITT-FALSE) — must match server ──
    function crc16(bytes) {
        var crc = 0xffff;
        for (var i = 0; i < bytes.length; i++) {
            crc ^= (bytes[i] & 255) << 8;
            for (var k = 0; k < 8; k++) { crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1); crc &= 0xffff; }
        }
        return crc & 0xffff;
    }

    // ── SAVE: one GET. base64url config rides up in the query string. ──
    // cb(true) on ok; cb(false, reason) on any failure. reason: badparams|rate|stale|error|timeout|net
    function save(accountId, revision, base64url, cb) {
        function done(okFlag, reason) { if (cb) { try { cb(okFlag, reason); } catch (e) {} } }
        calibrate(function () {
            rawRequestNow("/api/save", { id: accountId, rev: revision, d: base64url }, function (w, hh) {
                var r = decodeWH(w, hh);
                if (r.w === 1 && r.h === 1) { done(true); return; }
                if (r.w === 9) {
                    var reason = r.h === 2 ? "rate" : r.h === 3 ? "stale" : r.h === 1 ? "badparams" : "error";
                    log("save rejected (" + r.w + "," + r.h + ") " + reason);
                    done(false, reason);
                    return;
                }
                log("save unexpected (" + r.w + "," + r.h + ")");
                done(false, "error");
            }, function (e) { done(false, e === "timeout" ? "timeout" : "net"); });
        }, function () { done(false, "net"); });
    }

    // ── LOAD: manifest -> parallel data batch -> reassemble -> verify crc ──
    // cb(bytes) with the raw config binary (feed to DeserializeBuildPayloadCompact),
    // or cb(null, reason) — reason: empty|net|corrupt|timeout. "empty" = nothing
    // stored for this account (use defaults), which is a success, not an error.
    //
    // onProgress(phase, done, total) — OPTIONAL live status hook, called as:
    //   ("calibrate", 0, 0)         once calibration starts
    //   ("manifest", 0, 0)          fetching the manifest (chunk 0)
    //   ("chunks", got, totalBytes) after each data byte lands (got/total bytes)
    //   ("verify", total, total)    reassembled, verifying crc
    // Purely cosmetic — a wedge here never blocks the actual load.
    function load(accountId, cb, onProgress) {
        function done(bytes, reason) { if (cb) { try { cb(bytes, reason); } catch (e) {} } }
        function prog(phase, d, t) { if (onProgress) { try { onProgress(phase, d, t); } catch (e) {} } }
        prog("calibrate", 0, 0);
        calibrate(function () {
            // Manifest (chunk 0): dims encode 16-bit total stream length T.
            prog("manifest", 0, 0);
            rawRequestNow("/api/load", { id: accountId, chunk: 0 }, function (w, hh) {
                var m = decodeWH(w, hh);
                var T = (m.w - 1) * 256 + (m.h - 1);
                if (T === 0) { log("load: nothing stored"); done(null, "empty"); return; }
                if (T < 3) { log("load: bogus manifest T=" + T); done(null, "corrupt"); return; }
                fetchStream(accountId, T, done, prog);
            }, function (e) { done(null, e === "timeout" ? "timeout" : "net"); });
        }, function () { done(null, "net"); });
    }

    // Fetch all T stream bytes across ceil(T/2) data chunks, in self-tuning
    // parallel batches, then verify crc16. Re-request only chunks still missing.
    function fetchStream(accountId, T, done, prog) {
        prog = prog || function () {};
        var nChunks = Math.ceil(T / 2);      // chunk index 1..nChunks
        var stream = new Array(T);
        var got = new Array(T);              // per-byte presence
        var attemptsLeft = 4;                // whole-stream repair passes
        function reportChunks() {
            var n = 0;
            for (var i = 0; i < T; i++) if (got[i]) n++;
            prog("chunks", n, T);
        }
        prog("chunks", 0, T);

        function bytesForChunk(i, r) {
            // chunk i (1-based) carries stream[2(i-1)] and stream[2(i-1)+1]
            var base = 2 * (i - 1);
            stream[base] = decodeByte(r.w); got[base] = 1;
            if (base + 1 < T) { stream[base + 1] = decodeByte(r.h); got[base + 1] = 1; }
        }
        function missingChunks() {
            var list = [];
            for (var i = 1; i <= nChunks; i++) {
                var base = 2 * (i - 1);
                if (!got[base] || (base + 1 < T && !got[base + 1])) list.push(i);
            }
            return list;
        }

        function runPass() {
            var pending = missingChunks();
            if (pending.length === 0) { verify(); return; }
            if (attemptsLeft-- <= 0) { log("load: gave up with " + pending.length + " chunks missing"); done(null, "corrupt"); return; }

            var idx = 0, stalled = false;
            function pump() {
                // Keep up to _batchWidth requests in flight from the pending list.
                while (idx < pending.length && batchInFlight < _batchWidth) {
                    launch(pending[idx++]);
                }
            }
            var batchInFlight = 0, launchedThisPass = 0, okThisPass = 0;
            function launch(chunkIdx) {
                batchInFlight++; launchedThisPass++;
                rawRequestNow("/api/load", { id: accountId, chunk: chunkIdx }, function (w, hh) {
                    batchInFlight--; okThisPass++;
                    bytesForChunk(chunkIdx, decodeWH(w, hh));
                    reportChunks();
                    if (idx < pending.length) pump();
                    else if (batchInFlight === 0) finishPass();
                }, function () {
                    batchInFlight--; stalled = true;
                    if (idx < pending.length) pump();
                    else if (batchInFlight === 0) finishPass();
                });
            }
            function finishPass() {
                // Self-tune: a fully clean pass grows the batch; any stall shrinks it.
                if (stalled) _batchWidth = Math.max(BATCH_WIDTH_MIN, (_batchWidth >> 1) || 1);
                else if (okThisPass === launchedThisPass) _batchWidth = Math.min(BATCH_WIDTH_MAX, _batchWidth + 2);
                log("load pass: +" + okThisPass + "/" + launchedThisPass + " batch=" + _batchWidth);
                runPass();
            }
            pump();
        }

        function verify() {
            prog("verify", T, T);
            var data = stream.slice(0, T - 2);
            var wantCrc = ((stream[T - 2] & 255) << 8) | (stream[T - 1] & 255);
            var gotCrc = crc16(data);
            if (gotCrc !== wantCrc) {
                log("load: crc mismatch want=" + wantCrc + " got=" + gotCrc + "; retrying");
                if (attemptsLeft-- > 0) { for (var i = 0; i < T; i++) got[i] = 0; runPass(); return; }
                done(null, "corrupt");
                return;
            }
            log("load: ok " + data.length + " bytes, crc verified");
            done(data, null);
        }

        runPass();
    }

    // ── Publish onto QOL.net (both contexts) and a bare global fallback ──
    var api = {
        isConfigured: function () { return BASE_URL.indexOf("workers.dev") !== -1 || BASE_URL.indexOf("http") === 0; },
        save: save,
        load: load,
        setDebug: setDebug,
        _state: function () { return { calibrated: calibrated, swap: swap, scaleX: scaleX, scaleY: scaleY, batchWidth: _batchWidth }; }
    };
    try { if (typeof QOL !== "undefined" && QOL) QOL.net = api; } catch (e) {}
    try { if (typeof window !== "undefined") window.QOL_NET = api; } catch (e) {}

    log("loaded (configured=" + api.isConfigured() + ")");
})();
