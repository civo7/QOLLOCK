// scripts/simulator/panel.js
// =============================================================================
// Panel object model for the Panorama simulator.
// =============================================================================
// Fidelity notes — where we match the engine and where we deliberately don't:
//
//  MATCHED:
//   * FindChildTraverse is depth-first pre-order. This decides which panel wins
//     when two share an id, and the mod relies on traversal order in several
//     places (e.g. manifest.js `_buildList` walks a candidate root list).
//   * Attributes and the `text` property are SEPARATE stores. A Label declared
//     `<Label text="#Foo" />` has `.text === "#Foo"` but
//     `GetAttributeString("text", "") === ""`. The mod's `_readText()`
//     (manifest.js:87-97) tries the attribute first and falls through to
//     `.text` — that fall-through only happens because the engine keeps them
//     apart, so we keep them apart too.
//   * GetAttributeString honours its fallback argument (the old smoke-test stub
//     returned "" unconditionally, which hid the config bridge entirely).
//   * Invalid panels throw on property access the way a deleted C++ panel does,
//     so the mod's `try { panel.style.x = ... } catch(e) {}` guards get
//     exercised instead of silently passing.
//
//  DELIBERATELY NOT MATCHED:
//   * `style` is a plain object with no CSS parsing or layout. Nothing here can
//     validate a CSS property name, compute a size, or catch a Panorama-only
//     value like `overflow: hidden`. Layout/visual correctness is out of scope.
//   * `visible` and `style.visibility` are stored but do not affect traversal.
//     The engine also keeps collapsed panels in the tree and still delivers
//     scripted events to them, so this matches for our purposes — but it means
//     a test cannot tell "user can see it" from "it exists".
//   * No focus model, no input routing, no animation/transition timing.
// =============================================================================

"use strict";

let _panelSeq = 0;

class Panel {
    constructor(type, { id = "", classes = [], attributes = {}, text = "", doc = null } = {}) {
        this.type = type || "Panel";
        this.paneltype = this.type;
        this.id = id || "";
        this._uid = ++_panelSeq;
        this._doc = doc;
        this._parent = null;
        this._children = [];
        this._classes = new Set(classes);
        this._attrs = new Map(Object.entries(attributes));
        this._dialogVars = new Map();
        this._events = new Map();
        this._valid = true;

        this.text = text;
        this.visible = true;
        this.enabled = true;
        this.style = {};

        // Layout properties the mod reads. Static zeros: we do no layout.
        this.actuallayoutwidth = 0;
        this.actuallayoutheight = 0;
        this.actualxoffset = 0;
        this.actualyoffset = 0;
    }

    // ── Validity ──────────────────────────────────────────────────────────
    IsValid() {
        return this._valid;
    }

    _assertValid(op) {
        if (!this._valid) {
            throw new Error(`[Panel] ${op} on deleted panel #${this.id || this.type}`);
        }
    }

    /** Mark this panel and its whole subtree invalid, and unlink from parent. */
    _destroy() {
        for (const child of this._children.slice()) child._destroy();
        this._children.length = 0;
        if (this._parent) {
            const siblings = this._parent._children;
            const idx = siblings.indexOf(this);
            if (idx >= 0) siblings.splice(idx, 1);
            this._parent = null;
        }
        this._valid = false;
        if (this._doc) this._doc._unindex(this);
    }

    DeleteAsync(delaySec = 0) {
        const clock = this._doc && this._doc.clock;
        if (!clock) {
            this._destroy();
            return;
        }
        clock.schedule(delaySec, () => {
            if (this._valid) this._destroy();
        });
    }

    // ── Tree ──────────────────────────────────────────────────────────────
    GetParent() {
        return this._parent || null;
    }

    getBreadcrumbs() {
        if (this.breadcrumbs) return this.breadcrumbs;
        const parts = [];
        let cur = this;
        while (cur) {
            let tag = cur.type || "Panel";
            if (cur.id) tag += "#" + cur.id;
            if (cur._classes && cur._classes.size > 0) tag += "." + [...cur._classes].join(".");
            parts.unshift(tag);
            cur = cur._parent;
        }
        return parts.join(" > ");
    }

