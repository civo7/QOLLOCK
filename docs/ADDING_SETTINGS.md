# Adding a setting

Start with [architecture, section 6](../ARCHITECTURE.md#6-configuration-and-adding-settings).
A manifest schema, flat defaults, a visible control and a serialized field are
separate contracts. None automatically creates the others.

## Change path

1. **Confirm the default with the maintainer.** Agree on units, range, precision,
   dependencies, UI location and whether the value belongs in shared presets.
   Do not select a default from an example or another feature.
2. **Add flat defaults** in `panorama/scripts/ql_shared_presets.js`
   (`QOL_DEFAULT_CONFIG`). Add matching schema entries to every owning
   `panorama/scripts/manifests/<id>/manifest.js`. Settings-only preferences need
   not have a gameplay manifest. Shared keys can have multiple feature owners.
   Registration resolves existing defaults and numeric metadata from the shared
   catalog, while ConfigStore maintains one accepted value for every subscriber.
   Keep each declaration's type/meaning consistent; a local copy is not a second
   persistent setting.
   Omit repeated persistent defaults and numeric bounds from manifests; the shared
   default map and current field catalog own them. Feature-local fields still need
   explicit defaults and validation metadata.
3. **Edit the real tab renderer.** Most tabs register a renderer through
   `QOL.ui.window.registerTabRenderer` and build rows with `QOL.ui.controls`.
   Read an adjacent row in `ui/gameplay_tabs.js`, `config_tab.js`, `audio.js` or
   the relevant module. `ui/layout.js` declares navigation/fallback layout;
   editing it alone does not add a control to a tab with a custom renderer.
4. **Localize the entire interaction.** Reuse English source keys and add missing
   English/Russian catalog entries under `panorama/scripts/ql_settings_loc/`.
   Labels, descriptions, options, tooltips, previews and feedback all count.
   Settings localization uses `LocalizeSettingsText`, not invented `#QOL_*`
   tokens. Use [LOCALIZATION.md](LOCALIZATION.md) for the exact contract.
5. **Reuse control behavior.** Preserve dirty marking, save debounce, search
   collection, reset-key tracking, changed-state comparison, dependent rows,
   row synchronization and preview dispatch. Read current settings through
   `QOL.getSettingsConfig()` rather than capturing an object across replacement.
   Add names/descriptions/section overrides/performance metadata in
   `ui/ql_settings_metadata.js` where the existing path needs it.
6. **Implement runtime reaction.** Use the manifest's `onSettingsChanged` and
   current `ctx.config`. Keep enable predicates, disable cleanup and other owners
   consistent. Numeric modes are not necessarily boolean toggles. Do not add a
   second poller just to observe a setting already delivered through the hook.
7. **Preserve storage compatibility.** Add current control metadata to
   `QOL_SETTINGS_FIELDS`. A new compact schema version requires explicit
   maintainer authorization; until then the writers use a JSON envelope for
   values the published binary layout cannot represent.
   Preserve historical schema field order, bounds, steps and defaults. Update
   relevant normalization/migration/import/export paths. Package version,
   schema version and public update marker are separate concepts.
8. **Check the complete round-trip.** Verify control -> dirty intent -> published
   config -> HUD consumer -> export -> import, plus reset/preset application and
   disable/re-enable. Include range boundaries and malformed typed input.

## Runtime hook contract

The hook receives one payload, not `(key, value, allSettings)`:

```javascript
onSettingsChanged: function(change) {
    // change: {featureId, key, value, changes: {[key]: value}}
    // Read current normalized values with ctx.config.get(key) or view().
}
```

This signature illustration is not a feature implementation. Follow the owning
manifest's existing reaction path. `ctx.config.view()` is live and read-only by
convention; `all()` allocates a shallow copy. The HUD receives settings through
cross-context publication and polling, so hooks do not guarantee zero latency.
Batch payloads contain every changed owner key in `changes`; `key`/`value`
describe only the first. All shared subscribers already hold the accepted values
before hooks run.

## Numeric and enable-state boundaries

- Flat persisted toggles are generally 0/1; ConfigStore feature toggles become
  booleans. Do not apply generic JavaScript truthiness to flat values.
- A manifest `enableKey` is not a complete activation rule if it also declares
  `isEnabled`. Inspect the predicate and shared-key routing.
- Procedural sliders commit on the compact schema step grid where a field exists,
  within intersected UI/schema bounds. Invalid typed input preserves the prior
  value. A finer UI step cannot make the wire format preserve more precision.
- ConfigStore slider rounding is not compact-codec step snapping. Verify the
  renderer and actual consumer rather than assuming every numeric path matches.
- Performance tiers are UI metadata, not measured frame-time guarantees. Do not
  assign an unsupported milliseconds-per-tick claim to a new control.

## Verification

Use affected existing regressions and the offline gate in [TESTING.md](TESTING.md).
Localization tools find only the cases they scan; green dictionary loading is
not proof that all visible text is translated. Offline checks cannot establish
native panel identity, rendering or persistence across a full client restart.

The maintainer alone compiles/repackages the VPK and performs the relevant client
checks in [TEST_CHECKLIST.md](TEST_CHECKLIST.md). Agents must not run build scripts,
`resourcecompiler.exe`, modify game `addons`, or create/modify VPKs.
