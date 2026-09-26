# QOLLOCK Panorama pitfalls

Use [ARCHITECTURE.md](../ARCHITECTURE.md) for the consolidated current contract.
This page records recurring traps; it does not replace source inspection or
in-game evidence.

## Native panels are not an XML-only tree

Most Deadlock panels are created dynamically by C++ game code. Layout XML often
contains only the surrounding containers. A missing XML declaration or a miss in
`scripts/audit_panel_ids.js` does not prove that a panel cannot exist.

Use the extracted game files and maintainer's Panorama Debugger. Request the
specific scenario, parent chain, child IDs/classes and label values you need.
Do not assume that the first descendant with a matching ID belongs to the current
player or live instance; duplicate IDs are normal in repeated UI subtrees.

## Context isolation and initialization

`hud.xml` and `hud_escape_menu.xml` load different scripts into different JS
contexts. The HUD loads gameplay manifests and `core/ql_app.js`; the settings
context loads shared low-level services, locale dictionaries and UI modules,
**not FeatureRegistry or gameplay manifests**.

Settings must use their existing metadata/registered tab renderers, not query the
HUD's FeatureRegistry as if it were shared memory. Check script includes before
calling a helper in profile, profile-card, hero-testing or quickbuy code as well.
Panel attributes and the existing bridge APIs carry cross-context state.

## Panorama is not a browser

Do not assume DOM `window`/`document`, `fetch`, `XMLHttpRequest`, WebSockets,
`setTimeout` or `setInterval` in Panorama. Use native panels, engine events and
`$.Schedule`/`$.CancelScheduled` through the appropriate existing infrastructure.
Feature polling belongs in `QOL.core.Scheduler`, not another timer implementation.

The embedded HTML storage page is a separate browser environment. Browser APIs
used inside that page are not evidence that HUD scripts can call them.

Shipped JS uses the syntax accepted by `eslint.config.js` and the engine build
pipeline. Keep continuation operators at the end of the preceding line, as
required by the project's Valve minifier/ASI rule.

## Scroll geometry and UI scale

`actualxoffset`/`actualyoffset` describe layout offsets; they are not sufficient
to decide whether a child of `overflow: squish scroll` is currently visible.
A child's static offset can remain unchanged while the container scrolls.
Preserve the existing tooltip and search/drag scroll handling instead of
replacing it with `actualyoffset >= viewportHeight` checks.

Likewise, cursor/layout measurements and inline CSS design coordinates can use
different scales. The current positioning code accounts for `actualuiscale_x`
and `actualuiscale_y`; copying physical pixel coordinates straight into CSS can
double-scale overlays on 1440p/4K displays. Reuse the relevant tooltip, preview
or drag path and verify actual positioning in Panorama.

## Helper semantics and style ownership

[HELPERS.md](HELPERS.md) distinguishes direct-child search, descendant traversal,
class search, ancestor walks and deep text reads. They are not interchangeable.
A generic first-text helper cannot identify the authoritative numeric label.

Avoid unchanged style writes, but do not assume native read-back equals your
assigned string for every property. Use property-appropriate helpers/signatures.
Clearing a code override with `ClearPropertyFromCode` is not equivalent to
assigning an empty string or an arbitrary default.

A style signature belongs to a particular panel. Reset it when replacing that
panel, otherwise the new instance can skip its initial style application.
A live cached handle does not prove current root/player ownership; callers own
rebinding and invalidation. Delete asynchronously and prevent delayed callbacks
from recreating disabled feature UI.

## Hideout and match transitions

Game CSS applies hideout/shop-specific visibility and scaling, but does not prove
that a HUD root is never destroyed or that a particular JS change fixes jitter.
Those claims require live evidence.

Do not skip every Scheduler callback in hideout. Features can need their callback
to remove overlays or restore native cursor classes. Stop work when its owning
context is invalid; otherwise let each feature apply its own idle/visibility and
cleanup policy. Back off missing-source scans and verify later recovery.

`CitadelGameStateChanged` invalidates shared panel caches. It does not establish
that all native classes and children have already reached their final state.

## Configuration and localization traps

- A supported numeric zero is not missing input. `value || fallback` can silently
  replace zero-valued settings such as Buff Delay. Use the canonical normalizer.
- Feature config values have canonical types. Do not guess toggles from key
  prefixes or assume every value called `ENABLE_*` is a literal numeric `1`.
- A setting absent from the feature's declared ownership may never reach its
  config slice, even though the control displays the expected value.
- Settings text uses English exact-key dictionaries. `LocalizeSettingsText`'s
  second argument is a force flag, not a locale code; it does not resolve native
  Valve `#tokens`. Dev/status text must also be localized.
- English literals used as catalog keys are valid; direct untranslated dynamic
  captions and inline bilingual branches are not. See [LOCALIZATION.md](LOCALIZATION.md).

## Source edits are not installed game changes

After JS/XML/CSS edits, the maintainer must compile and repack before testing the
change in game. Agents must not execute build scripts or resourcecompiler, modify
game addons, or create/modify VPKs. Offline load/tests do not render Panorama or
establish client persistence, panel lifecycle or FPS.

Follow [TESTING.md](TESTING.md), [PROFILING.md](PROFILING.md) and the
[maintainer checklist](TEST_CHECKLIST.md); report exactly what was exercised.
