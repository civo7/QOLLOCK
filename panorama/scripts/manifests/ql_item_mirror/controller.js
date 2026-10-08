// OWNS: Advanced item-mirror settings model, native/overlay generations and coordinated lifetime.
(() => {
    "use strict";
    const N = QOL.features.itemMirror;
    const { FEATURE_ID, ITEM_MIRROR_RENDER_INTERVAL_MS_ACTIVE, ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE,
        ITEM_MIRROR_PROBE_SCAN_MS, ITEM_MIRROR_TARGETS } = N.data;
    const Q = QOL, alive = Q.utils.IsPanelValid, now = Q.utils.PerfNowMs;
    N.createController = ctx => {
        let running = false, loop = null, hudOwner = null, model = null;
        let overlay = null, row = null, overlayParent = null, slots = [], inventoryRoots = [];
        let nextScanMs = 0, rootLayoutSig = null, rowLayoutSig = null, lastShopOpen = false;
        const emptyInventory = () => ({ sources: [], slotStates: {}, runtimePanelIds: [],
            exceptionGroupAssignments: {}, nextSourceId: 0, nextAcquireOrder: 0 });
        let _mirror = emptyInventory();
        const native = N.createSources(() => _mirror);
        const renderer = N.createRenderer(ctx, () => _mirror, native);
        const gameplay = Q.panelCache.createIdResolver("gameplay_hud", { ownerPath: [{ className: "HudCore" }] });
        const abilities = Q.panelCache.createIdResolver("AbilitiesContainer", { ownerPath: [{ className: "HudCore" }] });

        function _isItemMirrorGameplayShown(root) {
            return !!Q.core.hud.isGameplayHudShown(root);
        }
        function deriveSettings() {
            const cfg = ctx.config.view ? ctx.config.view() : ctx.config.all();
            const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
            let scale = number(cfg.PASSIVE_COOLDOWN_SIZE, 40) / 40;
            if (scale <= 0) scale = 1;
            const opacity = Math.max(0, Math.min(1, number(cfg.PASSIVE_COOLDOWN_OPACITY, 0.5))).toFixed(2);
            return {
                enabled: Number(cfg.ENABLE_PASSIVE_COOLDOWN) === 1 && Number(cfg.ENABLE_OLD_ITEM_COOLDOWNS) !== 1,
                filters: Object.fromEntries(["ITEM_FILTER_DEF_PASSIVE", "ITEM_FILTER_OFF_PASSIVE",
                    "ITEM_FILTER_DEF_ACTIVE", "ITEM_FILTER_OFF_ACTIVE"].filter(key => Object.hasOwn(cfg, key)).map(key => [key, cfg[key]])),
                rootStyles: { uiScale: Math.round(Math.max(0.75, Math.min(1.5, scale)) * 100) + "%",
                    marginLeft: number(cfg.PASSIVE_COOLDOWN_X, 0) + "%", marginTop: -number(cfg.PASSIVE_COOLDOWN_Y, -2) + "%" },
                rowStyles: { opacity }
            };
        }
        function releasePresentation() {
            renderer.release();
            for (const slot of slots) renderer.releaseSlot(slot);
            slots = [];
            if (alive(row)) row.DeleteAsync(0);
            if (alive(overlay)) overlay.DeleteAsync(0);
            overlay = null; row = null; overlayParent = null;
            rootLayoutSig = null; rowLayoutSig = null;
        }
        function release() {
            releasePresentation();
            gameplay.reset(); abilities.reset(); native.reset();
            _mirror = emptyInventory(); inventoryRoots = [];
            hudOwner = null; nextScanMs = 0; lastShopOpen = false;
        }
        function ensureOverlay(hud) {
            const parent = gameplay.resolve(hud) || hud;
            if (!alive(parent)) return false;
            if (overlayParent !== parent || !alive(overlay) || overlay.GetParent() !== parent ||
                parent.FindChild("QOLItemMirrorRoot") !== overlay) releasePresentation();
            if (!overlay) {
                const abandoned = parent.FindChild("QOLItemMirrorRoot");
                if (alive(abandoned)) abandoned.DeleteAsync(0);
                overlay = $.CreatePanel("Panel", parent, "QOLItemMirrorRoot", { hittest: "false", hittestchildren: "false" });
                overlayParent = parent;
                try {
                    Object.assign(overlay.style, { horizontalAlign: "center", verticalAlign: "center", flowChildren: "down",
                        overflow: "noclip", x: "0px", y: "150px", visibility: "collapse" });
                } catch (error) { releasePresentation(); throw error; }
            }
            if (!alive(row) || row.GetParent() !== overlay || overlay.FindChild("QOLItemMirrorRow") !== row) {
                renderer.release();
                for (const slot of slots) renderer.releaseSlot(slot);
                slots = [];
                if (alive(row)) row.DeleteAsync(0);
                row = null; rowLayoutSig = null;
                const abandoned = overlay.FindChild("QOLItemMirrorRow");
                if (alive(abandoned)) abandoned.DeleteAsync(0);
                row = $.CreatePanel("Panel", overlay, "QOLItemMirrorRow", { hittest: "false", hittestchildren: "false" });
                try {
                    Object.assign(row.style, { flowChildren: "right", horizontalAlign: "center", verticalAlign: "center",
                        width: "fit-children", height: "fit-children", overflow: "noclip" });
                } catch (error) { releasePresentation(); throw error; }
            }
            rootLayoutSig = Q.core.panel.syncStyles(overlay, model.rootStyles, rootLayoutSig).sig;
            rowLayoutSig = Q.core.panel.syncStyles(row, model.rowStyles, rowLayoutSig).sig;
            _mirror.visualOpacityText = model.rowStyles.opacity;
            return true;
        }
        function ensureSlot(index) {
            if (!renderer.slotIsCurrent(slots[index], row)) {
                renderer.releaseSlot(slots[index]);
                slots[index] = null;
                slots[index] = renderer.createSlot(row, index);
            }
            return slots[index];
        }
        function idle() {
            if (loop) loop.reschedule(ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE / 1000);
        }
        function tick() {
            if (!running) return;
            const hud = Q.core.panel.findHud($.GetContextPanel());
            if (!alive(hud) || !model.enabled || !_isItemMirrorGameplayShown(hud)) {
                release(); idle(); return;
            }
            if (hudOwner !== hud) { release(); hudOwner = hud; }
            const abilityOwner = abilities.resolve(hud);
            const shopOpen = !!(abilityOwner && Q.utils.HasClassInHierarchy(abilityOwner, "gShopOpen"));
            const shopJustClosed = lastShopOpen && !shopOpen;
            lastShopOpen = shopOpen;
            if (shopOpen) {
                renderer.release();
                if (alive(overlay) && overlay.style.visibility !== "collapse") overlay.style.visibility = "collapse";
                idle(); return;
            }
            const time = now(), currentRoots = native.inventoryRoots(hud);
            const rootsChanged = currentRoots.length !== inventoryRoots.length || currentRoots.some((root, i) => root !== inventoryRoots[i]);
            inventoryRoots = currentRoots;
            let sources = _mirror.sources;
            if (rootsChanged || shopJustClosed || time >= nextScanMs || sources.some(source => !native.sourceIsCurrent(source, currentRoots))) {
                const scan = native._buildItemMirrorSourcesMulti(hud, null);
                nextScanMs = time + (scan.matches.length ? ITEM_MIRROR_PROBE_SCAN_MS : 1500);
                sources = native._reconcileItemMirrorSourcesMulti(scan.matches);
            }
            if (!ensureOverlay(hud)) { idle(); return; }
            const visible = sources.filter(source => native._ownerMatchesMirrorCategory(source.ownerIcon, ITEM_MIRROR_TARGETS[source.targetIndex], model.filters));
            const visibility = visible.length ? "visible" : "collapse";
            if (overlay.style.visibility !== visibility) overlay.style.visibility = visibility;
            for (let i = 0; i < visible.length; i++) {
                const slot = ensureSlot(i);
                if (slot.icon.style.visibility !== "visible") slot.icon.style.visibility = "visible";
                slot.sourceKey = visible[i].key;
                native.refreshNativeChildren(visible[i]);
                renderer._syncMirrorItemFromSourceMulti(slot, visible[i]);
            }
            for (let i = visible.length; i < slots.length; i++) {
                const slot = slots[i];
                if (!slot) continue;
                renderer._clearReadyFlash(slot.readyOverlay);
                if (alive(slot.icon) && slot.icon.style.visibility !== "collapse") slot.icon.style.visibility = "collapse";
            }
            const activeKeys = new Set(sources.map(source => source.key));
            for (const key of Object.keys(_mirror.slotStates)) if (!activeKeys.has(key)) delete _mirror.slotStates[key];
            if (loop) loop.reschedule((time < (_mirror.fastModeUntilMs || 0)
                ? ITEM_MIRROR_RENDER_INTERVAL_MS_ACTIVE : ITEM_MIRROR_RENDER_INTERVAL_MS_IDLE) / 1000);
        }
        return {
            onEnable: function() {
                model = deriveSettings(); running = true;
                tick();
                if (!loop && running) loop = Q.core.Scheduler.createPollLoop(tick, ITEM_MIRROR_RENDER_INTERVAL_MS_ACTIVE / 1000, FEATURE_ID);
            },
            onDisable() {
                running = false;
                if (loop) loop.stop();
                loop = null; release(); model = null;
            },
            onSettingsChanged() {
                model = deriveSettings(); nextScanMs = 0;
                if (running) tick();
            }
        };
    };
})();
