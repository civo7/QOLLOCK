# Chat translation owner

The [HUD manifest](../../panorama/scripts/manifests/ql_chat_translate/manifest.js)
is an existing account-restricted experiment. It has no public persisted toggle.
The existing native-party account probe and owner latch determine access;
unresolved account evidence remains pending until the original deadline. A
confirmed non-owner or an expired probe stops managed polling. Disable releases
owned images and discovery state while preserving the latch.

Discovery follows the verified top-bar `Messages` and bottom-chat `ChatMessages`
containers with bounded fallback scans. Native `MessageText` and `.Text > Label`
sources use the read-only `QOL.core.chatMessages.findLabel` helper loaded in the
HUD context; enabling image embedding is not a dependency.
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

## Independent chat consumers

`ql_chat_images` owns image children for whole-message image URLs. It shares
only the native label selector with translation. Private channels follow both
native top-bar teams and bottom chat, bound their message records and retry
late labels or partial writes. Replacement, recycled text, disable and cache
eviction remove owned images. No factory publishes lifetime closures or caches
through the shared namespace or `State`. Native text/visibility and parent
styles remain readable through unavailable image requests; actual proxy loading
and native composition require client checks.

`ql_chat_geometry` is the sole native chat geometry/visibility writer. It
remains alive while chat is hidden, applies accepted settings immediately,
follows living replacement and retries partial writes. Returning to default
or disabling releases only properties it attempted to own, resetting resolved
offsets before clearing overrides. Native animation and input remain engine-owned.
Image/translation disable does not reset this independent geometry. Core no
longer carries a second chat writer or the old chat-style aliases/caches.

`tests/chat_image_geometry_owners.test.js` covers the production owners and their
shared selector, matching, both teams, current bottom layout, bounded cleanup,
partial writes, native defaults, independent geometry and living HUD replacement.
