// scripts/simulator/perf/hud_tree.js
// =============================================================================
// Builds a realistic in-match HUD panel tree for the profiler.
// =============================================================================
// WHY REAL XML AND NOT A SYNTHETIC TREE
//
// The headline metric of this profiler is "tree nodes visited", and that number
// is a function of the tree: how many panels exist, how deep they nest, and —
// decisively — whether the id being searched for is present at all. A synthetic
// tree would let us pick numbers that flatter or damn any feature we like.
//
// So the tree is assembled from the actual layout XML that ships in the mod
// (panorama/layout/*.xml, which are the mod's patched copies of Valve's files)
// plus the vanilla layouts the mod does not override. Panel ids, classes, nesting
// depth and sibling counts are therefore real. Per-player layouts are
// instantiated 12 times, which is the teamfight case the bug reports describe.
//
// WHAT IS STILL APPROXIMATE (do not oversell this harness)
//
//  * Composition. In-engine, C++ decides which layout goes where and creates
//    many panels dynamically (each damage number, each health bar, each chat
//    line). We attach layouts under hand-specified parents (see COMPOSITION) —
//    a plausible arrangement, not a captured one.
//  * Dynamic panel counts. Floating combat text, data feed entries and modifier
//    icons are created and destroyed by the game continuously. We seed a fixed
//    number (see teamfight defaults) rather than model their lifecycles.
//  * Anything the game creates from code with no layout file is absent unless
//    listed in EXTRA_RUNTIME_PANELS.
//
// The consequence is worth stating plainly: absolute node counts are indicative,
// while RATIOS between features and BEFORE/AFTER deltas on an identical tree are
// solid. Optimisation decisions should rest on the latter two.
// =============================================================================

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const MOD_LAYOUT = path.join(REPO_ROOT, "panorama", "layout");
const VANILLA_LAYOUT = path.join(
    process.env.QOLLOCK_VANILLA || "G:/GameTracking-Deadlock/game/citadel/pak01_dir/panorama",
    "layout"
);

/**
 * XML element names that are not panels. Anything else in a layout is.
 *
 * GlobalClassListener is deliberately NOT here: it is a real panel in the tree
 * and hud.xml gives one of them id="minimap_persp", which the minimap features
 * look up. Excluding it made those lookups miss and produced a false finding.
 */
const NON_PANEL_TAGS = new Set([
    "root", "styles", "scripts", "include", "snippets", "snippet",
]);

/**
 * Composition of an in-match HUD.
 *
 * `mount` is the id of an already-created panel to attach under; layouts are
 * processed in order so a layout can mount under one added earlier. `count`
 * instantiates the layout N times (top bar players, health bars).
 *
 * Where a mount id does not exist yet the layout is attached to the Hud root and
 * a note is recorded — visible in the report rather than silently reshaping the
 * tree.
 */
const COMPOSITION = [
    // The mod's patched copy of Valve's hud.xml. This is the in-match HUD shell
    // and it declares the containers everything else mounts under
    // (gameplay_hud, TopBar, AbilitiesContainer, reticle_status, ...), so it
    // must come first.
    { file: "hud.xml", mod: true, mount: "Hud" },

    // Vanilla in-match chrome the mod does not ship a patched copy of.
    { file: "hud_minimap.xml", mount: "gameplay_hud" },
    { file: "citadel_hud_active_player_stats.xml", mount: "gameplay_hud" },
    { file: "citadel_hud_damage_feedback_display.xml", mount: "gameplay_hud" },
    { file: "citadel_hud_game_announcements.xml", mount: "gameplay_hud" },
    { file: "citadel_hud_shop_quickbuy.xml", mount: "gameplay_hud" },
    { file: "ability_hud_elements_container.xml", mount: "AbilitiesContainer" },
    { file: "chat.xml", mount: "Hud" },
    { file: "hud_playerintents.xml", mount: "gameplay_hud" },
    { file: "citadel_hud_player_level.xml", mount: "gameplay_hud" },
    { file: "citadel_hud_subtitles.xml", mount: "Hud" },

    // The mod's patched copies of layouts it does override.
    { file: "citadel_hud_top_bar.xml", mod: true, mount: "TopBar" },
    { file: "hud_gold_and_ap_container.xml", mod: true, mount: "gameplay_hud" },
    { file: "hud_health_container.xml", mod: true, mount: "gameplay_hud" },
    { file: "hud_health.xml", mod: true, mount: "hud_health_bars" },
    { file: "citadel_hud_hero_shop.xml", mod: true, mount: "Hud" },
    { file: "citadel_hud_hero_builds.xml", mod: true, mount: "Hud" },
    { file: "hud_quickbuy.xml", mod: true, mount: "gameplay_hud" },
    { file: "ability_hud_element_unit_target.xml", mod: true, mount: "AbilitiesContainer" },
    { file: "hud_paused.xml", mod: true, mount: "Hud" },

    // Twelve players in the top bar — the teamfight multiplier the bug reports
    // are about. The mod's patched per-player layout, once per player.
    { file: "citadel_hud_top_bar_player.xml", mod: true, mount: "TopBar", count: 12 },

    // Ability buttons: 4 abilities plus the weapon, for the local player.
    { file: "citadel_hud_ability_button.xml", mount: "AbilitiesContainer", count: 5 },

    // The weapon element — where ammo_panel, clip_status, reticle_status and the
    // reload progress bars actually live. It is loaded per ability slot by C++
    // from the ability_hud_elements dir, so it is not referenced by any parent
    // layout we could follow statically; without it the ammo and crosshair
    // features would appear to miss on every lookup, which would be a harness
    // artifact reported as a mod bug.
    { file: "ability_hud_elements/element_gun.xml", mount: "AbilitiesContainer" },
    { file: "ability_hud_elements/element_charges.xml", mount: "AbilitiesContainer" },
    { file: "ability_hud_elements/element_circular_progress.xml", mount: "AbilitiesContainer", count: 4 },

    // Item slots the shop/quickbuy churn through.
    { file: "hud_quickbuy_entry.xml", mod: true, mount: "CitadelHudQuickbuy", count: 8 },

    // Modifier/buff icons — one per active buff, and a teamfight has many.
    { file: "hud_modifiers_entry_center.xml", mount: "gameplay_hud", count: 16 },
];

