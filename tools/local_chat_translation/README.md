# Local Chat Translation Prototype

This local-only helper translates Russian chat text to English using MyMemory,
renders the result as WebP, and serves it to Panorama on `127.0.0.1:8765`.

## Start

```powershell
tools/local_chat_translation/start.ps1
```

The first start creates an isolated Python 3.12 environment under
`%LOCALAPPDATA%\QOLLOCK\chat_translation` and installs Pillow. Keeping the
environment outside this repository prevents DeadPacker from copying or
compiling Python dependencies. Leave the window open while playing.

## Test

```powershell
Invoke-WebRequest "http://127.0.0.1:8765/health"
Invoke-WebRequest "http://127.0.0.1:8765/translate.webp?text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82&source=ru&target=en" -OutFile translation-test.webp
```

The server binds only to localhost, limits messages to MyMemory's 500-byte
limit, supports only English/Russian pairs, and keeps a bounded in-memory cache.

## Current boundary

The VPK prototype uses plain HTTP localhost image loading. Whether Deadlock's
Panorama build permits that must be verified in-game. If it rejects localhost
or plain HTTP, the same VPK feature can point at an HTTPS-hosted adapter.
