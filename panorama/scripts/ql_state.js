// OWNS: Shared runtime snapshots consumed across HUD owners.
// DOES NOT OWN: Panel cache storage, feature-private bookkeeping or user defaults.
var State;
(() => {
    "use strict";
    State = {
        lastConfig: null,
        rejuvState: null,
        accountPresetTestActive: false,
        perfEnabled: false,
        perfDetailed: false,
        perfStats: {}
    };
    QOL.state = State;
    try { if (typeof window !== "undefined") window.State = State; } catch (_) {}
    try { if (typeof globalThis !== "undefined") globalThis.State = State; } catch (_) {}
})();
