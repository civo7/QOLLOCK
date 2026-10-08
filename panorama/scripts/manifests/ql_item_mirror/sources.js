// OWNS: Native inventory discovery, matching, source reconciliation and numeric-text observation.
(() => {
    "use strict";
    const N = QOL.features.itemMirror;
    const { INLINE_STYLE_PATTERNS, EXPRESS_SHOT_EXCLUDED_MOD_CLASSES, ITEM_MIRROR_TARGETS } = N.data;
    const _nowMs = QOL.utils.PerfNowMs, _isAlive = QOL.utils.IsPanelValid;
    N.createSources = readState => {
        const ITEM_MIRROR_EXPRESS_DEBUG = false, ITEM_MIRROR_EXCEPTION_DEBUG = false;
        let inventoryResolvers = null;
        function inventoryRoots(hud) {
        // hud.xml verifies the first two owners. Purchased lists are generated
        // natively beneath them; their scoped resolver records observed ancestry.
            if (!inventoryResolvers) inventoryResolvers = [
                QOL.panelCache.createIdResolver("StatsAndModsContainer", { ownerPath: [{ className: "HudCore" }] }),
                QOL.panelCache.createIdResolver("LowerLeft", { ownerPath: [{ className: "HudCore" }, "StatsAndModsContainer"] }),
                QOL.panelCache.createIdResolver("ModPurchasedPanelUniversal"),
                QOL.panelCache.createIdResolver("ModPurchasedPanelUniversalLocked")
            ];
            return inventoryResolvers.map(resolver => resolver.resolve(hud));
        }
        function belongsTo(panel, root) {
            if (!_isAlive(root)) return false;
            for (let depth = 0; depth < 64 && _isAlive(panel); depth++) {
                if (panel === root) return true;
                panel = panel.GetParent();
            }
            return false;
        }
        function currentIdChild(panel, owner) {
            if (!_isAlive(panel) || !belongsTo(panel, owner)) return false;
            const parent = panel.GetParent();
            return !panel.id || (_isAlive(parent) && parent.FindChild(panel.id) === panel);
        }
        function sourceIsCurrent(source, roots) {
            if (!source || !roots.some(root => belongsTo(source.ownerIcon, root))) return false;
            return currentIdChild(source.ownerIcon, source.ownerIcon.GetParent()) &&
            currentIdChild(source.iconContainer, source.ownerIcon);
        }
        function nativeChild(owner, id, previous) {
            if (currentIdChild(previous, owner)) return previous;
            const panel = _isAlive(owner) ? owner.FindChildTraverse(id) : null;
            return _isAlive(panel) ? panel : null;
        }
        function refreshNativeChildren(source) {
            source.sourceImage = nativeChild(source.ownerIcon, "ModIconImage", source.sourceImage);
            source.cooldownMask = nativeChild(source.ownerIcon, "CooldownMask", source.cooldownMask);
        }
        function reset() {
            for (const resolver of inventoryResolvers || []) resolver.reset();
        }
        function _findFirstExcludedModClassHit(iconContainer, ownerIcon, excludedModClasses) {
            if (!excludedModClasses || !excludedModClasses.length) return "";
            for (let i = 0; i < excludedModClasses.length; i++) {
                const cls = excludedModClasses[i];
                if (iconContainer && iconContainer.BHasClass && iconContainer.BHasClass(cls)) return cls;
                if (ownerIcon && ownerIcon.BHasClass && ownerIcon.BHasClass(cls)) return cls;
            }
            return "";
        }


        function _getFirstPanelTextByClass(parent, className) {
            if (!parent || !parent.FindChildrenWithClassTraverse) return "";
            const list = parent.FindChildrenWithClassTraverse(className);
            if (!list || !list.length) return "";
            for (let i = 0; i < list.length; i++) {
                const p = list[i];
                if (p && p.text) return String(p.text);
            }
            return "";
        }

        function _getFirstPanelTextById(parent, id) {
            if (!parent || !parent.FindChildTraverse) return "";
            const p = parent.FindChildTraverse(id);
            return (p && p.text) ? String(p.text) : "";
        }

        function _findItemOwnerFromContainer(iconContainer) {
            let current = iconContainer;
            while (current) {
                if (current.BHasClass) {
                    if (current.BHasClass("isWeapon") || current.BHasClass("isArmor") || current.BHasClass("isTech")) return current;
                    if (current.BHasClass("isTier1") || current.BHasClass("isTier2") || current.BHasClass("isTier3") || current.BHasClass("isTier4")) return current;
                }
                current = current.GetParent ? current.GetParent() : null;
            }
            return null;
        }

        function _getInlineStyleProperty(panel, propName) {
            if (!panel || !panel.GetAttributeString || !propName) return "";
            const styleText = panel.GetAttributeString("style", "");
            if (!styleText || styleText.length === 0) return "";
            const pattern = INLINE_STYLE_PATTERNS[propName];
            const match = pattern ? pattern.exec(styleText) : null;
            return match && match[1] ? match[1].trim() : "";
        }

        function _normalizeCooldownNumberText(text) {
            if (!text || typeof text !== "string") return "";
            const trimmed = text.trim();
            if (trimmed.length === 0) return "";
            const exact = /^(\d+(?:\.\d+)?)(?:s)?$/i.exec(trimmed);
            if (exact && exact[1]) return exact[1];
            const contains = /(\d+(?:\.\d+)?)/.exec(trimmed);
            if (contains && contains[1]) return contains[1];
            return "";
        }

        function _isItemMirrorCooldownProbeExcludedPanel(panel) {
            if (!panel) return false;
            let panelId = "";
            try { panelId = String(panel.id || ""); } catch(e0) { QOL.core.Logger.logWarn("core", "op failed: " + (e0 && e0.message ? e0.message : String(e0 || ""))); }
            if (
                panelId === "UpgradeLevelContainer" ||
            panelId === "UpgradeLevel" ||
            panelId === "TierContainer" ||
            panelId === "mod_tier_label" ||
            panelId === "ItemHidden" ||
            panelId === "embedded_active_tag" ||
            panelId === "ActiveTagContainer"
            ) {
                return true;
            }
            if (panel.BHasClass) {
                try {
                    if (
                        panel.BHasClass("tier_bg") ||
                    panel.BHasClass("mod_icon_background_container")
                    ) {
                        return true;
                    }
                } catch(e1) { QOL.core.Logger.logWarn("core", "op failed: " + (e1 && e1.message ? e1.message : String(e1 || ""))); }
            }
            return false;
        }

        function _findNumericLabelTextInTree(panel) {
            if (!panel || !panel.Children) return "";
            const queue = [panel];
            let best = "";
            for (let cursor = 0; cursor < queue.length; cursor++) {
                const current = queue[cursor];
                if (!current) continue;

                if (_isItemMirrorCooldownProbeExcludedPanel(current)) continue;

                if (typeof current.text === "string") {
                    const t = current.text.trim();
                    const norm = _normalizeCooldownNumberText(t);
                    if (norm && norm.length > 0) {
                        if (!best || norm.length <= best.length) {
                            best = norm;
                            if (t.length <= 2) return best;
                        }
                    }
                }

                const kids = current.Children ? current.Children() : [];
                for (let i = 0; i < kids.length; i++) queue.push(kids[i]);
            }
            return best;
        }

        function _probeCooldownTextFromSourceIcon(sourceIcon) {
            const classCandidates = ["Countdown", "cooldown_text", "CooldownText", "CooldownLabel"];
            const idCandidates = ["Countdown", "cooldown_text", "CooldownText", "CooldownLabel"];
            const byClass = {};
            const byId = {};
            let chosen = "";
            let chosenSource = "";

            if (!sourceIcon) {
                return { chosen: "", chosenSource: "", byClass: byClass, byId: byId, numeric: "" };
            }

            for (let i = 0; i < classCandidates.length; i++) {
                const cls = classCandidates[i];
                const rawByClass = _getFirstPanelTextByClass(sourceIcon, cls);
                const normByClass = _normalizeCooldownNumberText(rawByClass);
                byClass[cls] = normByClass || "";
                if (!chosen && normByClass) {
                    chosen = normByClass;
                    chosenSource = "class:" + cls;
                    return { chosen: chosen, chosenSource: chosenSource };
                }
            }

            for (let j = 0; j < idCandidates.length; j++) {
                const id = idCandidates[j];
                const rawById = _getFirstPanelTextById(sourceIcon, id);
                const normById = _normalizeCooldownNumberText(rawById);
                byId[id] = normById || "";
                if (!chosen && normById) {
                    chosen = normById;
                    chosenSource = "id:" + id;
                    return { chosen: chosen, chosenSource: chosenSource };
                }
            }

            const numeric = _findNumericLabelTextInTree(sourceIcon);
            if (!chosen && numeric) {
                chosen = numeric;
                chosenSource = "numeric";
            }

            return {
                chosen: chosen || "",
                chosenSource: chosenSource || "",
                byClass: byClass,
                byId: byId,
                numeric: numeric || ""
            };
        }

        function _findFirstImageSrcInTree(panel) {
            if (!panel || !panel.Children) return "";
            const queue = [panel];
            while (queue.length > 0) {
                const current = queue.shift();
                if (!current) continue;
                if (current.GetAttributeString) {
                    const src = current.GetAttributeString("src", "");
                    if (src && src !== "none") return src;
                    const def = current.GetAttributeString("defaultsrc", "");
                    if (def && def !== "none") return def;
                }
                let bg = "";
                try {
                    bg = (current.style && current.style.backgroundImage) ? String(current.style.backgroundImage) : "";
                } catch (e) {
                    bg = "";
                }
                const fromBg = _extractUrlFromBackgroundImage(bg);
                if (fromBg && fromBg !== "none") return fromBg;
                const kids = current.Children ? current.Children() : [];
                for (let i = 0; i < kids.length; i++) queue.push(kids[i]);
            }
            return "";
        }

        function _extractUrlFromBackgroundImage(styleValue) {
            if (!styleValue) return "";
            const s = String(styleValue).trim();
            if (!s || s === "none") return "";
            // Panorama commonly stores image styles as: url("file://{images}/...")
            const match = s.match(/url\((['"]?)(.*?)\1\)/i);
            if (match && match[2]) {
                return String(match[2]).trim();
            }
            return "";
        }

        function _getImageSrc(panel) {
            if (!panel || !panel.GetAttributeString) return "";
            const src = panel.GetAttributeString("src", "");
            if (src && src !== "none") return src;
            const def = panel.GetAttributeString("defaultsrc", "");
            if (def && def !== "none") return def;
            let bg = "";
            try {
                bg = (panel.style && panel.style.backgroundImage) ? String(panel.style.backgroundImage) : "";
            } catch (e) {
                bg = "";
            }
            const fromBg = _extractUrlFromBackgroundImage(bg);
            if (fromBg && fromBg !== "none") return fromBg;
            return "";
        }

        function _normalizeIconPath(path) {
            if (!path) return "";
            let s = String(path).trim().toLowerCase();
            if (s.indexOf("panorama:") === 0) s = s.substring(9);
            s = s.replace(/\\/g, "/");
            s = s.replace(/\s+/g, "");
            return s;
        }

        function _extractImagePathTail(path) {
            const s = _normalizeIconPath(path);
            if (!s) return "";
            let idx = s.indexOf("{images}/");
            if (idx >= 0) return s.substring(idx);
            idx = s.indexOf("images/");
            if (idx >= 0) return s.substring(idx);
            return s;
        }

        function _stripKnownImageExt(path) {
            if (!path) return "";
            return path.replace(/\.(psd|vtex|vsvg|png|jpg|jpeg)$/, "");
        }

        function _iconSourceMatchesTarget(foundSrc, expectedSrc) {
            if (!expectedSrc || expectedSrc.length === 0) return true;
            const foundNorm = _normalizeIconPath(foundSrc);
            const expectedNorm = _normalizeIconPath(expectedSrc);
            if (!foundNorm || !expectedNorm) return false;
            if (foundNorm === expectedNorm) return true;

            const foundTail = _extractImagePathTail(foundNorm);
            const expectedTail = _extractImagePathTail(expectedNorm);
            if (!foundTail || !expectedTail) return false;
            if (foundTail === expectedTail) return true;
            if (foundTail.indexOf(expectedTail) !== -1 || expectedTail.indexOf(foundTail) !== -1) return true;

            const foundNoExt = _stripKnownImageExt(foundTail);
            const expectedNoExt = _stripKnownImageExt(expectedTail);
            if (foundNoExt === expectedNoExt) return true;
            return (foundNoExt.indexOf(expectedNoExt) !== -1 || expectedNoExt.indexOf(foundNoExt) !== -1);
        }

        function _ownerMatchesItemKind(ownerIcon, itemKind) {
            if (!itemKind || itemKind.length === 0) return true;
            if (!ownerIcon || !ownerIcon.BHasClass) return false;
            const kind = String(itemKind).toLowerCase();
            if (kind === "weapon") return ownerIcon.BHasClass("isWeapon");
            if (kind === "armor" || kind === "vitality") return ownerIcon.BHasClass("isArmor");
            if (kind === "tech" || kind === "spirit") return ownerIcon.BHasClass("isTech");
            return true;
        }

        function _detectOwnerTier(ownerIcon) {
            if (!ownerIcon || !ownerIcon.BHasClass) return null;

            // Prefer the highest tier class present on owner icon.
            for (let t = 4; t >= 1; t--) {
                if (ownerIcon.BHasClass("isTier" + String(t))) return t;
            }

            // Fallback: read explicit tier label classes if owner tier class is missing.
            const tierLabel = ownerIcon.FindChildTraverse ? ownerIcon.FindChildTraverse("mod_tier_label") : null;
            if (tierLabel && tierLabel.BHasClass) {
                for (let lt = 4; lt >= 1; lt--) {
                    if (tierLabel.BHasClass("ModTierLevel" + String(lt))) return lt;
                }
            }

            return null;
        }

        function _ownerMatchesTier(ownerIcon, tier) {
            if (tier === undefined || tier === null || tier === "") return true;
            if (!ownerIcon || !ownerIcon.BHasClass) return false;
            const tierNum = parseInt(tier, 10);
            if (!isFinite(tierNum)) return true;
            if (tierNum < 1 || tierNum > 4) return true;
            const detected = _detectOwnerTier(ownerIcon);
            if (detected !== null) return detected === tierNum;
            return ownerIcon.BHasClass("isTier" + String(tierNum));
        }

        function _ownerMatchesExtraClass(ownerIcon, ownerClassName) {
            if (!ownerClassName || ownerClassName.length === 0) return true;
            if (!ownerIcon || !ownerIcon.BHasClass) return false;
            return ownerIcon.BHasClass(ownerClassName);
        }

        function _ownerMatchesCooldownCarrier(ownerIcon, requireCooldownCarrier) {
            if (!requireCooldownCarrier) return true;
            if (!ownerIcon || !ownerIcon.BHasClass) return false;
            const hasCooldownState = ownerIcon.BHasClass("OnCooldown") || ownerIcon.BHasClass("OffCooldown");
            if (!hasCooldownState) return false;
            const cooldownMask = ownerIcon.FindChildTraverse ? ownerIcon.FindChildTraverse("CooldownMask") : null;
            return !!cooldownMask;
        }

        function _ownerMatchesCooldownState(ownerIcon, requireCooldownState) {
            if (!requireCooldownState) return true;
            if (!ownerIcon || !ownerIcon.BHasClass) return false;
            return ownerIcon.BHasClass("OnCooldown") || ownerIcon.BHasClass("OffCooldown");
        }

        function _ownerMatchesUseType(ownerIcon, requirePassiveItem, requireActiveItem) {
            if (!ownerIcon || !ownerIcon.BHasClass) return false;
            const isActiveItem = ownerIcon.BHasClass("isActiveItem");
            if (requirePassiveItem && isActiveItem) return false;
            if (requireActiveItem && !isActiveItem) return false;
            return true;
        }

        function _entryHasClass(entry, className) {
            if (!entry || !className) return false;
            const iconContainer = entry.iconContainer;
            const ownerIcon = entry.ownerIcon;
            if (iconContainer && iconContainer.BHasClass && iconContainer.BHasClass(className)) return true;
            return !!(ownerIcon && ownerIcon.BHasClass && ownerIcon.BHasClass(className));
        }

        function _entryMatchesExcludedModClasses(entry, excludedModClasses) {
            return _findFirstExcludedModClassHit(entry && entry.iconContainer, entry && entry.ownerIcon, excludedModClasses).length === 0;
        }

        function _resolveTargetStyle(target) {
            if (target && target.style) {
                const explicitStyle = String(target.style).toLowerCase();
                if (explicitStyle === "offensive" || explicitStyle === "defensive") {
                    return explicitStyle;
                }
            }
            const kind = target && target.itemKind ? String(target.itemKind).toLowerCase() : "";
            if (kind === "weapon" || kind === "tech" || kind === "spirit") {
                return "offensive";
            }
            return "defensive";
        }

        function _isOwnerActiveUse(ownerIcon) {
            if (!ownerIcon || !ownerIcon.BHasClass) return false;
            if (ownerIcon.BHasClass("isActiveItem")) return true;
            if (ownerIcon.BHasClass("isPassiveItem")) return false;
            return false;
        }

        function _ownerMatchesMirrorCategory(ownerIcon, target, cfg) {
            if (!cfg) return true;
            const style = _resolveTargetStyle(target);
            const isActiveUse = _isOwnerActiveUse(ownerIcon);
            let key = "";
            if (style === "offensive") {
                key = isActiveUse ? "ITEM_FILTER_OFF_ACTIVE" : "ITEM_FILTER_OFF_PASSIVE";
            } else {
                key = isActiveUse ? "ITEM_FILTER_DEF_ACTIVE" : "ITEM_FILTER_DEF_PASSIVE";
            }
            if (!cfg.hasOwnProperty(key)) return true;
            return Number(cfg[key]) === 1;
        }

        function _collectItemMirrorModsContainers(root) {
            const out = [];
            if (!root || !root.FindChildTraverse || !root.FindChildrenWithClassTraverse) {
                return out;
            }

            function PushUnique(panel) {
                if (!_isAlive(panel)) return;
                for (let i = 0; i < out.length; i++) {
                    if (out[i] === panel) return;
                }
                out.push(panel);
            }

            function CollectFromSubtree(parent) {
                if (!_isAlive(parent) || !parent.FindChildrenWithClassTraverse) return;
                const found = parent.FindChildrenWithClassTraverse("ModsContainer") || [];
                for (let i = 0; i < found.length; i++) {
                    PushUnique(found[i]);
                }
            }

            const focusedRoots = [
                "StatsAndModsContainer",
                "LowerLeft",
                "ModPurchasedPanelUniversal",
                "ModPurchasedPanelUniversalLocked"
            ];
            for (let fr = 0; fr < focusedRoots.length; fr++) {
                const subtree = root.FindChildTraverse(focusedRoots[fr]);
                if (!_isAlive(subtree)) continue;
                CollectFromSubtree(subtree);
            }

            // Do not perform exhaustive full-DOM scan when focused mod roots are absent/collapsed
            return out;
        }

        function _buildItemMirrorSourceIndex(root) {
            const modsContainers = _collectItemMirrorModsContainers(root);
            const entries = [];
            let scannedCount = 0;
            const seenOwnerIcons = [];
            for (let mc = 0; mc < modsContainers.length; mc++) {
                const modsContainer = modsContainers[mc];
                if (!modsContainer) continue;
                const nestedIcons = modsContainer.FindChildrenWithClassTraverse("mod_icon_single_container") || [];
                for (let ni = 0; ni < nestedIcons.length; ni++) {
                    const nested = nestedIcons[ni];
                    if (!nested || nested.id !== "modIconContainer") continue;
                    scannedCount++;

                    const ownerIcon = _findItemOwnerFromContainer(nested);
                    if (!ownerIcon || !ownerIcon.BHasClass || !ownerIcon.BHasClass("hasAbility")) continue;

                    const ownerId = ownerIcon.id ? ownerIcon.id : "unknown";

                    // Focused roots overlap; deduplicate the same panel.
                    // IDs such as ModIcon0 are local to each native list
                    // and cannot identify an item across different owners.
                    let isDuplicateOwner = false;
                    for (let si = 0; si < seenOwnerIcons.length; si++) {
                        if (seenOwnerIcons[si] === ownerIcon) { isDuplicateOwner = true; break; }
                    }
                    if (isDuplicateOwner) continue;
                    seenOwnerIcons.push(ownerIcon);
                    const cooldownState = ownerIcon.BHasClass("OffCooldown") ? "off" : "on";
                    let sourceImage = nested.FindChildTraverse ? nested.FindChildTraverse("ModIconImage") : null;
                    if (!sourceImage && ownerIcon.FindChildTraverse) sourceImage = ownerIcon.FindChildTraverse("ModIconImage");
                    const cooldownMask = ownerIcon.FindChildTraverse ? ownerIcon.FindChildTraverse("CooldownMask") : null;
                    const iconSrc = _getImageSrc(sourceImage) || _findFirstImageSrcInTree(nested) || _findFirstImageSrcInTree(ownerIcon);
                    if (ITEM_MIRROR_EXPRESS_DEBUG &&
                    ownerIcon.BHasClass("isWeapon") &&
                    ownerIcon.BHasClass("isPassiveItem") &&
                    _ownerMatchesTier(ownerIcon, 3)) {
                        const rawSrc = (sourceImage && sourceImage.GetAttributeString) ? sourceImage.GetAttributeString("src", "") : "";
                        const rawDefaultSrc = (sourceImage && sourceImage.GetAttributeString) ? sourceImage.GetAttributeString("defaultsrc", "") : "";
                        const exclusionHit = _findFirstExcludedModClassHit(nested, ownerIcon, EXPRESS_SHOT_EXCLUDED_MOD_CLASSES);
                        _expressShotLog(
                            "candidate ownerId=" + ownerId +
                        " state=" + cooldownState +
                        " hasAbility=" + (ownerIcon.BHasClass("hasAbility") ? "1" : "0") +
                        " src=" + iconSrc +
                        " rawSrc=" + rawSrc +
                        " rawDefaultSrc=" + rawDefaultSrc +
                        " exclusionHit=" + (exclusionHit.length > 0 ? exclusionHit : "none")
                        );
                    }

                    entries.push({
                        ownerIcon: ownerIcon,
                        iconContainer: nested,
                        ownerId: ownerId,
                        cooldownState: cooldownState,
                        iconSrc: iconSrc,
                        sourceImage: sourceImage,
                        cooldownMask: cooldownMask
                    });
                }
            }
            return {
                modsContainersCount: modsContainers.length,
                scannedCount: scannedCount,
                entries: entries
            };
        }

        function _sourceEntryMatchesTarget(entry, target, cfg) {
            if (!entry || !target) return false;
            const isExpressTarget = (target.className === "expressShot");
            const itemClassName = target.className || "";
            const modClassName = target.modClassName || itemClassName;
            const skipClassMatch = !!target.skipClassMatch;
            const skipIconMatch = !!target.skipIconMatch;
            if (!skipClassMatch && (!itemClassName || !modClassName)) return false;

            const ownerIcon = entry.ownerIcon;
            const iconContainer = entry.iconContainer;
            const ownerClassName = target.ownerClassName ? target.ownerClassName : ((!skipClassMatch && target.modClassName) ? itemClassName : "");
            const requireModClass = target.requireModClass ? String(target.requireModClass) : "";
            const requireCooldownCarrier = !!target.requireCooldownCarrier;
            const requireCooldownState = !!target.requireCooldownState;
            const requirePassiveItem = !!target.requirePassiveItem;
            const requireActiveItem = !!target.requireActiveItem;
            const excludedModClasses = target.excludedModClasses || null;
            const itemKind = target.itemKind || "";
            const itemTier = (target.tier === undefined) ? null : target.tier;

            if (!iconContainer || !iconContainer.BHasClass) {
                if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=no_icon_container");
                return false;
            }
            if (requireModClass.length > 0 && !_entryHasClass(entry, requireModClass)) return false;
            if (skipClassMatch) {
                if (!skipIconMatch) {
                    if (!_iconSourceMatchesTarget(entry.iconSrc, target.iconSrc)) {
                        if (isExpressTarget) {
                            _expressShotLog(
                                "reject ownerId=" + String(entry.ownerId || "") +
                            " reason=icon_mismatch expected=" + String(target.iconSrc || "") +
                            " got=" + String(entry.iconSrc || "")
                            );
                        }
                        return false;
                    }
                }
            } else {
                if (!_entryHasClass(entry, modClassName)) {
                    if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=class_mismatch expectedClass=" + String(modClassName || ""));
                    return false;
                }
            }
            if (!_entryMatchesExcludedModClasses(entry, excludedModClasses)) {
                if (isExpressTarget) {
                    const excludedHit = _findFirstExcludedModClassHit(iconContainer, ownerIcon, excludedModClasses);
                    _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=excluded_mod_class class=" + String(excludedHit || ""));
                }
                return false;
            }
            if (!ownerIcon || !ownerIcon.BHasClass || !ownerIcon.BHasClass("hasAbility")) {
                if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=missing_hasAbility");
                return false;
            }
            if (!_ownerMatchesExtraClass(ownerIcon, ownerClassName)) {
                if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=owner_class_mismatch expectedOwnerClass=" + String(ownerClassName || ""));
                return false;
            }
            if (!_ownerMatchesCooldownCarrier(ownerIcon, requireCooldownCarrier)) {
                if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=cooldown_carrier_missing");
                return false;
            }
            if (!_ownerMatchesCooldownState(ownerIcon, requireCooldownState)) {
                if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=cooldown_state_missing");
                return false;
            }
            if (!_ownerMatchesUseType(ownerIcon, requirePassiveItem, requireActiveItem)) {
                if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=use_type_mismatch needsPassive=" + (requirePassiveItem ? "1" : "0") + " needsActive=" + (requireActiveItem ? "1" : "0"));
                return false;
            }
            if (!_ownerMatchesItemKind(ownerIcon, itemKind)) {
                if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=item_kind_mismatch expected=" + String(itemKind || ""));
                return false;
            }
            if (!_ownerMatchesTier(ownerIcon, itemTier)) {
                if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=tier_mismatch expected=" + String(itemTier));
                return false;
            }
            if (!_ownerMatchesMirrorCategory(ownerIcon, target, cfg)) {
                if (isExpressTarget) _expressShotLog("reject ownerId=" + String(entry.ownerId || "") + " reason=filter_bucket_disabled style=" + _resolveTargetStyle(target));
                return false;
            }
            if (isExpressTarget) _expressShotLog("match ownerId=" + String(entry.ownerId || "") + " src=" + String(entry.iconSrc || "") + " state=" + String(entry.cooldownState || ""));
            return true;
        }

        function _getStableRuntimePanelId(panel) {
            const _mirror = readState();
            if (!panel) return 0;
            const pool = _mirror.runtimePanelIds || [];
            // Prune dead panel references on each lookup to prevent unbounded
            // growth across shop open/close cycles during a long match.
            const cleaned = [];
            let found = 0;
            for (let i = 0; i < pool.length; i++) {
                const rec = pool[i];
                if (!rec || !_isAlive(rec.panel)) continue;
                cleaned.push(rec);
                if (rec.panel === panel) found = Number(rec.id) || 0;
            }
            _mirror.runtimePanelIds = cleaned;
            if (found) return found;
            const nextId = Number(_mirror.nextRuntimePanelId) || 1;
            cleaned.push({ panel: panel, id: nextId });
            _mirror.runtimePanelIds = cleaned;
            _mirror.nextRuntimePanelId = nextId + 1;
            return nextId;
        }

        function _getExceptionEntryKey(entry) {
            if (!entry) return "p0";
            const pid = _getStableRuntimePanelId(entry.iconContainer || entry.ownerIcon);
            return "p" + String(pid);
        }

        function _buildGroupedExceptionMatches(entries, usedEntryIndices, groupedExceptionTargets, cfg) {
            const _mirror = readState();
            const out = [];
            if (!entries || !entries.length || !groupedExceptionTargets || !groupedExceptionTargets.length) return out;

            const grouped = {};
            for (let g = 0; g < groupedExceptionTargets.length; g++) {
                const gm = groupedExceptionTargets[g];
                if (!gm || !gm.target) continue;
                const groupName = gm.target.exceptionGroup ? String(gm.target.exceptionGroup) : "__default__";
                if (!grouped[groupName]) grouped[groupName] = [];
                grouped[groupName].push(gm);
            }

            const groupNames = Object.keys(grouped);
            const assignments = _mirror.exceptionGroupAssignments || {};

            for (let gn = 0; gn < groupNames.length; gn++) {
                const group = groupNames[gn];
                const metas = grouped[group];
                const candidates = [];
                const targetUsed = {};
                const candidateAssigned = {};

                for (let ei = 0; ei < entries.length; ei++) {
                    if (usedEntryIndices[ei]) continue;
                    const entry = entries[ei];
                    const matchedTargets = [];
                    for (let mt = 0; mt < metas.length; mt++) {
                        const meta = metas[mt];
                        if (!_sourceEntryMatchesTarget(entry, meta.target, cfg)) continue;
                        matchedTargets.push(meta);
                    }
                    if (matchedTargets.length > 0) {
                        candidates.push({ entryIndex: ei, entry: entry, matchedTargets: matchedTargets });
                    }
                }

                function assignCandidate(candidateIndex, targetMeta, reason) {
                    if (candidateAssigned[candidateIndex]) return;
                    if (!targetMeta || targetUsed[targetMeta.targetIndex]) return;
                    const c = candidates[candidateIndex];
                    if (!c) return;
                    candidateAssigned[candidateIndex] = true;
                    targetUsed[targetMeta.targetIndex] = true;
                    usedEntryIndices[c.entryIndex] = true;

                    const assignKey = group + "|" + _getExceptionEntryKey(c.entry);
                    assignments[assignKey] = targetMeta.targetIndex;
                    _itemMirrorExceptionLog(
                        "group=" + group +
                    " ownerId=" + String(c.entry.ownerId || "") +
                    " -> " + String(targetMeta.target.className || "") +
                    " via=" + String(reason || "unknown")
                    );

                    out.push({
                        ownerIcon: c.entry.ownerIcon,
                        iconContainer: c.entry.iconContainer,
                        ownerId: c.entry.ownerId,
                        cooldownState: c.entry.cooldownState,
                        iconSrc: c.entry.iconSrc,
                        sourceImage: c.entry.sourceImage,
                        cooldownMask: c.entry.cooldownMask,
                        itemClassName: targetMeta.target.className,
                        targetIconSrc: targetMeta.target.iconSrc,
                        targetIndex: targetMeta.targetIndex
                    });
                }

                // Pass A: candidates that map to exactly one target.
                for (let ca = 0; ca < candidates.length; ca++) {
                    if (candidateAssigned[ca]) continue;
                    const candA = candidates[ca];
                    if (!candA || candA.matchedTargets.length !== 1) continue;
                    assignCandidate(ca, candA.matchedTargets[0], "single_match");
                }

                // Pass B: icon-src tie-break when available.
                for (let cb = 0; cb < candidates.length; cb++) {
                    if (candidateAssigned[cb]) continue;
                    const candB = candidates[cb];
                    if (!candB || candB.matchedTargets.length <= 1) continue;
                    const src = String(candB.entry.iconSrc || "");
                    if (!src) continue;
                    const iconHits = [];
                    for (let ih = 0; ih < candB.matchedTargets.length; ih++) {
                        const metaHit = candB.matchedTargets[ih];
                        if (_iconSourceMatchesTarget(src, metaHit.target.iconSrc)) iconHits.push(metaHit);
                    }
                    if (iconHits.length === 1 && !targetUsed[iconHits[0].targetIndex]) {
                        assignCandidate(cb, iconHits[0], "icon_tiebreak");
                    }
                }

                // Pass C: sticky assignment by panel identity.
                for (let cc = 0; cc < candidates.length; cc++) {
                    if (candidateAssigned[cc]) continue;
                    const candC = candidates[cc];
                    if (!candC) continue;
                    const stickyKey = group + "|" + _getExceptionEntryKey(candC.entry);
                    const preferredTargetIndex = assignments.hasOwnProperty(stickyKey) ? Number(assignments[stickyKey]) : -1;
                    if (preferredTargetIndex < 0) continue;
                    let stickyMeta = null;
                    for (let sm = 0; sm < candC.matchedTargets.length; sm++) {
                        const metaSticky = candC.matchedTargets[sm];
                        if (metaSticky.targetIndex === preferredTargetIndex) {
                            stickyMeta = metaSticky;
                            break;
                        }
                    }
                    if (stickyMeta && !targetUsed[stickyMeta.targetIndex]) {
                        assignCandidate(cc, stickyMeta, "sticky_panel");
                    }
                }

                // Pass D: deterministic fallback by declaration order.
                const availableTargets = [];
                for (let at = 0; at < metas.length; at++) {
                    if (!targetUsed[metas[at].targetIndex]) availableTargets.push(metas[at]);
                }
                availableTargets.sort(function(a, b) { return a.targetIndex - b.targetIndex; });

                for (let cd = 0; cd < candidates.length; cd++) {
                    if (candidateAssigned[cd]) continue;
                    const candD = candidates[cd];
                    if (!candD) continue;
                    let chosen = null;
                    for (let ad = 0; ad < availableTargets.length; ad++) {
                        const possible = availableTargets[ad];
                        if (targetUsed[possible.targetIndex]) continue;
                        for (let md = 0; md < candD.matchedTargets.length; md++) {
                            if (candD.matchedTargets[md].targetIndex === possible.targetIndex) {
                                chosen = possible;
                                break;
                            }
                        }
                        if (chosen) break;
                    }
                    if (chosen) assignCandidate(cd, chosen, "deterministic_fallback");
                }
            }

            _mirror.exceptionGroupAssignments = assignments;
            return out;
        }

        function _buildItemMirrorSourcesMulti(root, cfg) {
            const outMatches = [];
            const sourceIndex = _buildItemMirrorSourceIndex(root);
            const entries = sourceIndex.entries || [];
            const usedEntryIndices = {};
            const normalTargets = [];
            const groupedExceptionTargets = [];
            const exceptionTargets = [];

            for (let tiSplit = 0; tiSplit < ITEM_MIRROR_TARGETS.length; tiSplit++) {
                const splitTarget = ITEM_MIRROR_TARGETS[tiSplit];
                if (splitTarget && splitTarget.skipClassMatch && splitTarget.exceptionGroup) {
                    groupedExceptionTargets.push({ target: splitTarget, targetIndex: tiSplit });
                } else if (splitTarget && splitTarget.skipClassMatch) {
                    exceptionTargets.push({ target: splitTarget, targetIndex: tiSplit });
                } else {
                    normalTargets.push({ target: splitTarget, targetIndex: tiSplit });
                }
            }

            // Pass 1: strict class-based targets take priority.
            for (let mi = 0; mi < entries.length; mi++) {
                const entry = entries[mi];
                for (let nt = 0; nt < normalTargets.length; nt++) {
                    const normal = normalTargets[nt];
                    const normalTarget = normal.target;
                    if (!_sourceEntryMatchesTarget(entry, normalTarget, cfg)) continue;
                    outMatches.push({
                        ownerIcon: entry.ownerIcon,
                        iconContainer: entry.iconContainer,
                        ownerId: entry.ownerId,
                        cooldownState: entry.cooldownState,
                        iconSrc: entry.iconSrc,
                        sourceImage: entry.sourceImage,
                        cooldownMask: entry.cooldownMask,
                        itemClassName: normalTarget.className,
                        targetIconSrc: normalTarget.iconSrc,
                        targetIndex: normal.targetIndex
                    });
                    usedEntryIndices[mi] = true;
                    break;
                }
            }

            // Pass 2: grouped classless exceptions (structural twins).
            const groupedMatches = _buildGroupedExceptionMatches(entries, usedEntryIndices, groupedExceptionTargets, cfg);
            for (let gmIdx = 0; gmIdx < groupedMatches.length; gmIdx++) {
                outMatches.push(groupedMatches[gmIdx]);
            }

            // Pass 3: remaining classless exceptions.
            for (let miEx = 0; miEx < entries.length; miEx++) {
                if (usedEntryIndices[miEx]) continue;
                const exceptionEntry = entries[miEx];
                let exceptionMatchCount = 0;
                let exceptionChosen = null;
                for (let et = 0; et < exceptionTargets.length; et++) {
                    const exceptionMeta = exceptionTargets[et];
                    if (!_sourceEntryMatchesTarget(exceptionEntry, exceptionMeta.target, cfg)) continue;
                    exceptionMatchCount++;
                    exceptionChosen = exceptionMeta;
                }
                if (exceptionMatchCount === 1 && exceptionChosen) {
                    outMatches.push({
                        ownerIcon: exceptionEntry.ownerIcon,
                        iconContainer: exceptionEntry.iconContainer,
                        ownerId: exceptionEntry.ownerId,
                        cooldownState: exceptionEntry.cooldownState,
                        iconSrc: exceptionEntry.iconSrc,
                        sourceImage: exceptionEntry.sourceImage,
                        cooldownMask: exceptionEntry.cooldownMask,
                        itemClassName: exceptionChosen.target.className,
                        targetIconSrc: exceptionChosen.target.iconSrc,
                        targetIndex: exceptionChosen.targetIndex
                    });
                    usedEntryIndices[miEx] = true;
                } else if (exceptionMatchCount > 1) {
                    _itemMirrorExceptionLog(
                        "reject ownerId=" + String(exceptionEntry.ownerId || "") +
                    " reason=exception_ambiguous count=" + String(exceptionMatchCount)
                    );
                }
            }

            const summary = [];
            const structureSummary = [];
            for (let si = 0; si < outMatches.length; si++) {
                const match = outMatches[si];
                summary.push(match.itemClassName + "::" + match.ownerId + "|" + match.cooldownState + "|" + match.iconSrc);
                // Cooldown state changes are read from the live panel during render.
                // They should not force a structural rescan of every owned item.
                structureSummary.push(match.itemClassName + "::" + match.ownerId + "|" + match.iconSrc);
            }

            return {
                modsContainersCount: sourceIndex.modsContainersCount,
                scannedCount: sourceIndex.scannedCount,
                matches: outMatches,
                summary: summary,
                structureSummary: structureSummary
            };
        }

        function _getItemMirrorSemanticKey(sourceLike) {
            if (!sourceLike) return "||";
            const cls = sourceLike.itemClassName ? String(sourceLike.itemClassName) : "";
            const icon = sourceLike.iconSrc ? String(sourceLike.iconSrc) : "";
            const targetIcon = sourceLike.targetIconSrc ? String(sourceLike.targetIconSrc) : "";
            return cls + "|" + icon + "|" + targetIcon;
        }

        function _getItemMirrorClassKey(sourceLike) {
            if (!sourceLike) return "";
            return sourceLike.itemClassName ? String(sourceLike.itemClassName) : "";
        }

        function _reconcileItemMirrorSourcesMulti(scannedMatches) {
            const _mirror = readState();
            const previous = _mirror.sources || [];
            const usedPrev = {};
            const next = [];
            const semanticBuckets = {};
            const classBuckets = {};

            for (let pb = 0; pb < previous.length; pb++) {
                const prevSource = previous[pb];
                if (!prevSource) continue;
                const semanticKey = _getItemMirrorSemanticKey(prevSource);
                if (!semanticBuckets[semanticKey]) semanticBuckets[semanticKey] = [];
                semanticBuckets[semanticKey].push({ idx: pb, src: prevSource });

                const classKey = _getItemMirrorClassKey(prevSource);
                if (classKey.length > 0) {
                    if (!classBuckets[classKey]) classBuckets[classKey] = [];
                    classBuckets[classKey].push({ idx: pb, src: prevSource });
                }
            }

            const semanticKeys = Object.keys(semanticBuckets);
            for (let sk = 0; sk < semanticKeys.length; sk++) {
                const semanticBucket = semanticBuckets[semanticKeys[sk]];
                semanticBucket.sort(function(a, b) {
                    const ao = (a && a.src && a.src.acquisitionOrder !== undefined && a.src.acquisitionOrder !== null) ? Number(a.src.acquisitionOrder) : 999999;
                    const bo = (b && b.src && b.src.acquisitionOrder !== undefined && b.src.acquisitionOrder !== null) ? Number(b.src.acquisitionOrder) : 999999;
                    return ao - bo;
                });
            }
            const classKeys = Object.keys(classBuckets);
            for (let ck = 0; ck < classKeys.length; ck++) {
                const classBucket = classBuckets[classKeys[ck]];
                classBucket.sort(function(a, b) {
                    const ao = (a && a.src && a.src.acquisitionOrder !== undefined && a.src.acquisitionOrder !== null) ? Number(a.src.acquisitionOrder) : 999999;
                    const bo = (b && b.src && b.src.acquisitionOrder !== undefined && b.src.acquisitionOrder !== null) ? Number(b.src.acquisitionOrder) : 999999;
                    return ao - bo;
                });
            }

            for (let i = 0; i < scannedMatches.length; i++) {
                const match = scannedMatches[i];
                let existing = null;

                // 1) Strongest match: same panel objects.
                for (let p = 0; p < previous.length; p++) {
                    if (usedPrev[p]) continue;
                    const prev = previous[p];
                    if (!prev) continue;
                    if (prev.ownerIcon === match.ownerIcon &&
                    prev.iconContainer === match.iconContainer &&
                    prev.itemClassName === match.itemClassName &&
                    prev.targetIconSrc === match.targetIconSrc) {
                        existing = prev;
                        usedPrev[p] = true;
                        break;
                    }
                }

                // 2) Fallback: same semantic identity (class + icon srcs), for rebuilt/reordered trees.
                if (!existing) {
                    const semKey = _getItemMirrorSemanticKey(match);
                    const semBucket = semanticBuckets[semKey] || null;
                    if (semBucket) {
                        while (semBucket.length > 0) {
                            const semCandidate = semBucket.shift();
                            if (!semCandidate) continue;
                            if (usedPrev[semCandidate.idx]) continue;
                            existing = semCandidate.src;
                            usedPrev[semCandidate.idx] = true;
                            break;
                        }
                    }
                }

                // 3) Last fallback: same class when icon src is unstable/late-loaded.
                if (!existing) {
                    const clsKey = _getItemMirrorClassKey(match);
                    const clsBucket = clsKey.length > 0 ? (classBuckets[clsKey] || null) : null;
                    if (clsBucket) {
                        while (clsBucket.length > 0) {
                            const clsCandidate = clsBucket.shift();
                            if (!clsCandidate) continue;
                            if (usedPrev[clsCandidate.idx]) continue;
                            if (clsCandidate.src.targetIconSrc !== match.targetIconSrc) continue;
                            existing = clsCandidate.src;
                            usedPrev[clsCandidate.idx] = true;
                            break;
                        }
                    }
                }

                const key = existing && existing.key ? existing.key : ("item_src_" + String(_mirror.nextSourceId++));
                const acquisitionOrder = (existing && isFinite(Number(existing.acquisitionOrder)))
                    ? Number(existing.acquisitionOrder)
                    : Number(_mirror.nextAcquireOrder++);
                next.push({
                    key: key,
                    acquisitionOrder: acquisitionOrder,
                    ownerIcon: match.ownerIcon,
                    iconContainer: match.iconContainer,
                    itemClassName: match.itemClassName,
                    targetIconSrc: match.targetIconSrc,
                    targetIndex: match.targetIndex,
                    ownerId: match.ownerId,
                    cooldownState: match.cooldownState,
                    iconSrc: match.iconSrc,
                    sourceImage: match.sourceImage,
                    cooldownMask: match.cooldownMask
                });
            }

            next.sort(function(a, b) {
                const ao = (a.acquisitionOrder === undefined || a.acquisitionOrder === null) ? 999999 : Number(a.acquisitionOrder);
                const bo = (b.acquisitionOrder === undefined || b.acquisitionOrder === null) ? 999999 : Number(b.acquisitionOrder);
                if (ao !== bo) return ao - bo;
                const ai = (a.targetIndex === undefined || a.targetIndex === null) ? 9999 : Number(a.targetIndex);
                const bi = (b.targetIndex === undefined || b.targetIndex === null) ? 9999 : Number(b.targetIndex);
                if (ai !== bi) return ai - bi;
                const av = String(a.ownerId || "") + "|" + String(a.iconSrc || "");
                const bv = String(b.ownerId || "") + "|" + String(b.iconSrc || "");
                if (av < bv) return -1;
                if (av > bv) return 1;
                return 0;
            });

            _mirror.sources = next;
            const activePanels = new Set(next.flatMap(source => [source.ownerIcon, source.iconContainer]));
            _mirror.runtimePanelIds = (_mirror.runtimePanelIds || []).filter(record => activePanels.has(record.panel));
            const activeIds = new Set(_mirror.runtimePanelIds.map(record => String(record.id)));
            for (const key of Object.keys(_mirror.exceptionGroupAssignments || {})) {
                if (!activeIds.has(key.slice(key.lastIndexOf("|p") + 2))) delete _mirror.exceptionGroupAssignments[key];
            }
            return next;
        }

        function _expressShotLog(msg) {
            if (!ITEM_MIRROR_EXPRESS_DEBUG) return;
            $.Msg("[QOLLock][ItemExpressShot] " + msg);
        }

        function _itemMirrorExceptionLog(msg) {
            if (!ITEM_MIRROR_EXCEPTION_DEBUG) return;
            $.Msg("[QOLLock][ItemMirrorException] " + msg);
        }


        return { _buildItemMirrorSourcesMulti, _reconcileItemMirrorSourcesMulti, _ownerMatchesMirrorCategory,
            _getStableRuntimePanelId, _getInlineStyleProperty, _probeCooldownTextFromSourceIcon,
            inventoryRoots, sourceIsCurrent, refreshNativeChildren, reset };
    };
})();
