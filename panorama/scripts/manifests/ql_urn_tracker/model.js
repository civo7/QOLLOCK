// OWNS: Pure native networth parsing and the existing urn-difference display rules.
// DOES NOT OWN: Native panels, match time, config or presentation lifetime.
(() => {
    "use strict";
    function parse(valueText) {
        let raw = String(valueText || "")
            .replace(/<[^>]*>/g, "")
            .replace(/&(?:nbsp|thinsp);|&#(?:160|8239);/gi, "")
            .replace(/[\u00a0\u202f\s]/g, "")
            .toLowerCase();
        if (!raw) return 0;
        let multiplier = 1;
        const suffix = raw.match(/([kmb])$/);
        if (suffix) {
            multiplier = suffix[1] === "k" ? 1000 : (suffix[1] === "m" ? 1000000 : 1000000000);
            raw = raw.slice(0, -1);
            raw = !raw.includes(".") && (raw.match(/,/g) || []).length === 1 ? raw.replace(",", ".") : raw.replace(/,/g, "");
        } else raw = raw.replace(/,/g, "");
        const value = Number(raw.replace(/[^0-9.+-]/g, ""));
        return Number.isFinite(value) && value > 0 ? Math.round(value * multiplier) : 0;
    }
    function derive(friendlyVal, enemyVal, gameSec) {
        if (friendlyVal <= 0 && enemyVal <= 0) return { display: "--", mood: "neutral" };
        if (friendlyVal > 0 && enemyVal <= 0) return { display: "100%", mood: "good" };
        if (enemyVal > 0 && friendlyVal <= 0) return { display: "-100.0%", mood: "bad" };
        const higher = Math.max(friendlyVal, enemyVal), lower = Math.min(friendlyVal, enemyVal);
        const diff = (higher - lower) / higher * 100 * (friendlyVal < enemyVal ? -1 : 1);
        const threshold = gameSec / 60 < 15 ? 15 : 10;
        return { display: (diff > 0 ? "+" : "") + diff.toFixed(1) + "%",
            mood: diff >= threshold ? "good" : (diff <= -threshold ? "bad" : "neutral") };
    }
    QOL.features.urnDifferenceModel = { parse, derive };
})();
