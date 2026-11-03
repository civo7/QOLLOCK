# Damage number presentation

The `ql_damage_numbers` manifest owns native indicator size/opacity overrides.
CSS collapses small, cumulative (including final totals), and trooper events
without waiting for JavaScript label discovery. The shared HUD projector owns
the Fountain, clean, cumulative and trooper gates; retiring the manifest releases
those gates without changing persisted choices.

The native-label presentation poll runs only while size or opacity differs from
its neutral value. Returning both to neutral releases owned code styles and stops
discovery; a settings change restarts it. CSS visibility/Fountain modes remain
reactive while that poll is stopped. Active size/opacity still use native code
styles: removing that path requires client evidence of native style writers and
stylesheet priority on live and recycled indicator roles.

Size and opacity are edited directly beside the damage modes in the Crosshair
tab. These indicators follow world/combat events and have no HUD-canvas entry
or screen position controls.

The native `hud_event_indicator.css` import wrapper loads the preserved game
baseline before the QOLLOCK rules and Fountain keyframes. These rules must load
in the event indicator context; importing them only from HUD CSS is insufficient.

Fountain size is a percentage slider in the Crosshair tab, separate from the
damage font-size slider. The native event layout wraps its content in QOLLOCK's
scale canvas. The slider transforms this canvas only for individual events with
a native Fountain animation variant. Cumulative, final cumulative, batched and
other non-Fountain events keep their existing size. Native root placement and
scale writes stay separate from presentation; inner distance scales and keyframe
animations remain intact. Its neutral value preserves the
former Medium presentation. Scale classes exist only while Fountain is enabled.
The stylesheet shares identical rules and namespaces its animation names so disabling Fountain
returns native indicators to their own presentation. Clean and visibility rules
load afterwards and retain their independent settings.

Offline tests cover reactive classes, ownership retirement and settings sharing.
After maintainer compilation/repacking, verify the scale range with gun, spirit, melee,
pure, critical, cumulative and healing indicators at different distances, plus
clean mode and small/trooper filtering. A static hierarchy without those events
does not establish native class coverage or animation behavior.
Keep the same target in view while changing Fountain size: its indicators must
remain anchored to the target rather than shift toward or away from screen origin.
Compare individual and cumulative numbers together: changing Fountain size must
leave Big Numbers unchanged, including final totals, with Clean both on and off.
Also verify native values, descriptions and effectiveness bindings with Fountain
disabled: the canvas remains in the native layout at its neutral scale.
