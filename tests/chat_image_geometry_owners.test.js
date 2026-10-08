"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
function fixture(config = {}) {
    const e = createHud({ inHideout: false }); e.assertLoaded();
    const { $, QOL: Q } = e.sandbox.global;
    Q.core.App.shutdown(); e.sandbox.eval("Math.random = () => 0;");
    Q.core.ConfigAdapter.loadFromFlat({ ...e.sandbox.evalJson("QOL.buildDefaultConfig()"), ENABLE_IMAGES_IN_CHAT: 1,
        ENABLE_CHAT: 1, CHAT_X_OFFSET: 30, CHAT_Y_OFFSET: 20, CHAT_SCALE: 120, ...config });
    const requests = [], createdImages = [], create = $.CreatePanel;
    $.CreatePanel = (type, parent, id, ...args) => {
        const panel = create(type, parent, id, ...args);
        if (type === "Image" && id.startsWith("InjectedChatImage_")) {
            createdImages.push(panel); panel.SetImage = url => { requests.push({ panel, url }); panel.requestedUrl = url; };
        }
        return panel;
    };
    const add = (parent, id = "", classes = [], type = "Panel") => {
        const panel = $.CreatePanel(type, parent, id);
        for (const cls of classes) panel.AddClass(cls);
        return panel;
    };
    function layout(hud) {
        const core = add(hud, "", ["HudCore"]), top = add(core, "TopBar"), chats = add(top, "", ["ChatContainer"]);
        const team1 = add(chats, "Team1Chat"), team2 = add(chats, "Team2Chat");
        const messages = [add(team1, "Messages"), add(team2, "Messages")];
        const chat = add(core, "Chat", [], "CitadelChat"), lines = add(chat, "ChatLinesArea");
        const wrapper = add(lines, "", ["ChatLinesWrapper"]), bottom = add(wrapper, "ChatMessages");
        const input = add(chat, "ChatInput", [], "TextEntry"); input.text = "draft";
        return { core, top, team1, team2, messages, chat, wrapper, bottom, input };
    }
    const native = layout(e.root), retired = add(null, "RetiredChatGeneration");
    const factory = id => Q.core.FeatureRegistry.getManifest(id).create(Q.core.FeatureRegistry.createContext(id));
    const geometry = factory("ql_chat_geometry"), images = factory("ql_chat_images");
    function message(container, text, bottom = false, direct = false) {
        const panel = add(container, "", ["ChatMessage"]), contents = add(panel, "MessageContents");
        const host = bottom ? (direct ? contents : add(contents, "", ["Text"])) : add(contents, "", ["MessageWrapper"]);
        const label = add(host, bottom ? "" : "MessageText", [], "Label"); label.text = text;
        return { panel, contents, host, label };
    }
    function set(id, patch) {
        Q.core.ConfigStore.load({ [id]: patch });
        (id === "ql_chat_images" ? images : geometry).onSettingsChanged(); e.clock.advance(0);
    }
    const start = () => { geometry.onEnable(); images.onEnable(); e.clock.advance(0); };
    const stop = () => { images.onDisable(); geometry.onDisable(); e.clock.advance(0); };
    const imageFor = row => createdImages.findLast(image => image.IsValid() && image.GetParent() === row.host);
    return { ...e, $, Q, add, native, retired, layout, images, geometry, message, requests, createdImages, set, start, stop, imageFor };
}

test("image embedding handles both top teams and native .Text/direct-label layouts without replacing native text", () => {
    const e = fixture();
    const rows = [e.message(e.native.messages[0], "https://example.com/a.png"),
        e.message(e.native.messages[1], "http://example.com/b.GIF?x=1"),
        e.message(e.native.bottom, "https://example.com/c.webp", true),
        e.message(e.native.bottom, "https://example.com/d.jpeg", true, true)];
    e.start(); assert.equal(e.requests.length, 4);
    for (const [index, row] of rows.entries()) {
        const image = e.imageFor(row); assert.ok(image);
        assert.equal(image.style.maxWidth, "150px"); assert.equal(image.style.maxHeight, "150px");
        assert.equal(image.style.margin, index >= 2 ? "4px 4px 4px 4px" : "8px 8px 8px 8px");
        assert.equal(image.requestedUrl, "https://wsrv.nl/?url=" + encodeURIComponent(row.label.text) + "&w=150&h=150&fit=inside");
        assert.equal(row.label.style.visibility, undefined); assert.equal(row.host.style.maxWidth, undefined);
        assert.equal(row.panel.BHasClass("imageProcessed"), false);
    }
    assert.equal(e.native.input.text, "draft");
    assert.equal(e.Q.findChatMessageLabel, undefined); assert.equal(e.Q.state.imagesInChatTopMessageCache, undefined);
    e.clock.advance(5000); assert.equal(e.requests.length, 4, "unchanged messages do not request duplicate images");
    e.stop(); assert.deepEqual(e.clock.errors, []);
});

