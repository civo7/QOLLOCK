// OWNS: Per-source cooldown estimation, slot content, successful render signatures and ready feedback.
(() => {
    "use strict";
    const N = QOL.features.itemMirror;
    const { FEATURE_ID, ITEM_MIRROR_ICON_BASE_SIZE_PX, ITEM_MIRROR_TEXT_PROBE_INTERVAL_MS,
        ITEM_MIRROR_EMPTY_TEXT_PROBE_INTERVAL_MS, ITEM_MIRROR_RAPID_RETRIGGER_WINDOW_MS,
        ITEM_MIRROR_RAPID_RETRIGGER_SUPPRESS_MS, ITEM_MIRROR_READY_OVERLAY_FLASH_MS,
        ITEM_MIRROR_FORCED_IMAGE_BY_CLASS } = N.data;
    const _nowMs = QOL.utils.PerfNowMs, _isAlive = QOL.utils.IsPanelValid;
    function _getPanelClassTokens(panel) {
        if (!panel || !panel.GetAttributeString) return [];
        const classAttr = panel.GetClasses ? panel.GetClasses() : panel.GetAttributeString("class", "");
        if (Array.isArray(classAttr)) return classAttr;
        if (!classAttr || classAttr.length === 0) return [];
        const split = classAttr.split(/\s+/);
        const out = [];
        for (let i = 0; i < split.length; i++) {
            if (split[i]) out.push(split[i]);
        }
        return out;
    }

    function _syncPanelClasses(source, target, cache, cacheKey, seedClasses) {
        if (!source || !target) return;
        const prior = cache[cacheKey] || [];
        const map = {};
        for (let i = 0; i < prior.length; i++) if (prior[i]) map[prior[i]] = true;
        if (seedClasses) {
            for (let s = 0; s < seedClasses.length; s++) if (seedClasses[s]) map[seedClasses[s]] = true;
        }
        const fromAttr = _getPanelClassTokens(source);
        for (let a = 0; a < fromAttr.length; a++) if (fromAttr[a]) map[fromAttr[a]] = true;

        const tokens = Object.keys(map);
        for (let t = 0; t < tokens.length; t++) {
            const cls = tokens[t];
            target.SetHasClass(cls, source.BHasClass && source.BHasClass(cls));
        }
        cache[cacheKey] = tokens;
    }

    function _parseRadialClipEndDeg(clipText) {
        if (!clipText || clipText.length === 0) return null;
        const m = /,\s*([+\-]?\d+(?:\.\d+)?)\s*deg\s*\)/i.exec(String(clipText));
        if (!m || !m[1]) return null;
        const v = parseFloat(m[1]);
        return isFinite(v) ? v : null;
    }

    function _parseRadialClipStartDeg(clipText) {
        if (!clipText || clipText.length === 0) return null;
        const text = String(clipText);
        let m = /radial\s*\(\s*[^,]+,\s*([+\-]?\d+(?:\.\d+)?)\s*deg\s*,/i.exec(text);
        if ((!m || !m[1]) && text.indexOf(",") >= 0) {
            m = /,\s*([+\-]?\d+(?:\.\d+)?)\s*deg\s*,/i.exec(text);
        }
        if (!m || !m[1]) return null;
        const v = parseFloat(m[1]);
        return isFinite(v) ? v : null;
    }

    function _resolveRadialProgressDeg(clipText, previousDeg) {
        const startDeg = _parseRadialClipStartDeg(clipText);
        const endDeg = _parseRadialClipEndDeg(clipText);
        if (startDeg === null && endDeg === null) return null;
        if (startDeg === null) return endDeg;
        if (endDeg === null) return startDeg;
        if (!isFinite(startDeg) && !isFinite(endDeg)) return null;
        if (!isFinite(startDeg)) return endDeg;
        if (!isFinite(endDeg)) return startDeg;
        if (Math.abs(startDeg) <= 0.01 && endDeg > 0.01) return endDeg;
        if (Math.abs(endDeg) <= 0.01 && startDeg > 0.01) return startDeg;
        if (previousDeg !== null && isFinite(previousDeg)) {
            const ds = Math.abs(startDeg - previousDeg);
            const de = Math.abs(endDeg - previousDeg);
            if (ds < de) return startDeg;
            if (de < ds) return endDeg;
        }
        return (Math.abs(startDeg) >= Math.abs(endDeg)) ? startDeg : endDeg;
    }

    function _formatDerivedCooldownSeconds(sec) {
        if (!isFinite(sec) || sec <= 0) return "";
        if (sec >= 1) return String(Math.ceil(sec));
        const rounded = Math.round(sec * 10) / 10;
        return rounded.toFixed(1);
    }

    N.createRenderer = (ctx, readState, native) => {
        const { _getStableRuntimePanelId, _getInlineStyleProperty, _probeCooldownTextFromSourceIcon } = native;
        const ITEM_MIRROR_FLASH_DEBUG = false, ITEM_MIRROR_COOLDOWN_DEBUG = false, ITEM_MIRROR_COOLDOWN_DEBUG_THROTTLE_MS = 350;
        const readyFlashes = new Map();

        function _clearReadyFlash(overlayPanel) {
            const pending = readyFlashes.get(overlayPanel);
            readyFlashes.delete(overlayPanel);
            if (pending?.task) pending.task.stop();
            if (!_isAlive(overlayPanel)) return;
            if (overlayPanel.SetHasClass) overlayPanel.SetHasClass("ready_flash", false);
        }

        function _triggerReadyFlash(overlayPanel) {
            if (!_isAlive(overlayPanel)) return;
            _clearReadyFlash(overlayPanel);
            const pending = { task: null };
            readyFlashes.set(overlayPanel, pending);
            overlayPanel.style.visibility = "visible";
            pending.task = QOL.core.Scheduler.scheduleOnce(() => {
                if (!_isAlive(overlayPanel) || readyFlashes.get(overlayPanel) !== pending) return;
                overlayPanel.SetHasClass("ready_flash", true);
                pending.task = QOL.core.Scheduler.scheduleOnce(() => {
                    if (readyFlashes.get(overlayPanel) === pending) _clearReadyFlash(overlayPanel);
                }, (ITEM_MIRROR_READY_OVERLAY_FLASH_MS + 40) / 1000, ctx.id || FEATURE_ID);
            }, 0.01, ctx.id || FEATURE_ID);
        }

        function release() {
            for (const overlay of Array.from(readyFlashes.keys())) _clearReadyFlash(overlay);
        }


        function _syncItemMirrorStaticSlotState(slotObj, source, sourceIcon, sourceMod, slotState) {
            if (!slotObj || !source || !sourceIcon || !slotState) return;
            const mirrorIcon = slotObj.icon;
            const mirrorSlot = slotObj.modContainer;
            if (!mirrorIcon || !mirrorSlot) return;

            const sourceItemClassName = source.itemClassName || "";
            const sourceSig = [
                source.key || "",
                String(_getStableRuntimePanelId(sourceIcon)),
                String(_getStableRuntimePanelId(sourceMod)),
                String(sourceItemClassName),
                String(source.iconSrc || ""),
                String(source.targetIconSrc || "")
            ].join("|");
            if (slotState.staticSyncSig === sourceSig) return;
            if (!slotObj.classCache) slotObj.classCache = {};
            const classCache = slotObj.classCache;
            if (slotObj.itemClassName && slotObj.itemClassName !== sourceItemClassName) {
                for (const target of [mirrorSlot, slotObj.background, slotObj.iconInner, slotObj.image]) {
                    if (target) target.SetHasClass(slotObj.itemClassName, false);
                }
            }
            slotObj.itemClassName = sourceItemClassName;

            if (sourceMod) {
                _syncPanelClasses(sourceMod, mirrorSlot, classCache, "container", ["mod_icon_single_container"]);
            }
            if (sourceItemClassName && sourceItemClassName.length > 0 && sourceMod && sourceMod.BHasClass) {
                const hasItemClass = sourceMod.BHasClass(sourceItemClassName);
                mirrorSlot.SetHasClass(sourceItemClassName, hasItemClass);
                if (slotObj.background) slotObj.background.SetHasClass(sourceItemClassName, hasItemClass);
                if (slotObj.iconInner) slotObj.iconInner.SetHasClass(sourceItemClassName, hasItemClass);
                if (slotObj.image) slotObj.image.SetHasClass(sourceItemClassName, hasItemClass);
            }

            _syncPanelClasses(sourceIcon, mirrorIcon, classCache, "owner", ["OnCooldown", "OffCooldown", "VerticalCooldown", "isWeapon", "isArmor", "isTech"]);
            _syncPanelClasses(sourceIcon, mirrorSlot, classCache, "slotOwner", ["OnCooldown", "OffCooldown", "VerticalCooldown", "isWeapon", "isArmor", "isTech"]);
            slotState.staticSyncSig = sourceSig;
        }

        function _syncMirrorItemFromSourceMulti(slotObj, source) {
            const _mirror = readState();
            if (!slotObj || !source || !source.ownerIcon) return;
            const sourceIcon = source.ownerIcon;
            const sourceModContainer = source.iconContainer;
            const sourceItemClassName = source.itemClassName;
            const sourceTargetIconSrc = source.targetIconSrc;

            const mirrorIcon = slotObj.icon;
            const mirrorSlot = slotObj.modContainer;
            const mirrorMask = slotObj.cooldownMask;
            const mirrorCooldownText = slotObj.cooldownText;
            const mirrorReadyOverlay = slotObj.readyOverlay;
            const mirrorIconInner = slotObj.iconInner;
            const mirrorImage = slotObj.image;
            if (!mirrorSlot || !sourceIcon || !mirrorIcon) return;

            let slotState = _mirror.slotStates[source.key];
            if (!slotState) {
                slotState = {
                    lastSrc: "",
                    lastClip: "",
                    lastMaskScaleSig: "",
                    wasOnCooldown: false,
                    cdLastDeg: null,
                    cdLastMs: 0,
                    cdSlopeEma: null,
                    cdDirection: 0,
                    cdDisplayLock: null,
                    lastSizeSig: "",
                    staticSyncSig: "",
                    lastCooldownClassSig: "",
                    lastMirrorImagePanel: null,
                    cooldownTextStyled: false,
                    nextCooldownTextProbeMs: 0,
                    lastProbeCooldownText: "",
                    wasCooldownTextVisible: false,
                    lastCooldownEndMs: 0,
                    rapidRetriggerSuppressUntilMs: 0
                };
                _mirror.slotStates[source.key] = slotState;
            }
            // Source history survives reordering, but rendered signatures
            // do not survive a different slot or another occupant.
            const renderSlotChanged = slotState.renderSlot !== slotObj || slotObj.renderedSourceKey !== source.key;
            if (renderSlotChanged) {
                _clearReadyFlash(mirrorReadyOverlay);
                slotState.renderSlot = slotObj;
                slotObj.renderedSourceKey = source.key;
                slotState.staticSyncSig = "";
                slotState.lastCooldownClassSig = "";
                slotState.lastSizeSig = "";
                slotState.lastMaskScaleSig = "";
                slotState.lastMirrorImagePanel = null;
                slotState.cooldownTextStyled = false;
            }
            // Acquisition identity can survive a rebuilt inventory, but radial
            // velocity and text samples cannot cross a native panel generation.
            if (slotState.probeSourceIcon !== sourceIcon || slotState.probeSourceMod !== sourceModContainer ||
            slotState.probeSourceMask !== source.cooldownMask) {
                _clearReadyFlash(mirrorReadyOverlay);
                slotState.probeSourceIcon = sourceIcon;
                slotState.probeSourceMod = sourceModContainer;
                slotState.probeSourceMask = source.cooldownMask;
                slotState.nextCooldownTextProbeMs = 0;
                slotState.lastProbeCooldownText = "";
                slotState.lastClip = "";
                slotState.wasOnCooldown = false;
                slotState.wasCooldownTextVisible = false;
                slotState.cdLastDeg = null;
                slotState.cdLastMs = 0;
                slotState.cdSlopeEma = null;
                slotState.cdDirection = 0;
                slotState.cdDisplayLock = null;
                slotState.lastCooldownEndMs = 0;
                slotState.rapidRetriggerSuppressUntilMs = 0;
                if (mirrorMask) {
                    mirrorMask.style.clip = "radial(50% 50%, 0deg, 0deg)";
                    QOL_UTILS.SetPanelOpacitySafe(mirrorMask, 1, 1);
                }
            }
            const wasOnCooldownBefore = !!slotState.wasOnCooldown;

            const sourceMod = _isAlive(sourceModContainer) ? sourceModContainer : (sourceIcon.FindChildTraverse ? sourceIcon.FindChildTraverse("modIconContainer") : null);
            if (sourceMod && sourceMod !== source.iconContainer) source.iconContainer = sourceMod;
            let sourceImage = _isAlive(source.sourceImage) ? source.sourceImage : null;
            if (!sourceImage && sourceMod && sourceMod.FindChildTraverse) sourceImage = sourceMod.FindChildTraverse("ModIconImage");
            if (!sourceImage && sourceIcon.FindChildTraverse) sourceImage = sourceIcon.FindChildTraverse("ModIconImage");
            source.sourceImage = sourceImage || null;
            const size = _resolveMirrorItemSize(sourceIcon, sourceMod);
            const sizeSig = size.width + "|" + size.height;
            if (mirrorIcon.style.margin !== "2px 6px 2px 6px") {
                mirrorIcon.style.margin = "2px 6px 2px 6px";
            }
            if (mirrorCooldownText) {
                if (!slotState.cooldownTextStyled) {
                    mirrorCooldownText.style.width = "fit-children";
                    mirrorCooldownText.style.height = "fit-children";
                    mirrorCooldownText.style.fontSize = "20px";
                    mirrorCooldownText.style.fontWeight = "bold";
                    mirrorCooldownText.style.margin = "0px";
                    mirrorCooldownText.style.padding = "0px";
                    mirrorCooldownText.style.horizontalAlign = "center";
                    mirrorCooldownText.style.verticalAlign = "center";
                    mirrorCooldownText.style.textAlign = "center";
                    mirrorCooldownText.style.textOverflow = "clip";
                    mirrorCooldownText.style.y = "0px";
                    slotState.cooldownTextStyled = true;
                }
            }

            _syncItemMirrorStaticSlotState(slotObj, source, sourceIcon, sourceMod, slotState);

            // Keep mirror icon sizing deterministic regardless of source panel classes/style.
            if (slotState.lastSizeSig !== sizeSig ||
            mirrorIcon.style.width !== size.width ||
            mirrorIcon.style.height !== size.height ||
            mirrorSlot.style.width !== size.width ||
            mirrorSlot.style.height !== size.height) {
                mirrorIcon.style.width = size.width;
                mirrorIcon.style.height = size.height;
                mirrorSlot.style.width = size.width;
                mirrorSlot.style.height = size.height;
                slotState.lastSizeSig = sizeSig;
            }

            if (mirrorSlot.style.visibility !== "visible") mirrorSlot.style.visibility = "visible";
            if (mirrorSlot.style.backgroundColor !== "none") mirrorSlot.style.backgroundColor = "none";

            let hasImageSrc = false;
            if (mirrorImage && sourceImage) {
                if (slotState.lastMirrorImagePanel !== mirrorImage) {
                    slotState.lastMirrorImagePanel = mirrorImage;
                    slotState.lastSrc = "";
                }
                let forcedSrc = "";
                if (sourceTargetIconSrc && sourceTargetIconSrc.length > 0) {
                    forcedSrc = sourceTargetIconSrc;
                } else if (sourceItemClassName && ITEM_MIRROR_FORCED_IMAGE_BY_CLASS.hasOwnProperty(sourceItemClassName)) {
                    forcedSrc = ITEM_MIRROR_FORCED_IMAGE_BY_CLASS[sourceItemClassName];
                }

                let srcVal = forcedSrc;
                if (!srcVal || srcVal.length === 0) {
                    srcVal = sourceImage.GetAttributeString ? sourceImage.GetAttributeString("src", "") : "";
                    if ((!srcVal || srcVal === "none") && sourceImage.GetAttributeString) {
                        srcVal = sourceImage.GetAttributeString("defaultsrc", "");
                    }
                }
                if (srcVal && srcVal !== "none") {
                    try {
                        if (slotState.lastSrc !== srcVal) {
                            if (mirrorImage.SetImage) {
                                mirrorImage.SetImage(srcVal);
                            } else {
                                mirrorImage.style.backgroundImage = 'url("' + srcVal + '")';
                            }
                            slotState.lastSrc = srcVal;
                        }
                        hasImageSrc = true;
                    } catch(e) { QOL.core.Logger.logWarn("core", "op failed: " + (e && e.message ? e.message : String(e || ""))); }
                }
            }

            if (mirrorImage) {
                const imageVisibility = hasImageSrc ? "visible" : "collapse";
                if (mirrorImage.style.visibility !== imageVisibility) mirrorImage.style.visibility = imageVisibility;
                if (mirrorImage.style.zIndex !== "5") mirrorImage.style.zIndex = "5";
            }
            if (mirrorIconInner) {
                const iconInnerVisibility = hasImageSrc ? "collapse" : "visible";
                if (mirrorIconInner.style.visibility !== iconInnerVisibility) mirrorIconInner.style.visibility = iconInnerVisibility;
                if (mirrorIconInner.style.zIndex !== "4") mirrorIconInner.style.zIndex = "4";
            }

            if (!mirrorMask) return;
            let sourceMask = _isAlive(source.cooldownMask) ? source.cooldownMask : null;
            if (!sourceMask && sourceIcon.FindChildTraverse) sourceMask = sourceIcon.FindChildTraverse("CooldownMask");
            source.cooldownMask = sourceMask || null;
            const isOnCooldown = sourceIcon.BHasClass && sourceIcon.BHasClass("OnCooldown");
            const isVerticalCooldown = sourceIcon.BHasClass && sourceIcon.BHasClass("VerticalCooldown");
            const nowMs = Date.now ? Date.now() : (new Date()).getTime();

            const startedCooldownCycle = (!wasOnCooldownBefore && !!isOnCooldown);
            if (startedCooldownCycle) {
                slotState.nextCooldownTextProbeMs = 0;
                slotState.lastProbeCooldownText = "";
                const sinceEndMs = (slotState.lastCooldownEndMs > 0) ? (nowMs - slotState.lastCooldownEndMs) : 999999;
                if (sinceEndMs <= ITEM_MIRROR_RAPID_RETRIGGER_WINDOW_MS) {
                    slotState.rapidRetriggerSuppressUntilMs = nowMs + ITEM_MIRROR_RAPID_RETRIGGER_SUPPRESS_MS;
                    _itemMirrorFlashLog(source.key + " rapid suppress ON (" + String(ITEM_MIRROR_RAPID_RETRIGGER_SUPPRESS_MS) + "ms)");
                } else {
                    slotState.rapidRetriggerSuppressUntilMs = 0;
                }
                slotState.cdLastDeg = null;
                slotState.cdLastMs = 0;
                slotState.cdSlopeEma = null;
                slotState.cdDirection = 0;
                slotState.cdDisplayLock = null;
            }

            const cooldownClassSig = (isOnCooldown ? "1" : "0") + "|" + (isVerticalCooldown ? "1" : "0");
            if (slotState.lastCooldownClassSig !== cooldownClassSig) {
                mirrorIcon.SetHasClass("just_ready", false);
                mirrorSlot.SetHasClass("just_ready", false);
                mirrorIcon.SetHasClass("OnCooldown", !!isOnCooldown);
                mirrorIcon.SetHasClass("OffCooldown", !isOnCooldown);
                mirrorIcon.SetHasClass("VerticalCooldown", !!isVerticalCooldown);
                mirrorSlot.SetHasClass("OnCooldown", !!isOnCooldown);
                mirrorSlot.SetHasClass("OffCooldown", !isOnCooldown);
                mirrorSlot.SetHasClass("VerticalCooldown", !!isVerticalCooldown);
                slotState.lastCooldownClassSig = cooldownClassSig;
            }

            let maskClip = "";
            let maskOpacity = "";
            let maskVisibility = "";
            if (sourceMask && sourceMask.style) {
                const clipVal = sourceMask.style.clip;
                const opacityVal = sourceMask.style.opacity;
                const visibilityVal = sourceMask.style.visibility;

                if (clipVal !== undefined && clipVal !== null && clipVal !== "") maskClip = clipVal;
                if (opacityVal !== undefined && opacityVal !== null && opacityVal !== "") maskOpacity = opacityVal;
                if (visibilityVal !== undefined && visibilityVal !== null && visibilityVal !== "") maskVisibility = visibilityVal;
            }

            if (!maskClip && sourceMask) maskClip = _getInlineStyleProperty(sourceMask, "clip");
            if (!maskOpacity && sourceMask) maskOpacity = _getInlineStyleProperty(sourceMask, "opacity");
            if (!maskVisibility && sourceMask) maskVisibility = _getInlineStyleProperty(sourceMask, "visibility");

            if (maskClip && maskClip.length > 0) {
                if (slotState.lastClip !== maskClip || renderSlotChanged) {
                    try {
                        mirrorMask.style.clip = maskClip;
                        slotState.lastClip = maskClip;
                    } catch(e1) { slotState.renderSlot = null; QOL.core.Logger.logWarn("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
                }
            } else if (slotState.lastClip && slotState.lastClip.length > 0) {
                try {
                    if (mirrorMask.style.clip !== slotState.lastClip) {
                        mirrorMask.style.clip = slotState.lastClip;
                    }
                } catch(e2) { QOL.core.Logger.logWarn("core", "op failed: " + (e2 && e2.message ? e2.message : String(e2 || ""))); }
            }
            if (maskOpacity && maskOpacity.length > 0) {
                QOL_UTILS.SetPanelOpacitySafe(mirrorMask, maskOpacity, 1.0);
            }

            const maskScaleSig = isVerticalCooldown ? "1.00, 1.00" : "-1.00, 1.00";
            if (slotState.lastMaskScaleSig !== maskScaleSig) {
                try {
                    mirrorMask.style.preTransformScale2d = maskScaleSig;
                    slotState.lastMaskScaleSig = maskScaleSig;
                } catch(e4) { QOL.core.Logger.logWarn("core", "op failed: " + (e4 && e4.message ? e4.message : String(e4 || ""))); }
            }
            let showMask = !!isOnCooldown;
            if (!showMask && maskVisibility) showMask = (maskVisibility === "visible");
            const maskVisible = showMask ? "visible" : "collapse";
            if (mirrorMask.style.visibility !== maskVisible) mirrorMask.style.visibility = maskVisible;

            let isCooldownTextVisible = false, cooldownText = "", currentDeg = null;
            if (mirrorCooldownText) {
                cooldownText = "";
                let cooldownTextFromDerived = false;
                let cooldownTextDerivedNum = null;
                if (isOnCooldown) {
                    if (nowMs >= slotState.nextCooldownTextProbeMs) {
                        const cooldownProbe = _probeCooldownTextFromSourceIcon(sourceIcon);
                        slotState.lastProbeCooldownText = cooldownProbe.chosen || "";
                        // Retry missing text: C++ may add a label after the initial scan.
                        slotState.nextCooldownTextProbeMs = nowMs + (cooldownProbe.chosen
                            ? ITEM_MIRROR_TEXT_PROBE_INTERVAL_MS : ITEM_MIRROR_EMPTY_TEXT_PROBE_INTERVAL_MS);
                    }
                    cooldownText = slotState.lastProbeCooldownText || "";
                    if (cooldownText && cooldownText.length > 0) {
                        slotState.rapidRetriggerSuppressUntilMs = 0;
                    }
                }
                if ((!cooldownText || cooldownText.length === 0) && isOnCooldown) {
                    const calcClip = maskClip && maskClip.length > 0 ? maskClip : slotState.lastClip;
                    currentDeg = _resolveRadialProgressDeg(calcClip, slotState.cdLastDeg);
                    if (isFinite(currentDeg)) {
                        if (currentDeg < 0) currentDeg = 0;
                        if (currentDeg > 360 && currentDeg <= 720) currentDeg = currentDeg % 360;
                        if (currentDeg > 360) currentDeg = 360;
                    } else {
                        currentDeg = null;
                    }
                    if (currentDeg !== null) {
                        if (slotState.cdLastDeg !== null && slotState.cdLastMs > 0) {
                            const dtSec = (nowMs - slotState.cdLastMs) / 1000.0;
                            const dDeg = slotState.cdLastDeg - currentDeg;
                            if (dDeg < -180 || dDeg > 360) {
                                slotState.cdSlopeEma = null;
                                slotState.cdDisplayLock = null;
                                slotState.cdDirection = 0;
                            } else if (dtSec > 0.01 && dtSec < 1.0 && Math.abs(dDeg) > 0.01) {
                                if (slotState.cdDirection === 0 && Math.abs(dDeg) >= 0.05) {
                                    slotState.cdDirection = (dDeg > 0) ? 1 : -1;
                                }
                                let signedDelta = 0;
                                if (slotState.cdDirection >= 0 && dDeg > 0) {
                                    signedDelta = dDeg;
                                } else if (slotState.cdDirection <= 0 && dDeg < 0) {
                                    signedDelta = -dDeg;
                                }
                                if (signedDelta > 0) {
                                    const slope = signedDelta / dtSec;
                                    if (isFinite(slope) && slope > 0.001 && slope < 5000) {
                                        slotState.cdSlopeEma = (slotState.cdSlopeEma === null) ? slope : ((slotState.cdSlopeEma * 0.75) + (slope * 0.25));
                                    }
                                }
                            }
                        }
                        slotState.cdLastDeg = currentDeg;
                        slotState.cdLastMs = nowMs;
                        if (slotState.cdSlopeEma !== null && slotState.cdSlopeEma > 0.001) {
                            let remainingDeg = currentDeg;
                            if (slotState.cdDirection < 0) {
                                remainingDeg = 360 - currentDeg;
                            }
                            if (!isFinite(remainingDeg) || remainingDeg < 0) remainingDeg = 0;
                            const remainingSec = remainingDeg / slotState.cdSlopeEma;
                            const displayRaw = _formatDerivedCooldownSeconds(remainingSec);
                            let n = parseFloat(displayRaw);
                            if (isFinite(n)) {
                                if (n >= 1) {
                                    let intVal = Math.ceil(n);
                                    if (slotState.cdDisplayLock !== null && isFinite(slotState.cdDisplayLock)) {
                                        intVal = Math.min(intVal, slotState.cdDisplayLock);
                                    }
                                    slotState.cdDisplayLock = intVal;
                                    cooldownText = String(intVal);
                                    cooldownTextFromDerived = true;
                                    cooldownTextDerivedNum = intVal;
                                } else {
                                    if (slotState.cdDisplayLock !== null && isFinite(slotState.cdDisplayLock)) {
                                        n = Math.min(n, slotState.cdDisplayLock);
                                    }
                                    slotState.cdDisplayLock = n;
                                    cooldownText = (Math.round(n * 10) / 10).toFixed(1);
                                    cooldownTextFromDerived = true;
                                    cooldownTextDerivedNum = n;
                                }
                            } else {
                                cooldownText = displayRaw;
                                cooldownTextFromDerived = true;
                                cooldownTextDerivedNum = parseFloat(displayRaw);
                            }
                        }
                    }
                }

                if (cooldownTextFromDerived && isFinite(cooldownTextDerivedNum) && cooldownTextDerivedNum > 0 && cooldownTextDerivedNum < 1) {
                    if (slotState.rapidRetriggerSuppressUntilMs > nowMs) {
                        cooldownText = "";
                    }
                }

                if (cooldownText && cooldownText.length > 0) {
                    if (mirrorCooldownText.text !== cooldownText) mirrorCooldownText.text = cooldownText;
                    if (mirrorCooldownText.style.visibility !== "visible") mirrorCooldownText.style.visibility = "visible";
                    isCooldownTextVisible = true;
                } else {
                    if (mirrorCooldownText.style.visibility !== "collapse") mirrorCooldownText.style.visibility = "collapse";
                    if (!isOnCooldown) slotState.lastProbeCooldownText = "";
                }
            } else {
                isCooldownTextVisible = false;
            }

            if (ITEM_MIRROR_COOLDOWN_DEBUG && isOnCooldown) {
                const probeShort = slotState.lastProbeCooldownText || "-";
                let clipShort = maskClip || slotState.lastClip || "";
                const currentDegText = (currentDeg === null || currentDeg === undefined || !isFinite(currentDeg)) ? "-" : currentDeg.toFixed(2);
                const slopeText = (slotState.cdSlopeEma === null || slotState.cdSlopeEma === undefined || !isFinite(slotState.cdSlopeEma)) ? "-" : slotState.cdSlopeEma.toFixed(3);
                if (clipShort.length > 96) clipShort = clipShort.slice(0, 96) + "...";
                const cooldownDebugSig =
                String(source.key) + "|" +
                String(isVerticalCooldown ? 1 : 0) + "|" +
                currentDegText + "|" +
                String(slotState.cdDirection || 0) + "|" +
                slopeText + "|" +
                String(slotState.cdDisplayLock === null ? "-" : slotState.cdDisplayLock) + "|" +
                String(cooldownText || "-") + "|" +
                probeShort + "|" +
                clipShort;
                _itemMirrorCooldownDebugLogThrottled(
                    cooldownDebugSig,
                    "src=" + String(source.key) +
                " item=" + String(sourceItemClassName || "-") +
                " on=1 vertical=" + (isVerticalCooldown ? "1" : "0") +
                " deg=" + currentDegText +
                " dir=" + String(slotState.cdDirection || 0) +
                " slope=" + slopeText +
                " lock=" + (slotState.cdDisplayLock === null ? "-" : String(slotState.cdDisplayLock)) +
                " probe=" + probeShort +
                " text=" + (cooldownText || "-") +
                " clip=" + clipShort,
                    nowMs
                );
            }

            // Trigger ready flash on true cooldown end, with cooldown-text fallback.
            const becameReadyFromState = wasOnCooldownBefore && !isOnCooldown;
            const becameReadyFromText = slotState.wasCooldownTextVisible && !isCooldownTextVisible && !isOnCooldown;
            if (becameReadyFromState || becameReadyFromText) {
                if (mirrorReadyOverlay) _triggerReadyFlash(mirrorReadyOverlay, source.key);
                slotState.lastCooldownEndMs = nowMs;
                slotState.rapidRetriggerSuppressUntilMs = 0;
            }
            slotState.wasCooldownTextVisible = isCooldownTextVisible;
            slotState.wasOnCooldown = !!isOnCooldown;

            if (!isOnCooldown) {
                slotState.cdLastDeg = null;
                slotState.cdLastMs = 0;
                slotState.cdSlopeEma = null;
                slotState.cdDirection = 0;
                slotState.cdDisplayLock = null;
                slotState.nextCooldownTextProbeMs = 0;
                slotState.lastProbeCooldownText = "";
            } else {
                _mirror.fastModeUntilMs = nowMs + 500;
            }
        }

        function _itemMirrorFlashLog(msg) {
            if (!ITEM_MIRROR_FLASH_DEBUG) return;
            $.Msg("[QOLLock][ItemMirrorFlash] " + msg);
        }

        function _itemMirrorCooldownDebugLog(msg) {
            if (!ITEM_MIRROR_COOLDOWN_DEBUG) return;
            $.Msg("[QOLLock][ItemMirrorCooldown] " + msg);
        }

        function _itemMirrorCooldownDebugLogThrottled(sig, msg, nowMs) {
            const _mirror = readState();
            if (!ITEM_MIRROR_COOLDOWN_DEBUG) return;
            const now = Number(nowMs) || (Date.now ? Date.now() : (new Date()).getTime());
            const sameSig = sig && sig === _mirror.debugLastSig;
            if (sameSig && now < (_mirror.debugLastMs || 0)) return;
            _mirror.debugLastSig = sig || "";
            _mirror.debugLastMs = now + ITEM_MIRROR_COOLDOWN_DEBUG_THROTTLE_MS;
            _itemMirrorCooldownDebugLog(msg);
        }

        function _resolveMirrorItemSize(sourceIcon, sourceMod) {
            let sizePx = Math.round(Number(ITEM_MIRROR_ICON_BASE_SIZE_PX));
            if (!isFinite(sizePx) || sizePx <= 0) sizePx = 45;
            const sizeText = String(sizePx) + "px";
            return { width: sizeText, height: sizeText };
        }


        function createSlot(row, slotIndex) {
            const mirrorIcon = $.CreatePanel("Panel", row, "QOLItemMirrorIcon_" + String(slotIndex), {
                hittest: "false",
                hittestchildren: "false"
            });
            try {
                mirrorIcon.AddClass("QOLItemMirrorIcon");
                const baseSizeText = String(Math.max(1, Math.round(Number(ITEM_MIRROR_ICON_BASE_SIZE_PX) || 45))) + "px";
                mirrorIcon.style.width = baseSizeText;
                mirrorIcon.style.height = baseSizeText;
                mirrorIcon.style.flowChildren = "none";
                mirrorIcon.style.padding = "0px";
                mirrorIcon.style.margin = "2px 6px 2px 6px";
                mirrorIcon.style.overflow = "noclip";
                mirrorIcon.style.borderRadius = "0px";
                mirrorIcon.style.horizontalAlign = "center";
                mirrorIcon.style.verticalAlign = "center";

                const mirrorSlot = $.CreatePanel("Panel", mirrorIcon, "modIconContainer", {
                    hittest: "false",
                    hittestchildren: "false"
                });
                mirrorSlot.AddClass("mod_icon_single_container");
                mirrorSlot.AddClass("QOLItemMirrorModContainer");
                mirrorSlot.style.width = baseSizeText;
                mirrorSlot.style.height = baseSizeText;
                mirrorSlot.style.flowChildren = "none";
                mirrorSlot.style.backgroundColor = "none";
                mirrorSlot.style.padding = "0px";
                mirrorSlot.style.margin = "0px";
                mirrorSlot.style.overflow = "noclip";
                mirrorSlot.style.borderRadius = "0px";
                mirrorSlot.style.opacityMask = "none";
                mirrorSlot.style.horizontalAlign = "center";
                mirrorSlot.style.verticalAlign = "center";

                const viewport = $.CreatePanel("Panel", mirrorSlot, "", {
                    hittest: "false",
                    hittestchildren: "false"
                });
                viewport.AddClass("QOLItemMirrorViewport");
                viewport.style.width = "100%";
                viewport.style.height = "100%";
                viewport.style.padding = "0px";
                viewport.style.margin = "0px";
                viewport.style.horizontalAlign = "center";
                viewport.style.verticalAlign = "center";
                viewport.style.borderRadius = "50%";
                viewport.style.overflow = "clip clip";

                const bg = $.CreatePanel("Panel", viewport, "mod_icon_background", {
                    hittest: "false",
                    hittestchildren: "false"
                });
                bg.AddClass("mod_icon_background_container");
                bg.AddClass("QOLItemMirrorBackground");
                bg.style.width = "100%";
                bg.style.height = "100%";
                bg.style.backgroundColor = "none";
                bg.style.padding = "0px";
                bg.style.margin = "0px";
                bg.style.overflow = "clip clip";
                bg.style.borderRadius = "0px";
                bg.style.visibility = "collapse";
                QOL_UTILS.SetPanelOpacitySafe(bg, 0, 0);
                bg.style.width = "0px";
                bg.style.height = "0px";
                bg.style.horizontalAlign = "center";
                bg.style.verticalAlign = "center";

                const iconInner = $.CreatePanel("Panel", viewport, "mod_icon", {
                    hittest: "false",
                    hittestchildren: "false"
                });
                iconInner.AddClass("mod_icon");
                iconInner.AddClass("ability_icon");
                iconInner.AddClass("QOLItemMirrorIconInner");
                iconInner.style.width = "100%";
                iconInner.style.height = "100%";
                iconInner.style.padding = "0px";
                iconInner.style.margin = "0px";
                iconInner.style.overflow = "clip clip";
                iconInner.style.borderRadius = "0px";
                iconInner.style.horizontalAlign = "center";
                iconInner.style.verticalAlign = "center";

                const img = $.CreatePanel("Image", viewport, "ModIconImage", {
                    hittest: "false",
                    hittestchildren: "false",
                    scaling: "stretch",
                    defaultsrc: "none"
                });
                img.AddClass("QOLItemMirrorImage");
                img.style.width = "100%";
                img.style.height = "100%";
                img.style.visibility = "collapse";
                img.style.padding = "0px";
                img.style.margin = "0px";
                img.style.overflow = "clip clip";
                img.style.borderRadius = "0px";
                img.style.horizontalAlign = "center";
                img.style.verticalAlign = "center";

                const mask = $.CreatePanel("Panel", viewport, "CooldownMask", {
                    hittest: "false",
                    hittestchildren: "false"
                });
                mask.AddClass("QOLItemMirrorCooldownMask");
                mask.style.width = "100%";
                mask.style.height = "100%";
                mask.style.padding = "0px";
                mask.style.margin = "0px";
                mask.style.horizontalAlign = "center";
                mask.style.verticalAlign = "center";
                mask.style.borderRadius = "0px";
                mask.style.clip = "radial(50% 50%, 0deg, 0deg)";
                mask.style.opacityMask = "none";
                mask.style.overflow = "clip clip";
                mask.style.zIndex = "10";

                const cdText = $.CreatePanel("Label", mirrorIcon, "", {
                    hittest: "false",
                    hittestchildren: "false"
                });
                cdText.AddClass("QOLItemMirrorCooldownText");
                cdText.style.visibility = "collapse";
                cdText.style.width = "100%";
                cdText.style.height = "100%";
                cdText.style.horizontalAlign = "center";
                cdText.style.verticalAlign = "center";
                cdText.style.zIndex = "20";

                const readyOverlay = $.CreatePanel("Panel", viewport, "", {
                    hittest: "false",
                    hittestchildren: "false"
                });
                readyOverlay.AddClass("QOLItemMirrorReadyOverlay");
                readyOverlay.style.width = "100%";
                readyOverlay.style.height = "100%";
                readyOverlay.style.horizontalAlign = "center";
                readyOverlay.style.verticalAlign = "center";
                readyOverlay.style.overflow = "clip clip";
                readyOverlay.style.zIndex = "30";

                const slotObj = {
                    icon: mirrorIcon,
                    modContainer: mirrorSlot,
                    background: bg,
                    iconInner: iconInner,
                    image: img,
                    viewport: viewport,
                    cooldownMask: mask,
                    cooldownText: cdText,
                    readyOverlay: readyOverlay,
                    sourceKey: ""
                };
                return slotObj;
            } catch (error) {
                if (_isAlive(mirrorIcon)) mirrorIcon.DeleteAsync(0);
                throw error;
            }
        }

        function slotIsCurrent(slot, row) {
            if (!slot) return false;
            const pairs = [[slot.icon, row], [slot.modContainer, slot.icon], [slot.viewport, slot.modContainer],
                [slot.background, slot.viewport], [slot.iconInner, slot.viewport], [slot.image, slot.viewport],
                [slot.cooldownMask, slot.viewport], [slot.cooldownText, slot.icon], [slot.readyOverlay, slot.viewport]];
            return pairs.every(([panel, parent]) => _isAlive(panel) && panel.GetParent() === parent);
        }
        function releaseSlot(slot) {
            if (!slot) return;
            _clearReadyFlash(slot.readyOverlay);
            // Children can have been reparented while still alive. Every panel in
            // this record was created by this renderer; no native panel is deleted.
            for (const panel of new Set(Object.values(slot))) {
                if (_isAlive(panel) && typeof panel.DeleteAsync === "function") panel.DeleteAsync(0);
            }
        }

        return { _syncMirrorItemFromSourceMulti, _clearReadyFlash, createSlot, slotIsCurrent, releaseSlot, release };
    };
})();
