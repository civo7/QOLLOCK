# Hitsound and Killsound clips

Each Hitsound / Killsound dropdown option is a folder of numbered clips:

    sounds/hitsounds/blip/blip00.wav
    sounds/hitsounds/blip/blip01.wav
    ...
    sounds/hitsounds/blip/blip99.wav

Use 1 to 100 clips per option (00 to 99). One clip is picked at random each time
the sound plays. Hit sounds live in `sounds/hitsounds/`, kill sounds in
`sounds/killsounds/`.

Just add, remove or rename clips and build as usual. The build runs
`tools/update_hit_kill_soundevents.ps1` first, which lists every clip in
`soundevents/world_ambient_emitters.vsndevts` (the game only plays clips named
there). You can also run that script by hand:

    powershell -ExecutionPolicy Bypass -File tools\update_hit_kill_soundevents.ps1

Clips must be named after their folder: `<folder>00.wav` to `<folder>99.wav`. The
script stops with a message if a `.wav` in a folder is named anything else.

## Custom

The last option in each dropdown, Custom, has no clips in this repo. It works like the custom
announcers: make a pack with the QOL Lock Audio Pack Builder (pick the Hitsound or Killsound pack
type, add 1 to 100 clips, set a Name, Credit and Description) and install the `pak01_dir.vpk` it
makes. The pack supplies `custom00` to `custom99` for that folder and the name, description and
credit shown for the option. The sound events always list all 100 slots, so nothing needs to be run.

Without a pack installed, Custom shows as "Custom" and plays nothing.
