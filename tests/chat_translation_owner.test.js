"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { URL } = require("node:url");
const { createHud } = require("../scripts/simulator");
const OWNER = "841196165", LATCH = "QOL_LocalTranslationOwner_v1";
function fixture({ latch = "1", account = "" } = {}) {
    const hud = createHud({ inHideout: false });
    hud.assertLoaded(); hud.sandbox.eval("Math.random = () => 0;");
    const { $, QOL: Q } = hud.sandbox.global, registry = Q.core.FeatureRegistry;
    registry.disable("ql_chat_translate");
    if (latch !== null) hud.root.SetAttributeString(LATCH, latch);
    else hud.root.SetAttributeString(LATCH, "");
    const requests = [], images = [];
    const create = $.CreatePanel;
    $.CreatePanel = (type, parent, id, properties) => {
        const panel = create(type, parent, id, properties);
        if (type === "Image" && id.startsWith("QOLLocalTranslation_")) {
            images.push(panel);
            panel.SetImage = url => { requests.push({ panel, url }); panel.requestedUrl = url; };
        }
        return panel;
    };
    const add = (parent, id = "", classes = [], type = "Panel") => {
        const panel = $.CreatePanel(type, parent, id);
        for (const name of classes) panel.AddClass(name);
        return panel;
    };
    const text = (parent, id, value) => { const panel = add(parent, id, [], "Label"); panel.text = value; return panel; };
    const core = add(hud.root, "", ["HudCore"]), retired = add(hud.doc.absRoot, "RetiredTranslationGeneration");
    const party = add(add(hud.root, "CitadelPartyContainer"), "CitadelParty");
    const avatar = add(add(party, "LocalPlayer"), "AvatarImage"); avatar.accountid = account;
    const top = add(core, "TopBar"), chats = add(top, "", ["ChatContainer"]);
    const topContainer = add(add(chats, "Team1Chat", [], "CitadelHudTopBarChat"), "Messages");
    const otherTop = add(add(chats, "Team2Chat", [], "CitadelHudTopBarChat"), "Messages");
    const chat = add(core, "Chat", [], "CitadelChat"), lines = add(chat, "ChatLinesArea");
    const bottomContainer = add(add(lines, "", ["ChatLinesWrapper"]), "ChatMessages");
    const message = (container, value, bottom = false, direct = false) => {
        const panel = add(container, "", ["ChatMessage"]), contents = add(panel, "MessageContents");
        const label = bottom ? text(direct ? contents : add(contents, "", ["Text"]), "", value) : text(add(contents, "", ["MessageWrapper"]), "MessageText", value);
        return { panel, contents, label };
    };
    const enable = () => registry.enable("ql_chat_translate");
    const disable = () => registry.disable("ql_chat_translate");
    return { hud, Q, $, registry, add, text, core, retired, party, avatar, top, topContainer, otherTop, bottomContainer, message, requests, images, enable, disable };
}
function imageFor(env, label) { return env.images.findLast(image => image.IsValid() && image.GetParent() === label.GetParent()); }

test("translation preserves account gating and waits for late native owner evidence", () => {
    const env = fixture({ latch: null }), row = env.message(env.topContainer, "Привет");
    env.enable(); env.hud.clock.advance(1000); assert.equal(env.requests.length, 0);
    env.avatar.accountid = OWNER; env.hud.clock.advance(600);
    assert.equal(env.requests.length, 1);
    assert.equal(env.hud.root.GetAttributeString(LATCH, ""), "1");
    assert.ok(imageFor(env, row.label));
    assert.equal(env.Q.state.localTranslationOwnerMatch, undefined);
});

