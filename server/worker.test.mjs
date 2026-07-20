/**
 * Offline protocol test for the QOLLOCK settings worker.
 *
 * Runs the real worker.js (default export + ConfigStore) against an in-memory
 * fake Durable Object storage, decoding actual PNG bytes back to (w,h) exactly
 * the way the in-game client will read actuallayoutwidth / actuallayoutheight.
 * No network, no wrangler, no game — proves the save/load/manifest/crc protocol.
 *
 * Run:  node server/worker.test.mjs
 */
import worker, { ConfigStore } from "./worker.js";

// ── Minimal fake Durable Object storage (subset used by ConfigStore) ──
class FakeStorage {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : undefined; }
  async put(a, b) {
    if (typeof a === "object") { for (const k in a) this.m.set(k, a[k]); }
    else this.m.set(a, b);
  }
}

// One ConfigStore instance per account id (mirrors idFromName isolation).
const instances = new Map();
const env = {
  STORE: {
    idFromName: (id) => id,
    get: (id) => {
      if (!instances.has(id)) instances.set(id, new ConfigStore({ storage: new FakeStorage() }));
      const inst = instances.get(id);
      return { fetch: (req) => inst.fetch(req) };
    },
  },
};

// ── PNG (w,h) decoder — read IHDR width/height straight from the bytes ──
async function dims(resp) {
  const buf = new Uint8Array(await resp.arrayBuffer());
  // IHDR width/height are the 4-byte big-endian ints at offsets 16 and 20.
  const rd = (o) => (buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3];
  return { w: rd(16) >>> 0, h: rd(20) >>> 0 };
}

// Downlink level encoding — MUST match worker.js / ql_net.js (STEP=9, BASE=15).
// Every penc() response carries one "level" per dimension: dim = level*STEP+BASE.
// The in-game client recovers it with decodeLevel; we do the same here so the
// test reads exactly what the HUD reads, not the raw pixel size.
const STEP = 9, BASE = 15;
const decodeLevel = (dim) => Math.round((dim - BASE) / STEP);
// Level pair for a penc() response (status codes, manifest halves, data nibbles).
async function levels(resp) {
  const d = await dims(resp);
  return { w: decodeLevel(d.w), h: decodeLevel(d.h) };
}

const call = (path) => worker.fetch(new Request("https://x" + path), env);
// Same, but with a CF-Connecting-IP header so the per-IP write gate engages.
const callIp = (path, ip) =>
  worker.fetch(new Request("https://x" + path, { headers: { "CF-Connecting-IP": ip } }), env);

// ── base64url encode (matches client BuildPayloadToBase64Url output) ──
function toB64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b & 255);
  return Buffer.from(bin, "binary").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// ── CRC-16/CCITT-FALSE (must match worker's crc16) ──
function crc16(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= (byte & 255) << 8;
    for (let k = 0; k < 8; k++) { crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1; crc &= 0xffff; }
  }
  return crc & 0xffff;
}

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; } else { fail++; console.error("  ✗ FAIL: " + label); }
}
function eq(a, b, label) { ok(a === b, label + " (got " + a + ", want " + b + ")"); }

// Full client-side load: manifest -> data chunks -> reassemble -> verify crc.
// Mirrors ql_net.js exactly: manifest is two 6-bit levels (T = hi*64 + lo), and
// each data chunk i>=1 carries ONE stream byte as two 4-bit nibble levels.
async function clientLoad(id) {
  const man = await levels(await call("/api/load?id=" + id + "&chunk=0"));
  const T = man.w * 64 + man.h; // inverse of manifest encoding (6-bit levels)
  if (T === 0) return null; // nothing stored
  const stream = new Array(T);
  for (let i = 1; i <= T; i++) {
    const d = await levels(await call("/api/load?id=" + id + "&chunk=" + i));
    stream[i - 1] = ((d.w & 15) << 4) | (d.h & 15); // byte = hiNibble<<4 | loNibble
  }
  const data = stream.slice(0, T - 2);
  const gotCrc = ((stream[T - 2] & 255) << 8) | (stream[T - 1] & 255);
  ok(gotCrc === crc16(data), "crc16 matches after reassembly");
  return data;
}