test("image matching retains whole-message URL rules and retries a late native text binding", () => {
    const e = fixture();
    for (const value of ["look https://example.com/a.png", "https://example.com/a.svg", "javascript:a.png", "https://example.com/a.png#fragment", "https://example.com/\uD800.png"]) e.message(e.native.bottom, value, true);
    const late = e.add(e.native.messages[0], "", ["ChatMessage"]); e.start(); assert.equal(e.requests.length, 0);
    const contents = e.add(late, "MessageContents"), host = e.add(contents, "", ["MessageWrapper"]);
    const label = e.add(host, "MessageText", [], "Label"); label.text = "https://example.com/late.jpg";
    e.clock.advance(2700); assert.equal(e.requests.length, 1);
    e.stop(); assert.deepEqual(e.clock.errors, []);
});

test("image disable and message retirement preserve current chat geometry and native presentation", () => {
    const e = fixture(), row = e.message(e.native.messages[0], "https://example.com/a.png");
    row.label.style.opacity = "0.6"; row.contents.style.opacity = "0.4"; row.host.style.maxWidth = "210px";
    e.start(); const image = e.imageFor(row);
    e.images.onDisable(); e.clock.advance(0);
    assert.equal(image.IsValid(), false); assert.equal(e.native.chat.style.x, "30px");
    assert.equal(e.native.chat.style.y, "-20px"); assert.equal(e.native.chat.style.uiScale, "120%");
    assert.equal(row.label.style.opacity, "0.6"); assert.equal(row.contents.style.opacity, "0.4");
    assert.equal(row.host.style.maxWidth, "210px"); assert.equal(row.label.style.visibility, undefined);
    e.images.onEnable(); e.clock.advance(0); assert.ok(e.imageFor(row));
    e.set("ql_chat_geometry", { ENABLE_CHAT: 0 }); assert.equal(e.native.chat.style.visibility, "collapse");
    e.set("ql_chat_images", { ENABLE_IMAGES_IN_CHAT: 0 });
    assert.equal(e.imageFor(row), undefined); assert.equal(e.native.chat.style.visibility, "collapse");
    e.stop(); assert.deepEqual(e.clock.errors, []);
});

test("image owner retires living containers, messages, labels and moved image children", () => {
    const e = fixture(); const first = e.message(e.native.messages[0], "https://example.com/a.png"); e.start();
    const oldImage = e.imageFor(first); e.native.messages[0].SetParent(e.retired);
    const container = e.add(e.native.team1, "Messages"), row = e.message(container, first.label.text); e.clock.advance(220);
    assert.equal(oldImage.IsValid(), false); assert.ok(e.imageFor(row)); assert.equal(first.panel.IsValid(), true);
    const moved = e.imageFor(row); moved.SetParent(e.retired); e.clock.advance(220);
    assert.equal(moved.IsValid(), false); assert.ok(e.imageFor(row));
    const prior = e.imageFor(row); row.label.SetParent(e.retired);
    row.label = e.add(row.host, "MessageText", [], "Label"); row.label.text = "https://example.com/new.png";
    e.clock.advance(220); assert.equal(prior.IsValid(), false);
    assert.ok(e.imageFor(row).requestedUrl.includes(encodeURIComponent(row.label.text)));
    const final = e.imageFor(row); row.panel.SetParent(e.retired); e.clock.advance(220);
    assert.equal(final.IsValid(), false); assert.equal(row.panel.IsValid(), true);
    e.stop(); assert.deepEqual(e.clock.errors, []);
});

test("image owner updates recycled messages and bounds cleanup to current records", () => {
    const e = fixture(), row = e.message(e.native.bottom, "https://example.com/a.png", true); e.start();
    const first = e.imageFor(row); row.label.text = "https://example.com/b.png"; e.clock.advance(700);
    assert.equal(first.IsValid(), false); assert.ok(e.imageFor(row).requestedUrl.includes("b.png"));
    const second = e.imageFor(row); row.label.text = "ordinary text"; e.clock.advance(1200);
    assert.equal(second.IsValid(), false);
    for (let i = 0; i < 100; i++) e.message(e.native.bottom, "https://example.com/" + i + ".png", true);
    e.clock.advance(2700);
    assert.equal(e.createdImages.filter(image => image.IsValid()).length, 80);
    e.images.onDisable(); e.clock.advance(0);
    assert.equal(e.createdImages.some(image => image.IsValid()), false);
    e.stop(); assert.deepEqual(e.clock.errors, []);
});

