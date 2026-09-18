# `panorama/scripts/manifests/ql_chat_translate` (Real-Time In-Game Chat Translation)

## Description
Provides real-time machine translation for incoming multilingual text chat messages. Intended for cross-region communication (e.g. Cyrillic to English), this feature inspects new chat strings and queries a localized translation helper service (`http://127.0.0.1:8765/`), injecting translated subtitles directly below foreign-language chat entries.

## Files
- Manifest: `panorama/scripts/manifests/ql_chat_translate/manifest.js`
- Styles: Dynamic inline styling on injected translation labels

## Settings & Defaults
| Config Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ENABLE_CHAT_TRANSLATE` | `toggle` | `false` | Master toggle to enable real-time chat message translation. |

## Architecture & Lifecycle

### Activation & Lifecycle Hooks
- **`onEnable()`**: Initiates a cooperative polling loop in `QOL.core.Scheduler` running at `0.2Hz` (`5.0s` interval).
- **`onDisable()`**: Cancels scheduler task, purges translation memory caches, and safely destroys any injected translation labels.
- **`onSettingsChanged()`**: Synchronously refreshes the feature lifecycle and polls immediately if activated.
- **`test()`**: Verifies that the native chat container `#Chat` is accessible in the HUD DOM.

### DOM Injection & Target Panels
- **Target Message Streams**: Traverses child elements within `#Messages` and `#ChatMessages`.
- **Injected Panels**:
  - `Label#QOLChatTranslatedLabel`: Injected directly beneath detected foreign-language messages, formatted with dim secondary styling and language indicator tags.

### Engine Events & Polling Frequency
- **Polling Frequency**: Low-frequency polling at 0.2Hz (`5.0s`).
- **Engine Events**: None.

### Performance Tier & Caveats
- **Performance Tier**: Low (`< 0.05ms` per scan).
- **Local Daemon Requirement**: Relies on a local lightweight translation daemon listening on port `8765`. If the daemon is unreachable, requests fail gracefully without freezing or degrading game frame rates.
- **Account Safeguard**: Manifest contains an account ID check (`841196165`) to prevent unintended network requests for general users when the daemon is not running.