async function main() {
  const ID = "123456789";

  // ping (penc(1,1) -> level (1,1)) / probe (raw 600x1000 px, not level-encoded)
  eq((await levels(await call("/api/ping"))).w, 1, "ping level w");
  const pr = await dims(await call("/api/probe"));
  ok(pr.w === 600 && pr.h === 1000, "probe dims 600x1000 (raw px)");

  // load with nothing stored -> penc(0,0) manifest (levels 0,0 => T=0) => defaults
  const empty = await levels(await call("/api/load?id=" + ID + "&chunk=0"));
  ok(empty.w === 0 && empty.h === 0, "empty account manifest levels = (0,0)");
  ok((await clientLoad(ID)) === null, "empty account -> null (defaults)");

  // round-trip a realistic ~151-byte payload
  const payload = [];
  for (let i = 0; i < 151; i++) payload.push((i * 37 + 11) & 255);
  const s1 = await levels(await call("/api/save?id=" + ID + "&rev=1&d=" + toB64Url(payload)));
  ok(s1.w === 1 && s1.h === 1, "save rev=1 -> ok (1,1)");

  const loaded = await clientLoad(ID);
  ok(loaded && loaded.length === payload.length && loaded.every((v, i) => v === payload[i]),
     "loaded bytes == saved bytes (" + (loaded ? loaded.length : 0) + " bytes)");

  // stale revision rejected
  const stale = await levels(await call("/api/save?id=" + ID + "&rev=1&d=" + toB64Url(payload)));
  ok(stale.w === 9 && stale.h === 3, "stale rev=1 rejected (9,3)");

  // newer revision accepted, changes content
  const payload2 = payload.map((v) => (v ^ 0xaa) & 255);
  const s2 = await levels(await call("/api/save?id=" + ID + "&rev=2&d=" + toB64Url(payload2)));
  ok(s2.w === 1 && s2.h === 1, "save rev=2 -> ok");
  const loaded2 = await clientLoad(ID);
  ok(loaded2 && loaded2.every((v, i) => v === payload2[i]), "rev=2 content served back");

  // bad account id
  const bad = await levels(await call("/api/load?id=0&chunk=0"));
  ok(bad.w === 9 && bad.h === 1, "bad account id -> (9,1)");

  // bad base64 rejected
  const badB64 = await levels(await call("/api/save?id=" + ID + "&rev=3&d=!!!notb64!!!"));
  ok(badB64.w === 9 && badB64.h === 1, "bad base64 payload -> (9,1)");

  // far-future rev rejected — the permanent stale-lock griefing vector.
  // A day+ ahead of the server clock must not be accepted; otherwise it would
  // pin storedRev so high that the owner's real Date.now() saves stale forever.
  const FID = "111222333";
  const futureRev = Date.now() + 2 * 86400000; // 2 days ahead
  const fut = await levels(await call("/api/save?id=" + FID + "&rev=" + futureRev + "&d=" + toB64Url(payload)));
  ok(fut.w === 9 && fut.h === 1, "far-future rev rejected (9,1)");
  // ...and a sane rev still lands afterward (guard didn't corrupt state).
  const futOk = await levels(await call("/api/save?id=" + FID + "&rev=1&d=" + toB64Url(payload)));
  ok(futOk.w === 1 && futOk.h === 1, "sane rev accepted after future-rev reject");

  // oversized payload rejected before decode — blob-fattening griefing vector.
  const OID = "444555666";
  const huge = "A".repeat(2049); // valid base64url chars, over MAX_PAYLOAD_CHARS
  const big = await levels(await call("/api/save?id=" + OID + "&rev=1&d=" + huge));
  ok(big.w === 9 && big.h === 1, "oversized payload rejected (9,1)");

  // rate limit: hammer a fresh account (RATE_MAX_WRITES=8 per window)
  const RID = "987654321";
  let limited = false;
  for (let r = 1; r <= 12; r++) {
    const d = await levels(await call("/api/save?id=" + RID + "&rev=" + r + "&d=" + toB64Url(payload)));
    if (d.w === 9 && d.h === 2) { limited = true; break; }
  }
  ok(limited, "write rate limit trips (9,2)");

  // per-IP limit: spread writes across MANY distinct accounts from ONE ip, so the
  // per-account limit never trips — only the per-IP gate (RATE_IP_MAX_WRITES=60)
  // can stop this. This is the mass-enumeration vector.
  const IP = "203.0.113.7";
  let ipLimited = false, ipAcceptedBefore = 0;
  for (let n = 0; n < 80; n++) {
    const acct = "5000000" + (n < 10 ? "0" + n : n); // distinct 9-digit id per write
    const d = await levels(await callIp("/api/save?id=" + acct + "&rev=1&d=" + toB64Url(payload), IP));
    if (d.w === 9 && d.h === 2) { ipLimited = true; break; }
    if (d.w === 1 && d.h === 1) ipAcceptedBefore++;
  }
  ok(ipLimited, "per-IP write limit trips (9,2) across many accounts");
  ok(ipAcceptedBefore >= 60, "per-IP limit allows the generous quota first (" + ipAcceptedBefore + " >= 60)");

  // a DIFFERENT ip is unaffected by the first ip's exhausted quota.
  const other = await levels(await callIp("/api/save?id=700000001&rev=1&d=" + toB64Url(payload), "198.51.100.9"));
  ok(other.w === 1 && other.h === 1, "a different source IP is not rate-limited");

  // loads are read-only: never blocked by the per-IP write gate, even from a
  // maxed-out ip (the client must always be able to boot-load its config).
  const loadFromMaxedIp = await levels(await callIp("/api/load?id=" + ID + "&chunk=0", IP));
  ok(!(loadFromMaxedIp.w === 9 && loadFromMaxedIp.h === 2), "loads bypass the per-IP write gate");

  // Large payload near MAX_PAYLOAD_CHARS: locks in the manifest 6-bit ceiling.
  // The biggest allowed blob (2048 b64url chars -> ~1536 bytes, T ~= 1538) must
  // still fit T <= 4095 (hi,lo in 0..63) and round-trip byte-exact. If a future
  // schema grows the config past this, THIS test fails loudly instead of the
  // manifest silently truncating T in-game.
  const BID = "222333444";
  const bigPayload = [];
  for (let i = 0; i < 1400; i++) bigPayload.push((i * 91 + 7) & 255);
  const b64big = toB64Url(bigPayload);
  ok(b64big.length <= 2048, "large payload within MAX_PAYLOAD_CHARS (" + b64big.length + " <= 2048)");
  const bigSave = await levels(await call("/api/save?id=" + BID + "&rev=1&d=" + b64big));
  ok(bigSave.w === 1 && bigSave.h === 1, "large payload saved ok");
  const bigLoaded = await clientLoad(BID);
  ok(bigLoaded && bigLoaded.length === bigPayload.length && bigLoaded.every((v, i) => v === bigPayload[i]),
     "large payload round-trips byte-exact (" + (bigLoaded ? bigLoaded.length : 0) + " bytes)");

  console.log("\n" + (fail === 0 ? "✓ ALL PASS" : "✗ FAILURES") + " — " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
