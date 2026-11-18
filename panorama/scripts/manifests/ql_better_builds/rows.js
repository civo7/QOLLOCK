"use strict";

(() => {
    const { findChild, findChildByClass, findTraverse, setClass } = QOL.core.panel;
    const { FindFirstPanelByClass } = QOL_UTILS;
    const { buildKey } = QOL.features.betterBuilds;
    const PREFIX = "QolBetterBuilds";
    const NO_AUTHOR = ["", 0, -1, 0, "", 0, 0];
    const ROMAN = ["", "I", "II", "III", "IV", "V", "VI"];
    const child = (parent, name) => findTraverse(parent, PREFIX + name);
    const show = (panel, visible) => setClass(panel, PREFIX + "Shown", visible);

    function snippet(parent, name, currentContext = false) {
        const panel = currentContext ? $.CreatePanelWithCurrentContext(parent) : $.CreatePanel("Panel", parent, "");
        if (!panel) throw Error("Could not create Better Builds " + name);
        if (!panel.BLoadLayoutSnippet(PREFIX + name)) {
            panel.DeleteAsync(0);
            throw Error("Could not load Better Builds " + name);
        }
        return panel;
    }

    // UIShowTextTooltip supports markup. Escape all relay data before it reaches the tooltip.
    function tooltip(panel, lines) {
        const content = lines.map(line => String(line).replace(/[&<>"]/g, value =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[value])).join("<br>");
        panel.SetPanelEvent("onmouseover", () => $.DispatchEvent("UIShowTextTooltip", panel, content));
        panel.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", panel));
    }

    function authorOf(data, id) {
        return Object.prototype.hasOwnProperty.call(data.authors, id) ? data.authors[id] : NO_AUTHOR;
    }
    function rankName(data, badge) {
        const label = data.ranks[Math.floor(badge / 10)];
        const division = ROMAN[badge % 10];
        return label ? label + (division ? " " + division : "") : "";
    }
    function boardText(data, author) {
        const region = data.groups[author[2]];
        return region && author[3] > 0 ? region + " #" + author[3] : "";
    }
    function isNightShift(data, author) {
        return author[5] >= data.circles.dlns.regularEvents;
    }
    function badgeImage(rank) {
        return "s2r://panorama/images/ranked/badges/rank" + Math.floor(rank / 10) +
            "/badge_sm_subrank" + Math.max(1, Math.min(6, rank % 10)) + "_psd.vtex";
    }
    function setBadge(panel, badge, minimum) {
        show(panel, badge >= minimum);
        if (badge >= minimum) panel.SetImage(badgeImage(badge));
    }

    function describeAuthor(data, author, build, hero, text) {
        const name = author[0] || text("Unknown author");
        const rank = rankName(data, author[1]);
        const board = boardText(data, author);
        const lines = [name];
        if (rank) lines.push(rank);
        if (board) lines.push(board);
        if (author[5] > 0) lines.push(text("Played in {count} of the last {total} Night Shift editions.", {
            count: author[5], total: data.circles.dlns.events
        }));
        if (build && !author[6]) lines.push(text("This build is listed because trusted players run it."));
        if (build?.m) {
            const heroName = $.Localize("#" + hero.cls);
            if (build.m & 1) lines.push(text("{hero} is one of the author's top heroes on the leaderboard.", { hero: heroName }));
            if (build.m & 2) lines.push(text("The author regularly picks {hero} in Night Shift.", { hero: heroName }));
        }
        return lines;
    }

    function visibleBuilds(data, builds, group, tier, sort) {
        function qualifies(author) {
            if (!author[6]) return false;
            if (tier === 1) return author[3] > 0 && author[3] <= data.circles.top.position;
            if (tier === 2) return isNightShift(data, author);
            return true;
        }
        const scores = {
            best: build => build.s,
            recent: (_build, players) => players.reduce((latest, player) => Math.max(latest, player[1]), 0),
            most: (_build, players) => players.reduce((total, player) => total + player[3], 0),
            newest: build => build.u
        };
        const score = scores[sort];
        const result = [];
        for (const build of builds) {
            const author = authorOf(data, build.a);
            const players = (build.w || []).filter(player => qualifies(authorOf(data, player[0])));
            const trustedAuthor = qualifies(author);
            if (!trustedAuthor && players.length < (tier ? 1 : 2)) continue;
            if (group >= 0 && !(trustedAuthor && author[2] === group) &&
                !players.some(player => authorOf(data, player[0])[2] === group)) continue;
            result.push({ build, author, players, score: score(build, players) });
        }
        return result.sort((a, b) => b.score - a.score || b.build.s - a.build.s || b.build.id - a.build.id);
    }

    function date(unix) {
        return unix ? new Date(unix * 1000).toISOString().slice(0, 10) : "–";
    }
    function age(unix, text) {
        if (!unix) return "–";
        const days = Math.max(0, Math.floor((Date.now() / 1000 - unix) / 86400));
        return days ? text("{count}d", { count: days }) : text("Today");
    }
    function count(total, text) {
        if (!total) return "–";
        if (total < 1000) return String(total);
        if (total < 1000000) return text("{count}k", { count: Math.floor(total / 100) / 10 });
        return text("{count}m", { count: Math.floor(total / 100000) / 10 });
    }

    function renderChanges(target, build, data, text) {
        if (!build.c) return;
        const [patches, heroChanges, descriptions, items, removed] = build.c;
        const changes = heroChanges + items.reduce((total, item) => total + item[1], 0);
        if (!removed.length && !changes) return;
        target.text = removed.length
            ? text("Items gone: {count}", { count: removed.length })
            : text("Changes: {count}", { count: changes });
        show(target, true);
        setClass(target, PREFIX + "PillGone", removed.length > 0);
        setClass(target, PREFIX + "PillPatchFew", !removed.length && heroChanges <= 1 && changes <= 5);
        const itemName = index => data.items[index] || text("Unknown item");
        const lines = [text("Patches affecting this build since {date}: {count}", { date: date(build.u), count: patches })];
        for (const [at, description] of descriptions) lines.push(date(at) + " · " + description);
        if (heroChanges > descriptions.length) {
            lines.push(text("Additional hero changes: {count}", { count: heroChanges - descriptions.length }));
        }
        for (const [item, number, at] of items.slice(0, 8)) {
            lines.push(text("{item} · Changes: {count} · {date}", { item: itemName(item), count: number, date: date(at) }));
        }
        if (items.length > 8) lines.push(text("Additional items changed: {count}", { count: items.length - 8 }));
        if (removed.length) lines.push(text("No longer in the shop: {items}", { items: removed.map(itemName).join(", ") }));
        tooltip(target, lines);
    }

    function renderPlayers(row, players, data, text) {
        const users = child(row, "Users");
        show(users, players.length > 0);
        if (!players.length) return;
        findChild(users, PREFIX + "UsersCaption").text = text("Run by");
        const avatars = findChild(users, PREFIX + "UserAvatars");
        for (const player of players.slice(0, 3)) {
            const avatar = $.CreatePanel("CitadelAvatarImage", avatars, "");
            avatar.SetAccountID(Number(player[0]));
            setClass(avatar, PREFIX + "UserTried", !player[4]);
        }
        findChild(users, PREFIX + "UsersMore").text = players.length > 3 ? "+" + (players.length - 3) : "";
        const games = players.reduce((total, player) => total + player[2], 0);
        const lines = [
            text("Players: {players} · Games: {games} · Last {days} days", { players: players.length, games, days: data.usageDays }),
            text("Only games where the player bought items from this build count.")
        ];
        for (const player of players.slice(0, 8)) {
            const name = authorOf(data, player[0])[0] || text("Unknown player");
            const parts = [text("{player} · Games: {games} · Last played: {date}", { player: name, games: player[2], date: date(player[1]) })];
            if (player[5] > 0) parts.push(text("{percent}% bought from this build", { percent: player[5] }));
            if (!player[4]) parts.push(text("Also tried"));
            lines.push(parts.join(" · "));
        }
        if (players.length > 8) lines.push(text("And {count} more", { count: players.length - 8 }));
        if (players.some(player => !player[4])) lines.push(text("Faded avatars show players who mainly run a different build."));
        tooltip(users, lines);
    }

    function renderRow(parent, entry, index, data, hero, text, run) {
        const { build, author, players } = entry;
        const row = snippet(parent, "Row");
        setClass(row, PREFIX + "Alt", index % 2 === 1);
        child(row, "Rank").text = String(index + 1);
        child(row, "Name").text = build.n;
        child(row, "Avatar").SetAccountID(Number(build.a));
        child(row, "Author").text = author[0] || text("Unknown author");
        const rank = rankName(data, author[1]);
        const rankLabel = child(row, "RankName");
        rankLabel.text = rank ? "·  " + rank : "";
        rankLabel.visible = !!rank;
        setBadge(child(row, "Badge"), author[1], 11);
        const regular = isNightShift(data, author);
        const pills = [
            ["Board", boardText(data, author)],
            ["Dlns", regular ? "DLNS" : author[5] > 0 ? "DLNS ×" + author[5] : ""],
            ["HeroPill", build.m ? text("Main") : ""],
            ["TagPill", author[4] || ""],
            ["Lang", build.l || ""]
        ];
        for (const [key, value] of pills) {
            const pill = child(row, key);
            pill.text = value;
            show(pill, !!value);
            if (key === "Dlns") setClass(pill, PREFIX + "PillDlnsFew", !regular);
        }
        tooltip(FindFirstPanelByClass(row, PREFIX + "Byline"), describeAuthor(data, author, build, hero, text));
        renderChanges(child(row, "Patch"), build, data, text);
        child(row, "Favs").text = count(build.f, text);
        child(row, "Updated").text = age(build.u, text);
        tooltip(FindFirstPanelByClass(row, PREFIX + "Stats"), [
            text("Favourites: {count}", { count: build.f }),
            text("Last updated: {date}", { date: date(build.u) })
        ]);
        renderPlayers(row, players, data, text);
        child(row, "UseLabel").text = text("Use Build");
        row.SetPanelEvent("onactivate", () => run(build, "preview"));
        row.SetPanelEvent("ondblclick", () => run(build, "use"));
        child(row, "Use").SetPanelEvent("onactivate", () => run(build, "use"));
        const star = child(row, "Star");
        star.SetPanelEvent("onactivate", () => run(build, "favourite"));
        tooltip(star, [$.Localize("#Citadel_HeroBuilds_FavoriteButtonTooltip")]);
        return { row, key: buildKey(build.a, build.n), id: build.id };
    }

    function nativeBadge(row, data, author, active, text) {
        if (author === NO_AUTHOR || !author[6]) return null;
        const board = boardText(data, author);
        const parts = [author[4], board || (author[1] >= 101 ? rankName(data, author[1]) : ""), isNightShift(data, author) ? "DLNS" : ""].filter(Boolean);
        if (!parts.length) return null;
        const anchor = findChildByClass(findChild(row, "BuildNameArea"), "nameRow");
        if (!anchor) return undefined;
        const badge = snippet(anchor, "NativeChip", true);
        findChild(badge, PREFIX + "ChipLabel").text = (active ? parts.slice(0, 1) : parts).join("  ·  ");
        setBadge(findChild(badge, PREFIX + "Badge"), author[1], 101);
        tooltip(badge, describeAuthor(data, author, null, null, text));
        return badge;
    }

    Object.assign(QOL.features.betterBuilds, { PREFIX, child, show, snippet, tooltip, authorOf, visibleBuilds, renderRow, nativeBadge });
})();
