# `panorama/scripts/core/ql_event_bus.js`

## Purpose
Provides a lightweight, error-isolated internal publish/subscribe message bus for inter-module communication and engine event dispatching.

## Dependencies
- `panorama/scripts/core/ql_namespace.js` (`QOL.core`)

## Interface (`QOL.core.EventBus`)
- `on(event, callback)`: Registers a listener callback for an event name string.
- `off(event, callback)`: Unregisters a callback (or all callbacks if callback is omitted) for an event name string.
- `emit(event, payload)`: Synchronously dispatches an event to all registered listeners.

## Key Events
- `engine:scoreboard_toggle`: Fired on Tab press/release via `CitadelScoreboardToggle`.
- `engine:shop_opened`: Fired when the item shop opens via `CitadelOpenUpgradeShop`.
- `engine:shop_closed`: Fired when the item shop closes via `CitadelExitUpgradeShop` or `CitadelUserMsg_ForceShopClosed`.
- `engine:escape_menu_toggled`: Fired on Esc menu open/close via `CitadelToggleEscapeMenu`.
- `engine:game_state_changed`: Fired on match phase transitions via `CitadelGameStateChanged`.
- `<featureId>:<event>`: Scoped custom feature events emitted through `ctx.events.emit()`.

## Architectural Notes
- Listener isolation: If a registered listener throws an uncaught error, it is logged, but does not abort execution for remaining listeners or the emitter.
- Features access the bus via `context.events.on()` and `context.events.off()`.
