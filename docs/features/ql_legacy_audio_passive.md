# Legacy audio contracts

The [manifest](../../panorama/scripts/manifests/ql_legacy_audio_passive/manifest.js)
owns bridge-buff announcements, minimap and DL4D reminders, and captions. Basic
passive-item presentation belongs exclusively to
[ql_passive_cooldown](ql_passive_cooldown.md). The [Audio UI](../../panorama/scripts/ui/audio.js)
and [flat defaults](../../panorama/scripts/ql_shared_presets.js) are separate
settings representations. Every consumed setting must be registered in the
manifest so live edits, imports and exports reach it.

`BRIDGE_BUFF_START` shifts only the repeating bridge announcement. DL4D has
its own fixed timetable. The runtime reads native game-clock labels, suppresses
duplicate boundary alerts and stops reminder work in hideout and Street Brawl.
Caption hide callbacks use feature-owned managed one-shots and lifetime guards.
Replacing a caption deadline, hiding the caption or disabling the feature cancels
pending work. Hideout must remove a visible caption without emitting another
reminder from a retained clock. Settings changes refresh reminder policy without
waiting for the next observation poll.

Announcement deduplication, caption tokens and native caption handles belong to
each feature instance. A new HUD generation resets its private announcement
history; disabled callbacks cannot mutate a later instance. Disabling captions
alone cancels visible feedback immediately while preserving reminder audio.
The manifest does not publish a caption/game-clock cache through shared `State`.

This manifest does not implement Advanced item mirroring; see
[ql_item_mirror](ql_item_mirror.md). Tests can check emitted sound events, but
native asset playback requires a repacked client.
