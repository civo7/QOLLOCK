#!/usr/bin/env node
/*
 * simulate_resolutions.js — offline monitor-resolution tester for the QOLLOCK
 * cloud-save image side-channel. Lets us prove the encode/decode survives a given
 * display WITHOUT shipping a repack to a tester every time.
 *
 * Background: Panorama has no fetch. The worker answers each request with a tiny
 * PNG whose (width,height) encode data; the client reads actuallayoutwidth/height.
 * The engine ROUNDS that layout size, and on a UI-scaled display it also biases
 * SMALL sizes upward by ~1-2px. A friend on a 1.333x UI (1440p) had loads decode
 * garbage because a byte packed into one dimension couldn't survive that rounding.
 * The fix encodes ONE small "level" per dimension, widely spaced. This tool models
 * the whole pipeline across a matrix of resolutions and reports pass/fail.
 *
 * WHAT IT MODELS (faithfully mirrors ql_net.js + worker.js):
 *   server:  dim = level*STEP + BASE          (enc)
 *   engine:  actualPx = round(dim * uiScale) + bias, clamped to host*uiScale
 *            uiScale = verticalResolution / 1080   (Source2 Panorama reference)
 *            bias    = the small-size upward error; we sweep a worst-case RANGE
 *                      per dimension and require EVERY value in it to decode right
 *   client:  probe(600px) -> scale = probeActualPx / 600
 *            decodeWH: px / scale                (NO rounding — matches source)
 *            decodeLevel: round((v - BASE)/STEP) (the single rounding step)
 *
 * DRIFT GUARD: STEP/BASE are parsed out of the real source files and asserted to
 * match each other and this tool's constants, so a future tuning can't make the
 * simulator silently lie. If the shape of the source changes, this assert fails
 * loudly and this file must be updated alongside it.
 *
 * Usage:
 *   node scripts/simulate_resolutions.js            # full matrix, summary table
 *   node scripts/simulate_resolutions.js --verbose  # also list every failure
 *   node scripts/simulate_resolutions.js --bias N   # max upward small-size bias px (default 2)
 */

const fs = require("fs");
const path = require("path");

// ── Encoding constants (mirrored from source; verified against it below) ──
const STEP = 9;
const BASE = 15;

// Host panel styled size (layout units) — from ql_net.js HOST_W/HOST_H. Response
// images are clamped to host*uiScale; we model that to catch any clamp regression.
const HOST_W = 640, HOST_H = 1020;
const PROBE_W = 600, PROBE_H = 1000;

// ── Drift guard: parse the real files and confirm nothing has diverged ──
function parseConst(file, name) {
  const src = fs.readFileSync(file, "utf8");
  // Match the DECLARATION `<name> = <int>` — anchored to const/var (possibly via
  // a shared multi-declaration line, e.g. `var HOST_W = 640, HOST_H = 1020;`) so a
  // stale comment mentioning `STEP=5` can't be mistaken for the real value. Strip
  // line comments first, then require const/var earlier on the same statement.
  const code = src.replace(/\/\/[^\n]*/g, "");
  const m = code.match(new RegExp("(?:const|var)[^;\\n]*\\b" + name + "\\s*=\\s*(\\d+)"));
  if (!m) throw new Error("could not find `" + name + "` in " + path.basename(file));
  return parseInt(m[1], 10);
}
function verifySourcesMatch() {
  const root = path.resolve(__dirname, "..");
  const worker = path.join(root, "server", "worker.js");
  const client = path.join(root, "panorama", "scripts", "ql_net.js");
  const pairs = [
    ["worker.js STEP", parseConst(worker, "STEP"), STEP],
    ["worker.js BASE", parseConst(worker, "BASE"), BASE],
    ["ql_net.js STEP", parseConst(client, "STEP"), STEP],
    ["ql_net.js BASE", parseConst(client, "BASE"), BASE],
    ["host width", parseConst(client, "HOST_W"), HOST_W],
    ["host height", parseConst(client, "HOST_H"), HOST_H],
  ];
  const bad = pairs.filter(([, got, want]) => got !== want);
  if (bad.length) {
    console.error("DRIFT: simulator constants no longer match source:");
    for (const [what, got, want] of bad) console.error("  " + what + " source=" + got + " sim=" + want);
    console.error("Update simulate_resolutions.js to match the source, then re-run.");
    process.exit(2);
  }
}

// ── Protocol math (mirrors worker.js enc + ql_net.js decode) ──
const enc = (level) => level * STEP + BASE;
const decodeLevel = (dim) => Math.round((dim - BASE) / STEP);

