# Manual visual settings check

Dev -> Visual Settings Check starts a click-driven HUD inspection in a match
or sandbox. This tool does not award a pass: the maintainer observes the actual
screen after each change. It covers six groups in twelve steps: top bar, bottom
bar, souls, items, ammo and minimap. Each group has a reference state and a
visibly different state. Related X/Y changes are applied together; the card
describes the expected movement, scale or opacity change and exact values.

The card offers Next, Back, A/B comparison and Stop. There is no automatic
advance or ten-second wait. Allow the HUD to settle before assessing a step.
Items require equipped items; the check does not spawn items, simulate combat,
or establish correctness of every setting or game mode.

`ui/visual_check.js` is loaded before `ui/dev_tab.js` in the settings context.
It reuses panel validity/creation/deletion helpers and the core persistence
root/HUD resolver. Only direct children of the settings context are hidden
during the session; the CEF bridge remains visible and active. Their original
visibility overrides are restored on exit. The menu's dark background is also
temporarily cleared and restored, so it does not distort opacity checks.
The card stays near the upper left
to leave the crosshair and bottom HUD available for inspection.

Before starting, an existing pending user edit is flushed normally. The tool
then snapshots only its owned setting keys. Steps restore the previous group's
keys and publish the next configuration through the normal root/HUD revision
bridge. HUD ConfigAdapter and feature lifecycle processing remain responsible
for applying the changes; the tool never directly styles native HUD elements.
Temporary settings do not call SaveAndSync, profile persistence or CEF save.
Unrelated live settings are preserved. This is a runtime visual check, not a
disk-save or slider-input test.

Completion, Stop, settings close and resume restore original owned values.
A 0.5-second session-only watchdog also handles a deleted card/HUD/window.
There is no background loop when idle. Destruction of the entire JavaScript
context cannot run cleanup; the tool has not saved its temporary values to
disk, but normal startup restore is still subject to the game's lifecycle.

`tests/ui_visual_check.test.js` loads the real HUD/settings script lists in
separate simulated isolates and checks configuration propagation, grouped
offsets, no timed advance, completion/restart, close/deletion cleanup, prior
pending edits and absence of persistent saves. It cannot verify native cursor
routing, menu visibility or rendered positions. The maintainer must compile
and repack before checking the card in Deadlock.
