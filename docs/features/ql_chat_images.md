# ql_chat_images

Chat image embedding and chat geometry; external image requests are not local-only.

Source: [manifest.js](../../panorama/scripts/manifests/ql_chat_images/manifest.js),
loaded by the HUD layout. The general [lifecycle contract](../core/feature_registry.md)
and [architecture](../../ARCHITECTURE.md) explain context and configuration routing.

## Runtime and ownership

Starts a managed 0.2-second loop. Image parsing and chat geometry are owned
here; the translation experiment is a separate manifest. Preserve message and
panel lifetime guards when adding a supported image form. Image loading can
contact external services; do not describe the feature as offline-only or treat
transport/proxy behavior as a general security guarantee.

## Declared settings

- `ENABLE_IMAGES_IN_CHAT` (toggle)
- `CHAT_SCALE` (slider)
- `CHAT_X_OFFSET` (slider)
- `CHAT_Y_OFFSET` (slider)

Defaults/ranges belong to the linked schema, flat `QOL_DEFAULT_CONFIG` and
versioned codec definitions, not a duplicated table here. They are separate
representations; a declared field is not automatically a visible control or
proof of active runtime behavior. See [adding settings](../ADDING_SETTINGS.md).

## Verification boundary

The statements above describe source behavior. Native panel identity, binding
values, rendering and transitions need the maintainer's Panorama Debugger and
a repacked client scenario; neither a schema nor a read-only manifest hook
proves the whole feature works. See [verification](../TESTING.md).
