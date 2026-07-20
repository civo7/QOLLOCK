/**
 * QOLLOCK cloud settings store — Cloudflare Worker.
 *
 * ⚠ This is a SEPARATE worker from the Deadlock Minigames relay. It persists each
 * user's QOLLOCK HUD config across game restarts (Panorama has NO client-side
 * persistent storage — no $.persistentStorage, no convars, no GameInterfaceAPI),
 * replacing the old "hide the config token in a hero build-category name" hack.
 *
 * ── Transport ─────────────────────────────────────────────────────────────
 * Panorama UI has no fetch / no AsyncWebRequest / no websockets. The ONLY channel
 * back to the client is the intrinsic pixel size of an <Image>: the client sets an
 * <Image> src and reads actuallayoutwidth / actuallayoutheight. So every response
 * is a tiny PNG whose (width, height) ENCODE two bytes.
 *
 *   Uplink  (client → server): unlimited, via URL query params. The whole config
 *                              blob (base64url, ~200 chars) rides one GET.
 *   Downlink (server → client): 2 bytes per image. dimension = byte + 1  (1..256).
 *                              The config blob is streamed across N images.
 *
 * Identity is the Steam32 account_id, which the HUD can re-read on every launch.
 * It is NOT secret (teammates see it), so this store is deliberately low-stakes:
 * anyone who knows an account_id could read or overwrite that account's HUD config.
 * The only guard is a per-account write rate limit. That is an accepted trade-off
 * for HUD settings — see the branch design notes. Do NOT store anything sensitive.
 *
 * ── Encoding ──────────────────────────────────────────────────────────────
 * Every non-probe response encodes two "levels" as image dims via
 *   dim = level*STEP + BASE   (STEP=9, BASE=15)  ->  the client inverts it.
 * Status codes below are those level pairs (decode, then compare), NOT raw pixel
 * sizes — e.g. "(9,1) bad params" means levels w=9,h=1. See the knobs block for
 * why one level per dimension (not a full byte): 256 values can't survive the
 * engine's UI-scale rounding, levels spaced 5px apart can.
 *
 * ── Routes (all GET, all return a PNG; pass &rnd=<n> to defeat engine caching) ──
 *   /api/ping                                  -> (1,1)                 liveness
 *   /api/probe                                 -> (600,1000) RAW px     scale calibration
 *   /api/save?id=<acct>&rev=<n>&d=<b64url>     -> (1,1) ok
 *                                                 (9,1) bad params
 *                                                 (9,2) rate-limited
 *                                                 (9,3) stale revision (rev <= stored)
 *                                                 (9,9) internal error
 *   /api/load?id=<acct>&chunk=<i>              -> chunk 0 (manifest): two 6-bit levels
 *                                                 encode the total stream-byte count T
 *                                                 (<=4095):  w = (T>>6)&63, h = T&63.
 *                                                 T = 0  (i.e. levels (0,0)) => nothing stored.
 *                                                 chunk i>=1 (data): one stream byte as
 *                                                 two nibbles:  w = byte>>4, h = byte&15.
 *
 * The transmitted stream = <raw config binary> concat <crc16(binary), big-endian>.
 * So T = binaryLen + 2, and the client verifies integrity after reassembly and can
 * re-request only the chunks it is still missing. The raw binary feeds QOLLOCK's
 * existing DeserializeBuildPayloadCompact directly — no base64 round-trip on load.
 * T is capped by the manifest's 4095 ceiling — comfortably above MAX_PAYLOAD_CHARS.
 */

