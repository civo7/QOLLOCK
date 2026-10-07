# Custom RGB colors

Supported palette owners accept either their existing palette index or a tagged
RGB integer. `QOL_UTILS.SupportsCustomColor` is the authoritative key whitelist;
it covers inventory, stamina, ammo text, bottom bar, keyboard overlay, healthbar
accent and minimap icons. Existing defaults remain unchanged. No setting keys
were added. The shared helpers in `ql_utils.js` encode `#RRGGBB`
as an RGB payload in a reserved numeric band and resolve it back to a color.
The tag distinguishes literal black from native/default. Invalid HEX input is
rejected; it must not replace a previous value.

Historical compact schemas retain their original bounds, order and palette
meanings. Exports containing custom RGB use the JSON storage envelope inside
the existing Base64Url token; they do not assign a new compact schema version.
Both HUD and settings decoders recognize this envelope. Older clients without
envelope-token support cannot import these exports. Storage continues to carry
the tagged numeric values.

The ordinary palette rows preserve an existing custom value when synchronizing.
Choosing a swatch replaces it with that palette index; choosing Default uses the
owning feature's native reset path. Custom RGB does not replace charge-state,
warning or team logic. Opacity remains a separate setting.

Offline tests cover tagged black/white, malformed input, HUD delivery,
export/import and historical schema preservation. Actual native tint and reset
still require a maintainer compile/repack and client check.
