// Static Midtown references adapted from MapHunter. Native minimap ownership,
// configuration, scheduling and cleanup remain with QOLLOCK.
(() => {
    "use strict";
    const Q = globalThis.QOL;
    const P = Q.core.panel;
    const id = "ql_minimap_loot";
    const toggles = ["ENABLE_MINIMAP_TOUGH_CRATES", "ENABLE_MINIMAP_HEALING_SNACKS", "ENABLE_MINIMAP_STATUES", "ENABLE_MINIMAP_CRATE_ROUTES"];
    const numbers = ["MINIMAP_CAMP_NAMES", "MINIMAP_LOOT_MARKER_SCALE", "MINIMAP_LOOT_OPACITY", "MINIMAP_ROUTE_SCALE"];
    const groups = [
        ["tough_crates", toggles[0], true],
        ["snacks", toggles[1], true],
        ["statues", toggles[2], true],
        ["names", "MINIMAP_CAMP_NAMES"], ["runs", toggles[3]]
    ];
    const laneColors = { yellow: "#F1CC30", blue: "#29b1cc", green: "#59b247" };
    const minimalNames = new Set(["#map_district_theater", "#map_district_chinatown", "#map_district_fairfax", "#map_district_haunted_slums"]);
    const pct = value => (value * 100).toFixed(3) + "%";
    const px = value => value.toFixed(2) + "px";

    Q.core.FeatureRegistry.register({
        id, enabledByDefault: false, enableKeys: toggles,
        isEnabled: cfg => toggles.some(key => Number(cfg[key]) === 1) || Number(cfg.MINIMAP_CAMP_NAMES) > 0,
        settings: [...toggles.map(key => ({ key, type: "toggle" })), ...numbers.map(key => ({ key, type: "slider" }))],
        create(ctx) {
            function nativeMap(root) {
                // XML plus the native capture place these owners directly below
                // one another. A missing live owner must not adopt a retained map.
                const byClass = P.findChildByClass;
                const core = byClass(root, "HudCore");
                const gameplay = P.findChild(core, "gameplay_hud");
                const clamp = byClass(gameplay, "clamp_width");
                const host = P.findChild(clamp, "minimap_persp");
                const viewport = P.findChild(host, "minimap_container");
                return P.findChild(P.findChild(viewport, "HudMinimapContainer"), "hud_minimap");
            }
            const tree = P.createOwnedTree();
            const built = new Map();
            const expectedCounts = new Map();
            let signatures = new WeakMap();
            let model = null, owner = null, rootOwner = null, layer = null, loop = null, active = false;
            let createdComposition = "cache";
            const probe = Q.core.minimapProbe;
            const diagnostic = probe.createOwner({
                isActive: () => active,
                allowed: { hideRoot: value => typeof value === "boolean", skipSweep: value => typeof value === "boolean",
                    hideGroups: value => Array.isArray(value) && value.every(key => groups.some(spec => spec[0] === key)),
                    composition: value => ["cache", "layer", "none"].includes(value) },
                apply: (next, previous) => {
                    if ((next.composition || "cache") !== (previous.composition || "cache")) clear();
                    update();
                },
                snapshot: () => {
                    const observed = Object.fromEntries(groups.map(([key]) => {
                        const panel = P.findChild(layer, "QOLMapLoot_" + key);
                        return [key, { ...probe.panelState(panel), expected: expectedCounts.get(key) || 0 }];
                    }));
                    return { owner: id, native: probe.panelState(owner), root: probe.panelState(layer), composition: createdComposition,
                        groups: observed, counts: { total: Object.values(observed).reduce((sum, value) => sum + (value.children || 0), 0) } };
                }
            });

            function clear() { tree.clear(); built.clear(); expectedCounts.clear(); signatures = new WeakMap(); layer = owner = null; }
            function shown(panel, visible) { if (P.isAlive(panel) && panel.visible !== visible) panel.visible = visible; }
            function style(panel, values) {
                const result = P.syncStyles(panel, values, signatures.get(panel));
                signatures.set(panel, result.sig);
                return result.sig !== null;
            }
            function entry(list, styles, type = "Panel", text = null) { list.push({ styles, type, text }); }
            function at(u, v) { return { position: pct(u) + " " + pct(v) + " 0px", horizontalAlign: "left", verticalAlign: "top" }; }

            function plans(spec) {
                const [key, , image] = spec;
                const list = [], data = Q.minimapLootData;
                const scale = model.MINIMAP_LOOT_MARKER_SCALE / 100;
                if (image) {
                    const suffix = model.MINIMAP_LOOT_MARKER_SCALE === 100 ? "" : "_" + model.MINIMAP_LOOT_MARKER_SCALE;
                    entry(list, { width: "100%", height: "100%", backgroundSize: "100% 100%", backgroundRepeat: "no-repeat",
                        backgroundImage: 'url("s2r://panorama/images/qollock/minimap_references_' + key + suffix + '.vsvg")' });
                }
                if (key === "names") for (const [u, v, token] of data.names) {
                    if (model.MINIMAP_CAMP_NAMES === 2 && !minimalNames.has(token)) continue;
                    entry(list, { ...at(u, v), width: px(140 * scale), fontSize: px(9 * scale), marginLeft: px(-70 * scale),
                        marginTop: px(-6.3 * scale), textAlign: "center", color: "#c8cad2", fontWeight: "bold",
                        textShadow: "1px 1px 2px #000000" }, "Label", $.Localize(token).replace(/\s*:\s*$/, ""));
                }
                if (key === "runs") {
                    const routeScale = model.MINIMAP_ROUTE_SCALE / 100;
                    let longest = 0;
                    for (const run of data.runs) {
                        longest = Math.max(longest, run.stops.length);
                        for (let index = 1; index < run.stops.length; index++) {
                            const a = run.stops[index - 1], b = run.stops[index];
                            const du = b[0] - a[0], dv = b[1] - a[1], length = Math.sqrt(du * du + dv * dv);
                            if (!length) continue;
                            // Native background-size percentages follow this leg's
                            // width. The 4/7 texture retains the old .008/.014 map
                            // dash pattern while height stays in independent pixels.
                            entry(list, { ...at((a[0] + b[0] - length) / 2, (a[1] + b[1]) / 2), width: pct(length),
                                height: px(2 * routeScale), marginTop: px(-routeScale),
                                backgroundImage: 'url("s2r://panorama/images/qollock/minimap_route_dash.vsvg")',
                                backgroundSize: pct(0.014 / length) + " 100%", backgroundPosition: "0px 0px", backgroundRepeat: "repeat-x",
                                washColor: laneColors[run.lane], transform: "rotateZ(" + Math.atan2(dv, du) * 180 / Math.PI + "deg)", opacity: "0.9" });
                        }
                    }
                    for (let index = longest - 1; index >= 0; index--) for (const run of data.runs) {
                        const point = run.stops[index];
                        if (!point) continue;
                        const side = 11 * routeScale;
                        entry(list, { ...at(point[0], point[1]), width: px(side), height: px(side), marginLeft: px(-side / 2), marginTop: px(-side / 2),
                            border: "1px solid " + (point[2] ? "#f59e0b" : laneColors[run.lane]), borderRadius: "50%", backgroundColor: "#1b1c22",
                            color: "#f3e9dc", fontSize: px(7 * routeScale), textAlign: "center", fontWeight: "bold" }, "Label", String(index + 1));
                    }
                }
                return list;
            }

            function build(spec, group) {
                const list = plans(spec);
                expectedCounts.set(spec[0], list.length);
                if (diagnostic.controls) diagnostic.stages.builds++;
                // Reconcile siblings in batches; no full-HUD searches or per-dot sibling scans.
                const byType = new Map();
                list.forEach((plan, index) => {
                    if (!byType.has(plan.type)) byType.set(plan.type, []);
                    byType.get(plan.type).push({ id: "QOLMapLoot_" + spec[0] + "_" + index, properties: { hittest: "false" }, plan });
                });
                let ready = true;
                for (const [type, entries] of byType) {
                    const children = tree.children(group, type, entries);
                    children.forEach((panel, index) => {
                        if (!P.isAlive(panel)) { ready = false; return; }
                        const plan = entries[index].plan;
                        ready = style(panel, plan.styles) && ready;
                        if (plan.text !== null && panel.text !== plan.text) panel.text = plan.text;
                        if (type === "Label") P.setClass(panel, "QOLMinimapLootText", true);
                    });
                }
                return ready;
            }

            function update() {
                if (!active) return;
                if (diagnostic.controls) { diagnostic.stages.updates++; diagnostic.stages.discovery++; }
                const root = P.findHud($.GetContextPanel());
                if (root !== rootOwner) { clear(); rootOwner = root; }
                const native = P.isAlive(root) && (root.id === "Hud" || root.paneltype === "CitadelHud") ? nativeMap(root) : null;
                if (native !== owner) { clear(); owner = native; }
                if (!P.isAlive(owner) || !owner.BHasClass("dl_midtown") || Q.core.hud.isInHideout(root) || Q.isStreetBrawlModeActive?.(root)) { shown(layer, false); return; }
                if (diagnostic.controls?.skipSweep) diagnostic.stages.skippedSweeps++;
                else { if (diagnostic.controls) diagnostic.stages.sweeps++; if (!tree.sweep()) built.clear(); }
                const previousLayer = layer;
                // Native require-layer creates the offscreen composition target;
                // always-cache alone only changes the policy of an existing one.
                // Keep the moving native map outside this static reference layer.
                layer = tree.child(owner, "Panel", "QOLMinimapLootRoot", {
                    hittest: "false", hittestchildren: "false",
                    ...probe.compositionProperties(diagnostic.controls?.composition)
                });
                if (!P.isAlive(layer)) return;
                if (layer !== previousLayer) { createdComposition = diagnostic.controls?.composition || "cache"; shown(layer, false); }
                if (!style(layer, { width: "100%", height: "100%", ignoreParentFlow: "true", overflow: "noclip", opacity: String(model.MINIMAP_LOOT_OPACITY), zIndex: "10" })) { shown(layer, false); return; }
                for (const spec of groups) {
                    const [key, setting] = spec;
                    const group = tree.child(layer, "Panel", "QOLMapLoot_" + key, { hittest: "false", hittestchildren: "false" });
                    if (!P.isAlive(group)) continue;
                    const wanted = key === "names" ? model[setting] > 0 : model[setting] === 1;
                    if (!wanted) { shown(group, false); continue; }
                    if (built.get(key) === group) { shown(group, !diagnostic.controls?.hideGroups?.includes(key)); continue; }
                    shown(group, false);
                    if (!style(group, { width: "100%", height: "100%", ignoreParentFlow: "true", overflow: "noclip", zIndex: key === "runs" ? "10" : "1" })) continue;
                    if (built.get(key) !== group && build(spec, group)) built.set(key, group);
                    shown(group, built.get(key) === group && !diagnostic.controls?.hideGroups?.includes(key));
                }
                shown(layer, !diagnostic.controls?.hideRoot);
                if (diagnostic.controls) diagnostic.stages.render++;
            }
            function refresh() {
                if (!active) return;
                const config = ctx.config.view();
                const next = Object.fromEntries([...toggles, ...numbers].map(key => [key, Q.settings.readNumber(key, config[key])]));
                if (model) {
                    // Static geometry changes independently of opacity and gates.
                    // Reuse marker handles; hidden groups refresh before reveal.
                    if (next.MINIMAP_LOOT_MARKER_SCALE !== model.MINIMAP_LOOT_MARKER_SCALE) {
                        for (const key of ["tough_crates", "snacks", "statues", "names"]) built.delete(key);
                    }
                    if (next.MINIMAP_ROUTE_SCALE !== model.MINIMAP_ROUTE_SCALE) built.delete("runs");
                    if (next.MINIMAP_CAMP_NAMES !== model.MINIMAP_CAMP_NAMES) {
                        built.delete("names");
                        tree.remove("QOLMapLoot_names");
                    }
                }
                model = next;
                update();
            }
            return {
                diagnostics: { begin: diagnostic.begin, inspect: diagnostic.inspect,
                    retirement: () => ({ inactive: !active, tree: tree.isReleased() }) },
                onEnable() { active = true; refresh(); loop = Q.core.Scheduler.createPollLoop(update, 0.5, id); },
                onSettingsChanged: refresh,
                onDisable() { active = false; diagnostic.cancel(); loop?.stop(); loop = null; clear(); tree.dispose(); rootOwner = model = null; }
            };
        }
    });
})();
