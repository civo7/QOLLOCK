# QOLLOCK Translations

The settings UI is localized via per-language string modules in
`panorama/scripts/ql_settings_loc/ql_settings_loc_<lang>.js` (`SETTINGS_LOCALE_TEXT["ru"]`, `SETTINGS_LOCALE_TEXT["uk"]`, …). Each module maps `English source string -> translation`. `ql_settings_loc_en.js` is the canonical English source catalog.

This folder holds the round-trip tooling for translator spreadsheets and JSON catalogs:
the locale files in code are the source of truth, and a CSV is generated from them for translators to
fill, then merged back.

## Files

- `qollock_settings_translations.csv` — generated spreadsheet: one row per English string, one
  column per language. This is the file you hand to translators (via Google Sheets).
- `locales/` — i18next JSON catalogs used by the [qollock-translate](https://github.com/Predi-i/qollock-translate) web workbench.

## Workflow

### 1. Export the sheet (reconstruct it from code)

```sh
node scripts/export_translations.js
```

Writes `translations/qollock_settings_translations.csv` and prints per-language coverage
(translated / total). The CSV is UTF-8 with a BOM so Google Sheets / Excel read Cyrillic, CJK, and accented Latin correctly.

### 2. Share with translators

1. Google Sheets → **File → Import → Upload** → pick the CSV → *Replace spreadsheet*.
2. Share the sheet with translators (edit/comment access).
3. They fill the **blank cells** in their language column. **Untranslated strings are grouped at the
   bottom of the sheet** (fully-translated rows first, then partially-translated, then brand-new
   strings blank in every language at the very end). Rules for translators:
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
- A non-empty cell **sets/overrides** that language's translation in `panorama/scripts/ql_settings_loc/ql_settings_loc_<lang>.js`.
- An empty cell **leaves the existing translation untouched** — so a partial sheet never wipes work.
- Existing key order is preserved; brand-new keys are appended at the end of each module.

### 4. Validate & ship

```sh
npm test
```

Then repack the VPK (predi-i compiles — uncompiled edits aren't visible in-game).

## Languages

All 15 supported languages (matching `SETTINGS_LANGUAGE_OPTIONS` in `panorama/scripts/ui/theme.js`):
English (en), Russian (ru), Ukrainian (uk), Polish (pl), Bulgarian (bg), Belarusian (by),
Japanese (ja), Korean (ko), Chinese (zh), French (fr), Italian (it), Turkish (tr),
Portuguese (pt), BR Portuguese (pt-br), Spanish (es).