test("non-owner and unresolved deadline latch disable translation work without chat edits", () => {
    const denied = fixture({ latch: null, account: "123" }), message = denied.message(denied.topContainer, "Привет");
    denied.enable(); denied.hud.clock.advance(1000);
    assert.equal(denied.requests.length, 0); assert.equal(denied.hud.root.GetAttributeString(LATCH, ""), "0");
    assert.equal(denied.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_chat_translate"), false);
    assert.equal(message.label.style.visibility, undefined);
    const pending = fixture({ latch: null }); pending.enable(); pending.hud.clock.advance(16000);
    assert.equal(pending.hud.root.GetAttributeString(LATCH, ""), "0");
    assert.equal(pending.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_chat_translate"), false);
    const latched = fixture({ latch: "0", account: OWNER }); latched.enable(); latched.hud.clock.advance(1000);
    assert.equal(latched.requests.length, 0);
});

test("translation selects both native layouts independently of images-in-chat feature", () => {
    const env = fixture(), top = env.message(env.topContainer, "Привет мир"), bottom = env.message(env.bottomContainer, "Салют", true);
    const fallback = env.message(env.otherTop, "До встречи");
    assert.equal(env.registry.isEnabled("ql_chat_images"), false);
    assert.equal(env.Q.findChatMessageLabel, undefined);
    env.enable(); env.hud.clock.advance(1000);
    assert.equal(env.requests.length, 3);
    for (const row of [top, bottom, fallback]) assert.equal(row.label.style.visibility, undefined);
    const bottomImage = imageFor(env, bottom.label), topImage = imageFor(env, top.label);
    const params = new URL(bottomImage.requestedUrl);
    assert.equal(params.origin, "http://127.0.0.1:8765"); assert.equal(params.pathname, "/translate.webp");
    assert.equal(params.searchParams.get("style"), "replace-v5"); assert.equal(params.searchParams.get("source"), "ru");
    assert.equal(params.searchParams.get("target"), "en"); assert.equal(params.searchParams.get("layout"), "bottom");
    assert.equal(params.searchParams.get("text"), "Салют");
    assert.equal(topImage.style.width, "104px"); assert.equal(topImage.style.height, "18px");
    assert.ok(imageFor(env, fallback.label).requestedUrl.includes("layout=top"));
});

test("translation skips English, oversized and malformed text while retaining existing direct-label selection", () => {
    const env = fixture();
    env.message(env.topContainer, "hello"); env.message(env.topContainer, "п".repeat(241)); env.message(env.topContainer, "Привет\uD800");
    const accepted = env.message(env.bottomContainer, "п".repeat(240), true, true);
    env.enable(); env.hud.clock.advance(600);
    assert.equal(env.requests.length, 1); assert.ok(imageFor(env, accepted.label));
    assert.equal(imageFor(env, accepted.label).style.width, "390px");
    assert.equal(imageFor(env, accepted.label).style.height, "66px");
    assert.deepEqual(env.hud.clock.errors, []);
});

test("translation releases alive source generations and follows same-text label replacement", () => {
    const env = fixture(), row = env.message(env.topContainer, "Привет"); env.enable();
    const first = imageFor(env, row.label); assert.ok(first);
    env.topContainer.SetParent(env.retired);
    const replacement = env.add(env.top.FindChildrenWithClassTraverse("ChatContainer")[0].FindChild("Team1Chat"), "Messages");
    const current = env.message(replacement, "Салют"); env.hud.clock.advance(250);
    assert.equal(first.IsValid(), false); assert.ok(imageFor(env, current.label));
    const previous = imageFor(env, current.label); current.label.SetParent(env.retired);
    const label = env.text(current.contents, "MessageText", "Салют"); env.hud.clock.advance(500);
    assert.equal(previous.IsValid(), false); assert.ok(imageFor(env, label));
    assert.equal(row.label.style.visibility, undefined); assert.equal(current.label.style.visibility, undefined);
});

test("translation retires images when native messages move away, lose their role or change text", () => {
    const env = fixture(), row = env.message(env.topContainer, "Привет"); env.enable();
    const first = imageFor(env, row.label); row.panel.SetParent(env.retired); env.hud.clock.advance(250);
    assert.equal(first.IsValid(), false);
    const current = env.message(env.topContainer, "Салют"); env.hud.clock.advance(250);
    assert.ok(imageFor(env, current.label));
    current.label.text = "hello"; env.hud.clock.advance(2500);
    assert.equal(imageFor(env, current.label), undefined);
    current.label.text = "Привет"; env.hud.clock.advance(2500);
    const second = imageFor(env, current.label); assert.ok(second);
    current.panel.RemoveClass("ChatMessage"); env.hud.clock.advance(250); assert.equal(second.IsValid(), false);
});

test("translation retries partial creation, style and image dispatch failures without hiding original text", () => {
    const env = fixture(), row = env.message(env.topContainer, "Привет");
    const create = env.$.CreatePanel; let failCreate = true, failStyle = true, failRequest = true;
    env.$.CreatePanel = (type, parent, id, properties) => {
        if (type === "Image" && id.startsWith("QOLLocalTranslation_") && failCreate) { failCreate = false; throw Error("temporary create"); }
        const panel = create(type, parent, id, properties);
        if (type === "Image" && id.startsWith("QOLLocalTranslation_")) {
            panel.style = new Proxy(panel.style, { set(target, key, value) {
                if (key === "height" && failStyle) { failStyle = false; throw Error("temporary style"); }
                target[key] = value; return true;
            } });
            const setImage = panel.SetImage;
            panel.SetImage = url => { if (failRequest) { failRequest = false; throw Error("temporary request"); } setImage(url); };
        }
        return panel;
    };
    env.enable(); env.hud.clock.advance(2500);
    const image = imageFor(env, row.label);
    assert.ok(image); assert.equal(image.visible, true); assert.equal(image.style.height, "18px");
    assert.equal(env.requests.length, 1); assert.equal(row.label.style.visibility, undefined);
    env.hud.clock.advance(5000); assert.equal(env.requests.length, 1);
});

test("translation cache is bounded, image IDs are unique and shutdown releases only owned panels", () => {
    const env = fixture(), messages = Array.from({ length: 270 }, (_, index) => env.message(env.topContainer, "Привет " + index));
    env.enable(); env.hud.clock.advance(1000);
    assert.equal(env.requests.length, 256); assert.equal(new Set(env.images.map(image => image.id)).size, 256);
    assert.equal(imageFor(env, messages[0].label), undefined);
    messages.at(-1).label.style.visibility = "collapse";
    env.disable(); env.hud.clock.advance(1);
    assert.equal(env.images.filter(image => image.IsValid()).length, 0);
    assert.equal(messages.at(-1).label.style.visibility, "collapse");
    assert.equal(env.Q.core.Scheduler.getWorkSnapshot().some(owner => owner.id === "ql_chat_translate"), false);
    assert.equal(messages.every(row => row.panel.IsValid() && row.label.IsValid()), true);
    env.enable(); env.hud.clock.advance(600); assert.equal(env.images.filter(image => image.IsValid()).length, 256);
});

test("translation follows root generation and preserves existing latch on disable", () => {
    const env = fixture(), first = env.message(env.topContainer, "Привет"); env.enable();
    const image = imageFor(env, first.label);
    const replacement = env.add(env.hud.doc.absRoot, "Hud", [], "CitadelHud"); replacement.SetAttributeString(LATCH, "1");
    const container = env.add(replacement, "Messages"), current = env.message(container, "Салют");
    env.$.GetContextPanel = () => replacement; env.hud.clock.advance(250);
    assert.equal(image.IsValid(), false); assert.ok(imageFor(env, current.label));
    env.disable(); env.hud.clock.advance(1);
    assert.equal(replacement.GetAttributeString(LATCH, ""), "1");
    assert.equal(env.images.filter(image => image.IsValid()).length, 0);
});
