# Localization Architecture & Workflow

QOLLOCK settings UI supports 15 languages, loaded as modular dictionary scripts and resolved dynamically based on user settings or game language.

---

## 1. Directory Structure

All runtime localization dictionaries reside in:
`panorama/scripts/ql_settings_loc/`

Each file registers its dictionary onto `QOL.ui.locales[langKey]` and exports a global fallback `ql_settings_loc_<langKey>`.

Supported locales:
- `en` — English (`ql_settings_loc_en.js`)
- `ru` — Russian (`ql_settings_loc_ru.js`) — canonical primary reference
- `uk` — Ukrainian (`ql_settings_loc_uk.js`)
- `pl` — Polish (`ql_settings_loc_pl.js`)
- `bg` — Bulgarian (`ql_settings_loc_bg.js`)
- `by` — Belarusian (`ql_settings_loc_by.js`)
- `ja` — Japanese (`ql_settings_loc_ja.js`)
- `ko` — Korean (`ql_settings_loc_ko.js`)
- `zh` — Chinese (`ql_settings_loc_zh.js`)
- `fr` — French (`ql_settings_loc_fr.js`)
- `it` — Italian (`ql_settings_loc_it.js`)
- `tr` — Turkish (`ql_settings_loc_tr.js`)
- `pt` — Portuguese (`ql_settings_loc_pt.js`)
- `pt_br` — BR Portuguese (`ql_settings_loc_pt_br.js`)
- `es` — Spanish (`ql_settings_loc_es.js`)

---

## 2. Runtime Resolution

Resolution is handled by `LocalizeSettingsText(token, customLang)` in `panorama/scripts/ui/theme.js`:
1. If `token` does not start with `#`, it is returned unchanged.
2. Checks the active language dictionary (`QOL.ui.locales[activeLang]`).
3. If not found, falls back to English (`QOL.ui.locales.en`).
4. If still not found, falls back to Russian (`QOL.ui.locales.ru`).
5. If still not found, attempts `$.Localize(token)` via Valve engine localization.
6. If engine localization returns nothing, returns the raw `token`.

---

## 3. Translation Tooling & Scripts

All translation management scripts are located in `scripts/`:

| Script | Purpose |
|---|---|
| `scripts/locales_helper.js` | Core helper for AST parsing, reading/writing `ql_settings_loc_*.js`, and locale mapping. |
| `scripts/export_translations.js` (`npm run translations:export`) | Exports all 15 locale dictionaries to master CSV (`translations/qollock_settings_translations.csv`). |
| `scripts/import_translations.js` (`npm run translations:import`) | Imports translated strings from master CSV back into `ql_settings_loc_*.js`. |
| `scripts/export_locales_json.js` (`npm run translations:json:export`) | Exports structured JSON files to `translations/locales/<lang>/translation.json` (and `QOLLOCK-translations` if present). |
| `scripts/import_locales_json.js` (`npm run translations:json:import`) | Imports JSON files from `translations/locales/` or `QOLLOCK-translations` back into `ql_settings_loc_*.js`. |
| `scripts/find_untranslated.js` (`npm run translations:missing`) | Uses headless sandbox to traverse UI tabs and report untranslated keys. |
| `scripts/find_untranslated_labels.js` (`npm run translations:labels`) | Static scanner finding UI string literals that lack `#` localization keys. |

---

## 4. Quality Assurance & Tests

The test suite includes dedicated locale integrity validation in `tests/locales_integrity.test.js`:
- Ensures all 15 locale dictionary files exist and parse without syntax errors.
- Ensures English dictionary matches Russian base keys 100%.
- Verifies HTML tags (`<font color="...">...</font>`, `<b>`, `</b>`) are properly balanced and uncorrupted.
- Detects orphan keys and missing tokens.

Run the test suite before every commit:
```bash
npm test
```
