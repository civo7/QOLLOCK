# Better Builds

The Shop setting enables a High Elo tab in the native build browser. The tab
filters the live build list by leaderboard region and trusted-player group.
It displays author ranks, recent usage, favourites and relevant changes since
the build was updated. Trusted-author badges also appear on the native tabs.
The native browser previews, applies and favourites each build.

The HUD manifest owns the persisted setting and publishes the current QOLLOCK
language to a feature-specific attribute on the common Panorama root. The
popup script uses that attribute to mount and retire its own browser session.
It discovers the native selector under `BuildsContent`, uses its header and
main container as lookup roots and observes rows only inside the build list.
The native selector is created by the game. The current GameTracking popup
and selector XML describe the direct-child paths, including the row's
`BuildNameArea` and `RightPanel`. The supplied Better Builds mod supplies the
build-ID and row dialog variables. Check native ancestry and input routing with
the Panorama Debugger after a client update.

The feature uses the supplied Better Builds relay at
`https://builds.braydendwyer.com/`. The popup's CEF panel requests the hero
registry and one hero at a time through the BG1 title protocol. Requests send
regions and public hero metadata. The relay uses deadlock-api.com and its
published data. The popup manager keeps bounded-lifetime registry and hero
responses for the game session. An expired response is fetched again on the
next open. The popup displays feed failures and allows a retry.

The popup owns its panels, CEF instance and managed schedules. The native
input handlers remain installed during High Elo use. The popup collapses the
stock tabs, list and loading panel through native style overrides so its own
list can fill the space beside the details pane. Its temporary stock tab
controls restore those styles and activate the original native tabs. Closing
the browser, disabling the setting or replacing a selector also releases the
overrides and the active session. Delayed build selections and relay results
check session ownership.

Run `node --test tests/better_builds.test.js` for the settings-code, popup,
relay and native action simulator regressions. The tracked HUD capture has no
open build browser. Check actual layout, stock-to-High-Elo tab transitions,
build-ID searches, Use Build, favourites and the live feed in the client after
the maintainer compiles and repacks the mod.
