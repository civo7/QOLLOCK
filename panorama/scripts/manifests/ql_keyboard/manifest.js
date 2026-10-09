// OWNS: Private keyboard overlay panels and derived geometry/wash styling.
// DOES NOT OWN: Native input, bindings, glyph creation or shared HUD CSS gates.
// SOURCE: Native hud.xml gameplay_hud; retained CitadelBinding actions/layouts.
(() => {
    "use strict";
    const createKeyboardOverlayKey = (createOwned, parent, spec) => {
        if (!parent || !spec) return null;
        if (spec.emptyClass) {
            const empty = createOwned("Panel", parent, "");
            empty.AddClass("Key");
            empty.AddClass(spec.emptyClass);
            return empty;
        }

        const binding = createOwned("CitadelBinding", parent, "", {
            action: spec.action,
            glyphstyle: spec.glyphstyle,
            solid: "false"
        });
        binding.AddClass("Key");
        if (spec.keyClass) binding.AddClass(spec.keyClass);
        return binding;
    };

    const createKeyboardOverlayRow = (createOwned, layout, specs) => {
        const row = createOwned("Panel", layout, "");
        row.AddClass("KeyboardRow");
        for (let i = 0; i < specs.length; i++) {
            createKeyboardOverlayKey(createOwned, row, specs[i]);
        }
        return row;
    };

    const buildKeyboardOverlayLayouts = (createOwned, allBindingsBox) => {
        const baseLayout = createOwned("Panel", allBindingsBox, "");
        baseLayout.AddClass("KeyboardLayout");
        baseLayout.AddClass("KeyboardLayoutBase");
        createKeyboardOverlayRow(createOwned, baseLayout, [
            { emptyClass: "EmptyKeyWide" },
            { action: "AbilityMelee", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "MoveForward", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Attack", glyphstyle: "dark", keyClass: "MouseKey" },
            { action: "ADS", glyphstyle: "dark", keyClass: "MouseKey" }
        ]);
        createKeyboardOverlayRow(createOwned, baseLayout, [
            { action: "Roll", glyphstyle: "light", keyClass: "ShiftKey" },
            { action: "MoveLeft", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "MoveBackwards", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "MoveRight", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "HeldItem", glyphstyle: "light", keyClass: "ASDFKey" }
        ]);
        createKeyboardOverlayRow(createOwned, baseLayout, [
            { action: "Crouch", glyphstyle: "light", keyClass: "CtrlKey" },
            { action: "Mantle", glyphstyle: "light", keyClass: "SpaceKey" }
        ]);

        const fullLayout = createOwned("Panel", allBindingsBox, "");
        fullLayout.AddClass("KeyboardLayout");
        fullLayout.AddClass("KeyboardLayoutFull");
        createKeyboardOverlayRow(createOwned, fullLayout, [
            { emptyClass: "EmptyKey" },
            { action: "Ability1", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Ability2", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Ability3", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Ability4", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Attack", glyphstyle: "dark", keyClass: "MouseKey" },
            { action: "ADS", glyphstyle: "dark", keyClass: "MouseKey" }
        ]);
        createKeyboardOverlayRow(createOwned, fullLayout, [
            { action: "Scoreboard", glyphstyle: "light", keyClass: "TabKey" },
            { action: "AbilityMelee", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "MoveForward", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Cosmetic1", glyphstyle: "light", keyClass: "QWERTYKey" },
            { action: "Reload", glyphstyle: "light", keyClass: "QWERTYKey" }
        ]);
        createKeyboardOverlayRow(createOwned, fullLayout, [
            { emptyClass: "EmptyKeyWide" },
            { action: "MoveLeft", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "MoveBackwards", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "MoveRight", glyphstyle: "light", keyClass: "ASDFKey" },
            { action: "HeldItem", glyphstyle: "light", keyClass: "ASDFKey" }
        ]);
        createKeyboardOverlayRow(createOwned, fullLayout, [
            { action: "Roll", glyphstyle: "light", keyClass: "ShiftKey" },
            { action: "Item1", glyphstyle: "light", keyClass: "ZXCVKey" },
            { action: "Item2", glyphstyle: "light", keyClass: "ZXCVKey" },
            { action: "Item3", glyphstyle: "light", keyClass: "ZXCVKey" },
            { action: "Item4", glyphstyle: "light", keyClass: "ZXCVKey" }
        ]);
        createKeyboardOverlayRow(createOwned, fullLayout, [
            { action: "Crouch", glyphstyle: "light", keyClass: "CtrlKey" },
            { action: "ExtraInfo", glyphstyle: "light", keyClass: "AltKey" },
            { action: "Mantle", glyphstyle: "light", keyClass: "SpaceKey" }
        ]);
    };

    QOL.core.FeatureRegistry.register({
        id: "ql_keyboard",
        enableKey: "ENABLE_KEYBOARD_OVERLAY",
        enabledByDefault: false,
        settings: [
            { key: "ENABLE_KEYBOARD_OVERLAY", type: "toggle" },
            { key: "ENABLE_FULL_KEYBOARD_LAYOUT", type: "toggle" },
            { key: "KEYBOARD_OVERLAY_SCALE", type: "slider" },
            { key: "KEYBOARD_OVERLAY_X_OFFSET", type: "slider" },
            { key: "KEYBOARD_OVERLAY_Y_OFFSET", type: "slider" },
            { key: "KEYBOARD_OVERLAY_WASH_COLOR", type: "palette" }
        ],
        create(ctx) {
            const P = QOL.core.panel, U = QOL.utils;
            // Native hud.xml: Hud > .HudCore > gameplay_hud. Never create in a menu root.
            const gameplay = QOL.panelCache.createIdResolver("gameplay_hud", { retryMs: 500,
                ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }] });
            const styles = new Map();
            const tree = P.createOwnedTree();
            let generation = null, model = null, loop = null, enabled = false, root = null;

            function readModel() {
                const cfg = ctx.config.view();
                const full = U.IsCfgEnabled(cfg, "ENABLE_FULL_KEYBOARD_LAYOUT");
                const scale = U.ClampConfigNumber(cfg.KEYBOARD_OVERLAY_SCALE, 100, 70, 150, true) / 100;
                const x = U.ClampConfigNumber(cfg.KEYBOARD_OVERLAY_X_OFFSET, 0, -1500, 1500, true);
                const y = U.ClampConfigNumber(cfg.KEYBOARD_OVERLAY_Y_OFFSET, 0, -400, 1000, true);
                const size = value => Math.max(1, Math.round(value * scale)) + "px";
                const mouseSize = Math.max(1, Math.round(20 * Math.max(1, scale))) + "px";
                return { wash: U.ResolveWashColorFromPalette(U.ReadKeyboardOverlayWashColorIndex(cfg)),
                    box: { uiScale: "100%", marginLeft: (full ? 70 : 150) + "px", marginBottom: "300px",
                        x: x + "px", y: -y + "px", width: "fit-children" },
                    widths: { TabKey: size(53), SpaceKey: size(full ? 133 : 192), ShiftKey: size(80),
                        AltKey: size(60), CtrlKey: size(60), EmptyKeyWide: size(full ? 60 : 80) },
                    key: { width: size(40), height: size(40), margin: "2px" },
                    label: { fontSize: Math.max(1, Math.round(16 * Math.max(1, scale))) + "px", lineHeight: "0px" },
                    mouse: { width: mouseSize, height: mouseSize, backgroundTextureSize: mouseSize + " " + mouseSize }
                };
            }

            function releaseProperty(panel, owner, key) {
                if (!P.isAlive(panel) || P.clearStyleProperty(panel, key)) owner.properties.delete(key);
            }

            function releaseStyles(panel, owner) {
                for (const key of [...owner.properties]) releaseProperty(panel, owner, key);
                owner.signature = null;
                if (!owner.properties.size) styles.delete(panel);
            }

            function retire() {
                for (const [panel, owner] of styles) releaseStyles(panel, owner);
                tree.clear();
                generation = null;
            }

            function ensure(parent) {
                const stable = tree.sweep();
                if (stable && generation && generation.parent === parent) return true;
                retire();
                if (!P.isAlive(parent)) return false;
                // Retire foreign previous generations too. Merely waiting for
                // a living old root would prevent this owner from ever mounting.
                if (P.isAlive(P.findChild(parent, "QOLKeyboardOverlayRoot"))) {
                    tree.child(parent, "Panel", "QOLKeyboardOverlayRoot");
                    return false;
                }
                generation = { parent, overlay: null, box: null, keys: [] };
                const created = [];
                let childIndex = 0;
                const createOwned = (type, owner, id, properties) => {
                    // These IDs identify only QOL-created rows/keys/layouts.
                    // CitadelBinding still owns its native glyph descendants.
                    const panel = tree.child(owner, type, id || "QOLKeyboardOverlayChild" + childIndex++, properties);
                    if (!P.isAlive(panel)) throw new Error("Keyboard overlay panel creation failed");
                    created.push(panel);
                    return panel;
                };
                try {
                    generation.overlay = createOwned("Panel", parent, "QOLKeyboardOverlayRoot", {
                        hittest: "false", hittestchildren: "false" });
                    P.setVisible(generation.overlay, false);
                    generation.box = createOwned("Panel", generation.overlay, "AllBindingsBox", {
                        "class": "AllBindingsScope", hittest: "false", hittestchildren: "false" });
                    buildKeyboardOverlayLayouts(createOwned, generation.box);
                    generation.keys = created.filter(panel => panel.BHasClass("Key"));
                    return true;
                } catch (error) {
                    retire();
                    throw error;
                }
            }

            function render() {
                let ready = true;
                const desired = new Map();
                desired.set(generation.overlay, model.wash ? { washColor: model.wash } : {});
                desired.set(generation.box, model.box);
                for (const key of generation.keys) {
                    const width = Object.keys(model.widths).find(name => key.BHasClass(name));
                    desired.set(key, width ? { ...model.key, width: model.widths[width] } : model.key);
                }
                // Native KeyboardLetter/ModifierCombinerLabel are Label types, not a "Label" class.
                // CitadelBinding creates/replaces their glyph tree after our own construction.
                const stack = generation.box.Children().map(panel => ({ panel, depth: 0 }));
                while (stack.length) {
                    const { panel, depth } = stack.pop();
                    if (!P.isAlive(panel)) continue;
                    if (panel.paneltype === "Label") desired.set(panel, model.label);
                    if (panel.BHasClass("MouseButtonGlyph")) desired.set(panel, { ...desired.get(panel), ...model.mouse });
                    if (depth < 64) for (const child of panel.Children()) stack.push({ panel: child, depth: depth + 1 });
                }
                for (const [panel, owner] of styles) if (!desired.has(panel)) releaseStyles(panel, owner);
                for (const [panel, next] of desired) {
                    let owner = styles.get(panel);
                    if (!owner) { owner = { properties: new Set(), signature: null }; styles.set(panel, owner); }
                    for (const key of [...owner.properties]) if (!(key in next)) {
                        releaseProperty(panel, owner, key); owner.signature = null;
                        ready = !owner.properties.has(key) && ready;
                    }
                    // Attempted properties stay owned even when native setters reject one write.
                    for (const key of Object.keys(next)) owner.properties.add(key);
                    owner.signature = P.syncStyles(panel, next, owner.signature).sig;
                    ready = owner.signature !== null && ready;
                }
                if (generation.overlay.visible !== ready) P.setVisible(generation.overlay, ready);
            }

            function update() {
                if (!enabled) return;
                const current = P.findHud($.GetContextPanel());
                if (root !== current) { retire(); gameplay.reset(); root = current; }
                if (!P.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud")) { retire(); return; }
                const parent = gameplay.resolve(root);
                if (ensure(parent)) render();
            }

            function refresh() { model = readModel(); if (enabled) update(); }
            return {
                onEnable() { enabled = true; refresh(); loop = QOL.core.Scheduler.createPollLoop(update, 0.2, ctx.id); },
                onSettingsChanged: refresh,
                onDisable() {
                    enabled = false;
                    if (loop) loop.stop(); loop = null;
                    retire(); tree.dispose(); gameplay.reset(); model = root = null;
                }
            };
        },
        test() {
            try {
                const hud = QOL.core.panel.findHud($.GetContextPanel());
                if (!hud) return null;
                return {
                    passed: true,
                    name: "Keyboard overlay anchor panel exists",
                    message: "",
                    assertions: [{ passed: true, name: "Hud root panel exists" }]
                };
            } catch (e) {
                return { passed: false, name: "Keyboard panel check", message: e?.message || String(e) };
            }
        }
    });
})();
