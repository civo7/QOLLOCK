# Keyboard overlay ownership

The HUD `ql_keyboard` manifest owns its overlay, layouts, rows and native
`CitadelBinding` instances. The existing basic/full action lists and Full,
Compact and Grid choices remain available with the existing themes, offsets,
scale, wash and Customize controls. Native bindings resolve actions and own
glyph creation, replacement, input and press-state classes.

## Presentation and lifetime

The static native `Hud > .HudCore > gameplay_hud` XML owner calls
`QOL.features.keyboardOwnerLoaded()` on load. The feature also applies on enable,
settings changes, scoreboard visibility changes and accepted Customize preview
transitions. There is no keyboard poll, glyph discovery pass or periodic native
style verification. The load hook is inactive after disable or a failed enable.
It is an XML construction hook, not a general panel-mutation notification.
Arbitrary external reparenting or deletion does not trigger idle repair; the next
owning hook reconciles the tracked generation, and disable retires all recorded
created handles, including moved children.

`ql_feat_keyboard.css` owns the fullscreen wrapper and layout/positioning rules.
The binding and keyboard-glyph stylesheet extensions also import the scoped
`ql_feat_native_keyboard_overlay.css` presentation. This puts typography, mouse
sizes, themes, wheel animation and press-state rules in the actual independently
created native component contexts. All selectors remain confined to the keyboard
overlay; other native bindings and glyphs keep their stylesheet behavior. Native
wrappers retain their baseline imports. There are no per-glyph inline overrides
to release when a glyph appears late, is replaced or moves outside the overlay.

Settings apply `uiScale` to the created layout, retaining base geometry in CSS
and native units. This uniformly scales keys, glyphs, spacing and borders while
the outer box retains its configured positioning offsets. Theme, wash and scale
changes retain bindings. Only the selected action set is instantiated; Full Keys
and layout changes retire the previous generation, including its native bindings.
Only owned layout geometry, outer wash, visibility and theme classes use the
shared native-style owner. Rejected writes keep the overlay hidden and schedule
an owned retry; queued previous-generation deletion also schedules a retry.
These one-shots stop after success and are cancelled on disable. Missing gameplay
waits for the XML owner load hook rather than starting a discovery poll.

The shared created-tree helper tracks partial construction and retirement.
Previous foreign roots are retired rather than adopted; queued re-enable waits
for deletion before constructing a single successor. A loading-root lookalike
cannot host the overlay. Native-style retirement retains its shared cleanup-only
retry and protects newer leases. Unexpected construction failures stay observable
and remove subscriptions, pending work and the partially created generation.

The selected Keyboard Customize sample exposes the real binding box despite
ordinary shop visibility CSS. The preview owner delivers selection, expiry and
withdrawal through `presentation:preview_changed` after accepted delivery; keyboard
subscribes through its lifecycle context. This does not change shop state,
input, persisted settings or the selected action set.

Ordinary presentation requests cached composition only on the bounded
`AllBindingsBox`. The fullscreen wrapper has no composition request. Cached
native glyph and press/release output still require client verification.

## Diagnostics and verification

Feature-local `diagnostics.js` owns read-only receipts, a bounded outside-window
native glyph census and temporary `hideRoot`/`composition` controls. The HUD loads
it before the manifest; source captures fingerprint both factories. Inspection
does not render or add recurring work.

`inspect()` reports activity, generation, attachment, local visibility, owned
style readiness, update count, composition policy and selected/hidden binding and
payload counts. Hidden counts remain zero because inactive action sets are not
created. `glyphsReady` requires complete census, a selected native payload
and successful owned presentation. Glyph styles now come from component CSS, so
a late or replacement payload does not wait for a JavaScript render pass.
An empty modifier-combiner label alone is not a payload. `glyphWorkload` records
payload paths/types/IDs/roles; `glyphEpoch` additionally records handle identities.
These receipts establish presence and unchanged workload, not computed CSS,
animation execution or pixel output.

`begin()` leases temporary diagnostic controls. Hiding preserves bindings across
settings changes; changing composition recreates the owned generation. Omitted
controls return to ordinary cached presentation. Disable, replacement and a newer
lease retire older controls. `retirement()` distinguishes disabled state from
completed created-tree deletion and style release. Legacy captures and their
polling mechanism metadata remain historical evidence; the rewritten owner has
no active polling mechanism to contrast.

`keyboard_owner_lifecycle.test.js` covers retained actions/themes, uniform scale,
settings and Customize delivery, XML-load recovery, deep/late/replaced glyphs,
no idle native traversal or scheduled work, diagnostic leases and receipts,
queued re-enable, partial failure and rejected-write/deletion cleanup. Native
style-chain checks cover both component imports. These offline tests do not
prove native input, CSS cascade, composition or placement. After maintainer
compile/repack, check all layouts/themes, low/high scale, keyboard/mouse/modifier
glyphs, press/release, shop/Customize visibility, HUD reload and the combined
Expanded Config scene; measure frame time separately from offline work counts.
