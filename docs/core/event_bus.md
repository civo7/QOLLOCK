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
`ctx.events` deduplicates each event/callback pair and scopes subscriptions to
the instance generation. FeatureRegistry retires them before disable or failed-
enable cleanup, suppressing callbacks already captured by an EventBus snapshot.
Use `ctx.events.off` for earlier release. Direct EventBus/native subscriptions
still require explicit feature cleanup. See [lifecycle](feature_registry.md).

Core events include `config:changed`, `scheduler:error`, `scheduler:tick_ok`, and
the engine bridges listed in [app.md](app.md). The bus itself does not subscribe
to native game events. There is no current app-provided `engine:quickbuy_changed`
bridge. Do not invent one based on an old document.

`presentation:preview_changed` is a mod-owned HUD event emitted after a successful
preview commit or reset. It lets reactive owners observe accepted sample selection
changes; it is not a native game event or a settings-context notification. See
[Customize delivery](../ui/customize.md).

The optional shop-close compatibility listener is not a verified native event
contract; see [VALIDATION.md](../VALIDATION.md). Event names in this bus do not
prove corresponding engine events or shared-memory visibility from settings.
