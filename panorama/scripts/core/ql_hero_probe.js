// OWNS: Read-only native pregame/crosshair hero evidence for the FG portrait.
// DOES NOT OWN: Entity identity, shop/build actions, config, history or schedules.
// Sources retain verified native IDs/classes; conflicting or unreadable evidence is empty.
(() => {
    "use strict";
    const P = QOL.core.panel;
    const aliases = {
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

    const heroAliases = Object.keys(aliases);
    function currentHud(root) {
        if (root && !P.isAlive(root)) return null;
        const hud = P.findHud(root || $.GetContextPanel());
        return P.isAlive(hud) && (hud.id === "Hud" || hud.paneltype === "CitadelHud") ? hud : null;
    }
    function readHeroFromCrosshair(root) {
        const crosshair = P.findTraverse(currentHud(root), "crosshair");
        if (!P.isAlive(crosshair)) return "";
        // A pawn transition can leave two live dash indicators. Every recognized
        // class must agree instead of selecting the first alias/panel match.
        try {
            const candidates = [crosshair, ...(crosshair.FindChildrenWithClassTraverse("citadel_ability_dash") || [])];
            let found = "";
            for (const panel of candidates) {
                if (!P.isAlive(panel)) continue;
                for (const alias of heroAliases) {
                    if (!panel.BHasClass("hero_" + alias) && !panel.BHasClass(alias)) continue;
                    const hero = "hero_" + alias;
                    if (found && found !== hero) return "";
                    found = hero;
                }
            }
            return found;
        } catch (_) { return ""; }
    }
    function readHeroFromPregame(root) {
        const hud = currentHud(root);
        if (!hud) return "";
        // A hidden old reveal cannot override the current gameplay pawn. In
        // hero testing the verified ShowingHero reveal has priority in FG.
        try {
            if (!["GameStatePreGame", "GameStatePreGameWait", "connectedToHeroTesting"].some(name => hud.BHasClass(name))) return "";
            const abilities = P.findTraverse(P.findTraverse(hud, "Pregame"), "HeroAbilities");
            if (!P.isAlive(abilities) || !abilities.BHasClass("ShowingHero")) return "";
            let found = "";
            for (const alias of heroAliases) {
                if (!abilities.BHasClass("hero_" + alias)) continue;
                const hero = "hero_" + alias;
                if (found && found !== hero) return "";
                found = hero;
            }
            return found;
        } catch (_) { return ""; }
    }
    QOL.core.heroProbe = { readHeroFromCrosshair, readHeroFromPregame };
})();
