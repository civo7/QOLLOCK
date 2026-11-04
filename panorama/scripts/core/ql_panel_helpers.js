// =============================================================================
// QOLLOCK — core/ql_panel_helpers.js
// =============================================================================
// OWNS:        Safe panel utility functions: isPanelAlive, findHud, syncStyles,
//              safeCreatePanel, safeDeletePanel, setClass, setVisible and
//              ownership of attempted native styles/classes and exclusively
//              QOL-created trees.
//              isPanelAlive uses typeof check (not truthy) — mandatory for
//              correct destroyed-panel detection.
// DOES NOT OWN: Panel caching (PanelCache), feature lifecycle (FeatureRegistry)
// DEPENDS ON:  core/ql_namespace.js (QOL.core, QOL.ui)
// USED BY:     Feature manifests, settings renderer
// LOAD ORDER:  5th — after ql_scheduler.js
//
// Boundary validation: Checks QOL.core and QOL.ui exist.
// =============================================================================

(() => {
    "use strict";

    if (!QOL || !QOL.core || !QOL.ui) {
        if (typeof $ !== "undefined" && $.Msg) {
            $.Msg("[QOLLock] core/ql_panel_helpers: namespace not found — aborting. " +
                  "Is core/ql_namespace.js loaded first?");
        }
        return;
    }

    // -- Panel safety --
    const isPanelAlive = QOL_UTILS.IsPanelValid;

    const safeCreatePanel = (type, parent, id, properties) => {
        if (!isPanelAlive(parent) || typeof type !== "string" || !type) return null;
        try {
            if (properties) {
                return $.CreatePanel(type, parent, id || "", properties);
            }
            return $.CreatePanel(type, parent, id || "");
        } catch (e) {
            $.Msg(`[QOLLock][WARN][PanelHelpers] CreatePanel('${type}') threw: ${e && e.message ? e.message : String(e)}`);
            return null;
        }
    };

    const safeDeletePanel = (panel) => {
        if (!isPanelAlive(panel)) return;
        try {
            panel.DeleteAsync(0);
        } catch (_) {
            /* panel may already be destroyed */
        }
    };

    // -- Hud resolution --
    let _cachedHud = null;
    let _cachedHudContext = null;

    const findHud = (preferredRoot) => {
        const MAX_DEPTH = 64;
        try {
            const ctx = preferredRoot || $.GetContextPanel();
            if (!isPanelAlive(ctx)) return null;
            if (!preferredRoot && ctx === _cachedHudContext && isPanelAlive(_cachedHud)) return _cachedHud;
            if (!preferredRoot) { _cachedHud = null; _cachedHudContext = ctx; }
            if (ctx.id === "Hud" || ctx.paneltype === "CitadelHud") {
                if (!preferredRoot) _cachedHud = ctx;
                return ctx;
            }
            let hud = ctx.FindChild ? ctx.FindChild("Hud") : null;
            if (!isPanelAlive(hud)) hud = ctx.FindChildTraverse ? ctx.FindChildTraverse("Hud") : null;
            if (isPanelAlive(hud)) {
                if (!preferredRoot) _cachedHud = hud;
                return hud;
            }
            let absRoot = ctx;
            let depth = 0;
            while (depth < MAX_DEPTH) {
                const parent = absRoot.GetParent ? absRoot.GetParent() : null;
                if (!parent || !isPanelAlive(parent)) break;
                absRoot = parent;
                depth++;
            }
            if (absRoot && (absRoot.id === "Hud" || absRoot.paneltype === "CitadelHud")) {
                if (!preferredRoot) _cachedHud = absRoot;
                return absRoot;
            }
            hud = (absRoot && absRoot.FindChildTraverse) ? absRoot.FindChildTraverse("Hud") : null;
            if (isPanelAlive(hud)) {
                if (!preferredRoot) _cachedHud = hud;
                return hud;
            }
            if (ctx.id === "Hud" || ctx.paneltype === "CitadelHud" || (ctx.BHasClass && ctx.BHasClass("WindowRoot"))) {
                return ctx;
            }
            // A temporary menu/loading root must not mask a HUD created later.
            return absRoot || ctx;
        } catch (_) {
            return null;
        }
    };

    // -- Class helpers --
    const setClass = (panel, className, active) => {
        if (!isPanelAlive(panel) || typeof className !== "string" || !className) return false;
        try {
            const has = panel.BHasClass(className);
            if (active && !has) {
                panel.SetHasClass(className, true);
                return true;
            }
            if (!active && has) {
                panel.SetHasClass(className, false);
                return true;
            }
        } catch (e) {
            $.Msg(`[QOLLock][WARN][PanelHelpers] setClass('${className}') threw: ${e && e.message ? e.message : String(e)}`);
        }
        return false;
    };

    const setVisible = (panel, visible) => {
        if (!isPanelAlive(panel)) return;
        try {
            panel.visible = Boolean(visible);
        } catch (_) {}
    };

    // -- Style helpers --
    const syncStyles = (panel, styles, lastSig) => {
        if (!isPanelAlive(panel) || typeof styles !== "object" || !styles) {
            return { changed: false, sig: lastSig || "" };
        }
        const parts = [];
        for (const prop of Object.keys(styles)) {
            parts.push(`${prop}=${styles[prop]}`);
        }
        const sig = parts.join(";");
        if (sig === lastSig) return { changed: false, sig };
        let succeeded = true;
        for (const prop of Object.keys(styles)) {
            try {
                panel.style[prop] = styles[prop];
            } catch (_) { succeeded = false; }
        }
        // Never cache a partial write as applied: the next call must retry.
        return { changed: true, sig: succeeded ? sig : null };
    };

    const nativeStylePropertyName = QOL_UTILS.NativeStylePropertyName;
    const clearStyleProperty = (panel, prop) => {
        if (!isPanelAlive(panel) || typeof prop !== "string") return false;
        try {
            return panel.ClearPropertyFromCode(nativeStylePropertyName(prop)) !== false;
        } catch (_) {
            return false;
        }
    };

    const nativeStyleLeases = new Map();
    const nativeClassBaselines = new Map();
    const nativeCodeBaselines = new Map();
    const compositeCodeBaselines = new Map();
    const compositeComponents = {
        "style:font": ["fontSize", "fontFamily", "fontWeight", "fontStyle"],
        "style:margin": ["marginLeft", "marginRight", "marginTop", "marginBottom"]
    };
    const styleKey = property => "style:" + nativeStylePropertyName(property);
    const positionKeys = ["style:x", "style:y", "style:position"];
    // Own only attempted code properties/classes; native discovery and lifetime
    // remain with each caller. Rejected cleanup stays recorded for the next pass.
    const createNativeStyleOwner = ({ resetValues = {}, releasePosition = true, preserveClasses = false, preserveStyles = [] } = {}) => {
        const records = new Map();
        const resets = { ...resetValues };
        const preserved = new Set(preserveStyles.map(styleKey));
        const identity = {};
        let pending = null, generation = 0;
        const claim = (panel, key, property) => {
            if (compositeComponents[key]) {
                if (!compositeCodeBaselines.has(panel)) compositeCodeBaselines.set(panel, new Map());
                const groups = compositeCodeBaselines.get(panel);
                if (!groups.has(key)) {
                    const values = new Map();
                    for (const component of compositeComponents[key]) {
                        const value = panel.style[component];
                        if (value !== undefined && value !== null && value !== "") values.set(component, value);
                    }
                    groups.set(key, { values, owned: new Set() });
                }
                const fields = groups.get(key).owned;
                if (key === "style:" + property) {
                    for (const component of compositeComponents[key]) fields.add(component);
                } else fields.add(property.replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
            }
            if (!nativeStyleLeases.has(panel)) nativeStyleLeases.set(panel, new Map());
            nativeStyleLeases.get(panel).set(key, identity);
        };
        const held = (panel, key) => nativeStyleLeases.get(panel)?.get(key) === identity;
        const foreignPosition = panel => positionKeys.some(key => {
            const owner = nativeStyleLeases.get(panel)?.get(key);
            return owner && owner !== identity;
        });
        const drop = (panel, key) => {
            const leases = nativeStyleLeases.get(panel);
            if (leases?.get(key) === identity) {
                leases.delete(key);
                const code = nativeCodeBaselines.get(panel);
                code?.delete(key);
                if (code && !code.size) nativeCodeBaselines.delete(panel);
                const groups = compositeCodeBaselines.get(panel);
                groups?.delete(key);
                if (groups && !groups.size) compositeCodeBaselines.delete(panel);
                if (key.startsWith("class:")) {
                    const baselines = nativeClassBaselines.get(panel);
                    baselines?.delete(key);
                    if (baselines && !baselines.size) nativeClassBaselines.delete(panel);
                }
            }
            if (leases && !leases.size) nativeStyleLeases.delete(panel);
        };
        const cancelCleanup = () => {
            generation++;
            if (pending !== null) {
                try { $.CancelScheduled(pending); } catch (_) {}
                pending = null;
            }
        };
        const baseline = (panel, property) => {
            const key = styleKey(property);
            if (!isPanelAlive(panel) || !preserved.has(key)) return "";
            const values = nativeCodeBaselines.get(panel);
            if (values?.has(key)) return values.get(key);
            const current = panel.style[property];
            const value = current === null || current === undefined ? "" : String(current);
            return key === "style:transform" && value === "none" ? "" : value;
        };
        const clearProperty = (panel, record, property) => {
            try {
                const key = styleKey(property);
                if (property === "position" && held(panel, key)) {
                    const neutral = Object.prototype.hasOwnProperty.call(resets, property) ? resets[property] : null;
                    const components = neutral === null ? [] : String(neutral).trim().split(/\s+/);
                    if (!foreignPosition(panel)) {
                        if (neutral !== null) panel.style.position = neutral;
                        for (const [index, axis] of ["x", "y"].entries()) {
                            if (components[index]) panel.style[axis] = components[index];
                            if (!clearStyleProperty(panel, axis)) return false;
                        }
                        if (!clearStyleProperty(panel, "position")) return false;
                    } else {
                        // A newer owner may take only one component of a prior
                        // compound write. Release the remaining components
                        // individually, preserving the newer owner's coordinate.
                        for (const [index, axis] of ["x", "y"].entries()) {
                            if (!held(panel, styleKey(axis))) continue;
                            if (components[index]) panel.style[axis] = components[index];
                            if (!clearStyleProperty(panel, axis)) return false;
                        }
                    }
                    for (const positionKey of positionKeys) drop(panel, positionKey);
                } else if (held(panel, key)) {
                    const original = preserved.has(key) ? baseline(panel, property) : "";
                    if (original) panel.style[property] = original;
                    else {
                        for (const component of record.properties) {
                            if (styleKey(component) === key && !record.wantedProperties.has(component) &&
                                Object.prototype.hasOwnProperty.call(resets, component)) panel.style[component] = resets[component];
                        }
                        if (!clearStyleProperty(panel, property)) return false;
                        const group = compositeCodeBaselines.get(panel)?.get(key);
                        if (group) {
                            // Component setters share one native code slot. Keep
                            // original code fields never claimed by these owners.
                            for (const [component, value] of group.values) {
                                if (!group.owned.has(component)) panel.style[component] = value;
                            }
                        }
                    }
                    // An axis assignment and position share native storage.
                    // Clear the aggregate only after the last desired axis,
                    // respecting component leases held by other owners.
                    if (releasePosition && (property === "x" || property === "y") &&
                        !record.wantedProperties.has("x") && !record.wantedProperties.has("y") &&
                        !record.wantedProperties.has("position") && !foreignPosition(panel) &&
                        !clearStyleProperty(panel, "position")) return false;
                }
                drop(panel, key);
                for (const component of record.properties) {
                    if (styleKey(component) === key && !record.wantedProperties.has(component)) record.properties.delete(component);
                }
                record.signature = null;
                return true;
            } catch (_) { return false; }
        };
        const reconcileClass = (panel, name, value) => {
            setClass(panel, name, value);
            try { return panel.BHasClass(name) === value; } catch (_) { return false; }
        };
        const cleanup = (panel) => {
            const record = records.get(panel);
            if (!record) return true;
            if (!isPanelAlive(panel)) { records.delete(panel); nativeStyleLeases.delete(panel); nativeClassBaselines.delete(panel); nativeCodeBaselines.delete(panel); compositeCodeBaselines.delete(panel); return true; }
            let complete = true;
            const attempted = new Set();
            for (const property of record.properties) {
                const key = styleKey(property);
                if (record.wantedProperties.has(property) || attempted.has(key)) continue;
                attempted.add(key);
                if (!clearProperty(panel, record, property)) complete = false;
            }
            for (const name of record.classes) {
                if (record.wantedClasses.has(name)) continue;
                const key = "class:" + name;
                if (!held(panel, key) || reconcileClass(panel, name, record.classBaselines.get(name))) {
                    record.classes.delete(name); drop(panel, key);
                    record.classBaselines.delete(name);
                } else complete = false;
            }
            if (!record.properties.size && !record.classes.size) records.delete(panel);
            return complete;
        };
        const retryCleanup = () => {
            if (pending !== null || typeof $.Schedule !== "function") return;
            const token = generation;
            pending = $.Schedule(0.25, () => {
                if (token !== generation) return;
                pending = null;
                let complete = true;
                for (const panel of records.keys()) if (!cleanup(panel)) complete = false;
                if (!complete) retryCleanup();
            });
        };
        const release = (panel) => {
            const record = records.get(panel);
            if (!record) return true;
            record.settled = false;
            record.wantedProperties.clear(); record.wantedClasses.clear();
            return cleanup(panel);
        };
        const apply = (panel, styles, classes = {}) => {
            if (!isPanelAlive(panel)) { release(panel); return false; }
            let record = records.get(panel);
            let validatedStyles = false, previous;

            // Settled maps validate ownership/native feedback without key arrays.
            if (record?.settled) {
                try {
                    let match = true;
                    let sCount = 0;
                    for (const prop in styles) {
                        if (!Object.prototype.hasOwnProperty.call(styles, prop)) continue;
                        if (!Object.prototype.hasOwnProperty.call(record.styles, prop) || record.styles[prop] !== styles[prop] ||
                            (prop === "position" ? !positionKeys.every(k => held(panel, k)) : !held(panel, styleKey(prop))) ||
                            panel.style[prop] !== record.readback.get(prop)) {
                            match = false;
                            break;
                        }
                        sCount++;
                    }
                    if (match && sCount === record.properties.size) {
                        previous = record.signature;
                        validatedStyles = true;
                        let cCount = 0;
                        for (const cls in classes) {
                            if (!Object.prototype.hasOwnProperty.call(classes, cls)) continue;
                            const val = !!classes[cls];
                            if (!Object.prototype.hasOwnProperty.call(record.classValues, cls) || record.classValues[cls] !== val || !held(panel, "class:" + cls) ||
                                panel.BHasClass(cls) !== (record.classBaselines.get(cls) || val)) {
                                match = false;
                                break;
                            }
                            cCount++;
                        }
                        if (match && cCount === record.classes.size) {
                            return true;
                        }
                    } else {
                        previous = null;
                        validatedStyles = true;
                    }
                } catch (_) {
                    // A retiring native panel may reject feedback temporarily.
                    previous = null;
                    validatedStyles = true;
                }
            }

            const properties = Object.keys(styles);
            const names = Object.keys(classes);
            if (!record && !properties.length && !names.length) return true;
            if (!record) {
                record = { properties: new Set(), classes: new Set(), classBaselines: new Map(), wantedProperties: new Set(), wantedClasses: new Set(), signature: null, readback: new Map() };
                records.set(panel, record);
            }
            record.settled = false;
            record.wantedProperties.clear();
            for (let i = 0; i < properties.length; i++) record.wantedProperties.add(properties[i]);
            record.wantedClasses.clear();
            for (let i = 0; i < names.length; i++) record.wantedClasses.add(names[i]);
            let complete = cleanup(panel);
            if (!complete) retryCleanup();
            records.set(panel, record);
            for (const name of names) {
                const key = "class:" + name;
                // Carry the original baseline through instance handoffs, including
                // when a prior cleanup was rejected. Never sample its own override.
                if (!nativeClassBaselines.has(panel)) nativeClassBaselines.set(panel, new Map());
                const baselines = nativeClassBaselines.get(panel);
                if (!baselines.has(key)) {
                    let baseline = false;
                    try { baseline = preserveClasses && panel.BHasClass(name); } catch (_) {}
                    baselines.set(key, baseline);
                }
                const baseline = preserveClasses && baselines.get(key);
                record.classBaselines.set(name, !!baseline);
                record.classes.add(name);
                claim(panel, key);
                if (!reconcileClass(panel, name, !!baseline || !!classes[name])) complete = false;
            }
            if (!validatedStyles) {
                previous = record.signature;
                try {
                    for (const property of properties) {
                        const leased = property === "position" ? positionKeys.every(key => held(panel, key)) : held(panel, styleKey(property));
                        if (!leased || panel.style[property] !== record.readback.get(property)) previous = null;
                    }
                } catch (_) { previous = null; }
            }
            // Record ownership before a partial native write can fail.
            for (const property of properties) {
                const key = styleKey(property);
                if (preserved.has(key)) {
                    const original = baseline(panel, property);
                    if (!nativeCodeBaselines.has(panel)) nativeCodeBaselines.set(panel, new Map());
                    nativeCodeBaselines.get(panel).set(key, original);
                }
                record.properties.add(property);
                if (property === "position") for (const key of positionKeys) claim(panel, key);
                else claim(panel, styleKey(property), property);
            }
            const result = syncStyles(panel, styles, previous);
            record.signature = result.sig;
            if (record.signature === null) complete = false;
            else if (result.changed) {
                record.readback.clear();
                try {
                    for (const property of properties) record.readback.set(property, panel.style[property]);
                } catch (_) { record.signature = null; complete = false; }
            }
            if (!record.properties.size && !record.classes.size) records.delete(panel);
            if (complete) {
                record.styles = { ...styles };
                record.classValues = Object.fromEntries(names.map(name => [name, !!classes[name]]));
                record.settled = true;
            }
            return complete;
        };
        const retain = (panels) => {
            const current = new Set(panels);
            let complete = true;
            for (const panel of records.keys()) if (!current.has(panel) && !release(panel)) complete = false;
            if (!complete) retryCleanup();
            else if (!records.size) cancelCleanup();
            return complete;
        };
        const clear = () => retain([]);
        // Read-only diagnostic checks; no writes or cleanup retries.
        const verify = () => {
            try {
                for (const [panel, record] of records) {
                    if (!isPanelAlive(panel) || !record.settled) return false;
                    for (const property of record.wantedProperties) {
                        const leased = property === "position" ? positionKeys.every(key => held(panel, key)) : held(panel, styleKey(property));
                        if (!leased || panel.style[property] !== record.readback.get(property)) return false;
                    }
                    for (const name of record.wantedClasses) if (!held(panel, "class:" + name) || panel.BHasClass(name) !== (record.classBaselines.get(name) || !!record.classValues[name])) return false;
                }
                return true;
            } catch (_) { return false; }
        };
        return { apply, retain, clear, baseline, verify, isReleased: () => records.size === 0 };
    };

    const findRoot = (panel) => {
        try {
            let curr = panel || $.GetContextPanel();
            if (!isPanelAlive(curr)) return null;
            while (curr.GetParent) {
                const parent = curr.GetParent();
                if (!isPanelAlive(parent)) break;
                curr = parent;
            }
            return curr;
        } catch (_) { return null; }
    };

    const activate = (panel) => {
        if (!isPanelAlive(panel)) return false;
        try {
            $.DispatchEvent("Activated", panel, "mouse");
            return true;
        } catch (_) {}
        try {
            $.DispatchEvent("Activated", panel);
            return true;
        } catch (_) {}
        return false;
    };

    const isVisible = (panel) => {
        if (!isPanelAlive(panel)) return false;
        try {
            if (panel.visible === false || panel.visible === "false") return false;
            if (panel.BHasClass && (panel.BHasClass("hidden") || panel.BHasClass("Hidden") || panel.BHasClass("Collapsed"))) {
                return false;
            }
            return true;
        } catch (_) {
            return false;
        }
    };

    const readText = (panel) => {
        if (!isPanelAlive(panel)) return "";
        try {
            if (typeof panel.text === "string") return panel.text;
            if (panel.GetAttributeString) {
                const attr = panel.GetAttributeString("text", "");
                if (attr) return attr;
            }
        } catch (_) {}
        return "";
    };

    const readTextDeep = (panel, maxDepth = 4) => {
        if (!isPanelAlive(panel)) return "";
        const direct = readText(panel);
        if (direct) return direct;
        if (maxDepth <= 0 || !panel.Children) return "";
        let kids;
        try { kids = panel.Children(); } catch (_) { return ""; }
        for (let i = 0; i < kids.length; i++) {
            const t = readTextDeep(kids[i], maxDepth - 1);
            if (t) return t;
        }
        return "";
    };

    const readId = (panel) => {
        if (!panel) return "";
        try {
            return panel.id ? String(panel.id) : "";
        } catch (_) {
            return "";
        }
    };

    const hasClassToken = (panel, token) => {
        if (!isPanelAlive(panel) || !token) return false;
        try {
            return typeof panel.BHasClass === "function" && panel.BHasClass(token);
        } catch (_) {
            return false;
        }
    };

    const findChild = (parent, id) => {
        if (!isPanelAlive(parent) || !id) return null;
        try {
            return parent.FindChild ? parent.FindChild(id) : null;
        } catch (_) {
            return null;
        }
    };

    const findChildByClass = (parent, className) => {
        if (!isPanelAlive(parent) || typeof className !== "string" || !className) return null;
        try {
            const count = parent.GetChildCount();
            for (let index = 0; index < count; index++) {
                const child = parent.GetChild(index);
                if (hasClassToken(child, className)) return child;
            }
        } catch (_) { /* Native children may retire during enumeration. */ }
        return null;
    };

    const findTraverse = (root, id) => {
        if (!isPanelAlive(root) || !id) return null;
        try {
            return root.FindChildTraverse ? root.FindChildTraverse(id) : null;
        } catch (_) {
            return null;
        }
    };

    // Instance-local ownership of exclusively QOL-created IDs/handles. Native parent
    // selection, content, signatures and scheduling stay with the caller.
    const createOwnedTree = () => {
        const nodes = new Map(), retired = new Set();
        let pendingDeletion = null;
        const retryDeletion = () => {
            if (!retired.size || pendingDeletion !== null || typeof $.Schedule !== "function") return;
            pendingDeletion = $.Schedule(0.25, () => {
                pendingDeletion = null;
                for (const panel of retired) {
                    if (!isPanelAlive(panel)) retired.delete(panel);
                    else safeDeletePanel(panel);
                }
                retryDeletion();
            });
        };
        // One immediate-child snapshot per parent/pass preserves FindChild's
        // first-ID priority without N separate sibling walks for N markers.
        const indexChildren = parent => {
            const index = new Map();
            if (!isPanelAlive(parent)) return index;
            try {
                for (const panel of parent.Children()) {
                    if (isPanelAlive(panel) && !index.has(panel.id)) index.set(panel.id, panel);
                }
            } catch (_) { index.clear(); }
            return index;
        };
        const retire = panel => {
            if (!isPanelAlive(panel)) return;
            setVisible(panel, false);
            safeDeletePanel(panel);
            retired.add(panel);
            retryDeletion();
        };
        const discard = id => {
            const record = nodes.get(id);
            if (!record) return;
            nodes.delete(id);
            // Expected ancestry tracks children even after native reparenting.
            for (const [childId, child] of [...nodes]) {
                if (child.parent === record.panel) discard(childId);
            }
            retire(record.panel);
        };
        const sweep = () => {
            const previousSize = nodes.size;
            const parents = new Map();
            for (const [id, record] of [...nodes]) {
                if (record.handle) {
                    let attached = false;
                    try { attached = isPanelAlive(record.panel) && isPanelAlive(record.parent) && record.panel.GetParent() === record.parent; } catch (_) {}
                    if (!attached) discard(id);
                    continue;
                }
                if (!parents.has(record.parent)) parents.set(record.parent, indexChildren(record.parent));
                if (!isPanelAlive(record.panel) || !isPanelAlive(record.parent) ||
                    parents.get(record.parent).get(id) !== record.panel) discard(id);
            }
            for (const panel of retired) {
                if (!isPanelAlive(panel)) retired.delete(panel);
                else safeDeletePanel(panel);
            }
            return nodes.size === previousSize;
        };
        const ensureChild = (parent, type, id, properties, next) => {
            if (!id) return null;
            const previous = nodes.get(id);
            if (previous && (previous.panel !== next || previous.parent !== parent)) discard(id);
            if (!isPanelAlive(parent)) return null;
            // A rapid re-enable can still find the previous instance's tree
            // before DeleteAsync finishes. Never adopt that pending deletion.
            if (isPanelAlive(next) && (!nodes.has(id) || retired.has(next))) { retire(next); return null; }
            const creation = { hittest: "false", hittestchildren: "false", ...properties };
            const panel = isPanelAlive(next) ? next : safeCreatePanel(type, parent, id, creation);
            if (!isPanelAlive(panel)) return null;
            if (!nodes.has(id)) nodes.set(id, { panel, parent });
            // Keep the owned node recorded before potentially failing native
            // property writes; later reconciliation retries these flags.
            for (const key of ["hittest", "hittestchildren"]) {
                if ((creation[key] === false || creation[key] === "false") && panel[key] !== false) panel[key] = false;
            }
            return panel;
        };
        const child = (parent, type, id, properties) => ensureChild(parent, type, id, properties, findChild(parent, id));
        // Fresh creation owns the returned handle directly, including anonymous
        // nodes. Never look up/adopt an existing native child or fabricate IDs.
        // Preserve caller creation properties, including interactive controls.
        const create = (type, parent, id = "", properties) => {
            const panel = safeCreatePanel(type, parent, id, properties);
            if (isPanelAlive(panel)) nodes.set(panel, { panel, parent, handle: true });
            return panel;
        };
        const children = (parent, type, entries) => {
            const index = indexChildren(parent);
            return entries.map(({ id, properties }) => {
                const panel = ensureChild(parent, type, id, properties, index.get(id) || null);
                if (panel) index.set(id, panel);
                return panel;
            });
        };
        const clear = () => {
            // Every owned descendant is already recorded, including moved handles.
            // Bulk retirement needs no per-node branch discovery through discard().
            const records = [...nodes.values()].reverse();
            nodes.clear();
            for (const record of records) retire(record.panel);
            sweep();
        };
        const dispose = () => { clear(); retryDeletion(); };
        return { create, child, children, sweep, remove: discard, clear, dispose, isReleased: () => nodes.size === 0 && retired.size === 0 };
    };

    // ql_utils.js is loaded first in every context that includes panel helpers.
    const QOL_WASH_COLOR_PALETTE = QOL_UTILS.QOL_WASH_COLOR_PALETTE;
    const normalizePaletteIndex = QOL_UTILS.NormalizePaletteColorIndex;
    const resolvePaletteColor = QOL_UTILS.ResolveWashColorFromPalette;

    const setWashColor = (panel, color) => {
        if (!isPanelAlive(panel)) return false;
        try {
            if (color) {
                panel.style.washColor = String(color);
            } else {
                panel.ClearPropertyFromCode("wash-color");
                panel.style.washColor = "";
            }
            return true;
        } catch (_) {
            return false;
        }
    };

    const setWashColorFromPalette = (panel, value) => {
        const color = resolvePaletteColor(value);
        return setWashColor(panel, color);
    };

    // -- Attach to namespace --
    const panelApi = {
        isAlive: isPanelAlive,
        isPanelAlive,
        create: safeCreatePanel,
        createPanel: safeCreatePanel,
        delete: safeDeletePanel,
        deletePanel: safeDeletePanel,
        createOwnedTree,
        createNativeStyleOwner,
        findRoot,
        findHud,
        findChild,
        findChildByClass,
        findTraverse,
        setClass,
        setVisible,
        syncStyles,
        clearStyleProperty,
        activate,
        isVisible,
        readText,
        readTextDeep,
        readId,
        hasClassToken,
        setWashColor,
        setWashColorFromPalette,
        normalizePaletteIndex,
        resolvePaletteColor,
        washColorPalette: QOL_WASH_COLOR_PALETTE
    };

    QOL.core = QOL.core || {};
    QOL.core.panel = panelApi;
    QOL.core.PanelHelpers = panelApi;
    QOL.ui = QOL.ui || {};
    QOL.ui.PanelHelpers = panelApi;

    // Backward-compat aliases on root QOL namespace
    QOL.activatePanelSafe = activate;
    QOL.isPanelVisibleMaybe = isVisible;
    QOL.readPanelTextMaybe = readText;
    QOL.readPanelTextDeepMaybe = readTextDeep;
    QOL.readPanelIdTextMaybe = readId;
    QOL.panelHasClassToken = hasClassToken;
    QOL.setWashColorSafe = setWashColor;
    QOL.resolveWashColorFromPalette = resolvePaletteColor;
    QOL.normalizePaletteColorIndex = normalizePaletteIndex;
    QOL.washColorPalette = QOL_WASH_COLOR_PALETTE;

    if (typeof $ !== "undefined" && $.Msg) {
        $.Msg("[QOLLock] core/ql_panel_helpers: attached to QOL.core.panel and QOL.ui.PanelHelpers");
    }
})();
