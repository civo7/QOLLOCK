// Declarative minimap contrasts and evidence checks. The external analyzer uses
// the same data contract; nothing here samples UI cadence or changes settings.
(() => {
    "use strict";
    const owners = ["ql_minimap_runtime", "ql_minimap_loot"];
    const [runtime, loot] = owners;
    const source = "panorama/scripts/manifests/";
    const state = (patch = {}) => ({ ownersOff: [], pausedPolls: [],
        runtime: { hideRoot: false, hideTunnel: false, skipSweep: false, releaseGeometry: false, releaseDecoration: false,
            releasePlacement: false, releaseViewport: false, releaseNativeTargets: [], releaseGeometryRoles: [], composition: "cache", ...patch.runtime },
        loot: { hideRoot: false, hideGroups: [], skipSweep: false, composition: "cache", ...patch.loot },
        ...Object.fromEntries(Object.entries(patch).filter(([key]) => key !== "runtime" && key !== "loot")) });
    const frozen = patch => state({ ...patch, pausedPolls: owners.slice() });
    const conditions = [];
    const add = (id, a, b, file, symbol, question, extra = {}) => conditions.push({ id, a, b,
        source: { file: source + file, symbol }, question, ...extra });
    add("sham", state(), state(), "ql_minimap_runtime/manifest.js", "update", "A/A process and scene noise; no feature intervention");
    for (const [suffix, ids] of [["runtime", [runtime]], ["loot", [loot]], ["both", owners]]) {
        add("owners-" + suffix, state(), state({ ownersOff: ids }), suffix === "loot" ? "ql_minimap_loot/manifest.js" : "ql_minimap_runtime/manifest.js", "onDisable", "Whole-owner intervention, including lifecycle/native overrides; not an isolated rendering cost");
        add("polls-" + suffix, state(), state({ pausedPolls: ids }), suffix === "loot" ? "ql_minimap_loot/manifest.js" : "ql_minimap_runtime/manifest.js", "update", "Managed callback bodies, including synchronous native calls; scheduled ticks remain");
        add("sweep-" + suffix, state(), state({ runtime: { skipSweep: ids.includes(runtime) }, loot: { skipSweep: ids.includes(loot) } }), suffix === "loot" ? "ql_minimap_loot/manifest.js" : "ql_minimap_runtime/manifest.js", "tree.sweep", "Ownership sweep contribution within otherwise running updates; diagnostic-only lifetime checks skipped");
    }
    for (const [suffix, r, l] of [["crates", true, false], ["loot", false, true], ["both", true, true]]) {
        add("static-" + suffix, frozen(), frozen({ runtime: { hideRoot: r }, loot: { hideRoot: l } }), r ? "ql_minimap_runtime/manifest.js" : "ql_minimap_loot/manifest.js", r ? "renderCrates" : "update", "Visible retained roots with both callback bodies paused; includes affected layout/composition");
    }
    add("polls-hidden", state({ runtime: { hideRoot: true }, loot: { hideRoot: true } }), frozen({ runtime: { hideRoot: true }, loot: { hideRoot: true } }), "ql_minimap_runtime/manifest.js", "update", "Poll-body effect conditional on both static roots being hidden");
    for (const [id, group] of [["tough", "tough_crates"], ["snacks", "snacks"], ["statues", "statues"], ["names", "names"], ["routes", "runs"]]) {
        add("layer-" + id, frozen(), frozen({ loot: { hideGroups: [group] } }), "ql_minimap_loot/manifest.js", "plans(" + group + ") / build", "One retained content group, without deleting panels or disabling its owner");
    }
    add("layer-tunnel", frozen(), frozen({ runtime: { hideTunnel: true } }), "ql_minimap_runtime/manifest.js", "renderTunnel", "Viewport tunnel branch; outside the two static roots");
    for (const [id, g, d] of [["geometry", true, false], ["decoration", false, true], ["presentation", true, true]]) {
        add(id, frozen(), frozen({ runtime: { releaseGeometry: g, releaseDecoration: d } }), id === "geometry" ? "ql_minimap_runtime/geometry.js" : "ql_minimap_runtime/manifest.js", id === "geometry" ? "apply / release" : "renderNativeDecoration", "Release feature-owned native presentation while retaining created content; other owners/root CSS remain");
    }
    add("retention", frozen({ runtime: { hideRoot: true, hideTunnel: true, releaseGeometry: true, releaseDecoration: true }, loot: { hideRoot: true } }), state({ ownersOff: owners }), "ql_minimap_runtime/manifest.js", "releasePresentation / releaseOverlays", "Retention/scheduling and remaining intervention gap after hiding created branches and releasing native presentation; not pure tree memory cost");
    for (const policy of ["layer", "none"]) add("cache-" + policy, frozen(), frozen({ runtime: { composition: policy }, loot: { composition: policy } }), "ql_minimap_runtime/manifest.js", "renderCrates; ql_minimap_loot update", "Requested creation-time composition policy; trees rebuilt and warmed outside steady-state windows");
    for (const owner of ["runtime", "loot"]) for (const policy of ["layer", "none"]) add("cache-" + owner + "-" + policy,
        frozen(), frozen({ [owner]: { composition: policy } }), "ql_minimap_" + owner + "/manifest.js", "compositionProperties / update",
        "Requested composition policy for only the " + owner + " root; the other root retains its production cache policy");
    for (const target of ["renderer", "mapRender", "backgrounds", "canvas", "ranges"]) {
        add("native-" + target.toLowerCase(), frozen(), frozen({ runtime: { releaseNativeTargets: [target] } }), "ql_minimap_runtime/manifest.js", "renderNativeDecoration",
            "Release only the active " + target + " native override group; changes presentation, not proof of redundant code", { requiresTarget: target, presentationConfound: true });
    }
    for (const [id, control] of [["geometry-placement", "releasePlacement"], ["geometry-viewport", "releaseViewport"]]) {
        add(id, frozen(), frozen({ runtime: { [control]: true } }), "ql_minimap_runtime/geometry.js", "apply",
            "Release " + id + " as one coherent group; native size/placement/visible workload may change", { presentationConfound: true });
    }
    for (const role of ["host", "viewport", "frame", "nativeContainer", "renderer"]) {
        add("geometry-role-" + role.toLowerCase(), frozen(), frozen({ runtime: { releaseGeometryRoles: [role] } }), "ql_minimap_runtime/geometry.js", "apply",
            "Selectable structural intervention in one native panel role; may break coherent geometry/clipping. A speedup does not justify deleting the override",
            { optional: true, requiresRole: role, presentationConfound: true });
    }

    const create = (selectedIds = []) => {
        if (!Array.isArray(selectedIds) || selectedIds.some(id => !conditions.some(row => row.id === id))) throw Error("unknown minimap condition ID");
        const selected = conditions.filter(row => (!selectedIds.length && !row.optional) || row.id === "sham" || selectedIds.includes(row.id));
        const blocks = [];
        for (let repeat = 0; repeat < 3; repeat++) {
            const probes = selected.filter(row => row.id !== "sham");
            const offset = probes.length ? repeat * Math.max(1, Math.floor(probes.length / 3)) % probes.length : 0;
            const order = [selected.find(row => row.id === "sham"), ...probes.slice(offset), ...probes.slice(0, offset)];
            for (const row of order) blocks.push({ trial: blocks.length + 1, conditionId: row.id, repeat,
                order: repeat % 2 ? ["B", "A", "A", "B"] : ["A", "B", "B", "A"] });
        }
        return JSON.parse(JSON.stringify({ kind: "minimap-suite", conditions: selected, blocks,
            omitted: conditions.filter(row => !selected.includes(row)).map(row => row.id),
            available: conditions.filter(row => !selected.includes(row)),
            settleMs: 1000, sampleMs: 2000, deadlineMs: 1800000,
            scope: "One observed stable native minimap view; other views and camera/world-state stability are not proven." }));
    };
    const stable = value => {
        if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
        if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
        return JSON.stringify(value);
    };
    const verify = (expected, evidence) => {
        const errors = [];
        if (stable(evidence.applied) !== stable(expected)) errors.push("state vector mismatch");
        if (JSON.stringify(evidence.pausedPolls) !== JSON.stringify(expected.pausedPolls)) errors.push("poll pause mismatch");
        for (const id of owners) {
            const off = expected.ownersOff.includes(id), actual = evidence.owners[id];
            if (!actual || actual.enabled === off) { errors.push(id + " enable state mismatch"); continue; }
            if (off) {
                const retired = actual.retirement;
                if (!retired?.inactive || !retired.tree || (id === runtime && (!retired.geometry || !retired.decoration))) errors.push(id + " retirement/cleanup pending");
                continue;
            }
            const wanted = id === runtime ? expected.runtime : expected.loot;
            if (stable(actual.controls) !== stable(wanted)) errors.push(id + " controls mismatch");
            if (!actual.native?.present || !actual.root?.present || actual.root.parentIdentity !== actual.native.identity) errors.push(id + " root missing/moved");
            if (actual.root?.visible !== !wanted.hideRoot) errors.push(id + " local root visibility mismatch");
            if (!wanted.hideRoot && !(Number.isFinite(actual.root?.width) && actual.root.width > 0 && Number.isFinite(actual.root?.height) && actual.root.height > 0)) errors.push(id + " native layout unavailable/zero");
            if (actual.composition !== wanted.composition) errors.push(id + " creation policy mismatch");
            if (id === runtime) {
                if (!actual.reconciled?.geometry || !actual.reconciled?.decoration) errors.push("native geometry/decoration application/readback incomplete");
                if (!actual.counts?.expected || actual.counts.total !== actual.counts.expected || actual.markers?.children !== actual.counts.expected || actual.markers?.parentIdentity !== actual.root?.identity) errors.push(id + " incomplete crate tree");
                if (!actual.tunnel?.present || actual.tunnel.visible !== !wanted.hideTunnel || actual.tunnel.parentIdentity !== actual.geometry?.anchor?.identity) errors.push("tunnel missing/moved/visibility mismatch");
                if (wanted.releaseGeometry && !actual.released?.geometry) errors.push("geometry release pending");
                if (wanted.releaseDecoration && !actual.released?.decoration) errors.push("native decoration release pending");
                if ((wanted.releasePlacement || wanted.releaseViewport || wanted.releaseGeometryRoles?.length) && !actual.released?.geometry) errors.push("partial geometry change pending");
                for (const target of wanted.releaseNativeTargets || []) if (!actual.decoration?.releaseResults?.[target]) errors.push(target + " release pending");
            } else {
                for (const group of ["tough_crates", "snacks", "statues", "names", "runs"]) {
                    const item = actual.groups?.[group];
                    if (!item?.present || !item.expected || item.children !== item.expected || item.parentIdentity !== actual.root?.identity) errors.push(group + " missing/incomplete");
                    if (item?.visible !== !wanted.hideGroups.includes(group)) errors.push(group + " visibility mismatch");
                }
            }
        }
        return errors;
    };
    QOL.core.MinimapPlan = { create, verify, owners: owners.slice() };
})();