/**
 * Panels the engine creates from C++ with no layout file, which the mod looks
 * for by id. Only created when the composed layouts did not already declare
 * them — otherwise we would fork the tree with a duplicate container and every
 * mount below it would land in the wrong place.
 */
const EXTRA_RUNTIME_PANELS = [
    { id: "gameplay_hud", mount: "Hud" },
    { id: "TopBar", mount: "Hud" },
    { id: "hud_health_bars", mount: "gameplay_hud" },
    { id: "AbilitiesContainer", mount: "gameplay_hud" },
    { id: "CitadelHudQuickbuy", mount: "gameplay_hud" },
];

/**
 * Per-player top-bar panels are created by C++ with the ids "TopBarPlayer0".."N"
 * — no layout declares them, so the id has to be stamped on each instantiated
 * per-player subtree here. Several features address players by exactly this id
 * (manifests/ql_nicknames/manifest.js:85, and the old system's
 * GetTopBarPlayerPanel), and without the stamp every one of those lookups would
 * miss and the profile would blame the mod for the harness's omission.
 */
const PLAYER_PANEL_ID_PREFIX = "TopBarPlayer";

function readSafe(p) {
    try {
        return fs.readFileSync(p, "utf8");
    } catch {
        return null;
    }
}

function stripComments(xml) {
    return xml.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Minimal XML → node tree. Not a conformant parser: layouts are machine-written
 * and regular, and all we need is tag name, id, class and nesting.
 *
 * Non-panel tags (`<root>`, `<snippet>`, `<styles>`, ...) are TRANSPARENT: they
 * do not become panels, but panels declared inside them must still be collected,
 * so on close a transparent frame hands its children to whatever encloses it.
 * Getting this wrong silently yields an empty tree — which is exactly the kind of
 * harness bug that makes a profiler print reassuring zeroes.
 *
 * Returns the list of top-level panel nodes ({tag, id, classes, text, children}).
 */
function parseLayout(xml) {
    const src = stripComments(xml);
    const tokenRe = /<(\/?)([A-Za-z_][A-Za-z0-9_]*)((?:\s+[A-Za-z_:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;

    // A stack of frames. Each frame collects children; a frame is either a panel
    // node or a transparent wrapper.
    const roots = [];
    const stack = [{ transparent: true, children: roots }];
    const top = () => stack[stack.length - 1];

    let m;
    while ((m = tokenRe.exec(src)) !== null) {
        const closing = m[1] === "/";
        const tag = m[2];
        const attrText = m[3] || "";
        const selfClosing = m[4] === "/";

        if (closing) {
            // Never pop the bottom frame — malformed or unbalanced XML must not
            // corrupt the collection array.
            if (stack.length > 1) {
                const frame = stack.pop();
                if (frame.transparent) {
                    // Hoist a transparent frame's panels into its enclosing frame.
                    for (const child of frame.children) top().children.push(child);
                }
            }
            continue;
        }

        if (NON_PANEL_TAGS.has(tag)) {
            if (!selfClosing) stack.push({ transparent: true, children: [] });
            continue;
        }

        const idMatch = /\bid\s*=\s*"([^"]*)"/.exec(attrText);
        const classMatch = /\bclass\s*=\s*"([^"]*)"/.exec(attrText);
        const textMatch = /\btext\s*=\s*"([^"]*)"/.exec(attrText);
        const node = {
            tag,
            id: idMatch ? idMatch[1] : "",
            classes: classMatch ? classMatch[1].trim().split(/\s+/).filter(Boolean) : [],
            text: textMatch ? textMatch[1] : "",
            children: [],
        };

        top().children.push(node);
        if (!selfClosing) stack.push(node);
    }

    // Unclosed transparent frames still hold panels; do not lose them.
    while (stack.length > 1) {
        const frame = stack.pop();
        if (frame.transparent) {
            for (const child of frame.children) top().children.push(child);
        }
    }

    return roots;
}

