// OWNS: Keyboard-only diagnostic receipts, native glyph census and temporary control leases.
// DOES NOT OWN: Overlay rendering, persistent settings or polling suspension.
(() => {
    "use strict";
    QOL.features.keyboardDiagnostics = {
        create({ readState, update, styles, tree }) {
            const P = QOL.core.panel;
            const glyphIdentities = new WeakMap();
            let nextGlyphIdentity = 0;
            const defaultControls = { hideRoot: false, composition: "cache" };
            let diagnosticLease = null, diagnosticParent = null, controls = { ...defaultControls }, updates = 0;
            const cancelDiagnostics = () => { diagnosticLease = diagnosticParent = null; controls = { ...defaultControls }; };

            const diagnosticSource = () => {
                const current = P.findHud($.GetContextPanel());
                const validHud = P.isAlive(current) && (current.id === "Hud" || current.paneltype === "CitadelHud");
                return { root: current, parent: validHud ? P.findChild(P.findChildByClass(current, "HudCore"), "gameplay_hud") : null };
            };
            // A bounded census is an outside-window receipt, never another poll.
            function census(generation) {
                const counts = () => ({ bindings: 0, payloads: 0, unbound: 0, holdActions: 0, pressed: 0 });
                const result = { selected: counts(), hidden: counts(), complete: true,
                    glyphWorkload: null, glyphEpoch: null };
                if (!generation) return result;
                const selected = generation.alternate?.panel || generation.layout;
                const stack = [{ panel: selected, path: "0", depth: 0, counts: result.selected }];
                const workload = [], epoch = [];
                let remaining = 2048;
                try {
                    while (stack.length && remaining-- > 0) {
                        const { panel, path, depth, counts: current } = stack.pop();
                        if (!P.isAlive(panel)) { result.complete = false; continue; }
                        if (panel.paneltype === "CitadelBinding") {
                            current.bindings++;
                            if (panel.BHasClass("HasHoldAction")) current.holdActions++;
                            if (panel.BHasClass("IsPressed")) current.pressed++;
                        }
                        if (panel.BHasClass("UnboundKeyboardGlyph")) current.unbound++;
                        const label = panel.paneltype === "Label", mouse = panel.BHasClass("MouseButtonGlyph");
                        const kind = [label && panel.id === "KeyboardLetter" ? "letter" : "",
                            panel.BHasClass("KeyboardButtonGlyph") ? "keyboard" : "", mouse ? "mouse" : ""].filter(Boolean).join("+");
                        if (kind) {
                            current.payloads++;
                            const entry = [current === result.selected ? "selected" : "hidden", path, panel.paneltype, panel.id, kind];
                            workload.push(entry);
                            if (!glyphIdentities.has(panel)) glyphIdentities.set(panel, ++nextGlyphIdentity);
                            epoch.push([...entry, glyphIdentities.get(panel)]);
                        }
                        const children = panel.Children();
                        if (depth >= 64 && children.length) result.complete = false;
                        else children.forEach((child, index) => stack.push({ panel: child, path: path + "." + index,
                            depth: depth + 1, counts: current }));
                    }
                    if (stack.length) result.complete = false;
                } catch (_) { result.complete = false; }
                result.glyphWorkload = QOL.core.MinimapInvestigation.digest(JSON.stringify(workload));
                result.glyphEpoch = QOL.core.MinimapInvestigation.digest(JSON.stringify(epoch));
                return result;
            }
            function inspect() {
                const { enabled, root, generation, full } = readState();
                const present = P.isAlive(generation?.overlay);
                const source = diagnosticSource();
                const attached = present && source.root === root && P.isAlive(source.parent) && generation.parent === source.parent &&
                    generation.overlay.GetParent() === source.parent && P.findChild(source.parent, "QOLKeyboardOverlayRoot") === generation.overlay;
                const rootVisible = present && generation.overlay.visible === true;
                const stylesReady = enabled && attached && styles.verify();
                const { glyphWorkload, glyphEpoch, ...counts } = census(generation);
                return { active: enabled, generation: generation?.serial || null, rootPresent: present, rootVisible, attached,
                    full, ready: stylesReady && rootVisible, stylesReady,
                    glyphsReady: stylesReady && counts.complete && counts.selected.payloads > 0, glyphWorkload, glyphEpoch,
                    controls: { ...controls }, composition: generation?.composition || null, updates, census: counts };
            }
            function beginDiagnostics() {
                const { enabled, root, generation } = readState();
                const source = diagnosticSource();
                if (!enabled || source.root !== root || !P.isAlive(source.parent) || generation?.parent !== source.parent) {
                    throw Error("keyboard diagnostic owner inactive or retired");
                }
                cancelDiagnostics();
                const current = () => {
                    const next = diagnosticSource();
                    return readState().enabled && diagnosticLease === lease && next.root === source.root && next.parent === source.parent;
                };
                const lease = {
                    apply: (request = {}) => {
                        if (!current()) {
                            if (diagnosticLease === lease) cancelDiagnostics();
                            throw Error("keyboard diagnostic lease retired");
                        }
                        if (!request || typeof request !== "object" || Array.isArray(request) || Object.entries(request).some(([key, value]) =>
                            key === "hideRoot" ? typeof value !== "boolean" : key !== "composition" || !["none", "cache"].includes(value))) {
                            throw Error("invalid keyboard diagnostic controls");
                        }
                        controls = { ...defaultControls, ...request };
                        update();
                        const observed = inspect();
                        if (observed.rootPresent && controls.hideRoot && observed.rootVisible) throw Error("keyboard diagnostic visibility rejected");
                        return observed;
                    },
                    restore: () => {
                        if (diagnosticLease !== lease) return;
                        const owned = current();
                        cancelDiagnostics();
                        if (owned) update();
                        return inspect();
                    }
                };
                diagnosticLease = lease;
                diagnosticParent = source.parent;
                update();
                return lease;
            }
            return {
                get controls() { return controls; },
                reset: cancelDiagnostics,
                recordUpdate() { updates = Math.min(Number.MAX_SAFE_INTEGER, updates + 1); },
                reconcileParent(parent) {
                    if (diagnosticLease && parent !== diagnosticParent) cancelDiagnostics();
                },
                api: {
                    inspect, begin: beginDiagnostics,
                    retirement() {
                        const { enabled, lastParent } = readState();
                        return { inactive: !enabled, tree: tree.isReleased(), styles: styles.isReleased(),
                            rootPresent: P.isAlive(P.findChild(lastParent, "QOLKeyboardOverlayRoot")) };
                    }
                }
            };
        }
    };
})();
