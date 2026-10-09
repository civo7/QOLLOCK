# Keyboard overlay ownership

The HUD `ql_keyboard` manifest owns its created overlay, layouts, rows and
`CitadelBinding` panels. Native input, binding state and shared HUD CSS remain
with their existing owners. The basic/full action layouts and persisted setting
catalog are retained.

The instance resolves the current native `Hud > .HudCore > gameplay_hud` and
waits when gameplay is absent. A replaced living HUD, parent or created child
retires the previous generation. Every created panel is tracked, including
reparented rows/keys and partially constructed layouts; shared panel caches and
factory helper aliases are no longer part of this owner.

Geometry and palette/custom RGB wash are derived in settings hooks. Native
`CitadelBinding` glyphs can appear or change later, so polling reconciles current
descendants independently of the settings signature. The extracted
`citadel_ui_keyboard_glyph.xml` declares `KeyboardLetter` and
`ModifierCombinerLabel` as Label **types**, without a generic Label class.
Mouse images retain their native `MouseButtonGlyph` class. Successful styling
is guarded; rejected writes retry, and moved native glyphs lose only the code
properties this instance attempted to own.

`keyboard_owner_lifecycle.test.js` checks both action layouts, geometry/color
changes, late/replaced native glyphs, living generations, partial writes and
construction, registry failure cleanup and disabled callbacks. The simulator
does not prove native binding creation, glyph composition, key press visuals or
editor placement; verify those after maintainer compilation/repacking.