/** Count panels in a parsed node list. */
function countNodes(nodes) {
    let n = 0;
    for (const node of nodes) n += 1 + countNodes(node.children);
    return n;
}

/**
 * Materialize parsed nodes as simulator Panels under `parent`.
 *
 * `suffix` disambiguates ids when a layout is instantiated more than once. In
 * the engine, twelve top-bar players genuinely DO carry the same ids in twelve
 * separate subtrees, and FindChildTraverse returns the first. Reproducing that
 * exactly would make every duplicate id fire the simulator's duplicate-id
 * warning and drown the signal, and would also mean a lookup for a per-player
 * id always resolves to player 0 — which is what the engine does, so it is the
 * honest default. `dedupeIds: true` (used for non-player layouts) appends the
 * suffix instead, for cases where we want distinct addressable panels.
 */
function materialize(doc, parent, nodes, { suffix = "", dedupeIds = false } = {}) {
    const created = [];
    for (const node of nodes) {
        const id = node.id && dedupeIds && suffix ? node.id + suffix : node.id;
        const panel = doc.create(node.tag, { id, classes: node.classes, text: node.text });
        parent.addChild(panel);
        created.push(panel);
        if (node.children.length > 0) materialize(doc, panel, node.children, { suffix, dedupeIds });
    }
    return created;
}

/**
 * Build the in-match HUD under `doc.root` (the Hud panel).
 *
 * @param {Document} doc
 * @param {object}   opts
 * @param {number}   [opts.players=12]        top-bar player panels
 * @param {number}   [opts.damageNumbers=24]  floating combat text panels
 * @param {number}   [opts.dataFeed=6]        kill-feed entries
 * @param {number}   [opts.chatLines=8]
 * @returns {{panels:number, notes:string[], byLayout:object}}
 */