// ── Downlink encoding knobs ───────────────────────────────────────────────
// One image dimension carries ONE small "level", not a full byte:
//   dim = level*STEP + BASE   (STEP=9, BASE=15)  ->  dims in 15..582.
//
// WHY levels, not bytes: a full byte (256 values) cannot be packed into one
// dimension and survive UI scaling. The client reads actuallayoutwidth/height,
// which the engine rounds — and on a scaled display it also biases SMALL sizes
// upward by ~1px. Two rounding steps (scale-correct, then de-quantize) then push
// adjacent values across a boundary. Field-confirmed on a 1.333x UI: the manifest
// high byte 0 (a 16px image) came back as level 1, so T decoded as 409 instead of
// 153 and the whole load reassembled garbage. See github2/IMAGE_SIDECHANNEL_1PX_BUG.md.
//
// STEP=9 spaces adjacent levels 9 logical px apart so a ±2px engine error can't
// cross a boundary even when a sub-1080p display DOWNSCALES (which amplifies an
// absolute px error by 1/uiScale — the reason a tighter step failed at 720p in
// scripts/simulate_resolutions.js). BASE=15 keeps level 0 off the rounding floor.
// A data image encodes one byte as two nibbles (levels 0..15, max 150px); the
// manifest encodes T as two 6-bit levels (0..63, max 582px). Both stay under the
// client's 600px probe envelope, so no host-panel change is needed. STEP only
// affects image pixel size, never throughput (still one byte per image).
// MUST stay in lockstep with ql_net.js (STEP, BASE, decodeLevel).
const STEP = 9;
const BASE = 15;
// Encode one level (0..63) to its image dimension.
function enc(level) { return level * STEP + BASE; }
// PNG carrying two levels (one per dimension). Status codes, nibble pairs and
// manifest 6-bit halves all go through this — the client recovers each with
// decodeLevel, so everything shares the one scaling-robust band.
function penc(levelW, levelH) { return png(enc(levelW), enc(levelH)); }

// ── Write rate limit (per account) ────────────────────────────────────────
const RATE_WINDOW_MS = 10000; // sliding window
const RATE_MAX_WRITES = 8;    // max saves per window per account

// ── Write rate limit (per source IP) ──────────────────────────────────────
// The per-account limit above stops a griefer from hammering ONE account, but
// does nothing against a mass attack that writes 8x each to thousands of ids.
// This second limit caps total writes from a single source IP regardless of
// which accounts they target, which is what actually kills enumeration. Kept
// generous (1/sec sustained) so many players behind one CGNAT/household IP are
// never bothered, while a script firing thousands/sec is stopped cold.
const RATE_IP_WINDOW_MS = 60000; // 60s sliding window
const RATE_IP_MAX_WRITES = 60;   // max saves per window per source IP

// ── Save input guards (unauthenticated store, so bound the inputs) ──────────
// Revision is a client-supplied Date.now(); anyone who knows an account_id could
// otherwise post a far-future rev and permanently stale-lock the real owner out
// of their own config. Reject anything more than a day ahead of the server clock
// (generous slack for client/server clock skew) so a legitimate Date.now() always
// passes but a griefer's 9e15 does not.
const MAX_REV_SKEW_MS = 86400000; // 24h
// The config blob is ~200 base64url chars. Cap it well above that so a griefer
// can't fatten an arbitrary account's stored blob with megabytes of junk.
const MAX_PAYLOAD_CHARS = 2048;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return new Response("QOLLOCK settings store OK", { status: 200 });
    }

    // Panorama's <Image> loader only fetches URLs that look like an image, so the
    // client appends ".png" to every route. Strip it before routing.
    const p = url.pathname.replace(/\.png$/, "");
    const q = url.searchParams;

    if (p === "/api/ping") return await penc(1, 1);
    if (p === "/api/probe") return await png(600, 1000);

    if (p === "/api/save" || p === "/api/load") {
      const id = normalizeAccountId(q.get("id"));
      if (!id) return await penc(9, 1); // bad / missing account id

      // Writes get a second, per-source-IP gate BEFORE touching the account DO.
      // This is the guard against mass enumeration (many accounts, few writes
      // each) that the per-account limit can't see. Loads are read-only and
      // harmless, so they skip it.
      if (p === "/api/save") {
        const ip = String(request.headers.get("CF-Connecting-IP") || "").trim();
        if (ip) {
          // A DO instance keyed by the IP holds that IP's sliding write log.
          // Internal call, not seen by the game — it answers 200 ok / 429 over.
          const ipStub = env.STORE.get(env.STORE.idFromName("ip:" + ip));
          const gateUrl = new URL(request.url);
          gateUrl.pathname = "/api/_ipgate";
          const gate = await ipStub.fetch(new Request(gateUrl, request));
          if (gate.status === 429) return await penc(9, 2); // IP rate-limited
        }
      }

      // Each account is an isolated, strongly-consistent Durable Object instance.
      const stub = env.STORE.get(env.STORE.idFromName(id));
      return stub.fetch(request);
    }

    return await penc(9, 1);
  },
};

