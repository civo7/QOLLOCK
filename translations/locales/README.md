# QOLLOCK locale catalogs (i18next JSON) — workbench bridge

These JSON files are an **interchange artifact** for the
[qollock-translate](https://github.com/Predi-i/qollock-translate) web workbench. They are
**not** what ships in-game.

## Source of truth

The translations that compile into the VPK live as per-language modules in
`panorama/scripts/ql_settings_loc/ql_settings_loc_<lang>.js`, keyed by the
English source string. Panorama cannot read JSON at runtime, so **the JS modules stay canonical.**
These JSON files are generated from those modules and merged back into them.

**Private/public split:** This repo (`civo7/QOLLOCK`) is **private**. The workbench reads/writes
from the **public mirror** [`Predi-i/QOLLOCK-translations`](https://github.com/Predi-i/QOLLOCK-translations),
which contains **only** `locales/` (no mod code). A GitHub Actions workflow auto-syncs
`translations/locales/` here to `locales/` there on every push to `main`.

```
Private QOLLOCK (this repo)         Public QOLLOCK-translations          Workbench
  ql_settings_loc/*.js                 locales/*.json                    (D1 database)
        │  export_locales_json.js         │                                  │
        ▼                                 ▼  (Actions auto-sync)             │
  translations/locales/  ──────────────► locales/  ◄────── reads ◄──────────┤
        ▲                                 │                                  │
        └── import_locales_json.js ◄──  PR  ◄──────── writes ◄───────────────┘
             (manual, after PR merge)
```

- `en/translation.json` — the **source catalog** the workbench reads (identity map: English → English).
- `<lang>/translation.json` — the current translation baseline for each language (flat `English → translation`).

14 non-English languages: `ru uk pl bg be ja ko zh fr it tr pt pt-BR es` (`be` = Belarusian, `pt-BR` = BR Portuguese).

## Bridge scripts

```sh
# maps  ->  JSON   (regenerate catalogs from ql_settings_loc/)
node scripts/export_locales_json.js

# JSON  ->  maps   (merge a PR / a single file / the whole locales tree back in)
node scripts/import_locales_json.js [path]      # default path: translations/locales
npm test                                       # validates syntax and locale integrity
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

1. **Fork and brand:** Fork [`Slush97/grimoire-translate`](https://github.com/Slush97/grimoire-translate)
   to `Predi-i/qollock-translate`. Replace branding (name, logo, colors) in `src/site.config.ts`,
   `wrangler.jsonc`, `package.json`, `public/`, etc.

2. **Point at public repo:** Set `GITHUB_REPO: "Predi-i/QOLLOCK-translations"` in `wrangler.jsonc`
   (not `civo7/QOLLOCK` — that's private and the workbench can't fork it).

3. **Patch for flat keys:** In `src/lib/catalog.ts`, replace `unflattenValues` to **not** split on dots:
   ```ts
   export function unflattenValues(entries: Array<{ key: string; value: string }>): JsonObject {
     const root: JsonObject = {};
     for (const entry of entries) root[entry.key] = entry.value;  // verbatim, no split
     return root;
   }
   ```
   This preserves the 3 collision keys (`"Ready"` / `"Ready."` / `"Ready.."`) without corruption.

4. **Patch localesPath:** In `src/lib/github.ts`, change hardcoded `src/locales` → `SITE.localesPath`
   (config already has `localesPath: "translations/locales"` → now just `"locales"` in the public repo).

5. **Deploy:** `npm run deploy` (Cloudflare Pages + D1). The workbench reads `locales/en/translation.json`
   from the public repo as the source catalog, writes PRs back to the same public repo.

6. **Maintainer workflow:** When a PR lands in `Predi-i/QOLLOCK-translations`, pull it locally,
   run `node scripts/import_locales_json.js` in **this** (private) repo to merge the changes into
   `ql_settings.js`, commit, push to `main`. The Actions workflow auto-syncs back to public.

The branded fork already exists: **[Predi-i/qollock-translate](https://github.com/Predi-i/qollock-translate)**
(forked from `Slush97/grimoire-translate`). All patches (flat `catalog.ts`, branding, `localesPath: "locales"`,
`GITHUB_REPO: "Predi-i/QOLLOCK-translations"`) are committed on its `main`. What's left: Cloudflare deploy
(D1, KV, Access, secrets, GitHub token) — full guide: **[`DEPLOY.md`](https://github.com/Predi-i/qollock-translate/blob/main/DEPLOY.md)**.
