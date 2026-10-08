# Chat translation owner

The [HUD manifest](../../panorama/scripts/manifests/ql_chat_translate/manifest.js)
is an existing account-restricted experiment. It has no public persisted toggle.
The existing native-party account probe and owner latch determine access;
unresolved account evidence remains pending until the original deadline. A
confirmed non-owner or an expired probe stops managed polling. Disable releases
owned images and discovery state while preserving the latch.

Discovery follows the verified top-bar `Messages` and bottom-chat `ChatMessages`
containers with bounded fallback scans. Native `MessageText` and `.Text > Label`
sources are resolved locally: enabling image embedding is not a dependency.
Private per-message records retain source identity, text, image and successful
write signatures. Replaced, reparented and recycled messages retire owned images;
failed creation/style/request writes remain retryable. Cache bounds and the
existing byte/character sizing policy are retained.

The optional [localhost helper](../../tools/local_chat_translation/README.md)
keeps its existing endpoint, source/target language and layout/style parameters.
`SetImage` acceptance does not establish successful image loading, and a generic
image-loaded callback has not been verified for this Panorama build. The owner
therefore displays translation images beside readable native text and does not
write native text or visibility. A missing helper cannot erase the message.

`tests/chat_translation_owner.test.js` exercises production account gating, late
binding, both native layouts, living replacement, bounded cache, malformed input,
partial writes and shutdown. Maintainer compilation/repacking and client checks
must establish actual native chat composition and localhost image loading with
the helper available and unavailable.
