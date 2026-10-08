# On-death arcade coordination

The HUD `ql_on_death_arcade` owner observes the existing local respawn timer and
retains its established class fallback. It derives the selected game pool from
accepted settings; arcade implementations and modal polling remain in the
separate settings context. A missing/unreadable native timer is unknown evidence,
so replacing a timer does not cancel a running request. A hidden timer or a
nonpositive readable countdown ends the session. Hideout and an empty game pool
release the request.

`ql_bridge.js` owns the named descriptors for the existing active, game and token
attributes. The active flag commits a complete game/token pair; failed writes
retry the same request instead of discarding the death edge. Token identity spans
registry instance generations because settings remembers its last accepted token.
Existing attribute names and payloads are unchanged.

The temporary `onDeathArcadeEscapeOwned` channel marks individual native panels
whose `ShowEscapeMenu` class the HUD added. It is local to each target, never a
root/Hud broadcast or persisted setting. Both contexts remove only marked
classes. A preexisting manually opened Escape menu survives session cleanup,
and dismissing an automatically opened menu does not reopen it on every poll.
Replacing native targets retires their previous ownership and binds the current
generation. Disable stops HUD schedules and clears owned bridge/menu state.

`tests/on_death_arcade_owner.test.js` exercises payload rejection, living/late
sources, repeated enablement and two production XML-loaded isolates sharing
native attributes. The maintainer must compile/repack and verify native death,
respawn, modal dismissal and manually opened menus in the client.
