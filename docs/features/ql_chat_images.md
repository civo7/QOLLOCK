# `panorama/scripts/manifests/ql_chat_images` (Chat Image Embedding & Chat Repositioning)

## Description
Detects image URLs (e.g. `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`) posted in player text chat and dynamically embeds inline image previews beneath the corresponding chat line. In addition, provides layout controls to reposition and scale the main text chat container across the screen.

## Files
- Manifest: `panorama/scripts/manifests/ql_chat_images/manifest.js`
- Styles: Inline styles applied to injected image panels and chat root containers

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_IMAGES_IN_CHAT` | `toggle` | `false` | Master toggle to detect and render inline image previews in text chat messages. |
| `CHAT_SCALE` | `slider` | `1.0` | Global scale factor applied to the chat box container (0.5 to 2.0). |
| `CHAT_X_OFFSET` | `slider` | `0` | Horizontal pixel offset shifting the chat window across the screen. |
| `CHAT_Y_OFFSET` | `slider` | `0` | Vertical pixel offset shifting the chat window across the screen. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Locates `#Chat` and its message containers (`#Messages` and `#ChatMessages`), caches baseline styles, and registers a low-frequency polling loop with `QOL.core.Scheduler` running at `0.2Hz` (`5.0s`).
- **`onDisable()`**: Halts the scheduler loop, restores default chat scale and offsets, and safely removes all injected image preview panels.
- **`onSettingsChanged()`**: Synchronously updates chat position coordinates and scale.
- **`test()`**: Checks for the existence of `#Chat` or `#Messages` in the HUD DOM.

### DOM Injection & Target Panels
- **Target Container**: Native `#Chat` panel.
- **Message Streams**: Traverses child labels in `#Messages` (top chat stream) and `#ChatMessages` (standard chat stream).
- **Injected Panels**:
  - `Image#InjectedChatImage`: Injected as a sibling beneath recognized chat message labels. Uses `wsrv.nl` image CDN proxying to normalize image sizing and formats for Source 2's texture engine.

### Engine Events & Polling Frequency
- **Polling Frequency**: Low-frequency polling at 0.2Hz (`5.0s`), utilizing adaptive backoff up to `2.5s` when recent messages are detected.
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: Low (`~0.05ms` per scan).
- **Security & Network**: Utilizes `https://wsrv.nl/?url=` proxy to ensure web images conform to acceptable dimensions without crashing the game engine or overflowing texture memory.
- **Deduplication**: Injected image panels are tagged and cached to avoid redundant re-parsing of already-rendered chat lines.
