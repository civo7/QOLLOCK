// FG owns its portrait; native gold/level panels keep their original bindings.
(() => {
    'use strict';
    const U = QOL.utils;
    const P = QOL.core.panel;
    // Explicit m_strIconImageSmall resources from extracted scripts/heroes.vdata.
    // Keep extensions: e.g. Vindicta uses PNG, Sinclair uses PSD. Unknown heroes
    // stay hidden rather than guessing a resource or displaying Abrams.
    const heroIcons = {
        hero_inferno: 'inferno_sm_psd',
        hero_gigawatt: 'gigawatt_sm_psd',
        hero_hornet: 'hornet_sm_png',
        hero_ghost: 'spectre_sm_psd',
        hero_atlas: 'bull_sm_psd',
        hero_wraith: 'wraith_sm_psd',
        hero_forge: 'engineer_sm_psd',
        hero_chrono: 'chrono_sm_psd',
        hero_dynamo: 'sumo_sm_psd',
        hero_kelvin: 'kelvin_sm_psd',
        hero_haze: 'haze_sm_psd',
        hero_astro: 'astro_sm_psd',
        hero_bebop: 'bebop_sm_psd',
        hero_nano: 'nano_sm_psd',
        hero_orion: 'archer_sm_psd',
        hero_krill: 'digger_sm_psd',
        hero_shiv: 'shiv_sm_psd',
        hero_tengu: 'tengu_sm_psd',
        hero_kali: 'kali_sm_psd',
        hero_warden: 'warden_sm_psd',
        hero_yamato: 'yamato_sm_psd',
        hero_lash: 'lash_sm_psd',
        hero_viscous: 'viscous_sm_psd',
        hero_gunslinger: 'gunslinger_sm_psd',
        hero_yakuza: 'yakuza_sm_psd',
        hero_genericperson: 'genericperson_sm_psd',
        hero_tokamak: 'tokamak_sm_psd',
        hero_wrecker: 'wrecker_sm_psd',
        hero_rutger: 'rutger_sm_psd',
        hero_synth: 'synth_sm_psd',
        hero_thumper: 'thumper_sm_psd',
        hero_mirage: 'mirage_sm_psd',
        hero_slork: 'slork_sm_psd',
        hero_cadence: 'cadence_sm_psd',
        hero_targetdummy: 'targetdummy_sm_psd',
        hero_viper: 'kali_sm_psd',
        hero_vandal: 'vandal_sm_psd',
        hero_magician: 'magician_sm_psd',
        hero_trapper: 'trapper_sm_psd',
        hero_operative: 'operative_sm_psd',
        hero_vampirebat: 'vampirebat_sm_psd',
        hero_drifter: 'drifter_sm_psd',
        hero_priest: 'priest_sm_psd',
        hero_frank: 'frank_sm_psd',
        hero_bookworm: 'bookworm_sm_psd',
        hero_boho: 'hornet_sm_png',
        hero_doorman: 'doorman_sm_psd',
        hero_skyrunner: 'skyrunner_sm_psd',
        hero_swan: 'swan_sm_psd',
        hero_punkgoat: 'punkgoat_sm_psd',
        hero_graf: 'graf_sm_psd',
        hero_fortuna: 'fortuna_sm_psd',
        hero_necro: 'necro_sm_psd',
        hero_fencer: 'fencer_sm_psd',
        hero_familiar: 'familiar_sm_psd',
        hero_werewolf: 'werewolf_sm_psd',
        hero_unicorn: 'unicorn_sm_psd'
    };
    // Hexagon center: (1850 / 2048 - 0.5) * 400 = 161px from frame center.
    const portraitStyles = {
        visibility: 'visible', opacity: '1', ignoreParentFlow: 'true',
        horizontalAlign: 'center', verticalAlign: 'center',
        x: '0px', y: '161px', margin: '0px', width: '48px', height: '48px',
        uiScale: '100%', transform: 'rotateZ(-90deg)', borderRadius: '50%',
        overflow: 'clip', zIndex: '105'
    };
    QOL.healthbar.registerVariant("fg", function() {
        const probe = QOL.core.heroProbe.createReader();
        const resolver = QOL.panelCache.createIdResolver("health_and_abilities_container", {
            retryMs: 400,
            ownerPath: [{ id: "Hud", optional: true }, { className: "HudCore" }, "gameplay_hud"]
    });
    let portrait = null, hero = '', styleSig = null;

    function reset() {
        if (U.IsPanelValid(portrait)) portrait.visible = false;
        P.delete(portrait);
        portrait = null;
        hero = '';
        styleSig = null;
        resolver.reset();
        probe.reset();
    }

    function update(root, cfg) {
        if (Number(cfg && cfg.HEALTHBAR_TYPE) !== 2 || !U.IsPanelValid(root)) {
            reset();
            return;
        }
        const health = resolver.resolve(root);
        const bars = health && health.FindChildTraverse('hud_health_bars');
        const anchor = U.FindFirstPanelByClass(bars, 'health_bar_border');
        if (U.IsPanelValid(portrait) && portrait.GetParent() !== anchor) reset();
        if (!U.IsPanelValid(anchor)) return;
        if (!U.IsPanelValid(portrait)) {
            portrait = P.create('Image', anchor, 'QOLFGPortrait');
            hero = '';
            styleSig = null;
            if (!portrait) return;
            portrait.AddClass('qol_fg_portrait');
            portrait.hittest = false;
            portrait.visible = false;
        }
        styleSig = P.syncStyles(portrait, portraitStyles, styleSig).sig;
        // The pregame reveal identifies the hero before the crosshair appears.
        // In hero testing it also wins over a crosshair left from the last pawn.
        const pregameHero = probe.readHeroFromPregame(root);
        const nextHero = pregameHero || probe.readHeroFromCrosshair(root);
        if (!nextHero || !Object.prototype.hasOwnProperty.call(heroIcons, nextHero)) {
            if (portrait.visible) portrait.visible = false;
            hero = '';
            return;
        }
        if (nextHero !== hero) {
            portrait.SetImage('s2r://panorama/images/heroes/' + heroIcons[nextHero] + '.vtex');
            hero = nextHero;
        }
        if (!portrait.visible) portrait.visible = true;
    }

    return { update, release: reset, isActive: () => U.IsPanelValid(portrait) };
    });
})();
