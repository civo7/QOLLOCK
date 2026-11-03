// OWNS: Private keyboard overlay panels and derived geometry/wash styling.
// DOES NOT OWN: Native input, bindings, glyph creation or shared HUD CSS gates.
// SOURCE: Native hud.xml gameplay_hud; retained CitadelBinding actions/layouts.
(() => {
    "use strict";
    let nextGeneration = 0;
    let ownerLoaded = null;
    // Invoked by the static gameplay_hud XML owner after construction. This is
    // not an unhandled engine event or a promise of arbitrary child mutation.
    QOL.features.keyboardOwnerLoaded = () => { if (ownerLoaded) ownerLoaded(); };
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

    const buildKeyboardOverlayLayout = (createOwned, allBindingsBox, full) => {
        if (!full) {
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

            return baseLayout;
        }
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
        return fullLayout;
    };

    // Adapted compact/grid geometry; native CitadelBinding still owns the glyph
    // and pressed state. The retained Full Keys toggle selects the extra actions.
    function buildAlternateLayout(createOwned, parent, mode, full) {
        const layout = createOwned("Panel", parent, "");
        layout.AddClass("KeyboardLayout"); layout.AddClass("KeyboardLayoutAlternate");
        const rects = {};
        const add = (action, x, y, w = 1, h = 1) => { rects[action] = [x, y, w, h]; };
        if (mode === 1) {
            add("AbilityMelee", 0, 0); add("MoveForward", 1, 0); add("HeldItem", 2, 0);
            add("MoveLeft", 0, 1); add("MoveBackwards", 1, 1); add("MoveRight", 2, 1);
            add("Attack", 0, 2, 1.5); add("ADS", 1.5, 2, 1.5);
            add("Mantle", 0, 3, 3, 0.6);
            add("Roll", 0, 3.6, 1.5, 0.6); add("Crouch", 1.5, 3.6, 1.5, 0.6);
            if (full) for (let i = 0; i < 4; i++) {
                add("Ability" + (i + 1), i * 0.75, -0.75, 0.75, 0.75);
                add("Item" + (i + 1), i * 0.75, 4.2, 0.75, 0.6);
            }
        } else {
            const pairs = [["Roll", "Crouch"], ["AbilityMelee", "MoveLeft"], ["MoveForward", "MoveBackwards"],
                [full ? "Reload" : null, "MoveRight"], ["HeldItem", "Mantle"], ["Attack", "ADS"]];
            pairs.forEach((pair, x) => pair.forEach((action, y) => { if (action) add(action, x, y + (full ? 1 : 0)); }));
            if (full) for (let i = 0; i < 4; i++) {
                add("Ability" + (i + 1), i + 1, 0); add("Item" + (i + 1), i + 1, 3);
            }
        }
        const values = Object.values(rects), minY = Math.min(...values.map(rect => rect[1]));
        const keys = Object.entries(rects).map(([action, [x, y, w, h]]) => {
            const panel = createKeyboardOverlayKey(createOwned, layout, { action, glyphstyle: "light",
                keyClass: action === "Attack" || action === "ADS" ? "MouseKey" : "QWERTYKey" });
            return { panel, x, y: y - minY, w, h };
        });
        return { panel: layout, keys, width: Math.max(...values.map(rect => rect[0] + rect[2])),
            height: Math.max(...values.map(rect => rect[1] + rect[3])) - minY };
    }

    QOL.core.FeatureRegistry.register({
        id: "ql_keyboard",
        enableKey: "ENABLE_KEYBOARD_OVERLAY",
        enabledByDefault: false,
        settings: [
            ...QOL.presentation.stateSettings("ql_keyboard"),
            { key: "ENABLE_KEYBOARD_OVERLAY", type: "toggle" },
            { key: "ENABLE_FULL_KEYBOARD_LAYOUT", type: "toggle" },
            { key: "KEYBOARD_OVERLAY_THEME", type: "dropdown" },
            { key: "KEYBOARD_OVERLAY_LAYOUT", type: "dropdown" },
            { key: "KEYBOARD_OVERLAY_SCALE", type: "slider" },
            { key: "KEYBOARD_OVERLAY_X_OFFSET", type: "slider" },
            { key: "KEYBOARD_OVERLAY_Y_OFFSET", type: "slider" },
            { key: "KEYBOARD_OVERLAY_WASH_COLOR", type: "palette" }
        ],
        create(ctx) {
            const P = QOL.core.panel, U = QOL.utils;
            const styles = P.createNativeStyleOwner();
            const tree = P.createOwnedTree();
            let generation = null, model = null, retry = null, enabled = false, root = null, lastParent = null;
            const diagnostics = QOL.features.keyboardDiagnostics.create({
                readState: () => ({ enabled, root, generation, lastParent, full: model?.full || false }),
                update, styles, tree
            });

            function readModel() {
                const cfg = QOL.presentation.captureVisibility(ctx, ctx.config.view());
                const full = U.IsCfgEnabled(cfg, "ENABLE_FULL_KEYBOARD_LAYOUT");
                const layout = QOL.settings.readNumber("KEYBOARD_OVERLAY_LAYOUT", cfg.KEYBOARD_OVERLAY_LAYOUT);
                const theme = QOL.settings.readNumber("KEYBOARD_OVERLAY_THEME", cfg.KEYBOARD_OVERLAY_THEME);
                const scale = QOL.settings.readNumber("KEYBOARD_OVERLAY_SCALE", cfg.KEYBOARD_OVERLAY_SCALE);
                const x = Math.round(Number(cfg.KEYBOARD_OVERLAY_X_OFFSET)) || 0;
                const y = Math.round(Number(cfg.KEYBOARD_OVERLAY_Y_OFFSET)) || 0;
                return { full, layout, layoutKey: layout + ":" + full,
                    scale: scale + "%",
                    themeClasses: Object.fromEntries(Array.from({ length: 8 }, (_, i) => ["QOLKeyboardTheme" + i, i === theme])),
                    wash: P.resolvePaletteColor(cfg.KEYBOARD_OVERLAY_WASH_COLOR),
                    box: { marginLeft: (full ? 70 : 150) + "px", x: x + "px", y: -y + "px" }
                };
            }

            function retire() {
                styles.clear();
                tree.clear();
                generation = null;
            }

            function ensure(parent) {
                const stable = tree.sweep();
                if (stable && generation && generation.parent === parent && generation.layoutKey === model.layoutKey &&
                    generation.composition === diagnostics.controls.composition) return true;
                retire();
                if (!P.isAlive(parent)) return false;
                // Retire foreign previous generations too. Merely waiting for
                // a living old root would prevent this owner from ever mounting.
                if (P.isAlive(P.findChild(parent, "QOLKeyboardOverlayRoot"))) {
                    tree.child(parent, "Panel", "QOLKeyboardOverlayRoot");
                    return false;
                }
                lastParent = parent;
                generation = { serial: ++nextGeneration, parent, overlay: null, box: null, alternate: null,
                    layoutKey: model.layoutKey, composition: diagnostics.controls.composition };
                let childIndex = 0;
                const createOwned = (type, owner, id, properties) => {
                    // Private rows and bindings are tracked by handle; named
                    // roots also reject a previous generation awaiting deletion.
                    const panel = id ? tree.child(owner, type, id, properties) :
                        tree.create(type, owner, "QOLKeyboardOverlayChild" + childIndex++, {
                            hittest: "false", hittestchildren: "false", ...properties
                        });
                    if (!P.isAlive(panel)) throw new Error("Keyboard overlay panel creation failed");
                    if (!id) { panel.hittest = false; panel.hittestchildren = false; }
                    return panel;
                };
                try {
                    generation.overlay = createOwned("Panel", parent, "QOLKeyboardOverlayRoot", {
                        hittest: "false", hittestchildren: "false" });
                    P.setVisible(generation.overlay, false);
                    generation.box = createOwned("Panel", generation.overlay, "AllBindingsBox", {
                        "class": "AllBindingsScope", hittest: "false", hittestchildren: "false",
                        ...(generation.composition === "cache" ? {
                            "require-composition-layer": "true", "always-cache-composition-layer": "true"
                        } : {}) });
                    if (model.layout) generation.alternate = buildAlternateLayout(createOwned, generation.box, model.layout, model.full);
                    else generation.layout = buildKeyboardOverlayLayout(createOwned, generation.box, model.full);
                    return true;
                } catch (error) {
                    retire();
                    throw error;
                }
            }

            function render() {
                const desired = new Map();
                desired.set(generation.overlay, QOL.presentation.visibilityStyles("keyboard", QOL.presentation.visibilityConfig(ctx), root,
                    model.wash ? { washColor: model.wash } : {}));
                desired.set(generation.box, model.box);
                const layout = generation.alternate?.panel || generation.layout;
                desired.set(layout, { uiScale: model.scale });
                if (generation.alternate) {
                    const alternate = generation.alternate;
                    const px = value => Math.round(value * 40) + "px";
                    Object.assign(desired.get(alternate.panel), { width: px(alternate.width), height: px(alternate.height), flowChildren: "none" });
                    for (const { panel, x, y, w, h } of alternate.keys) desired.set(panel, {
                        x: px(x + 0.05), y: px(y + 0.05), width: px(w - 0.1), height: px(h - 0.1), margin: "0px"
                    });
                }
                // Native components own all glyph descendants. Their stylesheet
                // chain supplies typography, mouse sizes, themes and press states.
                let ready = styles.retain(desired.keys());
                for (const [panel, next] of desired) ready = styles.apply(panel, next,
                    panel === generation.box ? model.themeClasses : undefined) && ready;
                const visible = ready && !diagnostics.controls.hideRoot;
                if (generation.overlay.visible !== visible) P.setVisible(generation.overlay, visible);
                return ready && generation.overlay.visible === visible;
            }

            function retryPending() {
                if (retry || !enabled) return;
                const task = QOL.core.Scheduler.scheduleOnce(() => {
                    if (retry !== task) return;
                    retry = null;
                    update();
                }, 0.25, ctx.id);
                retry = task;
            }

            function update() {
                diagnostics.recordUpdate();
                if (!enabled) return;
                const current = P.findHud($.GetContextPanel());
                if (root !== current) { diagnostics.reset(); retire(); root = current; }
                if (!P.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud")) { retire(); return; }
                // Native hud.xml owns this static path and invokes our load hook.
                const parent = P.findChild(P.findChildByClass(root, "HudCore"), "gameplay_hud");
                diagnostics.reconcileParent(parent);
                if (ensure(parent)) {
                    P.setClass(generation.box, "QOLCustomizeKeyboardSample", QOL.presentation.preview.selected(root, "keyboard"));
                    if (!render()) retryPending();
                    else if (retry) { retry.stop(); retry = null; }
                } else if (P.isAlive(parent)) retryPending();
            }

            function refresh() {
                model = readModel();
                if (enabled) update();
            }

            function disable() {
                enabled = false;
                if (ownerLoaded === update) ownerLoaded = null;
                ctx.events.off("presentation:preview_changed", update);
                if (retry) retry.stop();
                retry = null;
                diagnostics.reset();
                retire(); tree.dispose(); model = root = null;
            }
            return QOL.presentation.bindVisibility(ctx, {
                diagnostics: diagnostics.api,
                onEnable() {
                    enabled = true;
                    ownerLoaded = update;
                    ctx.events.on("presentation:preview_changed", update);
                    try { refresh(); }
                    catch (error) { disable(); throw error; }
                },
                onSettingsChanged: refresh,
                onDisable: disable
            }, update);
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
