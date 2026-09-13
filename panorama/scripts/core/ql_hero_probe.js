// panorama/scripts/core/ql_hero_probe.js
// =============================================================================
// QOLLOCK — Hero Probe & Signature Detection Subsystem
// =============================================================================
// Provides hero identity resolution from UI panels, command strings, and
// live ability signature scanning for build storage and game state tracking.
//
// Modeled after thirdeye core/heroprobe.js & shop_hero_probe.js.
// =============================================================================

(() => {
    "use strict";

    const Q = globalThis.QOL = globalThis.QOL || {};
    Q.core = Q.core || {};

    const Panel = Q.core.panel || {};
    const isAlive = Panel.isAlive || ((p) => p != null && typeof p.IsValid === "function" && p.IsValid());

    const HERO_DETECT_ALIAS_MAP = {
        airheart: 1,
        inferno: 1,
        gigawatt: 1,
        hornet: 1,
        ghost: 1,
        atlas: 1,
        wraith: 1,
        forge: 1,
        chrono: 1,
        dynamo: 1,
        kelvin: 1,
        haze: 1,
        astro: 1,
        bebop: 1,
        nano: 1,
        orion: 1,
        krill: 1,
        shiv: 1,
        tengu: 1,
        kali: 1,
        warden: 1,
        yamato: 1,
        lash: 1,
        viscous: 1,
        gunslinger: 1,
        yakuza: 1,
        genericperson: 1,
        tokamak: 1,
        wrecker: 1,
        rutger: 1,
        synth: 1,
        thumper: 1,
        mirage: 1,
        slork: 1,
        cadence: 1,
        targetdummy: 1,
        bomber: 1,
        shieldguy: 1,
        viper: 1,
        vandal: 1,
        magician: 1,
        trapper: 1,
        operative: 1,
        vampirebat: 1,
        drifter: 1,
        priest: 1,
        frank: 1,
        bookworm: 1,
        boho: 1,
        doorman: 1,
        skyrunner: 1,
        swan: 1,
        punkgoat: 1,
        fortuna: 1,
        necro: 1,
        fencer: 1,
        druid: 1,
        graf: 1,
        opera: 1,
        familiar: 1,
        werewolf: 1,
        unicorn: 1
    };

    const BUILD_SAVE_STORAGE_SIGNATURE_SLOT_IDS = [
        "slot_signature_1",
        "slot_signature_2",
        "slot_signature_3"
    ];

    // "*" = any ability present; "" = ignored slot.
    const BUILD_SAVE_STORAGE_SIGNATURE_EXPECTED = [
        "",
        "ability_skyrunner_magic_beam",
        ""
    ];

    const BUILD_SAVE_STORAGE_SIGNATURE_LABELS = [
        "Waiting...",
        "ability_skyrunner_magic_beam",
        "Waiting..."
    ];

    const HERO_SELECT_COMMAND_SCAN_MAX_PANELS = 2500;
    const PANEL_ID_SIGNATURE = "hud_signature";
    const PANEL_ID_SHOP_MODS_SELECTED_BUILD = "ShopModsSelectedBuild";
    const BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID = "hero_skyrunner";
    const BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS = 250;

    let _sigFoldDiagLogged = false;
    const _sigLocaleDiagSeen = {};

    // ── Latin diacritic ASCII folding ──
    const FoldToAscii = (str) => {
        if (!str) return "";
        return String(str)
            .replace(/[\u00C0-\u00C5]/g, "a")
            .replace(/\u00C6/g, "ae")
            .replace(/\u00C7/g, "c")
            .replace(/[\u00C8-\u00CB]/g, "e")
            .replace(/[\u00CC-\u00CF]/g, "i")
            .replace(/\u00D0/g, "d")
            .replace(/\u00D1/g, "n")
            .replace(/[\u00D2-\u00D6\u00D8]/g, "o")
            .replace(/[\u00D9-\u00DC]/g, "u")
            .replace(/\u00DD/g, "y")
            .replace(/\u00DE/g, "th")
            .replace(/\u00DF/g, "ss")
            .replace(/[\u00E0-\u00E5]/g, "a")
            .replace(/\u00E6/g, "ae")
            .replace(/\u00E7/g, "c")
            .replace(/[\u00E8-\u00EB]/g, "e")
            .replace(/[\u00EC-\u00EF]/g, "i")
            .replace(/\u00F0/g, "d")
            .replace(/\u00F1/g, "n")
            .replace(/[\u00F2-\u00F6\u00F8]/g, "o")
            .replace(/[\u00F9-\u00FC]/g, "u")
            .replace(/[\u00FD\u00FF]/g, "y")
            .replace(/\u00FE/g, "th")
            .replace(/[\u0100\u0102\u0104]/g, "a").replace(/[\u0101\u0103\u0105]/g, "a")
            .replace(/[\u0106\u0108\u010A\u010C]/g, "c").replace(/[\u0107\u0109\u010B\u010D]/g, "c")
            .replace(/[\u010E\u0110]/g, "d").replace(/[\u010F\u0111]/g, "d")
            .replace(/[\u0112\u0114\u0116\u0118\u011A]/g, "e").replace(/[\u0113\u0115\u0117\u0119\u011B]/g, "e")
            .replace(/[\u011C\u011E\u0120\u0122]/g, "g").replace(/[\u011D\u011F\u0121\u0123]/g, "g")
            .replace(/[\u0124\u0126]/g, "h").replace(/[\u0125\u0127]/g, "h")
            .replace(/[\u0128\u012A\u012C\u012E\u0130]/g, "i").replace(/[\u0129\u012B\u012D\u012F\u0131]/g, "i")
            .replace(/[\u0132]/g, "ij").replace(/[\u0133]/g, "ij")
            .replace(/[\u0134]/g, "j").replace(/[\u0135]/g, "j")
            .replace(/[\u0136]/g, "k").replace(/[\u0137]/g, "k")
            .replace(/[\u0139\u013B\u013D\u013F\u0141]/g, "l").replace(/[\u013A\u013C\u013E\u0140\u0142]/g, "l")
            .replace(/[\u0143\u0145\u0147]/g, "n").replace(/[\u0144\u0146\u0148]/g, "n")
            .replace(/[\u014C\u014E\u0150]/g, "o").replace(/[\u014D\u014F\u0151]/g, "o")
            .replace(/[\u0152]/g, "oe").replace(/[\u0153]/g, "oe")
            .replace(/[\u0154\u0156\u0158]/g, "r").replace(/[\u0155\u0157\u0159]/g, "r")
            .replace(/[\u015A\u015C\u015E\u0160]/g, "s").replace(/[\u015B\u015D\u015F\u0161]/g, "s")
            .replace(/[\u0162\u0164\u0166]/g, "t").replace(/[\u0163\u0165\u0167]/g, "t")
            .replace(/[\u0168\u016A\u016C\u016E\u0170\u0172]/g, "u").replace(/[\u0169\u016B\u016D\u016F\u0171\u0173]/g, "u")
            .replace(/[\u0174]/g, "w").replace(/[\u0175]/g, "w")
            .replace(/[\u0176\u0178]/g, "y").replace(/[\u0177]/g, "y")
            .replace(/[\u0179\u017B\u017D]/g, "z").replace(/[\u017A\u017C\u017E]/g, "z")
            .replace(/\u017F/g, "s");
    };

    const CleanStorageHeroSignatureText = (text) => {
        if (text === null || text === undefined) return "";
        return String(text).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    };

    const ReadPanelIdTextMaybe = (panel) => {
        if (!panel) return "";
        try { return panel.id ? String(panel.id) : ""; } catch { return ""; }
    };

    const ReadPanelClassTextMaybe = (panel) => {
        if (!panel) return "";
        let classText = "";
        try {
            if (panel.GetAttributeString) classText = String(panel.GetAttributeString("class", "") || "");
        } catch { classText = ""; }
        if (!classText && panel.GetClasses) {
            try { classText = String(panel.GetClasses() || ""); } catch { classText = ""; }
        }
        return classText || "";
    };

    const ReadPanelTypeTextMaybe = (panel) => {
        if (!panel) return "";
        let typeText = "";
        try { if (panel.paneltype !== undefined && panel.paneltype !== null) typeText = String(panel.paneltype); } catch { typeText = ""; }
        if (!typeText) {
            try { if (panel.type !== undefined && panel.type !== null) typeText = String(panel.type); } catch { typeText = ""; }
        }
        if (!typeText) {
            try { if (panel.panelType !== undefined && panel.panelType !== null) typeText = String(panel.panelType); } catch { typeText = ""; }
        }
        return typeText || "";
    };

    const ReadPanelTextMaybe = (panel) => {
        if (!panel) return "";
        let text = "";
        try {
            if (panel.text !== undefined && panel.text !== null) text = String(panel.text);
        } catch {}
        if (text && text.length > 0) return text;
        if (panel.GetAttributeString) {
            try { text = panel.GetAttributeString("text", ""); } catch { text = ""; }
        }
        return text || "";
    };

    const ResolvePlayableHeroAlias = (rawAlias) => {
        if (!rawAlias) return "";
        let alias = String(rawAlias).toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (!alias) return "";
        if (alias.startsWith("hero_")) alias = alias.slice(5);
        if (alias.startsWith("cut_")) alias = alias.slice(4);
        if (alias.startsWith("npc_")) alias = alias.slice(4);
        if (!alias) return "";
        if (HERO_DETECT_ALIAS_MAP[alias]) return alias;

        const variant = alias
            .replace(/_v[0-9]+$/i, "")
            .replace(/_[0-9]+$/i, "")
            .replace(/_(staging|wip|test|preview|prototype|dev)$/i, "");
        if (variant && HERO_DETECT_ALIAS_MAP[variant]) return variant;

        const parts = alias.split("_");
        while (parts.length > 1) {
            parts.pop();
            const candidate = parts.join("_");
            if (candidate && HERO_DETECT_ALIAS_MAP[candidate]) return candidate;
        }
        return "";
    };

    const NormalizeHeroAliasToken = (aliasText) => {
        const alias = ResolvePlayableHeroAlias(aliasText);
        return alias ? `hero_${alias}` : "";
    };

    const ExtractHeroTokenFromText = (rawText) => {
        if (!rawText) return "";
        const text = String(rawText);

        const canonical = text.match(/\b(hero_[a-z0-9_]+)\b/i);
        if (canonical && canonical[1]) {
            const alias = ResolvePlayableHeroAlias(canonical[1]);
            if (alias) return `hero_${alias}`;
        }

        const scene = text.match(/citadel_hero_scene_([a-z0-9_]+)\.vcd/i);
        if (scene && scene[1]) {
            const alias = ResolvePlayableHeroAlias(scene[1]);
            if (alias) return `hero_${alias}`;
        }

        const vmdl = text.match(/models\/heroes\/([a-z0-9_]+)\//i);
        if (vmdl && vmdl[1]) {
            const alias = ResolvePlayableHeroAlias(vmdl[1]);
            if (alias) return `hero_${alias}`;
        }

        const vxml = text.match(/([a-z0-9_]+)_details_view\.vxml/i);
        if (vxml && vxml[1]) {
            const alias = ResolvePlayableHeroAlias(vxml[1]);
            if (alias) return `hero_${alias}`;
        }

        const tokens = text.match(/[a-z0-9_]+/gi);
        if (tokens) {
            for (let i = 0; i < tokens.length; i++) {
                const alias = ResolvePlayableHeroAlias(tokens[i]);
                if (alias) return `hero_${alias}`;
            }
        }
        return "";
    };

    const ExtractHeroFromLooseAliasTokens = (rawText) => {
        if (!rawText) return "";
        const text = String(rawText).toLowerCase();
        const parts = text.split(/[^a-z0-9]+/);
        for (let i = 0; i < parts.length; i++) {
            const token = parts[i];
            if (!token || token.length < 3) continue;
            const alias = ResolvePlayableHeroAlias(token);
            if (alias) return `hero_${alias}`;
        }
        return "";
    };

    const TryReadHeroFromPanelBHasClass = (panel) => {
        if (!panel || !panel.BHasClass) return "";
        for (const alias in HERO_DETECT_ALIAS_MAP) {
            try {
                if (panel.BHasClass(`hero_${alias}`)) return `hero_${alias}`;
            } catch {}
            try {
                if (panel.BHasClass(alias)) return `hero_${alias}`;
            } catch {}
        }
        return "";
    };

    const PanelLooksSelected = (panel) => {
        if (!panel) return false;
        const classText = ReadPanelClassTextMaybe(panel).toLowerCase();
        return /(^|[\s,_-])(selected|active|current|isselected|is_active)([\s,_-]|$)/.test(classText);
    };

    const normalizeHero = (hero) => {
        if (typeof Q.normalizeHeroId === "function") return Q.normalizeHeroId(hero);
        return hero || "";
    };

    const TryReadHeroFromPanelDetails = (panel) => {
        if (!panel) return "";
        const parseCandidate = (raw) => {
            if (!raw) return "";
            return normalizeHero(
                ExtractHeroTokenFromText(raw) ||
                NormalizeHeroAliasToken(raw) ||
                ExtractHeroFromLooseAliasTokens(raw)
            );
        };

        const directCandidates = [
            ReadPanelClassTextMaybe(panel),
            ReadPanelIdTextMaybe(panel),
            ReadPanelTypeTextMaybe(panel),
            ReadPanelTextMaybe(panel)
        ];
        for (let i = 0; i < directCandidates.length; i++) {
            const parsed = parseCandidate(directCandidates[i]);
            if (parsed) return parsed;
        }

        const parsedFromClassMembership = normalizeHero(TryReadHeroFromPanelBHasClass(panel));
        if (parsedFromClassMembership) return parsedFromClassMembership;

        if (panel.GetAttributeString) {
            const attrKeys = [
                "hero_name", "hero_internal_name", "hero", "current_hero",
                "src", "image", "style", "value", "text", "onactivate", "onmouseover"
            ];
            for (let a = 0; a < attrKeys.length; a++) {
                let attrVal = "";
                try { attrVal = String(panel.GetAttributeString(attrKeys[a], "") || ""); } catch { attrVal = ""; }
                if (!attrVal) continue;
                const parsedAttr = parseCandidate(attrVal);
                if (parsedAttr) return parsedAttr;
            }
        }

        try {
            if (panel.style) {
                const styleBg = String(panel.style.backgroundImage || "");
                const parsedStyleBg = parseCandidate(styleBg);
                if (parsedStyleBg) return parsedStyleBg;
            }
        } catch {}

        let parent = panel;
        for (let depth = 0; depth < 4; depth++) {
            try { parent = parent && parent.GetParent ? parent.GetParent() : null; } catch { parent = null; }
            if (!parent) break;
            const parentCombined = `${ReadPanelClassTextMaybe(parent)} ${ReadPanelIdTextMaybe(parent)} ${ReadPanelTypeTextMaybe(parent)}`;
            const parsedParent = parseCandidate(parentCombined);
            if (parsedParent) return parsedParent;
        }
        return "";
    };

    const TryReadHeroFromPanelSubtree = (panel, maxNodes) => {
        if (!panel) return "";
        const limit = Number(maxNodes) > 0 ? Number(maxNodes) : 80;
        const stack = [panel];
        let scanned = 0;
        while (stack.length > 0 && scanned < limit) {
            const current = stack.pop();
            if (!current) continue;
            scanned++;

            const hero = TryReadHeroFromPanelDetails(current);
            if (hero) return hero;

            let childCount = 0;
            try { childCount = current.GetChildCount ? current.GetChildCount() : 0; } catch { childCount = 0; }
            for (let i = 0; i < childCount; i++) {
                let child = null;
                try { child = current.GetChild(i); } catch { child = null; }
                if (child) stack.push(child);
            }
        }
        return "";
    };

    const NormalizeStorageHeroSignatureAbilityName = (text) => {
        const clean = CleanStorageHeroSignatureText(text);
        if (!clean) return "";
        const folded = FoldToAscii(clean).toLowerCase();
        const normalized = folded
            .replace(/&/g, "and")
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");

        if (!_sigFoldDiagLogged) {
            _sigFoldDiagLogged = true;
            $.Msg(`[QOLLock][LANG] NormalizeStorageHeroSignatureAbilityName: raw="${String(text)}" clean="${String(clean)}" folded="${String(folded)}" normalized="${String(normalized)}"`);
        }
        if (!normalized) return "";

        if (typeof Q.lookupLocaleAbility === "function") {
            const localeAbility = Q.lookupLocaleAbility(clean);
            if (localeAbility) {
                const diagKey = `${String(clean)}|${String(localeAbility)}`;
                if (!_sigLocaleDiagSeen[diagKey]) {
                    _sigLocaleDiagSeen[diagKey] = true;
                    $.Msg(`[QOLLock][LANG] NormalizeStorageHeroSignatureAbilityName: locale lookup resolved "${String(clean)}" → "${String(localeAbility)}"`);
                }
                return localeAbility;
            }
        }
        if (normalized.includes("rutger") && normalized.includes("rocket")) return "rutger_rocket";
        if (normalized.includes("hyper") && normalized.includes("beam")) return "hyper_beam";
        if (normalized.includes("skyrunner") && normalized.includes("magic") && normalized.includes("beam")) return "ability_skyrunner_magic_beam";
        if (normalized.includes("skyrunner") && normalized.includes("ability02")) return "ability_skyrunner_magic_beam";
        return normalized;
    };

    const AddStorageSignatureScanRoot = (roots, panel) => {
        if (!panel || !isAlive(panel)) return;
        for (let i = 0; i < roots.length; i++) {
            if (roots[i] === panel) return;
        }
        roots.push(panel);
    };

    const FindStorageHeroSignatureHud = (root) => {
        const roots = [];
        AddStorageSignatureScanRoot(roots, root);
        try {
            const contextPanel = $.GetContextPanel ? $.GetContextPanel() : null;
            AddStorageSignatureScanRoot(roots, contextPanel);
            let top = contextPanel;
            let sigRootGuard = 0;
            while (top && isAlive(top) && top.GetParent && top.GetParent() && sigRootGuard < 64) {
                top = top.GetParent();
                sigRootGuard++;
            }
            AddStorageSignatureScanRoot(roots, top);
        } catch {}

        for (let i = 0; i < roots.length; i++) {
            const scanRoot = roots[i];
            if (!scanRoot || !isAlive(scanRoot)) continue;
            if (ReadPanelIdTextMaybe(scanRoot) === PANEL_ID_SIGNATURE) return scanRoot;
            if (!scanRoot.FindChildTraverse) continue;
            try {
                const hud = scanRoot.FindChildTraverse(PANEL_ID_SIGNATURE);
                if (hud && isAlive(hud)) return hud;
            } catch {}
        }
        return null;
    };

    const GetStorageHeroSignatureSlotPanel = (root, signatureHud, index) => {
        const slotId = BUILD_SAVE_STORAGE_SIGNATURE_SLOT_IDS[index] || "";
        let slot = null;
        if (signatureHud && isAlive(signatureHud) && signatureHud.FindChildTraverse && slotId) {
            try { slot = signatureHud.FindChildTraverse(slotId); } catch { slot = null; }
        }
        if ((!slot || !isAlive(slot)) && root && isAlive(root) && root.FindChildTraverse && slotId) {
            try { slot = root.FindChildTraverse(slotId); } catch { slot = null; }
        }
        if ((!slot || !isAlive(slot)) && signatureHud && isAlive(signatureHud) && signatureHud.GetChildCount) {
            try {
                if (signatureHud.GetChildCount() > index) slot = signatureHud.GetChild(index);
            } catch { slot = null; }
        }
        return (slot && isAlive(slot)) ? slot : null;
    };

    const ExtractAbilityNameFromImageSrc = (src) => {
        if (!src) return "";
        const s = String(src).toLowerCase();
        let match = s.match(/\/abilities\/([a-z0-9_.-]+?)(?:_psd)?\.(?:vtex|png|jpg|tga|psd)/i);
        if (match && match[1]) {
            const name = String(match[1]);
            if (name.length > 0 && name.length < 128) return name;
        }
        match = s.match(/[\/\\]([a-z0-9_.-]+?)(?:_psd)?\.(?:vtex|png|jpg|tga|psd)/i);
        if (match && match[1]) {
            const name = String(match[1]);
            if (name.length > 0 && name.length < 128) return name;
        }
        return "";
    };

    const ExtractUrlFromBackgroundImage = (styleBg) => {
        if (!styleBg) return "";
        const match = styleBg.match(/url\s*\(\s*['"]?([^'"]+)['"]?\s*\)/i);
        return match && match[1] ? String(match[1]).trim() : "";
    };

    const GetImageSrc = (panel) => {
        if (!panel || !panel.GetAttributeString) return "";
        const src = panel.GetAttributeString("src", "");
        if (src && src !== "none") return src;
        const def = panel.GetAttributeString("defaultsrc", "");
        if (def && def !== "none") return def;
        let bg = "";
        try {
            bg = (panel.style && panel.style.backgroundImage) ? String(panel.style.backgroundImage) : "";
        } catch { bg = ""; }
        const fromBg = ExtractUrlFromBackgroundImage(bg);
        return (fromBg && fromBg !== "none") ? fromBg : "";
    };

    const ReadAbilityNameFromSlotImage = (slotPanel) => {
        if (!slotPanel || !isAlive(slotPanel) || !slotPanel.FindChildrenWithClassTraverse) return "";
        let imagePanels = null;
        try { imagePanels = slotPanel.FindChildrenWithClassTraverse("ability_image"); } catch { imagePanels = null; }
        if (!imagePanels || imagePanels.length < 1) {
            try { imagePanels = slotPanel.FindChildrenWithClassTraverse("image_container"); } catch { imagePanels = null; }
        }
        if (!imagePanels || imagePanels.length < 1) return "";

        for (let i = 0; i < imagePanels.length; i++) {
            const imgPanel = imagePanels[i];
            if (!imgPanel || !isAlive(imgPanel)) continue;
            const src = GetImageSrc(imgPanel);
            if (!src) continue;
            const abilityName = ExtractAbilityNameFromImageSrc(src);
            if (abilityName) return abilityName;
        }
        return "";
    };

    const ReadStorageHeroSignatureAbilityName = (slotPanel) => {
        if (!slotPanel || !isAlive(slotPanel) || !slotPanel.FindChildrenWithClassTraverse) return "";
        const imageName = ReadAbilityNameFromSlotImage(slotPanel);
        if (imageName) return imageName;

        let nameLabels = null;
        try { nameLabels = slotPanel.FindChildrenWithClassTraverse("ability_name"); } catch { nameLabels = null; }
        if (!nameLabels || nameLabels.length < 1) return "";
        for (let i = 0; i < nameLabels.length; i++) {
            const label = nameLabels[i];
            if (!label || !isAlive(label)) continue;
            const text = CleanStorageHeroSignatureText(ReadPanelTextMaybe(label));
            if (text) return text;
        }
        return "";
    };

    const ReadStorageHeroSignatureSlots = (root) => {
        const signatureHud = FindStorageHeroSignatureHud(root);
        const scan = {
            hudFound: !!(signatureHud && isAlive(signatureHud)),
            foundSlots: 0,
            names: [],
            normalized: [],
            sig: ""
        };
        const sigParts = [];
        for (let i = 0; i < BUILD_SAVE_STORAGE_SIGNATURE_SLOT_IDS.length; i++) {
            const slot = GetStorageHeroSignatureSlotPanel(root, signatureHud, i);
            if (slot) scan.foundSlots += 1;
            const name = ReadStorageHeroSignatureAbilityName(slot);
            const normalized = NormalizeStorageHeroSignatureAbilityName(name);
            scan.names[i] = name;
            scan.normalized[i] = normalized;
            sigParts.push(normalized || "-");
        }
        scan.sig = `hud:${scan.hudFound ? "1" : "0"}|slots:${String(scan.foundSlots)}|names:${sigParts.join("|")}`;
        return scan;
    };

    const ValidateStorageHeroSignatureScan = (scan) => {
        if (!scan || (!scan.hudFound && Number(scan.foundSlots) <= 0)) {
            return { ok: false, detail: "Waiting for Skyrunner signature HUD." };
        }
        for (let i = 0; i < BUILD_SAVE_STORAGE_SIGNATURE_EXPECTED.length; i++) {
            const expected = BUILD_SAVE_STORAGE_SIGNATURE_EXPECTED[i] || "";
            const expectedLabel = BUILD_SAVE_STORAGE_SIGNATURE_LABELS[i] || expected || "Waiting...";
            const actual = (scan.normalized && scan.normalized[i]) ? String(scan.normalized[i]) : "";
            const actualLabel = (scan.names && scan.names[i]) ? String(scan.names[i]) : (actual || "Waiting...");
            if (expected === "*") {
                if (!actual) {
                    return { ok: false, detail: `Waiting for Skyrunner signature slot ${String(i + 1)} (any ability).` };
                }
            } else if (expected) {
                if (!actual) {
                    return { ok: false, detail: `Waiting for Skyrunner signature slot ${String(i + 1)} (${expectedLabel}).` };
                }
                if (actual !== expected) {
                    return { ok: false, detail: `Skyrunner signature mismatch slot ${String(i + 1)}: expected ${expectedLabel}, saw ${actualLabel}.` };
                }
            }
        }
        return { ok: true, detail: "Skyrunner signature abilities confirmed." };
    };

    const ConfirmStorageHeroSignatureAbilities = (root, nowMs, requiredHits) => {
        const State = Q.state || (typeof globalThis !== "undefined" && globalThis.State) || {};
        let required = Number(requiredHits);
        if (!isFinite(required) || required < 1) required = 1;
        const scan = ReadStorageHeroSignatureSlots(root);
        const validation = ValidateStorageHeroSignatureScan(scan);
        const sig = `${scan && scan.sig ? scan.sig : "missing"}|ok:${validation.ok ? "1" : "0"}`;
        if (!validation.ok) {
            if (State.storageHeroSignatureConfirmSig !== sig) {
                State.storageHeroSignatureConfirmSig = sig;
            }
            State.storageHeroSignatureConfirmHits = 0;
            State.storageHeroSignatureLastDetail = validation.detail || "Waiting for Skyrunner signature abilities.";
            return {
                confirmed: false,
                source: "signature_abilities",
                detail: State.storageHeroSignatureLastDetail,
                signature: sig,
                hits: 0
            };
        }

        if (State.storageHeroSignatureConfirmSig !== sig) {
            State.storageHeroSignatureConfirmSig = sig;
            State.storageHeroSignatureConfirmHits = 1;
        } else {
            State.storageHeroSignatureConfirmHits = (Number(State.storageHeroSignatureConfirmHits) || 0) + 1;
        }

        const hits = Number(State.storageHeroSignatureConfirmHits) || 0;
        const confirmed = hits >= required;
        State.storageHeroSignatureLastDetail = confirmed
            ? validation.detail
            : `Skyrunner signature pending hits ${String(hits)}/${String(required)}.`;
        return {
            confirmed: confirmed,
            source: "signature_abilities",
            detail: State.storageHeroSignatureLastDetail,
            signature: sig,
            hits: hits
        };
    };

    const EnsureStorageHeroFavoritesHeaderVisible = (root, nowMs) => {
        if (!root) return false;
        const signal = (typeof Q.tryReadBuildCategoryPayloadStorageHeroFromFavoritesHeader === "function")
            ? Q.tryReadBuildCategoryPayloadStorageHeroFromFavoritesHeader(root)
            : { hero: "", source: "none" };
        const hero = normalizeHero(signal.hero);
        if (hero === BUILD_CATEGORY_PAYLOAD_STORAGE_HERO_ID) return true;

        const now = Number(nowMs) || Date.now();
        let acted = false;
        const isShopOpen = typeof Q.isHudClassActive === "function" && Q.isHudClassActive(root, "gShopOpen");
        if (!isShopOpen && typeof Q.shouldRunBuildCategoryPayloadUiAction === "function" && typeof Q.tryOpenHeroShopForHeroProbe === "function") {
            if (Q.shouldRunBuildCategoryPayloadUiAction(now, "buildCategoryPayloadShopOpenActionNextMs", BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS)) {
                if (Q.tryOpenHeroShopForHeroProbe(root, now)) acted = true;
            }
        }
        const favoritesNav = (typeof Q.findShopFavoritesNavButton === "function") ? Q.findShopFavoritesNavButton(root) : null;
        if (typeof Q.ensureShopFavoritesNavActive === "function") {
            if (Q.ensureShopFavoritesNavActive(root, now, "buildCategoryPayloadFavoritesActionNextMs", BUILD_CATEGORY_PAYLOAD_UI_ACTION_COOLDOWN_MS)) acted = true;
        }
        if (Q.settingsLoaderTraceLogThrottled) {
            Q.settingsLoaderTraceLogThrottled(
                `ensure_favorites|${hero || "-"}|${acted ? "1" : "0"}`,
                `ensure_favorites hero=${hero || "-"} source=${signal && signal.source ? String(signal.source) : "none"} acted=${acted ? "1" : "0"} shopOpen=${isShopOpen ? "1" : "0"} hasFavoritesNav=${favoritesNav ? "1" : "0"}`,
                now
            );
        }
        return acted;
    };

    const TryReadSelectedHeroIncludingStorageFromCommandPanels = (root) => {
        if (!root) return "";
        const stack = [root];
        let scanned = 0;
        let bestHero = "";
        let bestScore = -999;

        while (stack.length > 0 && scanned < HERO_SELECT_COMMAND_SCAN_MAX_PANELS) {
            const panel = stack.pop();
            if (!panel) continue;
            scanned++;

            let onactivate = "";
            try { onactivate = panel.GetAttributeString ? String(panel.GetAttributeString("onactivate", "") || "") : ""; } catch { onactivate = ""; }
            const heroFromCmd = normalizeHero(ExtractHeroTokenFromText(onactivate));
            if (heroFromCmd) {
                let score = 0;
                if (PanelLooksSelected(panel)) score += 8;
                try {
                    const idText = panel.id ? String(panel.id).toLowerCase() : "";
                    if (idText.includes("selected")) score += 3;
                    if (idText.includes("hero")) score += 1;
                } catch {}
                try {
                    if (panel.visible === true) score += 1;
                } catch {}
                if (score > bestScore) {
                    bestScore = score;
                    bestHero = heroFromCmd;
                }
            }

            let childCount = 0;
            try { childCount = panel.GetChildCount ? panel.GetChildCount() : 0; } catch { childCount = 0; }
            for (let i = 0; i < childCount; i++) {
                let child = null;
                try { child = panel.GetChild(i); } catch { child = null; }
                if (child) stack.push(child);
            }
        }

        return (bestHero && bestScore >= 4) ? bestHero : "";
    };

    const ResolveBuildSaveStorageHeroSignal = (root) => {
        const fromCommands = normalizeHero(TryReadSelectedHeroIncludingStorageFromCommandPanels(root));
        if (fromCommands) return { hero: fromCommands, source: "commands" };

        if (root && root.FindChildTraverse) {
            const panelRoots = [];
            const addPanel = (p) => {
                if (!p) return;
                for (let pi = 0; pi < panelRoots.length; pi++) {
                    if (panelRoots[pi] === p) return;
                }
                panelRoots.push(p);
            };
            addPanel(root.FindChildTraverse(PANEL_ID_SHOP_MODS_SELECTED_BUILD));
            addPanel(root.FindChildTraverse("CitadelHudHeroBuilds"));
            addPanel(root.FindChildTraverse("HeroBuildSelector"));
            for (let pr = 0; pr < panelRoots.length; pr++) {
                const probe = panelRoots[pr];
                if (!probe) continue;
                const fromPanel = normalizeHero(TryReadHeroFromPanelSubtree(probe, 320));
                if (fromPanel) {
                    const pid = ReadPanelIdTextMaybe(probe) || "-";
                    return { hero: fromPanel, source: `panel:${pid}` };
                }
            }
        }
        return { hero: "", source: "none" };
    };

    // ── Module registration ──
    const api = {
        foldToAscii: FoldToAscii,
        cleanSignatureText: CleanStorageHeroSignatureText,
        normalizeAbilityName: NormalizeStorageHeroSignatureAbilityName,
        findSignatureHud: FindStorageHeroSignatureHud,
        readSignatureSlots: ReadStorageHeroSignatureSlots,
        validateSignatureScan: ValidateStorageHeroSignatureScan,
        confirmSignatureAbilities: ConfirmStorageHeroSignatureAbilities,
        ensureFavoritesHeaderVisible: EnsureStorageHeroFavoritesHeaderVisible,
        readSelectedHeroFromCommands: TryReadSelectedHeroIncludingStorageFromCommandPanels,
        resolveStorageHeroSignal: ResolveBuildSaveStorageHeroSignal,
        readHeroFromPanelDetails: TryReadHeroFromPanelDetails,
        readHeroFromPanelSubtree: TryReadHeroFromPanelSubtree,
        resolvePlayableHeroAlias: ResolvePlayableHeroAlias,
        extractHeroTokenFromText: ExtractHeroTokenFromText
    };

    Q.core.heroProbe = api;

    // Backwards-compatible delegates directly on QOL namespace
    Q.confirmStorageHeroSignatureAbilities = ConfirmStorageHeroSignatureAbilities;
    Q.readStorageHeroSignatureSlots = ReadStorageHeroSignatureSlots;
    Q.resolveBuildSaveStorageHeroSignal = ResolveBuildSaveStorageHeroSignal;
    Q.tryReadSelectedHeroIncludingStorageFromCommandPanels = TryReadSelectedHeroIncludingStorageFromCommandPanels;
    Q.ensureStorageHeroFavoritesHeaderVisible = EnsureStorageHeroFavoritesHeaderVisible;
    Q.tryReadHeroFromPanelDetails = TryReadHeroFromPanelDetails;
    Q.tryReadHeroFromPanelSubtree = TryReadHeroFromPanelSubtree;
    Q.resolvePlayableHeroAlias = ResolvePlayableHeroAlias;
    Q.extractHeroTokenFromText = ExtractHeroTokenFromText;

    $.Msg("[QOLLock] core/ql_hero_probe: attached to QOL.core.heroProbe");
})();
