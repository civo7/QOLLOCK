// OWNS: Selected-build readout, settings model and the created LowerLeft child tree.
// DOES NOT OWN: Native shop bindings, selected build, shop layout or build storage.
// Evidence: hud.xml HudCore > StatsAndModsContainer > LowerLeft;
// citadel_hud_hero_builds.xml SelectedBuildInfoTitle; native SelectedBuildOuter.
(() => {
    "use strict";
    const ID = "ql_show_build_id";

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
            // hud.xml and the October 3 Debugger capture agree on these owners.
            // Re-evaluate direct children so a live retired generation cannot win.
            const directClass = P.findChildByClass;
            const directPath = (owner, ids) => {
                for (const id of ids) {
                    owner = P.findChild(owner, id);
                    if (!owner) return null;
                }
                return owner;
            };
            const tree = P.createOwnedTree();
            let active = false, model = null, loop = null, rootOwner = null, parent = null, panel = null, label = null;

            function readModel() {
                const cfg = ctx.config.view();
                return { enabled: U.IsCfgEnabled(cfg, "ENABLE_SHOW_BUILD_ID"), title: U.IsCfgEnabled(cfg, "ENABLE_SHOW_BUILD_ID_TITLE") };
            }
            function hide() {
                if (P.isAlive(panel)) U.SetStyleIfChanged(panel, "visibility", "collapse");
            }
            function releaseTree() {
                hide(); tree.clear();
                parent = panel = label = null;
            }
            function readName(core) {
                const builds = directPath(core, ["CitadelHudHeroShop", "Shop", "MainPanel", "ShopModsContainer",
                    "ShopModListsContainer", "ShopModsSelectedBuild"]);
                const header = directClass(directClass(builds, "BuildHeader"), "BuildHeaderContainer");
                const owner = P.findChild(header, "SelectedBuildOuter");
                const nativeLabel = U.FindFirstPanelByClass(owner, "SelectedBuildName");
                const name = P.readText(nativeLabel).trim();
                return name && !name.startsWith("#") && name !== "Unknown" ? name : "";
            }
            function readContent(core) {
                const source = directPath(core, ["CitadelHudHeroBuilds", "SelectedBuildInfo", "SelectedBuildInfoTitle"]);
                const selected = parse(P.readText(source));
                if (!selected) return null;
                const name = model.title ? selected.name || readName(core) : "";
                return selected.visibility + " Build: " + selected.id + (name ? " - " + name : "");
            }
            function ensure(nextParent) {
                if (!P.isAlive(nextParent)) { releaseTree(); return false; }
                if (parent !== nextParent) releaseTree();
                parent = nextParent;
                const previousPanel = panel;
                panel = tree.child(parent, "Panel", "selected_build_info");
                if (panel !== previousPanel) hide();
                label = tree.child(panel, "Label", "build_info");
                return P.isAlive(panel) && P.isAlive(label);
            }
            function render(content) {
                if (label.html !== true) label.html = true;
                if (label.text !== content) label.text = content;
                U.SetStyleIfChanged(panel, "visibility", "visible");
            }
            function update() {
                if (!active) return;
                const root = P.findHud($.GetContextPanel());
                if (root !== rootOwner) { releaseTree(); rootOwner = root; }
                if (!P.isAlive(root) || (root.id !== "Hud" && root.paneltype !== "CitadelHud")) { releaseTree(); return; }
                tree.sweep();
                const core = directClass(root, "HudCore");
                const nextParent = directPath(core, ["StatsAndModsContainer", "LowerLeft"]);
                if (parent && parent !== nextParent) releaseTree();
                if (!model.enabled) { hide(); return; }
                const content = readContent(core);
                if (!content) { hide(); return; }
                if (ensure(nextParent)) render(content);
                else hide();
            }
            function refresh() { model = readModel(); update(); }
            return {
                onEnable() {
                    active = true; refresh();
                    loop = QOL.core.Scheduler.createPollLoop(update, 1.0, ctx.id);
                },
                onSettingsChanged: refresh,
                onDisable() {
                    active = false;
                    if (loop) loop.stop(); loop = null;
                    releaseTree(); tree.dispose(); model = rootOwner = null;
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