export class ConfigStore {
  constructor(state) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\.png$/, "");
    const q = url.searchParams;

    try {
      if (p === "/api/_ipgate") return await this.handleIpGate();
      if (p === "/api/save") return await this.handleSave(q);
      if (p === "/api/load") return await this.handleLoad(q);
    } catch (e) {
      return await penc(9, 9); // internal error
    }
    return await penc(9, 1);
  }

  // Per-IP sliding-window gate. This DO instance is keyed by "ip:<addr>", so its
  // storage is that one IP's write log — independent of any account. Returns a
  // plain 200 (under limit) or 429 (over); the top-level worker maps 429 to the
  // (9,2) rate-limited PNG. Not an image route: the game never calls this.
  async handleIpGate() {
    const now = Date.now();
    let hits = (await this.storage.get("iprate")) || [];
    hits = hits.filter((t) => now - t < RATE_IP_WINDOW_MS);
    if (hits.length >= RATE_IP_MAX_WRITES) {
      await this.storage.put("iprate", hits);
      return new Response("over", { status: 429 });
    }
    hits.push(now);
    await this.storage.put("iprate", hits);
    return new Response("ok", { status: 200 });
  }

  async handleSave(q) {
    const rev = parseInt(q.get("rev"), 10);
    const d = q.get("d"); // base64url of the raw compact-binary config
    if (!Number.isFinite(rev) || rev < 0 || !d) return await penc(9, 1);
    // Reject a far-future rev — it would stale-lock the owner permanently.
    if (rev > Date.now() + MAX_REV_SKEW_MS) return await penc(9, 1);
    // Reject an oversized blob before we bother decoding it.
    if (d.length > MAX_PAYLOAD_CHARS) return await penc(9, 1);

    // Decode base64url -> raw bytes. Reject anything that isn't clean base64url.
    const bytes = fromBase64Url(d);
    if (!bytes) return await penc(9, 1);

    // Sliding-window write rate limit. The only guard on an unauthenticated,
    // account_id-keyed store — keeps a griefer who knows an id from hammering it.
    const now = Date.now();
    let hits = (await this.storage.get("rate")) || [];
    hits = hits.filter((t) => now - t < RATE_WINDOW_MS);
    if (hits.length >= RATE_MAX_WRITES) {
      await this.storage.put("rate", hits);
      return await penc(9, 2); // rate-limited
    }

    // Monotonic revision guard: never let a stale writer clobber newer config.
    const storedRev = (await this.storage.get("rev")) || 0;
    if (rev <= storedRev) return await penc(9, 3); // stale revision

    hits.push(now);
    // Store the raw bytes as a plain array (DO storage serializes it). Keep the
    // blob opaque — the server never parses the schema, so it never needs a bump.
    await this.storage.put({
      rate: hits,
      rev: rev,
      data: Array.from(bytes),
    });
    return await penc(1, 1); // ok
  }

  async handleLoad(q) {
    const chunk = parseInt(q.get("chunk"), 10);
    if (!Number.isFinite(chunk) || chunk < 0) return await penc(9, 1);

    const stored = await this.storage.get("data");
    if (!stored || stored.length === 0) {
      // Nothing saved for this account yet. Manifest (chunk 0) encodes T=0 as
      // (enc(0),enc(0)); any data chunk also reads bytes (0,0). Client sees T=0
      // and treats it as "use defaults".
      return await penc(0, 0);
    }

    // Stream = config bytes + crc16(config bytes), big-endian. T = total stream bytes.
    const crc = crc16(stored);
    const stream = stored.concat([(crc >> 8) & 255, crc & 255]);
    const T = stream.length;

    if (chunk === 0) {
      // Manifest: T (<= 4095) as two 6-bit levels, hi*64 + lo.
      return await penc((T >> 6) & 63, T & 63);
    }

    // Data chunk i>=1 carries stream byte [i-1] as two nibbles (hi, lo).
    const base = chunk - 1;
    if (base >= T) return await penc(0, 0); // past the end -> byte 0
    const b = stream[base] & 255;
    return await penc((b >> 4) & 15, b & 15);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeAccountId(raw) {
  const s = String(raw || "").trim();
  // Steam32 account_id: all digits, non-zero, up to ~12 chars (matches the HUD's
  // IsLikelyAccountId). Reject everything else to keep the DO namespace clean.
  if (!/^\d{5,12}$/.test(s)) return "";
  if (/^0+$/.test(s)) return "";
  return s;
}

function fromBase64Url(s) {
  let b64 = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*$/.test(b64)) return null;
  while (b64.length % 4 !== 0) b64 += "=";
  try {
    const bin = atob(b64);
    const out = new Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255;
    return out;
  } catch (e) {
    return null;
  }
}

