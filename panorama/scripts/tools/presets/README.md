# Player preset update tools

One-shot **developer** tools (run with Node, never loaded by the game) for turning
player-submitted share codes into entries in `ql_shared_presets.js`.

## Background

Players post their HUD as a compact share code in the Discord channel, e.g.:

```
[QOL-3-1-6]:Aig0SxQjZMhM7gclk6kBZCAD...
```

That string is the player's config bit-packed against a versioned schema and
base64url-encoded — the same format the in-game **Export** button produces.

Inside `ql_shared_presets.js` presets are stored **decoded**, as sparse JS objects
holding only the keys that differ from `QOL_DEFAULT_CONFIG`:

```js
QOL_PRESETS["Synthronix"] = {
    DEFAULT_HERO: "hero_haze",
    ENABLE_BUFF_HUD: 1,
    ...
};
```

So "updating a preset" = decode the player's share code back into such an object
and write it into the file. These tools do exactly that using the mod's **own**
codec (`QOL_CODEC`) and schema registry — no reimplementation, so the result is
byte-identical to what the in-game importer would produce.

## Workflow

1. Edit the `PRESETS` array near the bottom of `decode_presets.js` — one entry per
   player: `{ key: "<QOL_PRESETS key>", code: "<full [QOL-x-y-z]:... string>" }`.
   The `key` must match the key used in `QOL_PRESETS` / `BuildCommunityPresetEntries()`
   (e.g. the "Munchkin" button maps to the preset key `munchkinman`).

2. Decode:
   ```
   node panorama/scripts/tools/presets/decode_presets.js
   ```
   Prints each decoded preset and writes `decoded_presets.json`. Sanity-check the
   key counts and `DEFAULT_HERO` values against what the player posted.

3. Mark each preset's storage form in the `TARGETS` array in `apply_presets.js`:
   - `assign` — defined as `QOL_PRESETS["Key"] = { ... };`
   - `member` — defined inline in the big `QOL_PRESETS = { ... }` literal as `"Key": { ... },`

   Find the form with:
   ```
   grep -nE '(QOL_PRESETS\["Key"\] = \{|^\s*"Key": \{)' panorama/scripts/ql_shared_presets.js
   ```

4. Apply (rewrites `ql_shared_presets.js` in place):
   ```
   node panorama/scripts/tools/presets/apply_presets.js
   ```

5. Verify the file still parses and review the diff:
   ```
   node -e 'const fs=require("fs"),vm=require("vm");const s={$:{Msg(){}},console};s.window=s;vm.createContext(s);vm.runInContext(fs.readFileSync("panorama/scripts/ql_shared_presets.js","utf8"),s);console.log("presets:",Object.keys(s.QOL_PRESETS).length)'
   git diff panorama/scripts/ql_shared_presets.js
   ```

## Notes

- Keys equal to the default are intentionally dropped (presets are diffs; apply
  overlays them onto `QOL_DEFAULT_CONFIG`). That's why a player whose default hero
  is `hero_werewolf` (Silver) gets no `DEFAULT_HERO` line.
- Output keys are emitted alphabetically; the apply step preserves each preset's
  existing storage form and indentation.
- Old schema versions (3.1.3, 3.1.4, ...) still decode because the registry keeps
  every historical schema. The decoded object is current-key already.
