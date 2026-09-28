# Public release update checker

[ql_update_checker.js](../../panorama/scripts/ql_update_checker.js) runs in the
settings context through `hud_escape_menu.xml`, not as a HUD manifest.
`QOL_UPDATE_MARKER` identifies the public release independently of package
and settings-schema versions. Follow the
[public release procedure](../../README.md#publishing-a-public-release) before
changing or publishing a marker.

The checker loads a marker image through a Panorama Image panel, not browser
fetch. It classifies image dimensions; load failure, timeout or invalid
dimensions do not establish that a release is current. The probe must remain
visible enough for native image loading and must be removed after its bounded
attempt.

Opening settings starts at most one automatic attempt per script-context
lifetime. A recreated context is not the same as a whole game session.
`ENABLE_UPDATE_CHECKER` can hide a detected-update popup or allow a pending
check. Its default and persistence path belong to source, not this note.
Native image loading and popup layout need client verification.