function crc16(bytes) { // CCITT-FALSE, identical on both sides
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= (bytes[i] & 255) << 8;
    for (let k = 0; k < 8; k++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc & 0xffff;
}

// Server-side encode of one response (chunk 0 = manifest, i>=1 = one data byte).
function serverEncode(stream, T, chunk) {
  if (chunk === 0) return [enc((T >> 6) & 63), enc(T & 63)];       // manifest: two 6-bit levels
  const base = chunk - 1;
  if (base >= T) return [enc(0), enc(0)];                          // past end
  const b = stream[base] & 255;
  return [enc((b >> 4) & 15), enc(b & 15)];                        // one byte as two nibbles
}

// Engine: render an intrinsic PNG dim to the actuallayout px the client reads.
// Clamp to host*scale (never observed to bite for data/manifest, but modelled).
function render(intrinsicPx, uiScale, bias, hostLimitPx) {
  let px = Math.round(intrinsicPx * uiScale) + bias;
  if (px > hostLimitPx) px = hostLimitPx;                          // host clamp
  if (px < 1) px = 1;                                              // never below 1px
  return px;
}

// ── Resolution matrix. uiScale = height/1080 (Source2 Panorama reference). ──
const RESOLUTIONS = [
  { name: "1280x720  (720p)",       w: 1280, h: 720 },
  { name: "1366x768  (laptop)",     w: 1366, h: 768 },
  { name: "1600x900  (900p)",       w: 1600, h: 900 },
  { name: "1920x1080 (1080p)",      w: 1920, h: 1080 },
  { name: "1920x1200 (16:10)",      w: 1920, h: 1200 },
  { name: "2560x1080 (UW 1080)",    w: 2560, h: 1080 },
  { name: "2560x1440 (1440p)",      w: 2560, h: 1440 },
  { name: "3440x1440 (UW 1440)",    w: 3440, h: 1440 },
  { name: "2560x1600 (16:10 QHD+)", w: 2560, h: 1600 },
  { name: "3840x1600 (UW 1600)",    w: 3840, h: 1600 },
  { name: "3840x2160 (4K)",         w: 3840, h: 2160 },
  { name: "5120x2160 (5K2K)",       w: 5120, h: 2160 },
  { name: "7680x4320 (8K)",         w: 7680, h: 4320 },
];

// A representative config stream: 152 config bytes (varied) + 2 crc bytes.
function buildStream() {
  const cfg = [];
  for (let i = 0; i < 152; i++) cfg.push((i * 37 + 11) & 255);     // spread across 0..255
  const crc = crc16(cfg);
  return { stream: cfg.concat([(crc >> 8) & 255, crc & 255]), cfg };
}

// Run the full save->manifest->data->crc round trip for one display, requiring
// EVERY bias in [0..maxBias] (per dimension, worst-case) to decode correctly.
function testResolution(res, maxBias, verbose) {
  const uiScale = res.h / 1080;
  const { stream, cfg } = buildStream();
  const T = stream.length;
  // Probe calibration: the 600x1000 reference. Large, so no small-size bias — the
  // client recovers scale from it exactly the way the game does.
  const probeActualW = render(PROBE_W, uiScale, 0, Math.round(HOST_W * uiScale));
  const scale = probeActualW / PROBE_W;
  const hostLimit = Math.round(HOST_W * uiScale);   // width limit (levels only affect width magnitude <= height here)
  const hostLimitH = Math.round(HOST_H * uiScale);

  const failures = [];

  // Every response dimension is stressed across the full bias range independently.
  for (let bias = 0; bias <= maxBias; bias++) {
    // 1) Manifest must decode T exactly.
    const [mw, mh] = serverEncode(stream, T, 0);
    const T2 = decodeLevel(render(mw, uiScale, bias, hostLimit) / scale) * 64 +
               decodeLevel(render(mh, uiScale, bias, hostLimitH) / scale);
    if (T2 !== T) { failures.push(`bias=${bias} manifest T=${T2} want ${T}`); continue; }

    // 2) Every data byte must decode exactly.
    const out = new Array(T);
    let dataOk = true;
    for (let c = 1; c <= T; c++) {
      const [w, h] = serverEncode(stream, T, c);
      const hi = decodeLevel(render(w, uiScale, bias, hostLimit) / scale);
      const lo = decodeLevel(render(h, uiScale, bias, hostLimitH) / scale);
      out[c - 1] = ((hi & 15) << 4) | (lo & 15);
      if (out[c - 1] !== stream[c - 1]) {
        dataOk = false;
        failures.push(`bias=${bias} byte#${c - 1} got ${out[c - 1]} want ${stream[c - 1]}`);
        break;
      }
    }
    if (!dataOk) continue;

    // 3) crc must verify (the client's actual gate).
    const data = out.slice(0, T - 2);
    const want = ((out[T - 2] & 255) << 8) | (out[T - 1] & 255);
    if (crc16(data) !== want) failures.push(`bias=${bias} crc mismatch`);
  }

  const clampedManifest = Math.round(enc(63) * uiScale) > hostLimitH; // largest manifest dim vs host
  return { res, uiScale, scale, pass: failures.length === 0, failures, clampedManifest };
}

function main() {
  verifySourcesMatch();
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const bi = args.indexOf("--bias");
  const maxBias = bi >= 0 ? parseInt(args[bi + 1], 10) : 2;

  console.log(`QOLLOCK resolution simulator — STEP=${STEP} BASE=${BASE}, worst-case engine bias 0..${maxBias}px`);
  console.log("(uiScale = height/1080; every response dim stressed across the full bias range)\n");

  let allPass = true;
  const rows = [];
  for (const res of RESOLUTIONS) {
    const r = testResolution(res, maxBias, verbose);
    if (!r.pass) allPass = false;
    rows.push(r);
  }

  const nameW = Math.max(...RESOLUTIONS.map((r) => r.name.length));
  console.log("  " + "resolution".padEnd(nameW) + "  uiScale  result");
  console.log("  " + "-".repeat(nameW) + "  -------  ------");
  for (const r of rows) {
    const mark = r.pass ? "PASS" : "FAIL";
    console.log("  " + r.res.name.padEnd(nameW) + "  " +
                r.uiScale.toFixed(3).padStart(7) + "  " + mark +
                (r.clampedManifest ? "  (WARN manifest clamped by host)" : ""));
    if (!r.pass && verbose) for (const f of r.failures.slice(0, 8)) console.log("      - " + f);
  }

  console.log("\n" + (allPass
    ? "ALL RESOLUTIONS PASS — encode/decode survives every modelled display."
    : "SOME RESOLUTIONS FAIL — see above" + (verbose ? "." : " (re-run with --verbose for details).")));
  process.exit(allPass ? 0 : 1);
}

main();