function buildMatchHud(doc, { players = 12, damageNumbers = 24, dataFeed = 6, chatLines = 8 } = {}) {
    const notes = [];
    const byLayout = {};
    const hud = doc.root;

    /** Resolve a mount id, falling back to the Hud root with a note. */
    const mountFor = (id) => {
        if (!id || id === "Hud") return hud;
        const found = hud.FindChildTraverse(id);
        if (found) return found;
        notes.push(`mount "${id}" not found — attached to Hud root instead`);
        return hud;
    };

    for (const spec of COMPOSITION) {
        const dir = spec.mod ? MOD_LAYOUT : VANILLA_LAYOUT;
        const xml = readSafe(path.join(dir, spec.file));
        if (xml === null) {
            notes.push(`layout not found: ${spec.mod ? "mod" : "vanilla"}/${spec.file}`);
            continue;
        }
        const nodes = parseLayout(xml);
        const per = countNodes(nodes);
        if (per === 0) {
            notes.push(`layout parsed to zero panels: ${spec.file} (parser or file problem)`);
            continue;
        }
        const count = spec.file === "citadel_hud_top_bar_player.xml" ? players : spec.count || 1;
        const parent = mountFor(spec.mount);
        const isPlayer = spec.file === "citadel_hud_top_bar_player.xml";
        for (let i = 0; i < count; i++) {
            // Per-player subtrees keep their real (duplicated) ids because that
            // is what the engine does: twelve top-bar players carry the same ids
            // in twelve sibling subtrees and FindChildTraverse returns the first.
            const created = materialize(doc, parent, nodes, {
                suffix: count > 1 ? `_${i}` : "",
                dedupeIds: count > 1 && !isPlayer,
            });
            // Stamp the engine-assigned per-player id on the subtree root.
            //
            // 1-BASED, from a captured live tree (2026-08-21): the engine creates
            // TopBarPlayer1..TopBarPlayer12 for a 6v6 match and there is no
            // TopBarPlayer0. Modelling these 0-based was not a harmless off-by-one — it
            // made the profiler blame slot 12 for the wasted full-tree walk when the
            // real dead slot is 0, and a perf fix was aimed at the wrong index as a
            // result. The mod loops 0..12, so with correct numbering the model now
            // reproduces the real miss.
            if (isPlayer && created.length > 0) created[0].id = PLAYER_PANEL_ID_PREFIX + (i + 1);
        }
        byLayout[spec.file] = { perInstance: per, instances: count, total: per * count };
    }

    // Engine-created containers, but only where a layout did not already declare
    // one. Creating a second #gameplay_hud would silently fork the tree.
    for (const spec of EXTRA_RUNTIME_PANELS) {
        if (hud.FindChildTraverse(spec.id)) continue;
        notes.push(`engine container "${spec.id}" absent from layouts — synthesized`);
        const parent = mountFor(spec.mount);
        parent.addChild(doc.create("Panel", { id: spec.id, classes: [] }));
    }

    // Dynamic, engine-created content that has no layout file of its own but is
    // present in quantity during a fight. These inflate the tree exactly where a
    // teamfight inflates it, which is the point.
    const feedbackParent = mountFor("gameplay_hud");
    for (let i = 0; i < damageNumbers; i++) {
        const p = doc.create("Panel", { id: "", classes: ["DamageFeedbackEntry"] });
        feedbackParent.addChild(p);
        p.addChild(doc.create("Label", { id: "", classes: ["DamageNumber"], text: "42" }));
    }
    for (let i = 0; i < dataFeed; i++) {
        const p = doc.create("Panel", { id: "", classes: ["DataFeedEntry"] });
        feedbackParent.addChild(p);
        for (let j = 0; j < 4; j++) p.addChild(doc.create("Panel", { id: "", classes: ["DataFeedIcon"] }));
    }
    for (let i = 0; i < chatLines; i++) {
        const p = doc.create("Panel", { id: "", classes: ["ChatMessage"] });
        feedbackParent.addChild(p);
        p.addChild(doc.create("Label", { id: "", classes: ["ChatText"], text: "gg" }));
    }

    // Count what we actually built.
    let panels = 0;
    const stack = [hud];
    while (stack.length > 0) {
        const n = stack.pop();
        panels++;
        for (const c of n._children) stack.push(c);
    }

    return { panels, notes, byLayout };
}

/**
 * Rebuild a full per-panel tree captured from a live match instead of modelling one.
 *
 * Takes the full hierarchy JSON that scripts/import_tree_dump.js produces from
 * a per-panel dump of a sufficiently small subtree and materialises it under
 * doc.root. The usual Dev Panel summary has no ancestry and is rejected.
 * The point is to remove our guesses from the measurement: buildMatchHud below
 * composes layout XML plus hand-written assumptions about what C++ creates, and
 * those assumptions have been wrong by more than an order of magnitude in both
 * directions (see docs/PROFILING.md).
 *
 * The capture's own root becomes doc.root — its id and classes are copied onto it
 * rather than mounted beneath it, because in-engine #Hud IS the context panel and
 * several features depend on that.
 *
 * Any warning recorded at import time is surfaced here as a note, so a truncated or
 * depth-clipped capture cannot quietly become a trusted baseline.
 */
function buildCapturedHud(doc, captured) {
    const notes = [];
    if (!captured || captured.kind === "summary" || !captured.root ||
        typeof captured.root !== "object" || Array.isArray(captured.root)) {
        throw new Error("[hud_tree] a full per-panel tree is required; aggregate summaries contain no ancestry");
    }

    for (const w of captured.warnings || []) notes.push(`capture warning: ${w}`);
    if (captured.meta && captured.meta.truncated) {
        notes.push("capture was truncated — real tree is larger, treat counts as a floor");
    }
    if (captured.meta && captured.meta.clipped) {
        notes.push("capture was depth-clipped — deep subtrees are missing");
    }

    const hud = doc.root;
    if (captured.root.id) hud.id = captured.root.id;
    for (const cls of captured.root.classes || []) hud.AddClass(cls);

    let panels = 1;
    // Iterative to survive a deep real tree without blowing the JS stack.
    const stack = [[captured.root, hud]];
    while (stack.length > 0) {
        const [node, parent] = stack.pop();
        for (const child of node.children || []) {
            const panel = parent.addChild(
                doc.create(child.type || "Panel", { id: child.id || "", classes: child.classes || [] })
            );
            panels++;
            if (child.children && child.children.length > 0) stack.push([child, panel]);
        }
    }

    return { panels, notes, byLayout: { captured: panels } };
}

module.exports = { buildMatchHud, buildCapturedHud, parseLayout, countNodes, COMPOSITION };
