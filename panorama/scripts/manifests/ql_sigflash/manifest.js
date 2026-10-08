// OWNS: Signature icon flash class and a per-slot press/deadline latch.
// DOES NOT OWN: Ability cooldown, binding state or native signature content.
// Sources: hud.xml, hud_abilities.xml, hud_ability_icon.xml and debugger signature ancestry.
(() => {
    "use strict";
    QOL.core.FeatureRegistry.register({
        id: "ql_sigflash",
        enableKey: "ENABLE_PASSIVE_COOLDOWN",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_PASSIVE_COOLDOWN", type: "toggle", default: false }
        ],
        create(ctx) {
            const panelAPI = QOL.core.panel;
            const flashClass = "qol_signature_cooldown_pressed";
            const flashMs = 220;
            const resolver = QOL.panelCache.createIdResolver("hud_signature", {
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }, "AbilitiesContainer"]
            });
            const slots = [];
            for (let index = 1; index <= 4; index++) slots.push({
                icon: null, binding: null, pressed: false, until: 0,
                iconResolver: QOL.panelCache.createIdResolver("slot_signature_" + index, {
                    ownerPath: [{ className: "hud_abilities" }, "abilities"]
                }),
                bindingResolver: QOL.panelCache.createIdResolver("ability_binding_component", {
                    ownerPath: ["button_container", { className: "ability_key_container" }]
                })
            });
            let signaturePanel = null;
            let enabled = false;
            let loop = null;

            function releaseSlot(slot) {
                panelAPI.setClass(slot.icon, flashClass, false);
                slot.icon = slot.binding = null;
                slot.pressed = false;
                slot.until = 0;
                slot.iconResolver.reset();
                slot.bindingResolver.reset();
            }

            function release() {
                for (const slot of slots) releaseSlot(slot);
                signaturePanel = null;
                resolver.reset();
            }

            function discoverSlot(slot) {
                const icon = slot.iconResolver.resolve(signaturePanel);
                const binding = slot.bindingResolver.resolve(icon);
                if (icon !== slot.icon || binding !== slot.binding) {
                    panelAPI.setClass(slot.icon, flashClass, false);
                    slot.icon = icon;
                    slot.binding = binding;
                    slot.pressed = false;
                    slot.until = 0;
                }
                return panelAPI.isAlive(icon) && panelAPI.isAlive(binding);
            }

            function update() {
                if (!enabled) return;
                const current = resolver.resolve($.GetContextPanel());
                if (current !== signaturePanel) {
                    for (const slot of slots) releaseSlot(slot);
                    signaturePanel = current;
                }
                if (!signaturePanel) return;
                const now = Date.now();
                for (const slot of slots) {
                    if (!discoverSlot(slot)) continue;
                    const cooling = panelAPI.hasClassToken(slot.icon, "cooling_down") || panelAPI.hasClassToken(slot.icon, "ability_not_ready");
                    const pressed = panelAPI.hasClassToken(slot.binding, "IsPressed") || panelAPI.hasClassToken(slot.binding, "DownActivated");
                    if (cooling && pressed && !slot.pressed) slot.until = now + flashMs;
                    slot.pressed = pressed;
                    const active = slot.until > now;
                    if (!cooling && !active) slot.until = 0;
                    panelAPI.setClass(slot.icon, flashClass, active);
                }
            }

            function refreshSettings() {
                release();
                enabled = Number(ctx.config.view().ENABLE_PASSIVE_COOLDOWN) === 1;
                update();
            }

            return {
                onEnable() {
                    refreshSettings();
                    loop = QOL.core.Scheduler.createPollLoop(update, 0.2, ctx.id);
                },
                onSettingsChanged: refreshSettings,
                onDisable() {
                    if (loop) { loop.stop(); loop = null; }
                    QOL.core.Scheduler.cancelAllForFeature(ctx.id);
                    release();
                    enabled = false;
                }
            };
        },
        test() {
            try {
                const panel = QOL.core.panel.findTraverse($.GetContextPanel(), "hud_signature");
                if (!panel) return null;
                return { passed: true, name: "Signature flash panel exists", message: "", assertions: [{ passed: true, name: "hud_signature panel exists" }] };
            } catch (e) { return { passed: false, name: "Sigflash panel check", message: (e && e.message ? e.message : String(e)) }; }
        }
    });
})();
