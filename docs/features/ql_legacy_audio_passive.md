# Legacy audio and Basic cooldown contracts

The [manifest](../../panorama/scripts/manifests/ql_legacy_audio_passive/manifest.js)
owns bridge-buff announcements, minimap and DL4D reminders, captions, and some
Basic passive-item layout. The [Audio UI](../../panorama/scripts/ui/audio.js)
and [flat defaults](../../panorama/scripts/ql_shared_presets.js) are separate
settings representations. Every consumed setting must be registered in the
manifest so live edits, imports and exports reach it.

`BRIDGE_BUFF_START` shifts only the repeating bridge announcement. DL4D has
its own fixed timetable. The runtime reads native game-clock labels, suppresses
duplicate boundary alerts and stops reminder work in hideout and Street Brawl.
Caption hide callbacks need lifetime guards; hideout must remove a visible
caption without emitting another reminder from a retained clock.

This manifest does not implement Advanced item mirroring; see
[ql_item_mirror](ql_item_mirror.md). Tests can check emitted sound events, but
native asset playback requires a repacked client.
