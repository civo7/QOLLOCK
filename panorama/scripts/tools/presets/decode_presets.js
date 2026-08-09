// One-shot: decode player preset share codes into sparse diff-from-default objects.
// Loads the REAL codec + schema registry from ql_shared_presets.js via vm sandbox.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sharedPath = path.join(__dirname, "..", "..", "ql_shared_presets.js");
const src = fs.readFileSync(sharedPath, "utf8");

// Sandbox with Panorama stubs. Most code is guarded by typeof checks.
const sandbox = {};
sandbox.$ = { Msg: function() {}, Schedule: function() {}, persistentStorage: undefined };
sandbox.window = sandbox;
sandbox.console = console;
vm.createContext(sandbox);
try {
    vm.runInContext(src, sandbox, { filename: "ql_shared_presets.js" });
} catch (e) {
    console.error("LOAD ERROR:", e.message);
}

const CODEC = sandbox.QOL_CODEC;
const UTILS = sandbox.QOL_COMPACT_SCHEMA_UTILS;
const REGISTRY = sandbox.QOL_COMPACT_SCHEMA_REGISTRY;
const DEFAULT_CONFIG = sandbox.QOL_DEFAULT_CONFIG;

const DEFAULT_HERO_OPTIONS = [
    "hero_inferno","hero_gigawatt","hero_hornet","hero_ghost","hero_atlas","hero_wraith",
    "hero_forge","hero_chrono","hero_dynamo","hero_kelvin","hero_haze","hero_astro",
    "hero_bebop","hero_nano","hero_orion","hero_krill","hero_shiv","hero_tengu",
    "hero_warden","hero_yamato","hero_lash","hero_viscous","hero_synth","hero_mirage",
    "hero_viper","hero_magician","hero_vampirebat","hero_drifter","hero_priest","hero_frank",
    "hero_bookworm","hero_doorman","hero_punkgoat","hero_necro","hero_fencer","hero_familiar",
    "hero_werewolf","hero_unicorn"
];
const COMPACT_DEFAULT_HERO_FIELD = "DEFAULT_HERO_INDEX";
const TOKEN_RE = /^\[QOL-(\d+-\d+-\d+)\]:([A-Za-z0-9\-_]+)$/i;

function decodeCode(raw) {
    const m = String(raw).replace(/\s+/g, "").match(TOKEN_RE);
    if (!m) throw new Error("bad token");
    const semver = m[1].replace(/-/g, ".");
    if (!REGISTRY.hasOwnProperty(semver)) throw new Error("unknown semver " + semver);
    const binary = CODEC.FromBase64Url(m[2]);
    const schema = UTILS.GetSchema(semver);
    const parsed = CODEC.DeserializeCompactBinary(
        binary, schema,
        function(field, value, p) {
            if (field.key === COMPACT_DEFAULT_HERO_FIELD) {
                let hi = Math.round(value);
                if (hi < 0 || hi >= DEFAULT_HERO_OPTIONS.length) hi = 0;
                p.DEFAULT_HERO = DEFAULT_HERO_OPTIONS[hi] || String(DEFAULT_CONFIG.DEFAULT_HERO || "hero_werewolf");
                return true;
            }
            return false;
        },
        function(missing, p) {
            if (!missing || !missing.key) return;
            if (missing.key === COMPACT_DEFAULT_HERO_FIELD) {
                p.DEFAULT_HERO = String(DEFAULT_CONFIG.DEFAULT_HERO || "hero_werewolf");
            } else if (DEFAULT_CONFIG.hasOwnProperty(missing.key)) {
                p[missing.key] = DEFAULT_CONFIG[missing.key];
            }
        }
    );
    return { semver: semver, parsed: parsed };
}

function diffFromDefault(parsed) {
    const out = {};
    Object.keys(parsed).sort().forEach(function(k) {
        if (!DEFAULT_CONFIG.hasOwnProperty(k)) { out[k] = parsed[k]; return; }
        const a = parsed[k], b = DEFAULT_CONFIG[k];
        const same = (typeof a === "number" || typeof b === "number")
            ? Number(a) === Number(b)
            : String(a) === String(b);
        if (!same) out[k] = a;
    });
    return out;
}

