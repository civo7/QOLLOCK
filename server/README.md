# QOLLOCK cloud settings store

A tiny Cloudflare Worker that persists each user's QOLLOCK HUD config across game
restarts, replacing the old "hide the config token in a hero build-category name"
hack. Separate worker from the Minigames relay.

## Why this exists

Panorama has **no client-side persistent storage** — no `$.persistentStorage`, no
convars, no `GameInterfaceAPI`. The only value the HUD can re-read on every launch
is the Steam32 `account_id`. And the only channel *back* from a server to Panorama
is the intrinsic pixel size of an `<Image>` (`actuallayoutwidth/height`). So:

- **Uplink** (save): unlimited, via URL query params — the whole config rides one GET.
- **Downlink** (load): 2 bytes per image; the config is streamed across N images.

## Security model — read this

The store is keyed by `account_id`, which is **not secret** (teammates see it). There
is **no auth token** — Panorama can't keep a secret between launches. So anyone who
knows an `account_id` could read or overwrite that account's HUD config. The only
guard is a per-account write **rate limit**. This is an accepted trade-off for
low-stakes HUD settings. **Do not store anything sensitive here.**

## Protocol

| Route | Response `(w,h)` |
|-------|------------------|
| `/api/ping` | `(1,1)` liveness |
| `/api/probe` | `(600,1000)` scale calibration |
| `/api/save?id&rev&d` | `(1,1)` ok · `(9,1)` bad params · `(9,2)` rate-limited · `(9,3)` stale rev · `(9,9)` error |
| `/api/load?id&chunk=0` | manifest: dims encode 16-bit total stream length `T`; `(1,1)` = nothing stored |
| `/api/load?id&chunk=i` | data: `w = stream[2(i-1)]+1`, `h = stream[2(i-1)+1]+1` |

`stream = <raw compact-binary config> + crc16(config)` (big-endian). The client
reassembles, verifies the CRC, and re-requests only missing chunks. The raw binary
feeds QOLLOCK's existing `DeserializeBuildPayloadCompact` directly.

The server stores the config as an **opaque blob** — it never parses the schema, so
schema bumps in the mod never require a worker redeploy.

## Test (offline, no deploy, no game)

```
node server/worker.test.mjs
```

Runs the real worker against an in-memory fake Durable Object storage, decoding
actual PNG bytes back to `(w,h)` the way the in-game client will. Covers save/load,
manifest, CRC, stale-revision guard, rate limit, and bad input.

## Deploy

Needs a Cloudflare account (free plan is enough — SQLite-backed Durable Objects are
free). From this `server/` directory:

```
npx wrangler deploy
```

Then paste the resulting `*.workers.dev` URL into `BASE_URL` in
`panorama/scripts/ql_net.js`.
