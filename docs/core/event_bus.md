# Internal event bus

Source: `panorama/scripts/core/ql_event_bus.js`; export `QOL.core.EventBus`.
This is synchronous, context-local pub/sub, not a cross-realm transport.

- `on(event, callback)` appends a listener. Repeated registration can duplicate it;
  no unsubscribe handle is returned.
- `off(event, callback)` removes matching callbacks. Omitting the callback removes
  the entire event's listener list; individual features should remove only theirs.
- `emit(event, payload)` calls listeners synchronously and isolates listener
  exceptions so other listeners can continue. It snapshots listeners at dispatch start. Self-removal cannot skip the next
  listener; additions wait for the next emit. A removed listener already in the
  snapshot still receives the current emission.

`ctx.events.emit` prefixes the feature ID; `ctx.events.on/off` do not. For example,
an emitted feature event must be subscribed under its full `ql_name:event` name.
Feature-owned subscriptions require explicit cleanup in `onDisable`.

Core events include `config:changed`, `scheduler:error`, `scheduler:tick_ok`, and
the engine bridges listed in [app.md](app.md). The bus itself does not subscribe
to native game events. There is no current app-provided `engine:quickbuy_changed`
bridge. Do not invent one based on an old document.

The optional shop-close compatibility listener is not a verified native event
contract; see [VALIDATION.md](../VALIDATION.md). Event names in this bus do not
prove corresponding engine events or shared-memory visibility from settings.
