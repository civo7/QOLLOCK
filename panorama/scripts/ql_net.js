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

    // Downlink encoding — MUST match worker.js exactly.
    //
    // One image dimension carries ONE small "level", not a full byte:
    //   dim = level*STEP + BASE   (STEP=9, BASE=15)
    //
    // WHY levels, not bytes: a full byte (256 values) can't be packed into one
    // dimension and survive UI scaling. The engine's actuallayout rounds, and on a
    // scaled display it also biases small sizes UPWARD by ~1px; two rounding steps
    // (scale-correct, then de-quantize) then push adjacent values across a boundary.
    // A friend on a 1.333x UI had the manifest byte 0 (a 16px image) come back as
    // level 1 — T decoded as 409 instead of 153, and the whole load reassembled
    // garbage. See github2/IMAGE_SIDECHANNEL_1PX_BUG.md.
    //
    // STEP=9 spaces adjacent levels 9 logical px apart so a ±2px engine error
    // can't cross a boundary even when a sub-1080p display DOWNSCALES (downscale
    // amplifies an absolute px error by 1/uiScale — a tighter step failed at 720p
    // in the resolution simulator). BASE=15 keeps level 0 off the rounding floor.
    // A data image encodes one byte as two nibbles (levels 0..15, max 150px); the
    // manifest encodes T as two 6-bit levels (0..63, max 582px). Both stay under
    // the 600px probe envelope, so the host panel is unchanged.
    var STEP = 9;
    var BASE = 15;

    var REQ_TIMEOUT_MS = 8000;
    // Seconds between dimension checks. ~1 frame @60fps — the smallest useful
    // step, since a ready image can't be observed sooner than the next poll. At
    // 0.05 every one of the ~13 load waves paid a 50ms floor; 0.016 cuts that to
    // ~16ms per wave.
    var POLL_STEP = 0.016;

    // Parallel load batch. Grow on clean responses, shrink on any stall. Panorama's
    // image loader is known to wedge when too many <Image> loads are in flight at
    // once (mg_net.js runs strictly serial for that reason), so growth is bounded
    // and any stall halves the width immediately.
    //
    // START is the width the FIRST wave launches at; the batch then ramps UP inside
    // a single pass as clean responses land (see growOnClean below). This matters
    // because a ~151-byte config reassembles in one pass — the old between-pass
    // growth never fired on a normal load, pinning it at the start width forever.
    var BATCH_WIDTH_START = 8;
    var BATCH_WIDTH_MIN = 1;
    var BATCH_WIDTH_MAX = 24;
    var _batchWidth = BATCH_WIDTH_START;

    // ── Net logging (ON by default; net-scoped only) ──
    // Prints straight through $.Msg with a [QOLLock][net] tag, deliberately NOT
    // through QOL_UTILS.DebugLog: that is gated by the global debug flag and adds
    // its own throttling. We want the full transport trace on every launch without
    // turning on the noisy global debug — so a save/load failure is diagnosable
    // from the console alone, point by point.
    var DEBUG = true;
    function log(msg) {
        if (!DEBUG) return;
        try {
            if (typeof $ !== "undefined" && $.Msg) $.Msg("[QOLLock][net] " + msg + "\n");
        } catch (e) {}
    }
    function setDebug(on) { DEBUG = !!on; }

    // ── Invisible host panel that carries the request images ──
    // Must be on-screen and not culled (an off-screen / zero-opacity / occluded
    // panel makes Panorama skip the image load entirely), and larger than the
    // biggest response image (the 600x1000 probe) so a clamped probe can't
    // mis-calibrate. Rendered at 2% opacity with input passed through, so its
    // footprint is invisible and never steals menu hover.
    var HOST_W = 640, HOST_H = 1020;
    var host = null;
    function ensureHost() {
        if (host && host.IsValid && host.IsValid()) return host;
        try {
            var ctx = $.GetContextPanel();
            host = $.CreatePanel("Panel", ctx, "QOL_NetHost");
            host.style.position = "2px 2px 0px";
            host.style.width = HOST_W + "px";
            host.style.height = HOST_H + "px";
            host.style.opacity = "0.02";
            host.style.zIndex = "99999";
            host.SetAttributeString("hittest", "false");
            host.SetAttributeString("hittestchildren", "false");
            log("host created (styled " + HOST_W + "x" + HOST_H + " layout-units)");
            // The clamp hypothesis stands or falls on this: on a UI-scaled display
            // actuallayoutwidth reports the styled size * UI-scale. If that exceeds
            // the styled size a response image can be pinned to the host. Read it
            // back next frame so the log shows the ACTUAL host pixels.
            $.Schedule(0.05, function () {
                if (!host || !host.IsValid || !host.IsValid()) return;
                var aw = 0, ah = 0;
                try { aw = host.actuallayoutwidth; ah = host.actuallayoutheight; } catch (e) {}
                var sx = aw > 0 ? (aw / HOST_W) : 0;
                log("host actual=" + Math.round(aw) + "x" + Math.round(ah) +
                    " (UI-scale~" + sx.toFixed(3) + "); response images capped at this size");
            });
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
            var reqId = reqCounter - 1;
            var fullUrl = BASE_URL + path + ".png?" + qs;
            img.SetImage(fullUrl);
            log("req#" + reqId + " -> " + path + " (inFlight=" + inFlight + ") url=" + fullUrl);
        } catch (e) {
            inFlight--;
            log("req EXC sending " + path + ": " + (e && e.message ? e.message : e));
            if (onError) onError("exception");
            return;
        }

        var startMs = (typeof Date !== "undefined" && Date.now) ? Date.now() : 0;
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
            var w = 0, hh = 0, readErr = null;
            try { w = img.actuallayoutwidth; hh = img.actuallayoutheight; } catch (e) { readErr = (e && e.message ? e.message : String(e)); }
            if (readErr) log("req#" + reqId + " dim-read exc: " + readErr);
            if (w > 0 && hh > 0) {
                finished = true;
                var took = startMs ? (Date.now() - startMs) : elapsed;
                log("req#" + reqId + " OK " + path + " raw=" + w + "x" + hh + " in " + took + "ms");
                cleanup();
                onDone(w, hh);
                return;
            }
            elapsed += POLL_STEP * 1000;
            if (elapsed >= REQ_TIMEOUT_MS) {
                finished = true;
                log("req#" + reqId + " TIMEOUT " + path + " after " + Math.round(elapsed) + "ms (never got positive dims)");
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

    // Diagnostic breadcrumb from the LAST probe attempt. When calibration fails the
    // three root causes look identical to the user ("calib") but need different
    // fixes, so we bridge the raw evidence up in the reason string:
    //   • "noimg"     raw 0x0  — the probe <Image> never loaded at all (Proton /
    //                 ISP / TLS blocking a remote *.workers.dev PNG). Host resize
    //                 will NOT help.
    //   • "WxH:clamp" the probe came back but was pinned to the host width (the
    //                 640px host clamps a UI-scaled 600px probe on a >1080p display).
    //                 THIS is the one a bigger host panel fixes.
    //   • "WxH:distort" returned but wrong aspect for another reason.
    // Format bridged to settings: "calib:<detail>" e.g. "calib:854x1080:clamp".
    var lastProbeDiag = "";
    function finishCalib() {
        calibrated = true; calibrating = false;
        var ws = calibWaiters; calibWaiters = [];
        for (var i = 0; i < ws.length; i++) { try { ws[i].go(); } catch (e) {} }
    }
    function failCalib() {
        calibrating = false;
        var detail = lastProbeDiag ? ("calib:" + lastProbeDiag) : "calib";
        var ws = calibWaiters; calibWaiters = [];
        for (var i = 0; i < ws.length; i++) { try { if (ws[i].fail) ws[i].fail(detail); } catch (e) {} }
    }
    function calibrate(cb, fail) {
        if (calibrated) { if (cb) cb(); return; }
        if (cb) calibWaiters.push({ go: cb, fail: fail });
        if (calibrating) return;
        calibrating = true;
        probeOnce(1);
    }
    function probeOnce(attempt) {
        log("probe attempt " + attempt + "/" + PROBE_ATTEMPTS + " (expect ref " + PROBE_W + "x" + PROBE_H + ")");
        function retryOrFail(why) {
            if (attempt < PROBE_ATTEMPTS) { log("probe " + attempt + " " + why + "; retrying"); probeOnce(attempt + 1); return; }
            log("probe FAILED all " + PROBE_ATTEMPTS + " attempts; giving up. lastDiag=" + lastProbeDiag); failCalib();
        }
        rawRequestNow("/api/probe", null, function (w, hh) {
            var rawW = w, rawH = hh;
            var sw = false;
            if (w > hh) { sw = true; var t = w; w = hh; hh = t; }
            var sx = w / PROBE_W, sy = hh / PROBE_H;
            // Uniform UI scale => sx ≈ sy. Divergence means the probe was clamped to
            // a wrong-aspect container; reject and retry rather than latch garbage.
            var lo = Math.min(sx, sy), hi = Math.max(sx, sy);
            var skew = hi > 0 ? ((hi - lo) / hi) : 1;
            log("probe raw=" + rawW + "x" + rawH + " swap=" + sw +
                " sx=" + sx.toFixed(3) + " sy=" + sy.toFixed(3) +
                " skew=" + (skew * 100).toFixed(1) + "% (reject if >15% or scale<=0.05)");
            if (!(lo > 0.05) || skew > 0.15) {
                // Record raw dims + guess whether it was clamped to the ~640px host.
                var kind = (Math.max(rawW, rawH) >= HOST_W - 5) ? "clamp" : "distort";
                lastProbeDiag = Math.round(rawW) + "x" + Math.round(rawH) + ":" + kind;
                if (kind === "clamp") log("probe likely CLAMPED to host (" + HOST_W + "px) — a UI-scaled 600px probe outgrew it. Fix = enlarge host panel.");
                else log("probe distorted (wrong aspect, not a plain host clamp).");
                retryOrFail("distorted " + lastProbeDiag); return;
            }
            swap = sw; scaleX = sx; scaleY = sy;
            log("CALIBRATED ok swap=" + swap + " sx=" + scaleX.toFixed(3) + " sy=" + scaleY.toFixed(3));
            finishCalib();
        }, function (e) {
            lastProbeDiag = (e === "timeout" ? "timeout" : "noimg");
            log("probe transport fail: " + e + " -> " + lastProbeDiag +
                (lastProbeDiag === "noimg" ? " (image never loaded; Proton/ISP/TLS block? host resize won't help)"
                                           : " (loaded too slow; raise REQ_TIMEOUT_MS or check latency)"));
            retryOrFail("failed");
        });
    }

    // Scale-correct a raw (w,h) image to logical pixels — WITHOUT rounding. The
    // single rounding step happens in decodeLevel, so a scaled dimension is never
    // rounded twice (double-rounding is what tipped values across a boundary).
    function decodeWH(w, hh) {
        if (swap) { var t = w; w = hh; hh = t; }
        return { w: w / scaleX, h: hh / scaleY };
    }
    // Recover the encoded level: dim = level*STEP + BASE  =>  level = (dim-BASE)/STEP.
    // `dim` is the scale-corrected (still-float) value from decodeWH.
    function decodeLevel(dim) { return Math.round((dim - BASE) / STEP); }

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
    // cb(true) on ok; cb(false, reason) on any failure.
    // reason: badparams|rate|stale|error|timeout|net|calib
    //   "calib" = the /api/probe calibration never succeeded, so we never even
    //   sent the save. That points at transport/scaling (e.g. a probe clamped to
    //   the host on a non-1080p UI), NOT at the server rejecting the write — it's
    //   deliberately distinct from "net" so a failure can be told apart in-game.
    function save(accountId, revision, base64url, cb) {
        function done(okFlag, reason) {
            log("SAVE done ok=" + okFlag + (reason ? (" reason=" + reason) : ""));
            if (cb) { try { cb(okFlag, reason); } catch (e) {} }
        }
        log("SAVE start account=" + accountId + " rev=" + revision + " payload=" + (base64url ? base64url.length : 0) + " chars");
        calibrate(function () {
            log("SAVE calibrated, sending /api/save");
            rawRequestNow("/api/save", { id: accountId, rev: revision, d: base64url }, function (w, hh) {
                var r = decodeWH(w, hh);
                // The reply is two status codes, each one level per dimension —
                // decode them back before matching.
                var cw = decodeLevel(r.w), ch = decodeLevel(r.h);
                log("SAVE reply decoded=(" + cw + "," + ch + ") rawpx=(" + Math.round(w) + "," + Math.round(hh) + ")");
                if (cw === 1 && ch === 1) { done(true); return; }
                if (cw === 9) {
                    var reason = ch === 2 ? "rate" : ch === 3 ? "stale" : ch === 1 ? "badparams" : "error";
                    log("SAVE rejected by server code (9," + ch + ") -> " + reason);
                    done(false, reason);
                    return;
                }
                log("SAVE unexpected reply (" + cw + "," + ch + ") -> error");
                done(false, "error");
            }, function (e) { log("SAVE transport fail: " + e); done(false, e === "timeout" ? "timeout" : "net"); });
        }, function (detail) { log("SAVE aborted, calibration failed (" + detail + ")"); done(false, detail || "calib"); });
    }

    // ── LOAD: manifest -> parallel data batch -> reassemble -> verify crc ──
    // cb(bytes) with the raw config binary (feed to DeserializeBuildPayloadCompact),
    // or cb(null, reason) — reason: empty|net|corrupt|timeout|calib. "empty" =
    // nothing stored for this account (use defaults), which is a success, not an
    // error. "calib" = calibration failed before the manifest was ever fetched
    // (transport/scaling), kept distinct from "net" so it can be told apart.
    //
    // onProgress(phase, done, total) — OPTIONAL live status hook, called as:
    //   ("calibrate", 0, 0)         once calibration starts
    //   ("manifest", 0, 0)          fetching the manifest (chunk 0)
    //   ("chunks", got, totalBytes) after each data byte lands (got/total bytes)
    //   ("verify", total, total)    reassembled, verifying crc
    // Purely cosmetic — a wedge here never blocks the actual load.
    function load(accountId, cb, onProgress) {
        function done(bytes, reason) {
            log("LOAD done bytes=" + (bytes ? bytes.length : 0) + (reason ? (" reason=" + reason) : ""));
            if (cb) { try { cb(bytes, reason); } catch (e) {} }
        }
        function prog(phase, d, t) { if (onProgress) { try { onProgress(phase, d, t); } catch (e) {} } }
        log("LOAD start account=" + accountId);
        prog("calibrate", 0, 0);
        calibrate(function () {
            // Manifest (chunk 0): dims encode 16-bit total stream length T.
            log("LOAD calibrated, fetching manifest (chunk 0)");
            prog("manifest", 0, 0);
            rawRequestNow("/api/load", { id: accountId, chunk: 0 }, function (w, hh) {
                var m = decodeWH(w, hh);
                // Manifest carries T as two 6-bit levels (0..63): T = hi*64 + lo.
                var hi = decodeLevel(m.w), lo = decodeLevel(m.h);
                var T = hi * 64 + lo;
                log("LOAD manifest levels=(" + hi + "," + lo + ") rawpx=(" + Math.round(w) + "," + Math.round(hh) + ") -> stream length T=" + T + " bytes");
                if (T === 0) { log("LOAD nothing stored (empty account, defaults)"); done(null, "empty"); return; }
                if (T < 3) { log("LOAD bogus manifest T=" + T + " -> corrupt"); done(null, "corrupt"); return; }
                fetchStream(accountId, T, done, prog);
            }, function (e) { log("LOAD manifest transport fail: " + e); done(null, e === "timeout" ? "timeout" : "net"); });
        }, function (detail) { log("LOAD aborted, calibration failed (" + detail + ")"); done(null, detail || "calib"); });
    }

    // Fetch all T stream bytes across T data chunks (one byte per image, carried
    // as two nibbles), in self-tuning parallel batches, then verify crc16.
    // Re-request only chunks still missing.
    function fetchStream(accountId, T, done, prog) {
        prog = prog || function () {};
        var nChunks = T;                     // one image per byte, chunk index 1..T
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
            // chunk i (1-based) carries stream[i-1] as two nibbles:
            //   byte = highNibble*16 + lowNibble, high in w, low in h.
            var base = i - 1;
            var hi = decodeLevel(r.w), lo = decodeLevel(r.h);
            stream[base] = ((hi & 15) << 4) | (lo & 15);
            got[base] = 1;
        }
        function missingChunks() {
            var list = [];
            for (var i = 1; i <= nChunks; i++) {
                if (!got[i - 1]) list.push(i);
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
                    // Ramp WITHIN the pass: a whole stream usually lands in one pass,
                    // so between-pass growth never fires — the load runs entirely at
                    // BATCH_WIDTH_START otherwise. Widen on each clean response so
                    // pump() opens more slots as we go, then let pump refill them.
                    if (!stalled && _batchWidth < BATCH_WIDTH_MAX) _batchWidth++;
                    if (idx < pending.length) pump();
                    else if (batchInFlight === 0) finishPass();
                }, function () {
                    // Any stall: halve the width NOW so the rest of this pass backs
                    // off immediately, not just on the next pass.
                    batchInFlight--; stalled = true;
                    _batchWidth = Math.max(BATCH_WIDTH_MIN, (_batchWidth >> 1) || 1);
                    if (idx < pending.length) pump();
                    else if (batchInFlight === 0) finishPass();
                });
            }
            function finishPass() {
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
