# Localization architecture and contributor contract

Read this file before adding or changing user-facing text. This applies to Dev
and diagnostic screens as well as ordinary settings. English and translated
copy belongs in the locale catalogs; do not embed bilingual captions or choose
Russian/English with a conditional inside a UI module.

## Actual runtime contract

The 15 dictionaries live in `panorama/scripts/ql_settings_loc/ql_settings_loc_<lang>.js`
and register on `globalThis.SETTINGS_LOCALE_TEXT`. English is an identity map:
the English phrase itself is the key. Russian is `ru`; Brazilian Portuguese is
`pt-br` at runtime, `pt_br` in the filename and `pt-BR` in JSON exports.
Belarusian is `by` at runtime and `be` in JSON exports.

`LocalizeSettingsText(text, force)` in `ui/theme.js` returns the active
language's exact-key match or the original English phrase. English returns the
source phrase directly. The second argument is a boolean: true bypasses the
Presets-tab localization exemption; it is not a language selector. It does not
resolve #tokens, use QOL.ui.locales, fall back to Russian or call $.Localize.
Those claims in the previous version of this document were incorrect. Native
Valve #tokens are a separate localization mechanism.

## Adding UI text

1. Reuse an existing English key where the meaning matches. Otherwise add the
   English identity entry and Russian translation to their respective files.
   Add reviewed translations to other dictionaries when available; do not fill
   them with copied English merely to claim 100% coverage.
2. Pass the source key through LocalizeSettingsText before assigning visible
   text. For dynamically created overlays/status messages use force=true.
   Keep translated sentences whole; append diagnostic values separately or use
   a documented placeholder scheme. Do not concatenate translated fragments.
3. Verify English and Russian rendering and fallback for an incomplete locale.
   Tests must observe text actually displayed, not only count catalog entries.
4. Update relevant English module documentation, run npm test, and export new
   source entries through the translation workflow after the change is pushed.

A literal English phrase used as a lookup key is part of the existing format.
Assigning that phrase directly to a dynamic label without localization is not.
No blanket exemption exists for the Dev tab. Automated checks have limited
coverage and do not excuse skipping these steps.

## Repositories and synchronization

- QOLLOCK: runtime JS dictionaries, authoritative set of shipped source keys.
- Predi-i/QOLLOCK-translations: JSON catalogs at locales/<code>/translation.json.
- Predi-i/qollock-translate: translator website reading/writing that catalog
  repository; it is not the mod's runtime locale source.

`.github/workflows/sync-translations.yml` exports from QOLLOCK main daily,
on manual dispatch, and on changes to dictionaries/export tooling. It needs
PUBLIC_REPO_PAT with Contents write access to the public catalog repository.
The corrected path filters cover the extracted dictionary directory. Staging
locales before checking the diff includes new, previously untracked files.

The default exporter adds missing entries and preserves community translations
and orphan entries. It does not propagate corrections over existing non-English
entries; coordinate those edits in the public catalog. Malformed merge inputs
now abort before output writes. --replace explicitly discards that protection
and must not be used by automatic sync. Coverage excludes orphan keys and uses
one decimal place so 830/832 is not printed as 100%.

The reverse direction is still manual and reviewed:

1. Obtain the merged public catalogs (review repository changes first).
2. Run `node scripts/import_locales_json.js D:/GitHub2/QOLLOCK-translations/locales`.
3. Review the runtime dictionary diff, run npm test, then commit and repack as
   maintainer. Do not assume exporting catalogs imports community translations.

The importer supports only languages registered in scripts/locales_helper.js.
Adding a new language also needs runtime language options/IDs, XML includes,
config compatibility and tests. A new catalog on the website alone is not
runtime language support. Unknown catalogs are currently skipped with warnings.
JSON export defaults to translations/locales; it does not auto-discover the
sibling repo. CSV export defaults to translations. The .bat wrappers have
additional sibling-directory behavior; they are not equivalent to plain npm
commands. Import/export does not compile or repack the mod.

## Checks and known coverage limits

- npm test checks dictionary loading, English identity values, English-key
  markup and absence of orphan keys in non-English maps. It does not require
  complete translations or validate every translated HTML value.
- tests/ui_visual_check.test.js verifies every walkthrough caption/step goes
  through the catalog and checks rendered Russian launch text.
- tests/locale_export.test.js covers community text preservation, addition of
  new entries and refusal to overwrite malformed merge inputs.
- translations:missing instruments localization calls while rendering tabs;
  translations:labels scans only label: literals. Neither proves absence of
  hardcoded text, and identifiers/names can be legitimate untranslated values.

## Audit snapshot — 2026-09-26

Before the walkthrough fix, English and Russian each had 832 catalog keys.
Italian had 52/832; the other twelve non-English catalogs had 830/832. Identical
English values include names and technical terms and are not automatically
translation defects. These counts exclude visible text never entered in a map.
The fix adds 18 English/Russian entries (850 total); other languages fall back
to English for untranslated new text.

The latest inspected sync run (36119754359, September 25) succeeded and reported
no new strings. The old push filter still targeted ql_settings.js, so dictionary
changes depended on daily/manual execution. This was a trigger gap, not evidence
of a broken PAT. Local unpushed commits cannot reach that workflow.

The live public repository also has German (649 entries) and Dutch (97), neither
registered among the mod's 15 languages. Russian differs in one public catalog
entry from the current runtime catalog; Italian has no additional translations
there. No mass import, new language registration, remote push or deployment was
performed during this fix. A broader UI audit is still needed before claiming
full language coverage, especially for older Dev/status text.
