# QOLLOCK Translations

The settings UI is localized via per-language string maps in
`panorama/scripts/ql_settings.js` (`SETTINGS_RU_TEXT`, `SETTINGS_UK_TEXT`, …). Each map is
`English source string -> translation`. **English is the source** and has no map.

This folder holds the round-trip tooling that replaces the old (lost) Google Sheet workflow:
the maps in code are the source of truth, and a CSV is generated from them for translators to
fill, then merged back.

## Files

- `qollock_settings_translations.csv` — generated spreadsheet: one row per English string, one
  column per language. This is the file you hand to translators (via Google Sheets).

## Workflow

### 1. Export the sheet (reconstruct it from code)

```sh
node scripts/export_translations.js
```

Writes `translations/qollock_settings_translations.csv` and prints per-language coverage
(translated / total). The CSV is UTF-8 with a BOM so Google Sheets / Excel read Cyrillic & CJK
correctly.

### 2. Share with translators

1. Google Sheets → **File → Import → Upload** → pick the CSV → *Replace spreadsheet*.
2. Share the sheet with the translators (edit/comment access).
3. They fill the **blank cells** in their language column. Rules for them:
   - **Do not edit the `English` column** — it's the key that links every translation. Changing it
     orphans the translation.
   - Leave a cell blank if there's no translation yet (blanks are safe — see import).
   - Keep any inline markup like `<font color="#66cc99">…</font>` intact; translate only the text.

### 3. Import the filled sheet back

Google Sheets → **File → Download → Comma-separated values (.csv)**, then:

```sh
node scripts/import_translations.js path/to/downloaded.csv
# (defaults to translations/qollock_settings_translations.csv if no path is given)
```

Merge semantics (safe):
- A non-empty cell **sets/overrides** that language's translation.
- An empty cell **leaves the existing translation untouched** — so a partial sheet never wipes work.
- Existing key order is preserved; brand-new keys are appended at the end of each map.

### 4. Validate & ship

```sh
node --check panorama/scripts/ql_settings.js
```

Then repack the VPK (predi-i compiles — uncompiled edits aren't visible in-game).

## Adding new translatable strings

When you add a new user-facing string in the settings UI, it won't be in any language map yet, so
it won't appear in the export. Add it to the `EXTRA_SOURCE_STRINGS` list at the top of
`scripts/export_translations.js` so it shows up (with blank cells) for translators. Once a
translation lands in a map, the export picks it up automatically and you can prune it from that
list.

## Languages

English (source), Russian, Ukrainian, Polish, Bulgarian, Belarusian, Japanese, Chinese, French,
Portuguese, BR Portuguese, Spanish — matching `SETTINGS_LANGUAGE_OPTIONS` in `ql_settings.js`.
