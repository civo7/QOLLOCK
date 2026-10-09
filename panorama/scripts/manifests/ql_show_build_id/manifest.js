// OWNS: Selected-build readout, settings model and the created LowerLeft child tree.
// DOES NOT OWN: Native shop bindings, selected build, shop layout or build storage.
// Evidence: hud.xml HudCore > StatsAndModsContainer > LowerLeft;
// citadel_hud_hero_builds.xml SelectedBuildInfoTitle; native SelectedBuildOuter.
(() => {
    "use strict";
    const ID = "ql_show_build_id";
    const SEARCH_MS = 3000;
    const panelStyles = { marginLeft: "26px", verticalAlign: "bottom", height: "24px", flowChildren: "right", zIndex: "5" };
    const labelStyles = { whiteSpace: "nowrap", fontSize: "16px", fontWeight: "bold", fontFamily: "oracle, blocky, sans-serif",
        color: "#FFEFD7", textShadow: "0px 1px 3px 3.0 #000000cc" };

    function parse(rawText) {
        const raw = String(rawText || "").trim();
        if (!raw) return null;
        const match = raw.match(/^([\d,]+)(?:\s*-\s*(.*?))?(?:\s*-\s*([\d,]+))?$/);
        const parts = match ? [match[1], match[2], match[3]] : raw.split(" - ");
        const id = String(parts[0] || "").replace(/,/g, "").trim();
        const name = String(parts[1] || "").trim();
        const version = parseInt(String(parts[2] || "0").replace(/,/g, ""), 10);
        if (!id || id === "0") return null;
        return { id, name: name !== "Unknown" ? name : "", visibility: version > 0 || parseInt(id, 10) > 0 ? "Public" : "Private" };
    }

    QOL.core.FeatureRegistry.register({
        id: ID,
        enableKey: "ENABLE_SHOW_BUILD_ID",
        enabledByDefault: false,
        settings: [{ key: "ENABLE_SHOW_BUILD_ID", type: "toggle" }, { key: "ENABLE_SHOW_BUILD_ID_TITLE", type: "toggle" }],
        create(ctx) {
            const P = QOL.core.panel, U = QOL.utils;
            const lowerResolver = QOL.panelCache.createIdResolver("LowerLeft", {
                retryMs: SEARCH_MS, ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }, "StatsAndModsContainer"]
            });
            const sourceResolver = QOL.panelCache.createIdResolver("SelectedBuildInfoTitle", { retryMs: SEARCH_MS, refreshMs: SEARCH_MS });
            const outerResolver = QOL.panelCache.createIdResolver("SelectedBuildOuter", { retryMs: SEARCH_MS, refreshMs: SEARCH_MS });
            const nameResolver = QOL.panelCache.createIdResolver("SelectedBuildName", { retryMs: SEARCH_MS, refreshMs: SEARCH_MS });
            const resolvers = [lowerResolver, sourceResolver, outerResolver, nameResolver];
            const tree = P.createOwnedTree();
            let active = false, model = null, loop = null, rootOwner = null, parent = null, panel = null, label = null;
            let panelSignature = null, labelSignature = null;

            function readModel() {
                const cfg = ctx.config.view();
                return { enabled: U.IsCfgEnabled(cfg, "ENABLE_SHOW_BUILD_ID"), title: U.IsCfgEnabled(cfg, "ENABLE_SHOW_BUILD_ID_TITLE") };
            }
            function hide() {
                if (P.isAlive(panel)) U.SetStyleIfChanged(panel, "visibility", "collapse");
            }
            function releaseTree() {
                hide(); tree.clear();
                parent = panel = label = null; panelSignature = labelSignature = null;
            }
            function resetSources() { for (const resolver of resolvers) resolver.reset(); }
            function readName(root) {
                const owner = outerResolver.resolve(root) || nameResolver.resolve(root);
                const nativeLabel = P.isAlive(owner) && owner.BHasClass("SelectedBuildName") ? owner :
                    U.FindFirstPanelByClass(owner, "SelectedBuildName");
                const name = P.readText(nativeLabel).trim();
                return name && !name.startsWith("#") && name !== "Unknown" ? name : "";
            }
            function readContent(root) {
                const selected = parse(P.readText(sourceResolver.resolve(root)));
                if (!selected) return null;
                const name = model.title ? selected.name || readName(root) : "";
                return selected.visibility + " Build: " + selected.id + (name ? " - " + name : "");
            }
            function ensure(nextParent) {
                if (!P.isAlive(nextParent)) { releaseTree(); return false; }
                if (parent !== nextParent) releaseTree();
                parent = nextParent;
                const previousPanel = panel, previousLabel = label;
                panel = tree.child(parent, "Panel", "selected_build_info");
                if (panel !== previousPanel) { panelSignature = null; hide(); }
                label = tree.child(panel, "Label", "build_info");
                if (label !== previousLabel) labelSignature = null;
                return P.isAlive(panel) && P.isAlive(label);
            }
            function render(content) {
                panelSignature = P.syncStyles(panel, panelStyles, panelSignature).sig;
                labelSignature = P.syncStyles(label, labelStyles, labelSignature).sig;
                if (label.html !== true) label.html = true;
                if (label.text !== content) label.text = content;
                U.SetStyleIfChanged(panel, "visibility", "visible");
            }
            function update() {
                if (!active) return;
                const root = P.findHud($.GetContextPanel());
                if (root !== rootOwner) { releaseTree(); resetSources(); rootOwner = root; }
                if (!P.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud")) { releaseTree(); return; }
                tree.sweep();
                const nextParent = lowerResolver.resolve(root);
                if (parent && parent !== nextParent) releaseTree();
                if (!model.enabled) { hide(); return; }
                const content = readContent(root);
                if (!content) { hide(); return; }
                if (ensure(nextParent)) render(content);
                else hide();
            }
            function refresh() { model = readModel(); resetSources(); update(); }
            return {
                onEnable() {
                    active = true; refresh();
                    loop = QOL.core.Scheduler.createPollLoop(update, 1.0, ctx.id);
                },
                onSettingsChanged: refresh,
                onDisable() {
                    active = false;
                    if (loop) loop.stop(); loop = null;
                    releaseTree(); tree.dispose(); resetSources(); model = rootOwner = null;
                }
            };
        },
        test() {
            const lower = QOL.core.panel.findTraverse(QOL.core.panel.findHud($.GetContextPanel()), "LowerLeft");
            if (!lower) return null;
            return { passed: true, name: "LowerLeft panel exists", message: "", assertions: [{ passed: true, name: "LowerLeft exists" }] };
        }
    });
})();
