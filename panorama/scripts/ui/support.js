// panorama/scripts/ui/support.js
// =============================================================================
// QOLLOCK — Support & Credits Subsystem (ES6)
// =============================================================================
// Encapsulates the Support tab interface: Welcome/Hero card, CTA grid
// (Donations, Discord, Commissions, Change Log), and Credits / Contributors /
// Translators plaques and grids.
// =============================================================================

(() => {
    "use strict";

    const Q = (typeof globalThis !== "undefined" && globalThis.QOL)
        ? globalThis.QOL
        : (typeof QOL !== "undefined" ? QOL : (globalThis.QOL = {}));
    Q.ui = Q.ui || {};

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

    const HERO_BODY_LINES = [
        "This is a mod designed to give you complete freedom over your game.",
        "By default everything is disabled and has nearly zero performance cost.",
        "Be conscious of the features you are using and read carefully.",
        "The majority of issues are caused by improper installation or conflicting mods.",
    ];

    const CTA_DEFS = [
        {
            id: "SupportCtaSupportBtn",
            title: "Support",
            hint: "Help fund continued development",
            iconSrc: "s2r://panorama/images/icons/icon_thumbsup.vsvg",
            primary: true,
            onactivate: () => {
                try { $.DispatchEvent("ExternalBrowserGoToURL", "https://ko-fi.com/civocivocivo"); } catch {}
            },
        },
        {
            id: "SupportCtaDiscordBtn",
            title: "Discord",
            hint: "Help, feedback, and community",
            iconSrc: "s2r://panorama/images/qollock/discord_logo_png.vtex",
            iconClass: "SupportCtaBtnIconDiscord",
            onactivate: () => {
                try { $.DispatchEvent("ExternalBrowserGoToURL", "https://discord.gg/npCvuMcTY7"); } catch {}
            },
        },
        {
            id: "SupportCtaCommissionBtn",
            title: "Commission",
            hint: "Request a custom feature or preset",
            iconSrc: "s2r://panorama/images/icons/icon_feedback.vsvg",
            onactivate: () => {
                try { $.DispatchEvent("ExternalBrowserGoToURL", "https://discord.gg/npCvuMcTY7"); } catch {}
            },
        },
        {
            id: "SupportCtaChangeLogBtn",
            title: "Change Log",
            hint: "Latest updates and version notes",
            iconSrc: "s2r://panorama/images/icons/icon_refresh.vsvg",
            onactivate: () => {
                try { $.DispatchEvent("ExternalBrowserGoToURL", "https://gamebanana.com/mods/updates/650634"); } catch {}
            },
        },
    ];

    const CONTRIBUTORS = [
        { label: "Civo", role: "Contributor", url: "https://ko-fi.com/civocivocivo" },
        { label: "Bytenode", role: "Contributor", url: "https://gamebanana.com/members/5222690" },
        { label: "BreadRollius", role: "Contributor", url: "https://gamebanana.com/members/4296197" },
        { label: "Bonclide", role: "Contributor", url: "https://gamebanana.com/members/2408486" },
        { label: "Hanturaya", role: "Contributor", url: "https://gamebanana.com/members/4577138" },
        { label: "Predi_i", role: "Contributor", url: "https://gamebanana.com/members/5107678" },
        { label: "RizoBoy", role: "Contributor", url: "https://gamebanana.com/members/4436032" },
        { label: "Klutzz", role: "Contributor", url: "https://gamebanana.com/members/4745216" },
        { label: "ArkanoidVFX", role: "Contributor", url: "https://gamebanana.com/members/1359230" },
        { label: "Goblin Man Sam", role: "Contributor", url: "https://gamebanana.com/members/4762321" },
        { label: "NinjabladeJR", role: "Contributor", url: "https://gamebanana.com/members/4779465" },
        { label: "Mikoboy", role: "Contributor", url: "https://gamebanana.com/members/2814130" },
        { label: "Wouwei", role: "Contributor", url: "https://gamebanana.com/members/4788864" },
        { label: "Mo_Difier", role: "Contributor", url: "https://gamebanana.com/members/4795931" },
        { label: "Flameblast12", role: "Contributor", url: "https://gamebanana.com/members/4789815" },
        { label: "Fascilux", role: "Contributor", url: "https://gamebanana.com/members/4690723" },
        { label: "Karma", role: "Contributor" },
        { label: "Somarotsaway", role: "Contributor", url: "https://gamebanana.com/members/3961199" },
        { label: "EmilyVasquez", role: "Contributor", url: "https://gamebanana.com/members/1383839" },
        { label: "gfkm", role: "Contributor", url: "https://gamebanana.com/members/5349748" },
        { label: "Aminsx", role: "Contributor", url: "https://gamebanana.com/members/4798159" },
        { label: "oGeorge", role: "Contributor", url: "https://gamebanana.com/members/5260464" },
        { label: "Lustie", role: "Contributor", url: "https://gamebanana.com/mods/655927" },
        { label: "0xluc4s", role: "Contributor", url: "https://gamebanana.com/members/5229080" },
    ];

    const TRANSLATORS = [
        { label: "QuicklyRemove", role: "Translator", iconSrc: "s2r://panorama/images/qollock/chinese_png.vtex" },
        { label: "Gyzeh", role: "Translator", iconSrc: "s2r://panorama/images/qollock/french_png.vtex" },
        { label: "Theran", role: "Translator", iconSrc: "s2r://panorama/images/qollock/brazil_png.vtex" },
        { label: "Milorime", role: "Translator", iconSrc: "s2r://panorama/images/qollock/spanish_png.vtex" },
        { label: "des_", role: "Translator", iconSrc: "s2r://panorama/images/qollock/russian_png.vtex", breakBefore: true },
        { label: "Данон", role: "Translator", iconSrc: "s2r://panorama/images/qollock/belarus_png.vtex" },
        { label: "Cactus330", role: "Translator", iconSrc: "s2r://panorama/images/qollock/poland_png.vtex" },
        { label: "MBG Records", role: "Translator", iconSrc: "s2r://panorama/images/qollock/turkish_png.vtex" },
        { label: "flameblast12", role: "Translator", iconSrc: "s2r://panorama/images/qollock/korean_png.vtex" },
    ];

    const createSupportThanksPlaques = (parent, entries, columns) => {
        if (!isAlive(parent) || !Array.isArray(entries) || entries.length === 0) return null;

        const grid = $.CreatePanel("Panel", parent, "SupportThanksPlaqueGrid");
        if (!grid) return null;
        grid.AddClass("SupportThanksPlaqueGrid");

        const cols = Math.max(1, columns || 4);
        let index = 0;

        while (index < entries.length) {
            const rowEntries = [];
            while (index < entries.length && rowEntries.length < cols) {
                const candidate = entries[index];
                if (rowEntries.length > 0 && candidate && typeof candidate === "object" && candidate.breakBefore) {
                    break;
                }
                rowEntries.push(candidate);
                index++;
            }
            if (rowEntries.length === 0) {
                rowEntries.push(entries[index]);
                index++;
            }

            const row = $.CreatePanel("Panel", grid, "");
            if (!row) continue;
            row.AddClass("SupportThanksPlaqueRow");

            const rowInner = $.CreatePanel("Panel", row, "");
            if (!rowInner) continue;
            rowInner.AddClass("SupportThanksPlaqueRowInner");

            for (let c = 0; c < rowEntries.length; c++) {
                const entry = rowEntries[c];
                const entryData = (typeof entry === "object" && entry) ? entry : { label: entry };
                const plaque = $.CreatePanel(entryData.url ? "Button" : "Panel", rowInner, "");
                if (!plaque) continue;

                plaque.AddClass("PresetGridBtn");
                plaque.AddClass("PresetGridBtnBase");
                plaque.AddClass("SupportThanksPlaque");
                if (c % 2 === 1) plaque.AddClass("SupportThanksPlaqueAlt");
                if (entryData.role) plaque.AddClass(`SupportThanksPlaqueRole_${entryData.role}`);
                if (entryData.iconSrc) plaque.AddClass("SupportThanksPlaqueHasIcon");

                if (entryData.url) {
                    plaque.AddClass("SupportThanksPlaqueClickable");
                    const targetUrl = entryData.url;
                    plaque.SetPanelEvent("onactivate", () => {
                        try { $.DispatchEvent("ExternalBrowserGoToURL", targetUrl); } catch {}
                    });
                }

                const plaqueContent = $.CreatePanel("Panel", plaque, "");
                if (!plaqueContent) continue;
                plaqueContent.AddClass("SupportThanksPlaqueContent");

                if (entryData.iconSrc) {
                    const icon = $.CreatePanel("Image", plaqueContent, "");
                    if (icon) {
                        icon.AddClass("SupportThanksPlaqueIcon");
                        if (entryData.role) icon.AddClass(`SupportThanksPlaqueIcon_${entryData.role}`);
                        try { icon.SetImage(entryData.iconSrc); } catch {}
                    }
                }

                const label = $.CreatePanel("Label", plaqueContent, "");
                if (label) {
                    label.text = entryData.label || "";
                    if (entryData.role) label.AddClass(`SupportThanksPlaqueLabel_${entryData.role}`);
                }
            }
        }
        return grid;
    };

    const createSupportThanksGroup = (parent, title, entries, columns, roleClass) => {
        if (!isAlive(parent) || !Array.isArray(entries) || entries.length === 0) return null;
        const group = $.CreatePanel("Panel", parent, "");
        if (!group) return null;

        group.AddClass("SupportThanksGroup");
        if (roleClass) group.AddClass(roleClass);

        const groupTitle = $.CreatePanel("Label", group, "");
        if (groupTitle) {
            groupTitle.AddClass("SupportThanksGroupTitle");
            if (roleClass) groupTitle.AddClass(`${roleClass}Title`);
            groupTitle.text = localize(title || "");
        }

        group.thanksGrid = createSupportThanksPlaques(group, entries, columns || 4);
        return group;
    };

    const renderSupportTab = (list) => {
        if (!globalThis.gSearchCollectMode && !isAlive(list)) return;

        // Search collection mode
        if (globalThis.gSearchCollectMode && globalThis.gSearchCollectState) {
            if (typeof globalThis.CreateSectionTitle === "function" && typeof globalThis.CreateRow === "function") {
                globalThis.CreateSectionTitle(list, "Help, Contact & Support");
                globalThis.CreateRow(list, "Discord", "SEARCH_TAB:Support", "actionbutton", null, null, null, [
                    { label: "Open" },
                ], "Help and feedback");
                globalThis.CreateRow(list, "Commission", "SEARCH_TAB:Support", "actionbutton", null, null, null, [
                    { label: "Open" },
                ], "Request a custom feature or preset");
                globalThis.CreateRow(list, "Change Log", "SEARCH_TAB:Support", "actionbutton", null, null, null, [
                    { label: "Open" },
                ], "Latest updates and version notes");
                globalThis.CreateRow(list, "Support", "SEARCH_TAB:Support", "actionbutton", null, null, null, [
                    { label: "Open" },
                ], "Support the mod - donate via Ko-fi (kofi) to help fund continued development");
                globalThis.CreateSectionTitle(list, "Special Thanks");
                globalThis.CreateRow(list, "Contributors", "SEARCH_TAB:Support", "actionbutton", null, null, null, [
                    { label: "Open" },
                ], "Community acknowledgements");
            }
            return;
        }

        // --- Section 1: Hero / intro card ---
        const supportIntroCard = $.CreatePanel("Panel", list, "SupportIntroCard");
        if (supportIntroCard) {
            supportIntroCard.AddClass("SupportTabCard");
            supportIntroCard.AddClass("SupportIntroCard");
            supportIntroCard.AddClass("SupportHeroCard");

            const supportHeroTitle = $.CreatePanel("Label", supportIntroCard, "");
            if (supportHeroTitle) {
                supportHeroTitle.AddClass("SupportTabSectionTitle");
                supportHeroTitle.AddClass("SupportHeroTitle");
                supportHeroTitle.text = localize("Welcome to QOL Lock");
            }

            const supportHeroBulletList = $.CreatePanel("Panel", supportIntroCard, "SupportHeroBulletList");
            if (supportHeroBulletList) {
                supportHeroBulletList.AddClass("SupportHeroBulletList");
                for (const heroLine of HERO_BODY_LINES) {
                    const bulletRow = $.CreatePanel("Panel", supportHeroBulletList, "");
                    if (!bulletRow) continue;
                    bulletRow.AddClass("SupportHeroBullet");

                    const marker = $.CreatePanel("Panel", bulletRow, "");
                    if (marker) marker.AddClass("SupportHeroBulletMarker");

                    const bulletLabel = $.CreatePanel("Label", bulletRow, "");
                    if (bulletLabel) {
                        bulletLabel.AddClass("SupportTabText");
                        bulletLabel.AddClass("SupportHeroBulletLabel");
                        const heroLineText = localize(heroLine);
                        bulletLabel.text = (heroLineText && heroLineText.endsWith("."))
                            ? heroLineText.slice(0, -1)
                            : heroLineText;
                    }
                }
            }
        }

        // --- Section 2: Help, Contact & Support CTA grid ---
        const supportCtaSection = $.CreatePanel("Panel", list, "SupportCtaSection");
        if (supportCtaSection) {
            supportCtaSection.AddClass("SupportTabCard");
            supportCtaSection.AddClass("SupportCtaCard");

            const supportCtaSectionTitle = $.CreatePanel("Label", supportCtaSection, "");
            if (supportCtaSectionTitle) {
                supportCtaSectionTitle.AddClass("SupportTabSectionTitle");
                supportCtaSectionTitle.AddClass("SupportCtaSectionTitle");
                supportCtaSectionTitle.text = localize("Help, Contact & Support");
            }

            const supportCtaGrid = $.CreatePanel("Panel", supportCtaSection, "SupportCtaGrid");
            if (supportCtaGrid) {
                supportCtaGrid.AddClass("SupportCtaGrid");

                for (let ctaIdx = 0; ctaIdx < CTA_DEFS.length; ctaIdx += 2) {
                    const ctaRow = $.CreatePanel("Panel", supportCtaGrid, "");
                    if (!ctaRow) continue;
                    ctaRow.AddClass("SupportCtaRow");

                    for (let ctaColumn = 0; ctaColumn < 2 && (ctaIdx + ctaColumn) < CTA_DEFS.length; ctaColumn++) {
                        if (ctaColumn > 0) {
                            const ctaGap = $.CreatePanel("Panel", ctaRow, "");
                            if (ctaGap) ctaGap.AddClass("SupportCtaRowGap");
                        }

                        const def = CTA_DEFS[ctaIdx + ctaColumn];
                        const ctaSlot = $.CreatePanel("Panel", ctaRow, "");
                        if (!ctaSlot) continue;
                        ctaSlot.AddClass("SupportCtaBtnSlot");

                        const ctaBtn = $.CreatePanel("Button", ctaSlot, def.id);
                        if (!ctaBtn) continue;
                        ctaBtn.AddClass("SupportCtaBtn");
                        ctaBtn.AddClass("SupportCtaGridBtn");
                        if (def.primary) ctaBtn.AddClass("SupportCtaBtnPrimary");

                        const ctaContent = $.CreatePanel("Panel", ctaBtn, "");
                        if (!ctaContent) continue;
                        ctaContent.AddClass("SupportCtaBtnContent");

                        const ctaBtnIcon = $.CreatePanel("Image", ctaContent, "");
                        if (ctaBtnIcon) {
                            ctaBtnIcon.AddClass("SupportCtaBtnIcon");
                            if (def.iconClass) ctaBtnIcon.AddClass(def.iconClass);
                            if (def.iconSrc) {
                                try { ctaBtnIcon.SetImage(def.iconSrc); } catch {}
                            }
                        }

                        const ctaText = $.CreatePanel("Panel", ctaContent, "");
                        if (!ctaText) continue;
                        ctaText.AddClass("SupportCtaBtnText");

                        const ctaBtnTitle = $.CreatePanel("Label", ctaText, "");
                        if (ctaBtnTitle) {
                            ctaBtnTitle.AddClass("SupportCtaBtnTitle");
                            ctaBtnTitle.text = localize(def.title);
                        }

                        const ctaBtnHint = $.CreatePanel("Label", ctaText, "");
                        if (ctaBtnHint) {
                            ctaBtnHint.AddClass("SupportCtaBtnHint");
                            ctaBtnHint.text = localize(def.hint);
                        }

                        if (typeof def.onactivate === "function") {
                            ctaBtn.SetPanelEvent("onactivate", def.onactivate);
                        }
                    }
                }
            }
        }

        // --- Section 3: Community / Special Thanks ---
        const supportThanksBlock = $.CreatePanel("Panel", list, "SupportTabThanksBlock");
        if (supportThanksBlock) {
            supportThanksBlock.AddClass("SupportTabThanksBlock");
            supportThanksBlock.AddClass("SupportTabCard");

            const supportThanksTitle = $.CreatePanel("Label", supportThanksBlock, "");
            if (supportThanksTitle) {
                supportThanksTitle.AddClass("SupportTabSectionTitle");
                supportThanksTitle.text = localize("Credits");
            }

            const supportThanksRule = $.CreatePanel("Panel", supportThanksBlock, "");
            if (supportThanksRule) supportThanksRule.AddClass("SupportThanksRule");

            createSupportThanksGroup(supportThanksBlock, "Contributors", CONTRIBUTORS, 6, "SupportThanksGroupContributor");
            createSupportThanksGroup(supportThanksBlock, "Translators", TRANSLATORS, 6, "SupportThanksGroupTranslator");
        }
    };

    // Public API on Q.ui.support
    Q.ui.support = {
        render: renderSupportTab,
        createSupportThanksPlaques,
        createSupportThanksGroup,
        contributors: CONTRIBUTORS,
        translators: TRANSLATORS,
        ctaDefs: CTA_DEFS,
        heroBodyLines: HERO_BODY_LINES,
    };

    // Register with window manager
    if (typeof Q.ui.window?.registerTabRenderer === "function") {
        Q.ui.window.registerTabRenderer("Support", renderSupportTab);
    }

    // Backward compatibility globals
    globalThis.CreateSupportThanksPlaques = createSupportThanksPlaques;
    globalThis.CreateSupportThanksGroup = createSupportThanksGroup;
    globalThis.RenderSupportTabContent = renderSupportTab;
})();
