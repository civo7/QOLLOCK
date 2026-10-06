"use strict";
// Model the native compositor transition the old direct-frame tests omitted.
module.exports = (env, source) => {
    const event = {};
    env.global.$.DispatchEvent("DragStart", source, event);
    const proxy = event.displayPanel;
    const layer = env.em.addChild(env.doc.create("Panel", { id: "NativeDragLayer" }));
    layer.actualxoffset = 500;
    layer.actualyoffset = 300;
    proxy.SetParent(layer);
    proxy.actualxoffset = 350;
    proxy.actualyoffset = 220;
    env.clock.advance(1);
    return proxy;
};
