# QOLLOCK locale catalogs (i18next JSON) — workbench bridge

These JSON files are an **interchange artifact** for the
[grimoire-translate](https://github.com/Slush97/grimoire-translate) web workbench. They are
**not** what ships in-game.

## Source of truth

The translations that compile into the VPK live as per-language maps in
`panorama/scripts/ql_settings.js` (`SETTINGS_RU_TEXT`, `SETTINGS_UK_TEXT`, …), keyed by the
English source string. Panorama cannot read JSON at runtime, so **the JS maps stay canonical.**
These JSON files are generated from those maps and merged back into them.

```
ql_settings.js maps  ──export──▶  translations/locales/<lang>/translation.json  ──▶ workbench (D1)
        ▲                                                                              │
        └───────────────import───────  GitHub PR  ◀──────────────────────────────────┘
```

- `en/translation.json` — the **source catalog** the workbench reads (identity map: English → English).
- `<lang>/translation.json` — the current translation baseline for each language (flat `English → translation`).

11 languages: `ru uk pl bg be ja zh fr pt pt-BR es` (`be` = Belarusian, `pt-BR` = BR Portuguese).

## Bridge scripts

```sh
# maps  ->  JSON   (regenerate all 12 catalogs from ql_settings.js)
node scripts/export_locales_json.js

# JSON  ->  maps   (merge a PR / a single file / the whole locales tree back in)
node scripts/import_locales_json.js [path]      # default path: translations/locales
node --check panorama/scripts/ql_settings.js    # always re-validate after import
# then repack the VPK
```

Import is safe by default: non-empty values override, blanks/missing keys leave existing work
untouched, key order is preserved, brand-new keys are appended sorted.

## ⚠️ Required fork patch: flat keys (do NOT skip)

The files here are **flat on purpose**. The stock workbench treats `.` in a key as a path
separator (`src/lib/catalog.ts` → `unflattenValues`). Our keys are English sentences, and some are
a dot-prefix of another:

| short key | colliding longer key |
|---|---|
| `Ready` | `Ready.` |
| `Reset to default value` | `Reset to default value.` |
| `Move ability stacks to bottom-center of ability icon` | `…ability icon.` |

The stock nesting **silently corrupts** these. `export_locales_json.js` detects such collisions and
refuses to write nested output; that is why we emit flat. For the workbench's **own** output (Export
/ PR) to stay flat and lossless, patch its `src/lib/catalog.ts` so keys are opaque:

```ts
// unflattenValues: assign the key verbatim instead of splitting on "."
export function unflattenValues(entries: Array<{ key: string; value: string }>): JsonObject {
  const root: JsonObject = {};
  for (const entry of entries) root[entry.key] = entry.value;   // was: entry.key.split('.') nesting
  return root;
}
```

`flattenCatalog` / `flattenValues` need no change: they only recurse real nested objects, and our
flat files have none, so keys are already preserved on read. `import_locales_json.js` also tolerates
nested input, but only flat round-trips without the collision risk above.

## Standing up the workbench

The branded fork already exists: **[Predi-i/qollock-translate](https://github.com/Predi-i/qollock-translate)**
(forked from `Slush97/grimoire-translate`). The flat-keys `catalog.ts` patch above, the QOLLOCK
branding (`src/site.config.ts`), the `translations/locales` source path, and `wrangler.jsonc`
(repo → `civo7/QOLLOCK`, Worker/D1 named `qollock-translate`, id placeholders) are all committed
on its `main`.

What's left is the one-time Cloudflare deploy on **your** account (D1, KV, Access, secrets, domain).
The full step-by-step guide lives in the fork: **[`DEPLOY.md`](https://github.com/Predi-i/qollock-translate/blob/main/DEPLOY.md)**.

The very first deploy step happens **here**: commit `translations/locales/` to `civo7/QOLLOCK` so the
website has an English source to read (it fetches `translations/locales/en/translation.json` from the
branch `GITHUB_BRANCH` points at).