const PRESETS = [
    { key: "BreadRollius", code: "[QOL-3-1-9]:AjQ0S18jZMhMDg8lk6kBZCADh4clKBThq0IGEEChYmRkZI5YQjZiCZlkAKBQwBgggwyAjCAcWFoyAicDy8HjAUsswRJLBB5kzgIAAAAyyJDpIEMmQ8kHBrQMSzIDAVCWyChLZFj0U5bIKEtk2KuU8ryKIkMGAAAAoAUgIQNbkZEpkP8fpRqQpFWQQTYAk5HJ0MjI-P8Dow" },
    { key: "Jaundice", code: "[QOL-3-1-9]:AjM0SxQjZMhMTk-Vk5knZCADh4clKBSgRkEGsJWi4GRkZIxYQjZiCRl2AKBQxhgigwyAjCAcWVoyAicDt8HjAUssEVNQFB5kssIeAEAyyJCBIIsmwsgHBowMSzJB7lKWyChLZGT0U5bIKEtk-aOU8ryKIkM2zjngPAuuIyNboaYoUv4fpRqQpNWQQSaA26XJjMjI-P8DNQ" },
    { key: "Valerie", code: "[QOL-3-1-9]:AjI0SxQjZMhMDm_Fk9E_ZCAD94MlLhTgT0MGMJWi4GRkZIxYQjZiCZlkJqBQxhgggwyAjCAcWVoyAicDy8HjAUsswRLLJB5kpgJ3QkIyyJAhEcuW4MgHBowMSzIB7lKWyChLZGT0U5bIKEtk2quU8ryKIkMGEEAAoAXAIyNbuYIUkP8fpRqQpNWQQbYWk5HJ0MjI-P8DIA" },
    { key: "Deethirty", code: "[QOL-3-1-9]:AkA0SxQjZMhMbk8gk6khZCADh4clKBSoR0MG0BOgYGRkZIxYQjZiCRlkAKBQxgAggwyAjCAcWFoyAicDy8HjAUsswRJKyhBkzh4wAAAyyJAhIUMmQ8kHBowMSzIZAFCW9ChLZGT0U5bIKEtkzmuU8ryKIkMGkAEAoEUgICNbkZEBAP4fpRqQpNWQQSYAk5EBgMjI-P8DJQ" },
    { key: "mituu", code: "[QOL-3-1-9]:AmM0SxQjZMhMbm8lk6khZCADh4clKBTgR0MG0JOiYGRkZIxYQjZiCRlkAKBQwBghgwyAjCAcWFoyAicDy8HjAUsswRJLGh5kzh4wAEAyyJApIUMmQ8kHBowMSzIZAFCWyChLZGT0U5bIKEtkyKOU8ryKIkMGAAAAoEWgIyNbkZEpkP8fpRKQpNWQQSYAk5HJ0MjI-P8Dog" },
    { key: "Seyer", code: "[QOL-3-1-9]:AjU0SxQjZMhMDk8lk6kpZCADh4clKBQYQ0EGkEGhAWRkZIxYQjZiCRl4AKBQwBgggwyAjCAcWFoyAicDycHjAUsswRJLZB5kzgAwAAAyyJAhIUMmQwEHBowMSzIZAFCWyChLZGT0U5bIKEtkyKOU8ryKIkM2AAAAoAWgIyNbkZEpkv8fpRqQpJWQQQYAk5HJ0MjI-P8DAw" },
    { key: "Boredom", code: "[QOL-3-1-9]:Ak80SxQjZMhOTk8lk6knZCADh4clKBTRT0EGkHWg4GRkZIxYQjZiCZmGAqxQwBghgwyAjCAcWVoyAicDysHjAUsswRJLAB5kzgI-AEAyyJAhIUMmQ08HBowMSzJBAFKWyChLZGT0U5bIKEtk2KuU8byKIkMGAAAAoAWgIyNbIU8pkP8fpRqQpNWQQSYA25HJ0MjIEAAAKA" },
    { key: "Anguish", code: "[QOL-3-1-9]:AigUSxQjZMhMDg8lk6khZCADh4clKBQAQ0EGAIKiIWRkZIxYQjZiCRlkAKBQwBgggwyAjCAcWFp6ACcjy8HjAUsswRJLZB5kzgAgAAAyyJAhIUPWQMkHBowMSzIBAFCWyChLZGT0U5bIKEtkzKOU8ryKIkMGoAEAoAWgIyNbkZEpkP8fpRmQpNWQQTYAk5HJ0MjI-P8Dyw" },
    { key: "Nairshark", code: "[QOL-3-1-9]:Aig0ShQjZMhMTm8lk6kHZCADh6ciKBTg4vqDgVKgY2RkUI5YQjZiCRlkAKBQwBgggwyAjCAcWFoyAiejy8HjAUsswRJLXB5kzgIwAAAyyJApIUMmQ8kHBowMSzJBAFKWyChLZGT0U5bIKEtkxKOU8ryKIkMGAAAAoAWgIyNbkZGpkP8fpQGQpBWQQTYAk5HJ0MjI-P8DoQ" },
    { key: "Blank2762", code: "[QOL-3-1-9]:Ajg0SxQjZMhMDk8lk6khZCADh4clKBTwR0MGAIKi4WVkZIxYQjZiCRl2AKBQwBgggwygjCAcWVoyAicjycHjAUsswRJLRR5kzgA-AAAyyJApIUMmQ8kHBowMSzIZ_lOWyChLZGT0U5bIKEtk3KuU8ryKIkM2AAAAoAWgIyNbkZEpkP8fpRqQpJWQQSYAk5HJ0MjI-P8DqA" },
    { key: "Keta", code: "[QOL-3-1-9]:AjI0SxQjZMhMDk8lk6knZCADh4clKBSAS0MGAIKiaGRkZI5YQjZiCZlkAKBQwBgggwyAjCAcWloyAicDy8HjAUssyRJLCh5kzkIAAAAyyJAhIUMmQ8kHBoAMSzIBAFCWyChLZGT0U5bIKEtkzKOU8ryKIkM2AAAAoAWgIyNbkZEpkP8_pRqQpNWQQTYAk5HJ0MjI-P8D8Q" },
    { key: "loony", code: "[QOL-3-1-9]:AjU0SxQjZMhMbk8lk6kBZCADh4clKBTxR0MGkEGhYGRkZIxYQjZiCRlkAKBQwBgggwyAjCAcWFoyAicDycHjAUsswRJLZB5kzhwAAAAyyJAhIUMmQ8kHBowMSzIBAFCWyChLZGT0U5bIKEtkwKOU8ryKIkMGAAAAoAWgIyNbkZEpkP8fpQKQpJWQQSYAk5HJ0MjI-P8Dzw" },
    { key: "Starjadian", code: "[QOL-3-1-9]:AjwUSxQjZMhODk8lk6kBZCADt4clKBT4T0EGEJKi8mRkZI5YQjZiCZlkAqBQxhghgwygjCAcW1oyAiejy8HjAUssyRJLIR5kzkA-AEAyyJApIUMmQ8kHBowMSzJb_lOWyChLZGT0U5bIKEtkzKuU8ryKIkMGAAAAoEWgI_NakZGpkv8_pRqQpNWQQTYAk5HJ0MjI-P8DQA" }
];

console.log("CODEC ok:", !!(CODEC && CODEC.FromBase64Url), "REGISTRY keys:", Object.keys(REGISTRY).join(","), "DEFAULT_CONFIG keys:", Object.keys(DEFAULT_CONFIG || {}).length);

const result = {};
PRESETS.forEach(function(p) {
    try {
        const dec = decodeCode(p.code);
        const diff = diffFromDefault(dec.parsed);
        result[p.key] = diff;
        console.log("\n=== " + p.key + " (schema " + dec.semver + ", " + Object.keys(diff).length + " keys) ===");
        console.log(JSON.stringify(diff, null, 2));
    } catch (e) {
        console.log("\n=== " + p.key + " FAILED: " + e.message + " ===");
    }
});

fs.writeFileSync(path.join(__dirname, "decoded_presets.json"), JSON.stringify(result, null, 2));
console.log("\nWrote decoded_presets.json");