// CRC-16/CCITT-FALSE — small, fast, ample for a ~150-byte integrity check.
function crc16(bytes) {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= (bytes[i] & 255) << 8;
    for (let k = 0; k < 8; k++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc & 0xffff;
}

/* ─────────────────────────── PNG encoder ───────────────────────────
 * Emits an 8-bit grayscale PNG of exactly W x H black pixels — the client only
 * reads the dimensions, never the pixels. The IDAT is REAL deflate (via the
 * platform CompressionStream), not stored/uncompressed: a field of zeros
 * collapses to a few hundred bytes regardless of W x H.
 *
 * This matters for reachability, not just speed. An uncompressed 600x1000 probe
 * is ~600 KB on the wire, and Russian ISP DPI throttles large TLS responses from
 * *.workers.dev to a crawl (observed: tiny replies instant, the big probe stalls
 * for 30s+ even though the Worker returns 200 immediately). A compressed probe is
 * sub-KB, so there is nothing large left for DPI to choke — the whole protocol
 * then rides on uniformly tiny responses. png() is async because CompressionStream
 * is async; all call sites are in async handlers.
 */
async function png(w, h) {
  w = Math.max(1, Math.min(w | 0, 8000));
  h = Math.max(1, Math.min(h | 0, 8000));

  // Raw PNG scanlines: each row = 1 filter byte (0) + w pixel bytes (0). All zero.
  const raw = new Uint8Array(h * (1 + w));
  const idat = await deflate(raw); // zlib-wrapped (RFC 1950), exactly what IDAT needs

  const total = 8 + (12 + 13) + (12 + idat.length) + 12;
  const out = new Uint8Array(total);
  let o = 0;
  const put = (v) => { out[o++] = v & 255; };
  const put4 = (n) => { put(n >>> 24); put(n >>> 16); put(n >>> 8); put(n); };
  const putStr = (s) => { for (let i = 0; i < s.length; i++) put(s.charCodeAt(i)); };

  for (const b of [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) put(b); // signature

  put4(13); let type = o; putStr("IHDR");                  // IHDR
  put4(w); put4(h); put(8); put(0); put(0); put(0); put(0);
  put4(crc32(out.subarray(type, o)));

  put4(idat.length); type = o; putStr("IDAT");             // IDAT
  out.set(idat, o); o += idat.length;
  put4(crc32(out.subarray(type, o)));

  put4(0); type = o; putStr("IEND");                       // IEND
  put4(crc32(out.subarray(type, o)));

  return new Response(out, {
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "access-control-allow-origin": "*",
    },
  });
}

// Deflate (zlib format) via the platform CompressionStream — present in both
// Cloudflare Workers and Node 18+.
async function deflate(bytes) {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks = [];
  let len = 0;
  const reader = cs.readable.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    len += value.length;
  }
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