    GetChildCount() {
        this._assertValid("GetChildCount");
        return this._children.length;
    }

    GetChild(index) {
        this._assertValid("GetChild");
        return this._children[index] || null;
    }

    /**
     * A METHOD, not a getter — `panel.Children()` is how the engine exposes it and
     * how the mod calls it (39 call sites). Modelling it as a getter made
     * `panel.Children()` throw "Children is not a function", which the mod's error
     * boundaries swallowed: features died silently partway through their update and
     * the profiler under-counted their real cost. The mod also guards with
     * `if (panel.Children)`, which is satisfied either way, so nothing catches this
     * except an explicit test.
     */
    Children() {
        this._assertValid("Children");
        return this._children.slice();
    }

    /** Append `child`, detaching it from any previous parent. */
    addChild(child) {
        this._assertValid("addChild");
        if (child._parent) {
            const siblings = child._parent._children;
            const idx = siblings.indexOf(child);
            if (idx >= 0) siblings.splice(idx, 1);
        }
        child._parent = this;
        child._doc = this._doc;
        this._children.push(child);
        if (this._doc) this._doc._index(child);
        return child;
    }

    SetParent(parent) {
        if (parent && typeof parent.addChild === "function") parent.addChild(this);
    }

    MoveChildBefore(child, beforeChild) {
        this._assertValid("MoveChildBefore");
        if (!child) return;
        const curIdx = this._children.indexOf(child);
        if (curIdx < 0) return;
        this._children.splice(curIdx, 1);
        if (!beforeChild) {
            this._children.push(child);
            return;
        }
        const targetIdx = this._children.indexOf(beforeChild);
        if (targetIdx < 0) {
            this._children.push(child);
        } else {
            this._children.splice(targetIdx, 0, child);
        }
    }

    RemoveAndDeleteChildren() {
        this._assertValid("RemoveAndDeleteChildren");
        for (const child of this._children.slice()) child._destroy();
        this._children.length = 0;
    }

    // ── Lookup ────────────────────────────────────────────────────────────
    /** Direct children only. */
    FindChild(id) {
        this._assertValid("FindChild");
        return this._children.find((c) => c.id === id) || null;
    }

    /**
     * Depth-first pre-order search of the whole subtree (self excluded, matching
     * the engine: FindChildTraverse never returns the panel it was called on).
     */
    FindChildTraverse(id) {
        this._assertValid("FindChildTraverse");
        if (!id) return null;
        const stack = [];
        // Push in reverse so we pop children in declaration order.
        for (let i = this._children.length - 1; i >= 0; i--) stack.push(this._children[i]);
        while (stack.length > 0) {
            const node = stack.pop();
            if (node.id === id) {
                return node;
            }
            for (let i = node._children.length - 1; i >= 0; i--) stack.push(node._children[i]);
        }
        return null;
    }

    FindChildInLayoutFile(id) {
        return this.FindChildTraverse(id);
    }

    /** All descendants carrying `className`, depth-first pre-order. */
    FindChildrenWithClassTraverse(className) {
        this._assertValid("FindChildrenWithClassTraverse");
        if (!className) return [];
        const out = [];
        const stack = [];
        for (let i = this._children.length - 1; i >= 0; i--) stack.push(this._children[i]);
        while (stack.length > 0) {
            const node = stack.pop();
            if (node._classes.has(className)) out.push(node);
            for (let i = node._children.length - 1; i >= 0; i--) stack.push(node._children[i]);
        }
        return out;
    }

    // ── Classes ───────────────────────────────────────────────────────────
    BHasClass(className) {
        this._assertValid("BHasClass");
        return this._classes.has(className);
    }

    AddClass(className) {
        this._assertValid("AddClass");
        if (className) this._classes.add(className);
    }

    RemoveClass(className) {
        this._assertValid("RemoveClass");
        this._classes.delete(className);
    }

    SetHasClass(className, has) {
        if (has) this.AddClass(className);
        else this.RemoveClass(className);
    }

