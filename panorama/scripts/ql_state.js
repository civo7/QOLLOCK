// OWNS: Shared runtime snapshots consumed across HUD owners.
// DOES NOT OWN: Panel cache storage, feature-private bookkeeping or user defaults.
var State;
(() => {
    "use strict";
    State = {
        lastConfig: null,
        combatStatus: {
            lastCombatMs: 0,
            signalActive: false,
            nextAlertProbeMs: 0
        },
        rejuvState: null,
        accountPresetTestActive: false,
        rootClassCache: { panel: null, values: {} },
        coreRootStaticSig: "",
        abilitiesClassCache: { panel: null, values: {} },
        perfEnabled: false,
        perfDetailed: false,
        perfStats: {}
    };
    QOL.state = State;
    try { if (typeof window !== "undefined") window.State = State; } catch (_) {}
    try { if (typeof globalThis !== "undefined") globalThis.State = State; } catch (_) {}
})();
