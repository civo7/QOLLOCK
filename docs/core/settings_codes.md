# Settings exchange codes

`panorama/scripts/ql_settings_code.js` owns clipboard exchange, independently of
CEF JSON persistence and the frozen historical binary decoder. It loads in both
HUD and settings through their actual XML entry points. There is no server,
browser compression API or new dependency.

## Public paths

- `QOL_CODEC.SerializeSettings` / `QOL.core.codec.serializeSettings` remain JSON
  storage-envelope writers.
- `QOL_CODEC.SerializeSettingsCode` / `QOL.core.codec.serializeSettingsCode` and
  `QOL.persistence.serializeSettingsCode` produce binary clipboard payloads.
- `QOL_CODEC.DeserializeSettings` and both adapters read JSON envelopes, settings
  codes and historical binary payloads.
- The Config tab shares compact codes as `[QOL-<schema-with-dashes>-C]:<Base64Url>`
  when the shared dictionary can represent the configuration. For settings
  outside that shared prefix, it uses the existing JSON exchange token without
  `-C`. Each receiver applies the named settings it supports. Historical binary
  tokens without `-C` continue through their existing reader.

## Permanent dictionary

Each array position in the module is a permanent ID for a `[key, reference]`
pair. Entries are frozen, append-only wire data. Never remove, reorder, reuse or
change a published pair. A retired setting keeps its slot. Current settings
metadata, ranges and defaults remain owned by their existing modules.

A missing record means the immutable reference value, not the recipient's
current default. Thus sparse records reconstruct a snapshot without depending on
current defaults. A normal default change does not change the dictionary.
New persisted settings require appended entries; the writer rejects unregistered
keys rather than silently excluding them. A newly appended entry does not modify
any previous prefix identity.

The header declares the sender's dictionary length and CRC32 of its entire
prefix, including entries absent from the sparse payload. Readers accept known
prefixes, and reject unknown or mismatched dictionaries before applying anything.
Newer readers retain older prefixes; fields introduced after the sender's prefix
use the existing default-based import application policy. Retired fields are
decoded but filtered by the current known-key parser.

The installed Shop customization build and the Better Builds branch published
different extensions of the same prefix. The binary writer keeps the Git IDs
and appends the recovered Shop fields. The reader accepts the installed layout
by its own prefix signatures, so the overlapping ID resolves to the correct
setting. For direct clipboard sharing, the Config tab writes the common compact
prefix when all fields outside it use their reference defaults. Otherwise the
existing JSON exchange carries the full named snapshot across both branches.
An already-exported binary code from one branch can be imported and re-exported
in the updated build to share it with the other branch.

## Binary layout

The initial format starts with ASCII `Q` and format byte `1`, followed by:

1. Dictionary count as unsigned varint.
2. Dictionary-prefix CRC32, little endian. Input is each pair's JSON plus LF,
   concatenated in ID order (the shipped reference table uses ASCII).
3. Changed-field count as unsigned varint.
4. Records in increasing ID order: varint `4 * (id - previousId - 1) + tag`,
   with initial `previousId = -1`, followed by the tagged value.
5. CRC32 of all preceding payload bytes, little endian.

Tags: `0` flips a numeric zero/one reference; `1` carries a ZigZag-varint integer
delta; `2` carries the exact JavaScript decimal number string; `3` carries text.
Integer deltas are used only when operands, delta and ZigZag representation are
safe integers. Number strings must be canonical and finite. Text is a varint
code-unit count followed by varint UTF-16 code units, preserving Unicode and
unpaired surrogates without browser APIs. CRC32 detects accidental corruption;
it does not authenticate configurations.

Readers bound payload size, reject non-minimal/overflowing/truncated varints,
out-of-range IDs, invalid types, redundant assignments and trailing data. New
tokens also require a complete, canonical Base64Url body. Unknown format or
dictionary reports that an update is needed; other failures report invalid
input. Parsing failures leave live settings intact.

Settings codes preserve values accepted by the current shared settings contract;
they do not bypass normalization or grant additional numeric precision. The
release/schema tag is retained for display, but new-code compatibility is owned
by the dictionary and format, not release numbers. Normalization and application
use current settings metadata. The import preview and local preferences
(`DRAG_ENABLED`, `AUTO_SAVE_CHANGES`, `ENABLE_UPDATE_CHECKER`) keep their existing
behavior.

## Verification

`tests/settings_code.test.js` exercises production export and cross-realm
decoding, frozen codes from both dictionary branches, full presets, changed
fractions/colors/text, default/catalog evolution and malformed inputs. Existing JSON/legacy regressions
remain in place. Run `npm test` before committing. After maintainer compile/repack,
verify real clipboard copy/paste, preview/apply and old-code import in the client.
Offline tests do not establish native UI behavior or durable CEF storage.