    ToggleClass(className) {
        this.SetHasClass(className, !this.BHasClass(className));
    }

    GetClasses() {
        // The engine returns a space-joined string here, not an array.
        return Array.from(this._classes).join(" ");
    }

    // ── Attributes ────────────────────────────────────────────────────────
    GetAttributeString(key, fallback) {
        this._assertValid("GetAttributeString");
        if (this._attrs.has(key)) return String(this._attrs.get(key));
        return typeof fallback === "undefined" ? "" : fallback;
    }

    SetAttributeString(key, value) {
        this._assertValid("SetAttributeString");
        this._attrs.set(key, String(value));
    }

    GetAttributeInt(key, fallback) {
        const raw = this._attrs.has(key) ? parseInt(this._attrs.get(key), 10) : NaN;
        return Number.isNaN(raw) ? (typeof fallback === "undefined" ? 0 : fallback) : raw;
    }

    SetAttributeInt(key, value) {
        this._attrs.set(key, String(Math.trunc(Number(value) || 0)));
    }

    // ── Text entry ────────────────────────────────────────────────────────
    /**
     * TextEntry.SetText(). Honours `maxchars` when declared, because
     * BuildNameTextEntry carries maxchars="50"
     * (citadel_hud_hero_builds.xml:25) while CategoryNameTextEntry does not —
     * that asymmetry is exactly the risk we want tests to expose.
     */
    SetText(value) {
        this._assertValid("SetText");
        const max = this.GetAttributeInt("maxchars", 0);
        let next = String(value);
        if (max > 0 && next.length > max) next = next.slice(0, max);
        this.text = next;
    }

    Submit() {
        this._assertValid("Submit");
        this._fire("oninputsubmit");
    }

    SetDialogVariable(name, value) {
        this._dialogVars.set(name, String(value));
    }

    /**
     * The engine exposes typed setters alongside SetDialogVariable, and the mod
     * uses the int one to bind a hero id onto a top bar player card
     * (ql_feat_recentpurchases.js BuildHeroPlayerCardMap). Without it that call
     * throws, the feature's error boundary swallows it, and the popup system
     * looks merely inert rather than broken.
     */
    SetDialogVariableInt(name, value) {
        this._dialogVars.set(name, String(Math.trunc(Number(value) || 0)));
    }

    GetDialogVariable(name) {
        return this._dialogVars.get(name) || "";
    }

    ClearPropertyFromCode(prop) {
        this._assertValid("ClearPropertyFromCode");
        if (this.style && typeof prop === "string") {
            // Native API takes CSS names; style writes expose camelCase aliases.
            if (/[A-Z]/.test(prop)) return false;
            const jsProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            delete this.style[jsProp];
            return true;
        }
        return false;
    }

    // ── Events ────────────────────────────────────────────────────────────
    SetPanelEvent(name, handler) {
        this._assertValid("SetPanelEvent");
        this._events.set(name, handler);
    }

    _fire(name) {
        const handler = this._events.get(name);
        if (typeof handler !== "function") return false;
        try {
            handler();
            return true;
        } catch (err) {
            if (this._doc) this._doc.eventErrors.push({ panel: this.id, name, error: err });
            return false;
        }
    }

    /** Simulates a click/activate, which is what ActivatePanelSafe does. */
    activate() {
        return this._fire("onactivate") || this._fire("onmouseactivate");
    }

    // Flag only: tests dispatch verified DragStart/DragEnd callbacks and supply
    // layout measurements. This does not simulate the native drag compositor.
    SetDraggable(enabled) {
        this._assertValid("SetDraggable");
        this.draggable = !!enabled;
    }

    SetFocus() {
        if (this._doc) this._doc.focused = this;
        return true;
    }

    SetSelected(selected) {
        this._assertValid("SetSelected");
        if (this.type === "DropDown") {
            const options = this._dropdownOptions || [];
            this._dropdownSelected = options.find((option) => option.IsValid() && option.id === selected) || null;
            return;
        }
        this.SetHasClass("Selected", !!selected);
    }

