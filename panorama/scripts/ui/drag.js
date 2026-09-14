// panorama/scripts/ui/drag.js
// =============================================================================
// QOLLOCK — Settings Window Dragging & Drag Toggle Button (ES6)
// =============================================================================
// Extracted from ql_settings.js. Manages dragging the SettingsWindow across
// the screen via header drag areas, bounds calculation, and DragStart/DragEnd events.
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : null);

    if (!Q?.ui) {
        $.Msg("[QOLLock] ui/drag: QOL.ui missing — aborting");
        return;
    }

    let _dragHandleLeft = null;
    let _dragHandleRight = null;
    let _dragParentPanel = null;
    let _dragHandlersBoundLeft = false;
    let _dragHandlersBoundRight = false;

    const isAlive = (panel) => {
        if (Q.core?.panel?.isAlive) return Q.core.panel.isAlive(panel);
        return !!(panel && typeof panel.IsValid === "function" && panel.IsValid());
    };

    const localize = (text) => {
        if (typeof globalThis.LocalizeSettingsText === "function") {
            return globalThis.LocalizeSettingsText(text, true);
        }
        if (typeof $.Localize === "function") {
            return $.Localize(text);
        }
        return text;
    };

    const ensureDragToggleButtonContent = (btn) => {
        if (!isAlive(btn)) return;
        btn.hittest = true;
        btn.hittestchildren = true;

        const hasSwitch = !!btn.FindChildTraverse("DragToggleSwitch");
        const hasLabel = !!btn.FindChildTraverse("DragToggleLabel");

        if (!hasSwitch || !hasLabel) {
            try { btn.RemoveAndDeleteChildren(); } catch (_) {}

            const switchPanel = $.CreatePanel("Panel", btn, "DragToggleSwitch");
            if (switchPanel) {
                switchPanel.AddClass("DragToggleSwitch");
                switchPanel.hittest = false;
                switchPanel.hittestchildren = false;
                const switchKnob = $.CreatePanel("Panel", switchPanel, "DragToggleSwitchKnob");
                if (switchKnob) {
                    switchKnob.AddClass("DragToggleSwitchKnob");
                    switchKnob.hittest = false;
                    switchKnob.hittestchildren = false;
                }
            }

            const label = $.CreatePanel("Label", btn, "DragToggleLabel");
            if (label) {
                label.text = localize("Drag");
                label.hittest = false;
            }
            return;
        }

        const switchPanelExisting = btn.FindChildTraverse("DragToggleSwitch");
        if (switchPanelExisting) {
            switchPanelExisting.hittest = false;
            switchPanelExisting.hittestchildren = false;
        }
        const switchKnobExisting = btn.FindChildTraverse("DragToggleSwitchKnob");
        if (switchKnobExisting) {
            switchKnobExisting.hittest = false;
            switchKnobExisting.hittestchildren = false;
        }
        const labelExisting = btn.FindChildTraverse("DragToggleLabel");
        if (labelExisting) {
            labelExisting.text = localize("Drag");
            labelExisting.hittest = false;
        }
    };

    const ensureSettingsHeaderDragHandle = (headerPanel) => {
        if (!isAlive(headerPanel)) return null;

        let dragHandleLeft = headerPanel.FindChildTraverse("SettingsHeaderDragAreaLeft");
        if (!dragHandleLeft) {
            dragHandleLeft = $.CreatePanel("Panel", headerPanel, "SettingsHeaderDragAreaLeft");
        }
        if (dragHandleLeft) dragHandleLeft.AddClass("SettingsHeaderDragArea");

        let dragHandleRight = headerPanel.FindChildTraverse("SettingsHeaderDragAreaRight");
        if (!dragHandleRight) {
            dragHandleRight = $.CreatePanel("Panel", headerPanel, "SettingsHeaderDragAreaRight");
        }
        if (dragHandleRight) dragHandleRight.AddClass("SettingsHeaderDragArea");

        const legacyDragHandle = headerPanel.FindChildTraverse("SettingsHeaderDragArea");
        if (legacyDragHandle && legacyDragHandle !== dragHandleLeft && legacyDragHandle !== dragHandleRight) {
            try { legacyDragHandle.DeleteAsync(0); } catch (_) {}
        }

        const closeBtn = headerPanel.FindChildTraverse("CloseBtn");
        if (closeBtn) {
            try {
                headerPanel.MoveChildBefore(dragHandleLeft, closeBtn);
                headerPanel.MoveChildBefore(dragHandleRight, closeBtn);
            } catch (_) {}
        }

        return {
            left: dragHandleLeft,
            right: dragHandleRight,
        };
    };

    const getPanelXOffsetWithinAncestor = (panel, ancestor) => {
        if (!isAlive(panel) || !isAlive(ancestor)) return null;
        let total = 0;
        let node = panel;
        let guard = 0;

        while (node && isAlive(node) && guard < 48) {
            if (node === ancestor) return total;
            const offsetX = Number(node.actualxoffset);
            if (Number.isFinite(offsetX)) total += offsetX;
            if (!node.GetParent) break;
            const parentNode = node.GetParent();
            if (isAlive(parentNode)) {
                let scrollX = 0;
                let hasScrollX = false;
                try {
                    const sx0 = Number(parentNode.scrolloffset_x);
                    if (Number.isFinite(sx0)) { scrollX = sx0; hasScrollX = true; }
                } catch (_) {}
                if (!hasScrollX) {
                    try {
                        const sx1 = Number(parentNode.actualscrolloffset_x);
                        if (Number.isFinite(sx1)) scrollX = sx1;
                    } catch (_) {}
                }
                total -= scrollX;
            }
            node = parentNode;
            guard++;
        }
        return total;
    };

    const getPanelYOffsetWithinAncestor = (panel, ancestor) => {
        if (!isAlive(panel) || !isAlive(ancestor)) return null;
        let total = 0;
        let node = panel;
        let guard = 0;

        while (node && isAlive(node) && guard < 48) {
            if (node === ancestor) return total;
            const offsetY = Number(node.actualyoffset);
            if (Number.isFinite(offsetY)) total += offsetY;
            if (!node.GetParent) break;
            const parentNode = node.GetParent();
            if (isAlive(parentNode)) {
                let scrollY = 0;
                let hasScrollY = false;
                try {
                    const sy0 = Number(parentNode.scrolloffset_y);
                    if (Number.isFinite(sy0)) { scrollY = sy0; hasScrollY = true; }
                } catch (_) {}
                if (!hasScrollY) {
                    try {
                        const sy1 = Number(parentNode.actualscrolloffset_y);
                        if (Number.isFinite(sy1)) scrollY = sy1;
                    } catch (_) {}
                }
                total -= scrollY;
            }
            node = parentNode;
            guard++;
        }
        return total;
    };

    const updateSettingsHeaderDragAreaBounds = (headerPanel, handlePanel, handlePanelRight) => {
        if (!isAlive(headerPanel) || !isAlive(handlePanel) || !isAlive(handlePanelRight)) return;

        const headerWidth = Number(headerPanel.actuallayoutwidth);
        const headerHeight = Number(headerPanel.actuallayoutheight);
        if (!Number.isFinite(headerWidth) || !Number.isFinite(headerHeight) || headerWidth <= 0 || headerHeight <= 0) return;

        const titlePanel = headerPanel.FindChildTraverse("SettingsTitle");
        const titleX = getPanelXOffsetWithinAncestor(titlePanel, headerPanel) || 0;
        const titleWidth = titlePanel && Number.isFinite(Number(titlePanel.actuallayoutwidth)) ? Number(titlePanel.actuallayoutwidth) : 0;

        const closeBtn = headerPanel.FindChildTraverse("CloseBtn");
        const closeX = getPanelXOffsetWithinAncestor(closeBtn, headerPanel) || headerWidth;

        const leftWidth = Math.max(0, titleX);
        const rightWidth = Math.max(0, closeX - (titleX + titleWidth));

        try {
            handlePanel.style.width = `${Math.floor(leftWidth)}px`;
            handlePanel.style.height = `${Math.floor(headerHeight)}px`;
            handlePanel.style.marginLeft = "0px";

            handlePanelRight.style.width = `${Math.floor(rightWidth)}px`;
            handlePanelRight.style.height = `${Math.floor(headerHeight)}px`;
            handlePanelRight.style.marginLeft = `${Math.floor(titleX + titleWidth)}px`;
        } catch (_) {}
    };

    const isDragEnabled = () => {
        if (typeof globalThis.MOD_CONFIG === "object" && globalThis.MOD_CONFIG !== null) {
            return globalThis.MOD_CONFIG.DRAG_ENABLED === 1;
        }
        return false;
    };

    const setupSettingsWindowDragging = (headerPanel, dragPanel) => {
        if (!isAlive(headerPanel) || !isAlive(dragPanel)) return;

        const handles = ensureSettingsHeaderDragHandle(headerPanel);
        if (!handles?.left || !handles?.right) return;

        const handlePanel = handles.left;
        const handlePanelRight = handles.right;

        const updateBounds = () => {
            if (isAlive(headerPanel) && isAlive(handlePanel) && isAlive(handlePanelRight)) {
                updateSettingsHeaderDragAreaBounds(headerPanel, handlePanel, handlePanelRight);
            }
        };

        updateBounds();
        if (typeof $.Schedule === "function") {
            $.Schedule(0.0, updateBounds);
            $.Schedule(0.03, updateBounds);
            $.Schedule(0.12, updateBounds);
        }

        if (!isAlive(_dragParentPanel)) {
            _dragParentPanel = dragPanel.GetParent ? dragPanel.GetParent() : null;
        }

        const enabled = isDragEnabled();
        if (typeof handlePanel.SetDraggable === "function") handlePanel.SetDraggable(enabled);
        if (typeof handlePanelRight.SetDraggable === "function") handlePanelRight.SetDraggable(enabled);

        if (typeof $.RegisterEventHandler === "function") {
            if (!_dragHandlersBoundLeft) {
                $.RegisterEventHandler("DragStart", handlePanel, (_p, dragEvent) => {
                    if (!isDragEnabled() || !isAlive(dragPanel)) return;
                    dragEvent.displayPanel = dragPanel;
                    dragEvent.removePositionBeforeDrop = false;
                    try { dragPanel.style.align = "left top"; } catch (_) {}
                });

                $.RegisterEventHandler("DragEnd", handlePanel, (_p, droppedPanel) => {
                    if (!isAlive(droppedPanel)) return;
                    if (isAlive(_dragParentPanel) && typeof droppedPanel.SetParent === "function") {
                        droppedPanel.SetParent(_dragParentPanel);
                    }
                    try { droppedPanel.style.align = "left top"; } catch (_) {}
                });
                _dragHandlersBoundLeft = true;
            }

            if (!_dragHandlersBoundRight) {
                $.RegisterEventHandler("DragStart", handlePanelRight, (_p, dragEvent) => {
                    if (!isDragEnabled() || !isAlive(dragPanel)) return;
                    dragEvent.displayPanel = dragPanel;
                    dragEvent.removePositionBeforeDrop = false;
                    try { dragPanel.style.align = "left top"; } catch (_) {}
                });

                $.RegisterEventHandler("DragEnd", handlePanelRight, (_p, droppedPanel) => {
                    if (!isAlive(droppedPanel)) return;
                    if (isAlive(_dragParentPanel) && typeof droppedPanel.SetParent === "function") {
                        droppedPanel.SetParent(_dragParentPanel);
                    }
                    try { droppedPanel.style.align = "left top"; } catch (_) {}
                });
                _dragHandlersBoundRight = true;
            }
        }

        _dragHandleLeft = handlePanel;
        _dragHandleRight = handlePanelRight;
    };

    const wireDragToggleButton = (btn, win) => {
        if (!isAlive(btn)) return;
        ensureDragToggleButtonContent(btn);

        let targetWin = win;
        if (!isAlive(targetWin) && typeof $.GetContextPanel === "function") {
            targetWin = $.GetContextPanel()?.FindChildTraverse?.("SettingsWindow");
        }

        btn.SetHasClass("Active", isDragEnabled());

        btn.SetPanelEvent("onmouseover", () => {
            if (typeof $.DispatchEvent === "function") {
                $.DispatchEvent("UIShowTextTooltip", btn, localize("Allows you to drag move some menus."));
            }
        });

        btn.SetPanelEvent("onmouseout", () => {
            if (typeof $.DispatchEvent === "function") {
                $.DispatchEvent("UIHideTextTooltip");
            }
        });

        btn.SetPanelEvent("onactivate", () => {
            if (typeof globalThis.MOD_CONFIG === "object" && globalThis.MOD_CONFIG !== null) {
                globalThis.MOD_CONFIG.DRAG_ENABLED = (globalThis.MOD_CONFIG.DRAG_ENABLED === 1 ? 0 : 1);
            }
            btn.SetHasClass("Active", isDragEnabled());

            if (!isAlive(targetWin) && typeof $.GetContextPanel === "function") {
                targetWin = $.GetContextPanel()?.FindChildTraverse?.("SettingsWindow");
            }
            if (isAlive(targetWin)) {
                setupSettingsWindowDragging(targetWin.FindChildTraverse?.("SettingsHeader"), targetWin);
            }

            if (typeof globalThis.SaveAndSync === "function") {
                globalThis.SaveAndSync();
            }
        });
    };

    // Export on QOL.ui.drag
    Q.ui.drag = {
        ensureDragToggleButtonContent,
        ensureSettingsHeaderDragHandle,
        getPanelXOffsetWithinAncestor,
        getPanelYOffsetWithinAncestor,
        updateSettingsHeaderDragAreaBounds,
        setupSettingsWindowDragging,
        wireDragToggleButton,
        isDragEnabled,
    };

    // Backward compatibility globals for ql_settings.js
    globalThis.EnsureDragToggleButtonContent = ensureDragToggleButtonContent;
    globalThis.EnsureSettingsHeaderDragHandle = ensureSettingsHeaderDragHandle;
    globalThis.GetPanelXOffsetWithinAncestor = getPanelXOffsetWithinAncestor;
    globalThis.GetPanelYOffsetWithinAncestor = getPanelYOffsetWithinAncestor;
    globalThis.UpdateSettingsHeaderDragAreaBounds = updateSettingsHeaderDragAreaBounds;
    globalThis.SetupSettingsWindowDragging = setupSettingsWindowDragging;
    globalThis.WireDragToggleButton = wireDragToggleButton;
})();
