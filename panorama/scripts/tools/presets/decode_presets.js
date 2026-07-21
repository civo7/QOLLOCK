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
    { key: "BreadRollius", code: "[QOL-3-1-9]:AjQ0S18jZMhMDg8lk6kBZCADh4clKBTpq0IGEEChYmRkZI5YQjZiCZlkAKBQwBgggwyAjCAcWFoyAicDycHjAUsswRJLBB5kzgIAAAAyyJDpIEMmQ8kHBrQMSzIDAVCWyChLZFj0U5bIKEtk2KuU8ryKIkMGAAAAoAUgIQNbkZEpkP8fpRqQpFWQQTYAk5HJ0MjI-P8DqQ" },
    { key: "Synthronix",   code: "[QOL-3-1-6]:Aig0SxQjZMhM7gclk6kBZCADh4clKBTwQ0MGAIKicWRkZIxYQjZiCRlkAKBQwBgggwyAjCAcWFoyAicDy8HjAUsswRJLCh5kzh4wAAAyyJAhI0MmQ8kHBowMSzIBAFCWyChLZGT0U5bIKEtkzKOU8ryKIkMGAAAAoAWgIyMLkZEpkP8fpRKQpJWQQSYAGQ" },
    { key: "munchkinman",  code: "[QOL-3-1-6]:Aig0SxQjZMhMbmUlk6kBZCADh4clKBT4T-dzEZKi6GRkZIxYQjZiCZl2AKBQwBgggwyAjCAcWVoyAiejF8DjAUsswRJLQR5kzh4-AEAyyJAhIUMmQ8kHBowMSzJZ_lOWyChLZGT0U5bIKEtk_qiU8ryKIkM2oCPQoEWgAwBYIfcoAoY-pRqQpJWQQQYARw" },
    { key: "Xavier",       code: "[QOL-3-1-6]:AigUSxQjZMhMcg8gk6khZCADh4clKBSAQ38GAIKiYWRkZI5YQjZiCRlkAKBQwJgggwyAjCAcWFoyAicDy8HjAUssgRJL4BBkzhIAAAAyyJAhIUMmQ2UHBowMSzIBAFKWyChLZGT0U5bIKEtkxKMU8r6kIfsGAAAAoAWgIyNbkZEpkP8fpQKQpJWQQSYAUQ" },
    { key: "Jared",        code: "[QOL-3-1-6]:AjU0SxQjZMhMbk8gk6khZCADh4clKBTATkMGEFKhYGRkZIxYQjZiCRlkAKBQpggggwyAjCAcWFoyAicDycHjAUssyRJLixBkzhwAAEAyyJAhIUMmQ8kHBogMSzIZAVKWyChLZGT005TIKEtkzKuU8ryKIkM20AEAoEWgIyMbkJEpkf8fpRmQpNWQQTYAUg" },
    { key: "Basil",        code: "[QOL-3-1-4]:AisUSxQjZMhMDk_WkqknZCADR8EjHhTIQxsFAHKgYWRkPIxYQjZiCRlkAKBQwggggwyAjCAcWMowAicDy8HjAUssyRJLZCFk4gAwAAAyyJAhIUMmQ8kHBowMSzIBAFKWyChLZGT0U5bIKEtkzqOU8ryKIkMGAAAAoAWgIyPDkJEpkP8_pRqQpBWy" },
    { key: "Neonvoid",     code: "[QOL-3-1-4]:AigUSxQjZMjM9Gclk6khASDDh4clKBT6R0MGEIOi4mRkZIxYQoZhaRlkAKBQxhgggwygjCAcWVoyAiejycHjAUsswRJLZB5kzhw-AAAyyJAhIUMmQ8kHBowMSzIBZlCWyChLZGT0U5bIKEtk4auU8r6KIkMGAAAAoAWgIyNbkZEpkv8fpQKQpBUU" },
    { key: "ninjabladeJr", code: "[QOL-3-1-4]:AkY0SxQjZMhM7mwvk8kHZCADh4clKBTAW9wF0ISi4GRk5o5YQjZiCZlkoqxkTB8igwyApWVVWZKxBCcjysfjAUsswRJLpDlkzh42ikUyyJAhI0MmQ10CBowMSzIZAFKWyChLZGT0U5bIKEtkxKsU8LyKIkMGAAAAoAWgIyNbkZEpkP8fpQKQpBXY" },
    { key: "BSQTT",        code: "[QOL-3-1-3]:AkrwSBQjZMhMDg8lk6kBZCADh4clKBT480IG0EShY2RkZI5YQjZiCRl2AKBQUAQggwyAjCAcWFoyAicDy8HjAUsswRJLWh5kzgIAAAAyyJAhIUMmQ8kHBowMSzIBAFCWyChLZGT0U5bIKEtk0KOU8ryKIkM2AAAAoAWgIyNbkZEpkP8fpQKQpAHR" }
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