    // Only option registration and selection are modelled, not the engine's
    // popup layout, input routing, or automatic submit events.
    AddOption(option) {
        this._assertValid("AddOption");
        if (this.type !== "DropDown") throw new Error("AddOption requires DropDown");
        option._assertValid("AddOption");
        this._dropdownOptions = this._dropdownOptions || [];
        if (!this._dropdownOptions.includes(option)) this._dropdownOptions.push(option);
        this.addChild(option);
    }

    GetSelected() {
        this._assertValid("GetSelected");
        if (this.type !== "DropDown") throw new Error("GetSelected requires DropDown");
        return this._dropdownSelected?.IsValid() ? this._dropdownSelected : null;
    }

    SetImage() { /* no-op: no asset pipeline in the simulator */ }
    SetScaling() { /* no-op */ }

    // ── Debug ─────────────────────────────────────────────────────────────
    /** Renders the subtree — invaluable when a FindChildTraverse returns null. */
    dump(depth = 0, maxDepth = 40) {
        const pad = "  ".repeat(depth);
        const cls = this._classes.size ? "." + Array.from(this._classes).join(".") : "";
        const txt = this.text ? ` text=${JSON.stringify(String(this.text).slice(0, 60))}` : "";
        let out = `${pad}<${this.type}${this.id ? ` #${this.id}` : ""}${cls}>${txt}\n`;
        if (depth < maxDepth) {
            for (const child of this._children) out += child.dump(depth + 1, maxDepth);
        }
        return out;
    }
}

/**
 * Owns the clock, the panel tree and an id index. Panels reach the document to
 * schedule deletions and to report anomalies (duplicate ids, handler throws).
 *
 * Tree shape matters here. There is no `id="Hud"` anywhere in hud.xml — the Hud
 * panel is created by the engine and the layout is loaded *into* it, so
 * `$.GetContextPanel()` returns the Hud panel itself. That is why
 * `core/ql_panel_helpers.js:49 findHud()` first tries
 * `ctx.FindChildTraverse("Hud")` (which misses, because FindChildTraverse never
 * returns the panel it was called on), then walks up to the absolute root and
 * searches again from there. We model both levels so that fallback is exercised
 * instead of accidentally short-circuiting.
 */
class Document {
    constructor(clock) {
        this.clock = clock;
        this.eventErrors = [];
        this.duplicateIds = new Map();
        this.focused = null;
        this._byId = new Map();

        this.absRoot = new Panel("Panel", { id: "PanoramaRoot", doc: this });
        this._index(this.absRoot);

        // The context panel for hud.xml. `root` is the context panel, matching
        // what $.GetContextPanel() hands the mod.
        this.root = this.absRoot.addChild(new Panel("Panel", { id: "Hud", doc: this }));
    }

    create(type, opts = {}) {
        return new Panel(type, { ...opts, doc: this });
    }

    _index(panel) {
        if (!panel.id) return;
        const list = this._byId.get(panel.id) || [];
        if (!list.includes(panel)) list.push(panel);
        this._byId.set(panel.id, list);
        for (const child of panel._children) this._index(child);
    }

    _unindex(panel) {
        if (!panel.id) return;
        const list = this._byId.get(panel.id);
        if (!list) return;
        const idx = list.indexOf(panel);
        if (idx >= 0) list.splice(idx, 1);
        if (list.length === 0) this._byId.delete(panel.id);
    }

    _warnDuplicateId(id, count) {
        this.duplicateIds.set(id, count);
    }

    /** Assert the tree is anomaly-free. Tests call this to stay honest. */
    assertClean() {
        const problems = [];
        if (this.duplicateIds.size > 0) {
            for (const [id, count] of this.duplicateIds) {
                problems.push(`duplicate id "${id}" (${count} panels)`);
            }
        }
        for (const e of this.eventErrors) {
            problems.push(`handler ${e.name} on #${e.panel} threw: ${e.error.message}`);
        }
        return problems;
    }
}

module.exports = { Panel, Document };