test("image owner retries failed creation, partial styles and image requests while native URL remains readable", () => {
    const e = fixture(), row = e.message(e.native.bottom, "https://example.com/a.png", true);
    const create = e.$.CreatePanel; let failure = "create";
    e.$.CreatePanel = (type, parent, id, ...args) => {
        if (type === "Image" && id.startsWith("InjectedChatImage_") && failure === "create") {
            failure = "style"; throw new Error("native image creation rejected");
        }
        const panel = create(type, parent, id, ...args);
        if (type === "Image" && id.startsWith("InjectedChatImage_")) {
            panel.style = new Proxy(panel.style, { set(target, key, value) {
                if (key === "maxWidth" && failure === "style") { failure = "image"; throw new Error("native image size rejected"); }
                target[key] = value; return true;
            } });
            panel.SetImage = url => {
                if (failure === "image") { failure = null; throw new Error("native image dispatch rejected"); }
                panel.requestedUrl = url; e.requests.push({ panel, url });
            };
        }
        return panel;
    };
    e.start(); e.clock.advance(1200);
    assert.equal(e.requests.length, 1); assert.ok(e.imageFor(row));
    assert.equal(row.label.style.visibility, undefined); assert.equal(row.host.style.maxWidth, undefined);
    e.stop(); assert.deepEqual(e.clock.errors, []);
});

test("independent chat owners follow a new living HUD with the current accepted settings", () => {
    const e = fixture(), old = e.message(e.native.messages[0], "https://example.com/a.png"); e.start();
    const image = e.imageFor(old), hud = e.add(null, "Hud", [], "CitadelHud"), next = e.layout(hud);
    e.$.GetContextPanel = () => hud;
    const current = e.message(next.bottom, "https://example.com/b.png", true); e.clock.advance(550);
    assert.equal(image.IsValid(), false); assert.ok(e.imageFor(current));
    assert.equal(next.chat.style.x, "30px"); assert.equal(next.chat.style.uiScale, "120%");
    assert.equal(e.native.chat.style.x, undefined); assert.equal(e.native.chat.IsValid(), true);
    e.stop(); assert.deepEqual(e.clock.errors, []);
});

test("chat geometry preserves native defaults, animation and input, and releases only attempted properties", () => {
    const e = fixture({ CHAT_X_OFFSET: 0, CHAT_Y_OFFSET: 0, CHAT_SCALE: 100 });
    const native = { x: "7px", y: "12px", uiScale: "77%", transform: "scaleY(-1)", preTransformScale2d: "0.8, 0.8", visibility: "visible" };
    Object.assign(e.native.chat.style, native); e.start();
    for (const [key, value] of Object.entries(native)) assert.equal(e.native.chat.style[key], value);
    e.set("ql_chat_geometry", { CHAT_X_OFFSET: 88, CHAT_Y_OFFSET: -40, CHAT_SCALE: 150 });
    assert.equal(e.native.chat.style.x, "88px"); assert.equal(e.native.chat.style.y, "40px"); assert.equal(e.native.chat.style.uiScale, "150%");
    assert.equal(e.native.chat.style.preTransformScale2d, native.preTransformScale2d);
    e.set("ql_chat_geometry", { CHAT_X_OFFSET: 0, CHAT_Y_OFFSET: 0, CHAT_SCALE: 100 });
    assert.equal(e.native.chat.style.x, undefined); assert.equal(e.native.chat.style.uiScale, undefined);
    assert.equal(e.native.chat.style.visibility, "visible"); assert.equal(e.native.chat.style.transform, "scaleY(-1)");
    assert.equal(e.native.input.text, "draft");
    e.stop(); assert.deepEqual(e.clock.errors, []);
});

test("chat geometry releases living replaced native owners and retries partial apply/retirement", () => {
    const e = fixture(); e.start();
    const first = e.native.chat; let rejected = true;
    first.ClearPropertyFromCode = property => {
        if (property === "x" && rejected) { rejected = false; return false; }
        delete first.style[property.replace(/-([a-z])/g, (_match, char) => char.toUpperCase())]; return true;
    };
    first.SetParent(e.retired); const next = e.add(e.native.core, "Chat", [], "CitadelChat");
    let remaining = 2;
    next.style = new Proxy(next.style, { set(target, key, value) {
        if (key === "y" && remaining-- > 0) throw new Error("native chat y rejected");
        target[key] = value; return true;
    } });
    e.clock.advance(550); assert.equal(next.style.x, "30px"); assert.equal(next.style.y, undefined);
    e.clock.advance(1100); assert.equal(next.style.y, "-20px");
    assert.equal(first.style.x, undefined); assert.equal(first.style.uiScale, undefined);
    assert.equal(first.IsValid(), true); e.stop(); assert.deepEqual(e.clock.errors, []);
});
