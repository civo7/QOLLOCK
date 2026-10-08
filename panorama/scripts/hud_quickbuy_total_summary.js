// OWNS: Quickbuy costs, upcoming previews, notify/drag callbacks and their deferred work.
// Context: hud_quickbuy.xml; independent from the HUD FeatureRegistry and QOL services.
(() => {
    "use strict";
const quickbuyUpcomingPreviewSlots=[
	{
		rootId:'QuickbuyUpcomingPreview2',
		entryPanelId:'QuickbuyPreview2Entry',
		soulsLabelId:'QuickbuyUpcomingPreview2SoulsNeededLabel',
		queueIndex:1
	},
	{
		rootId:'QuickbuyUpcomingPreview3',
		entryPanelId:'QuickbuyPreview3Entry',
		soulsLabelId:'QuickbuyUpcomingPreview3SoulsNeededLabel',
		queueIndex:2
	},
	{
		rootId:'QuickbuyUpcomingPreview4',
		entryPanelId:'QuickbuyPreview4Entry',
		soulsLabelId:'QuickbuyUpcomingPreview4SoulsNeededLabel',
		queueIndex:3
	},
	{
		rootId:'QuickbuyUpcomingPreview5',
		entryPanelId:'QuickbuyPreview5Entry',
		soulsLabelId:'QuickbuyUpcomingPreview5SoulsNeededLabel',
		queueIndex:4
	}
];
const QUICKBUY_ITEM_NAME_ALIASES={
	'basic magazine':'extended magazine',
	'dispel magic':'debuff remover',
	'mystic reach':'mystic expansion',
	'mystic regen':'mystic regeneration',
	'improved cooldown':'compress cooldown',
	'sharp shooter':'sharpshooter',
	'spellslinger headshots':'spirit rend'
};
const QUICKBUY_ICON_OVERRIDES={
	'compress cooldown':'s2r://panorama/images/items/spirit/improved_cooldown_psd.vtex',
	'mystic expansion':'s2r://panorama/images/items/spirit/mystic_reach_psd.vtex',
	'mystic regeneration':'s2r://panorama/images/items/spirit/mystic_regen_psd.vtex',
	'debuff reducer':'s2r://panorama/images/items/vitality/debuff_reducer_psd.vtex',
	'dispel magic':'s2r://panorama/images/items/vitality/debuff_remover_psd.vtex'
};
const QUICKBUY_RAW_RECIPE_COMPONENTS={
	'Aerial Supremacy':['Stamina Mastery'],
	'Apex Combat':['Ricochet'],
	'Arcane Surge':['Extra Stamina'],
	'Arctic Blast':['Cold Front'],
	'Armor Piercing Rounds':['High-Velocity Rounds'],
	'Ballistic Enchantment':['Mystic Expansion'],
	'Boundless Spirit':['Improved Spirit'],
	'Burst Fire':['Rapid Rounds'],
	'Capacitor':['Tesla Bullets'],
	'Colossus':['Extra Health'],
	'Crippling Headshot':['Weakening Headshot'],
	'Crushing Fists':['Melee Charge'],
	'Cultist Sacrifice':['Monster Rounds'],
	'Disarming Hex':['Rusted Barrel'],
	'Divine Barrier':['Guardian Ward'],
	'Enduring Speed':['Sprint Boots'],
	'Escalating Exposure':['Mystic Vulnerability'],
	'Escalating Resilience':['Extended Magazine'],
	'Express Shot':['High-Velocity Rounds'],
	'Focus Lens':['Spirit Sap'],
	'Fortitude':['Extra Health'],
	'Fury Trance':['Bullet Lifesteal'],
	'Greater Expansion':['Mystic Expansion'],
	'Guardian Ward':['Grit'],
	'Headhunter':['Headshot Booster'],
	'Healing Booster':['Extra Regen'],
	'Healing Nova':['Healing Rite'],
	'Healing Tempo':['Healing Booster'],
	'Improved Spirit':['Extra Spirit'],
	'Indomitable':['Reactive Barrier'],
	'Infuser':['Spirit Lifesteal'],
	'Juggernaut':['Enduring Speed'],
	'Kinetic Dash':['Extra Stamina'],
	'Leech':['Bullet Lifesteal','Spirit Lifesteal'],
	'Lifestrike':['Melee Lifesteal'],
	'Lightning Scroll':['Mystic Slow'],
	'Mercurial Magnum':['Quicksilver Reload'],
	'Opening Rounds':['High-Velocity Rounds'],
	'Point Blank':['Close Quarters'],
	'Radiant Regeneration':['Mystic Regeneration'],
	'Rapid Recharge':['Extra Charge'],
	'Reactive Barrier':['Grit'],
	'Rescue Beam':['Healing Rite'],
	'Sharpshooter':['Long Range','High-Velocity Rounds'],
	'Spellbreaker':['Debuff Reducer'],
	'Spirit Rend':['Spirit Shredder Bullets'],
	'Spirit Shielding':['Grit'],
	'Spirit Snatch':['Spirit Strike'],
	'Spiritual Overflow':['Spirit Lifesteal'],
	'Stamina Mastery':['Extra Stamina'],
	'Superior Cooldown':['Compress Cooldown'],
	'Superior Duration':['Duration Extender'],
	'Surge of Power':['Extra Spirit'],
	'Swift Striker':['Rapid Rounds'],
	'Tankbuster':['Mystic Burst'],
	'Timeless Emblem':['Transcendent Cooldown'],
	'Titanic Magazine':['Extended Magazine'],
	'Transcendent Cooldown':['Superior Cooldown'],
	'Trophy Collector':['Sprint Boots'],
	'Unstoppable':['Debuff Reducer'],
	'Vampiric Burst':['Bullet Lifesteal'],
	'Veil Walker':['Sprint Boots'],
	'Vortex Web':['Slowing Hex'],
	'Weapon Shielding':['Grit'],
	'Weighted Shots':['Slowing Bullets']
};
function ParseQuickbuySoulsCost(costText){
	if(!costText)return 0;
	let digits=costText.toString().match(/\d+/g);
	if(!digits||digits.length===0)return 0;
	let soulsCost=parseInt(digits.join(''),10);
	return isFinite(soulsCost)?soulsCost:0;
}

function NormalizeQuickbuyItemName(itemNameText){
	if(!itemNameText)return '';
	return itemNameText.toString().replace(/\s+/g,' ').replace(/^\s+|\s+$/g,'');
}

function CanonicalizeQuickbuyItemName(itemNameText){
	let normalizedItemName=NormalizeQuickbuyItemName(itemNameText)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g,' ')
		.replace(/\s+/g,' ')
		.replace(/^\s+|\s+$/g,'');

	if(QUICKBUY_ITEM_NAME_ALIASES[normalizedItemName])return QUICKBUY_ITEM_NAME_ALIASES[normalizedItemName];
	return normalizedItemName;
}

function InitializeQuickbuyRecipeComponents(){
	for(let upgradeName in QUICKBUY_RAW_RECIPE_COMPONENTS){
		if(!QUICKBUY_RAW_RECIPE_COMPONENTS.hasOwnProperty(upgradeName))continue;
		let canonicalUpgradeName=CanonicalizeQuickbuyItemName(upgradeName);
		QUICKBUY_RECIPE_COMPONENTS[canonicalUpgradeName]=[];
		for(let componentIndex=0;componentIndex<QUICKBUY_RAW_RECIPE_COMPONENTS[upgradeName].length;componentIndex++){
			QUICKBUY_RECIPE_COMPONENTS[canonicalUpgradeName].push(CanonicalizeQuickbuyItemName(QUICKBUY_RAW_RECIPE_COMPONENTS[upgradeName][componentIndex]));
		}
	}
}

function GetQuickbuySellQueueSoulsCredit(quickbuySellQueueEntries){
	let totalSellSoulsCredit=0;
	for(let sellIndex=0;sellIndex<quickbuySellQueueEntries.length;sellIndex++)totalSellSoulsCredit+=quickbuySellQueueEntries[sellIndex].sellSoulsCredit;
	return totalSellSoulsCredit;
}

function BuildQuickbuyQueueCostProgress(quickbuyQueueEntries,currentSoulsAmount,quickbuySellQueueEntries){
	let adjustedQuickbuyTotalSoulsCost=0;
	let runningQuickbuySoulsCost=0;
	let componentPurchasePoolByName={};
	let availableSoulsAmount=currentSoulsAmount+GetQuickbuySellQueueSoulsCredit(quickbuySellQueueEntries);
	let queueIndex=0,componentIndex=0;

	for(queueIndex=0;queueIndex<quickbuyQueueEntries.length;queueIndex++){
		let quickbuyQueueEntry=quickbuyQueueEntries[queueIndex];
		quickbuyQueueEntry.effectiveSoulsCost=quickbuyQueueEntry.baseSoulsCost;
		if(!quickbuyQueueEntry.itemKey)continue;
		if(!componentPurchasePoolByName[quickbuyQueueEntry.itemKey])componentPurchasePoolByName[quickbuyQueueEntry.itemKey]=[];
		componentPurchasePoolByName[quickbuyQueueEntry.itemKey].push({
			queueIndex:queueIndex,
			baseSoulsCost:quickbuyQueueEntry.baseSoulsCost,
			isConsumedByLaterUpgrade:false
		});
	}

	for(queueIndex=0;queueIndex<quickbuyQueueEntries.length;queueIndex++){
		let queuedUpgradeName=quickbuyQueueEntries[queueIndex].itemKey;
		let requiredComponentNames=QUICKBUY_RECIPE_COMPONENTS[queuedUpgradeName];
		if(!requiredComponentNames)continue;

		for(componentIndex=0;componentIndex<requiredComponentNames.length;componentIndex++){
			let requiredComponentName=requiredComponentNames[componentIndex];
			let purchasedComponentPool=componentPurchasePoolByName[requiredComponentName];
			if(!purchasedComponentPool)continue;

			for(let purchasedComponentIndex=0;purchasedComponentIndex<purchasedComponentPool.length;purchasedComponentIndex++){
				let purchasedComponent=purchasedComponentPool[purchasedComponentIndex];
				if(purchasedComponent.isConsumedByLaterUpgrade)continue;
				if(purchasedComponent.queueIndex>=queueIndex)continue;

				quickbuyQueueEntries[queueIndex].effectiveSoulsCost-=purchasedComponent.baseSoulsCost;
				purchasedComponent.isConsumedByLaterUpgrade=true;
				break;
			}
		}
	}

	for(queueIndex=0;queueIndex<quickbuyQueueEntries.length;queueIndex++){
		let queueEntry=quickbuyQueueEntries[queueIndex];
		if(queueEntry.effectiveSoulsCost<0)queueEntry.effectiveSoulsCost=0;
		runningQuickbuySoulsCost+=queueEntry.effectiveSoulsCost;
		queueEntry.cumulativeSoulsCost=runningQuickbuySoulsCost;
		queueEntry.remainingSoulsCost=runningQuickbuySoulsCost-availableSoulsAmount;
		if(queueEntry.remainingSoulsCost<0)queueEntry.remainingSoulsCost=0;
	}

	adjustedQuickbuyTotalSoulsCost=runningQuickbuySoulsCost-GetQuickbuySellQueueSoulsCredit(quickbuySellQueueEntries);
	return adjustedQuickbuyTotalSoulsCost<0?0:adjustedQuickbuyTotalSoulsCost;
}


    const POLL_SECONDS = 0.5;
    const CHAT_COOLDOWN_MS = 1000;
    const CHAT_RETRY_DELAYS = [0, 0.008, 0.012, 0.016, 0.032];
    const QUICKBUY_RECIPE_COMPONENTS = {};
    const ICON_CLASSES = ['hasAbility', 'isWeapon', 'isArmor', 'isTech', 'isTier0', 'isTier5',
        'HideModTierLabel', 'isEnhanced', 'hasUpgradeLevel', 'isCorrupted', 'isActiveItem',
        'Locked', 'unowned', 'owned', 'newSlotUnlocked', 'IsNewItem'];
    const TIER_CLASSES = ['ModTierLevel1', 'ModTierLevel2', 'ModTierLevel3', 'ModTierLevel4', 'ModTierLevel5'];
    const DRAG_CLASSES = ['DraggingOutside', 'IsBeingDragged', 'IsDragSource', 'IsDragTarget', 'Dragging'];
    const records = new Map();
    const bindings = new WeakMap();
    let lookups = new WeakMap();
    const tasks = new Map();
    let context = null, host = null, root = null, running = true, frame = 0, generation = 0;
    let pollHandle = null, eventHandle = null, lastShopOpen = false, lastChatSubmitMs = 0, notifyEnabled = false;

    function isAlive(panel) {
        try { return !!panel && typeof panel.IsValid === 'function' && panel.IsValid(); } catch (_) { return false; }
    }

    function belongsTo(panel, owner) {
        for (let depth = 0; depth < 64 && isAlive(panel); depth++) {
            if (panel === owner) return true;
            try { panel = panel.GetParent(); } catch (_) { return false; }
        }
        return false;
    }

    function child(panel, id) {
        try { const found = isAlive(panel) && panel.FindChild(id); return isAlive(found) ? found : null; }
        catch (_) { return null; }
    }

    function childClass(panel, name) {
        if (!isAlive(panel)) return null;
        for (let i = 0; i < panel.GetChildCount(); i++) {
            const candidate = panel.GetChild(i);
            if (isAlive(candidate) && candidate.BHasClass(name)) return candidate;
        }
        return null;
    }

    function nativeHost(owner) {
        const hud = owner?.id === 'Hud' ? owner : child(owner, 'Hud');
        const core = childClass(hud || owner, 'HudCore');
        const parent = child(child(core, 'StatsAndModsContainer'), 'LowerLeft');
        return { parent, panel: child(parent, 'CitadelHudQuickbuy') || child(hud, 'CitadelHudQuickbuy') || child(owner, 'CitadelHudQuickbuy') };
    }

    function preferred(owner, id) {
        // These paths are from hud.xml, hud_quickbuy.xml and hud_quickbuy_entry.xml.
        if (id === 'CitadelHudQuickbuy') return nativeHost(owner).panel;
        if (id === 'QuickbuyQueue' || id === 'QuickbuySellQueue') return child(childClass(owner, 'QuickbuyQueueOuter'), id);
        if (/^QuickbuyUpcomingPreview[2-5]$/.test(id)) return child(child(owner, 'QuickbuyUpcomingPreviewContainer'), id);
        if (/^QuickbuyPreview[2-5]Entry$/.test(id)) return child(childClass(owner, 'QuickbuyUpcomingMini'), id);
        if (/^QuickbuyUpcomingPreview[2-5]SoulsNeededLabel$/.test(id)) return child(childClass(owner, 'QuickbuyUpcomingPreviewSoulsNeeded'), id);
        if (id === 'NotifyButton' || id === 'ReorderButton') return child(child(owner, 'ControlIcons'), id);
        const content = child(owner, 'ItemContentPanel');
        if (id === 'ModIcon') return child(content, id);
        const namePanel = childClass(content, 'NamePanel');
        if (id === 'ModName') return child(namePanel, id);
        if (id === 'ModCost' || id === 'QueueRemainingSoulsLabel') return child(childClass(namePanel, 'CostPanel'), id);
        if (id === 'QueueRemainingSoulsDivider') return childClass(childClass(namePanel, 'CostPanel'), id);
        return null;
    }

    // The companion context does not include QOL services. Each lookup keeps
    // its own root/parent generation, direct-child checks and bounded misses.
    function resolve(owner, id, force = false) {
        if (!isAlive(owner)) return null;
        let ownerLookups = lookups.get(owner);
        if (!ownerLookups) { ownerLookups = new Map(); lookups.set(owner, ownerLookups); }
        let state = ownerLookups.get(id);
        if (!state) {
            state = { root: owner, parent: null, panel: null, next: 0 };
            ownerLookups.set(id, state);
        }
        const direct = preferred(owner, id) || child(owner, id);
        if (direct) { state.panel = direct; state.parent = owner; state.next = Date.now() + 5000; return direct; }
        if (!force && state.panel && belongsTo(state.parent, owner)) {
            const current = child(state.parent, id);
            if (current && Date.now() < state.next) { state.panel = current; return current; }
        }
        if (!force && !state.panel && Date.now() < state.next) return null;
        try { state.panel = owner.FindChildTraverse(id); } catch (_) { state.panel = null; }
        if (!isAlive(state.panel)) state.panel = null;
        state.parent = state.panel ? state.panel.GetParent() : null;
        state.next = Date.now() + (state.panel ? 5000 : 1000);
        return state.panel;
    }

    function ancestors(panel) {
        const result = [];
        for (let depth = 0; depth < 64 && isAlive(panel); depth++) {
            result.push(panel);
            try { panel = panel.GetParent(); } catch (_) { break; }
        }
        return result;
    }

    function readModel() {
        const chain = ancestors(context);
        const active = name => chain.some(panel => panel.BHasClass(name));
        let count = 3;
        for (const panel of chain.slice(0, 6)) {
            const value = panel.GetAttributeInt('qol_enhanced_quickbuy_count', -1);
            if (value >= 1) { count = value; break; }
        }
        return { enhanced: active('enhanced_quickbuy_active'), notify: active('shop_click_to_notify_active'),
            count: Math.max(1, Math.min(quickbuyUpcomingPreviewSlots.length + 1, Math.round(Number(count)) || 3)),
            shopOpen: !!host?.BHasClass('gShopOpen') };
    }

    function record(panel) {
        if (!records.has(panel)) records.set(panel, { styles: new Map(), classes: new Map(), text: 0, image: 0, events: new Map() });
        return records.get(panel);
    }

    function style(panel, property, value) {
        if (!isAlive(panel)) return;
        const owned = record(panel).styles;
        let entry = owned.get(property);
        if (!entry) { entry = { value: null, seen: frame }; owned.set(property, entry); }
        entry.seen = frame;
        if (entry.value !== value || panel.style[property] !== value) {
            panel.style[property] = value;
            entry.value = value;
        }
    }

    function cls(panel, name, active) {
        if (!isAlive(panel)) return;
        record(panel).classes.set(name, frame);
        if (panel.BHasClass(name) !== !!active) panel.SetHasClass(name, !!active);
    }

    function text(panel, value) {
        if (!isAlive(panel)) return;
        record(panel).text = frame;
        const desired = String(value);
        if (panel.text !== desired) panel.text = desired;
    }

    function image(panel, path) {
        if (!isAlive(panel)) return;
        record(panel).image = frame;
        // Native CitadelModIcon may rewrite this same Image instance.
        panel.SetImage(path || '');
    }

    function panelEvent(panel, name, callback, key, guard = () => true) {
        if (!isAlive(panel)) return;
        const events = record(panel).events;
        let entry = events.get(name);
        if (!entry) { entry = { active: true, seen: frame, callback: null, key: null }; events.set(name, entry); }
        entry.active = true; entry.seen = frame; entry.callback = callback; entry.guard = guard;
        if (entry.key === key) return;
        // Publish the key after the native write succeeds. A failed binding must retry.
        panel.SetPanelEvent(name, () => { if (running && entry.active && isAlive(panel) && entry.guard()) entry.callback(); });
        entry.key = key;
    }

    function releaseProperty(panel, property) {
        try { return panel.ClearPropertyFromCode(property.replace(/[A-Z]/g, c => '-' + c.toLowerCase())) !== false; }
        catch (_) { return false; }
    }

    function releaseRecord(panel, all = false) {
        const owned = records.get(panel);
        if (!owned) return;
        const binding = bindings.get(panel);
        if (!isAlive(panel)) {
            if (binding) binding.active = false;
            for (const event of owned.events.values()) event.active = false;
            records.delete(panel); return;
        }
        if (binding && (all || binding.seen !== frame)) binding.active = false;
        for (const [property, entry] of owned.styles) {
            if ((all || entry.seen !== frame) && releaseProperty(panel, property)) owned.styles.delete(property);
        }
        for (const [name, seen] of owned.classes) {
            if (all || seen !== frame) {
                try {
                    if (panel.BHasClass(name)) panel.SetHasClass(name, false);
                    owned.classes.delete(name);
                } catch (e) { $.Msg('[QOLLock][QuickBuy] release class: ' + String(e)); }
            }
        }
        if (owned.text && (all || owned.text !== frame)) {
            try { if (panel.text !== '0') panel.text = '0'; owned.text = 0; }
            catch (e) { $.Msg('[QOLLock][QuickBuy] release text: ' + String(e)); }
        }
        if (owned.image && (all || owned.image !== frame)) {
            try { panel.SetImage(''); owned.image = 0; }
            catch (e) { $.Msg('[QOLLock][QuickBuy] release image: ' + String(e)); }
        }
        for (const [name, event] of owned.events) {
            if (all || event.seen !== frame) {
                event.active = false;
                try {
                    if (typeof panel.ClearPanelEvent === 'function') panel.ClearPanelEvent(name);
                    else panel.SetPanelEvent(name, () => {});
                    owned.events.delete(name);
                } catch (e) { $.Msg('[QOLLock][QuickBuy] release event: ' + String(e)); }
            }
        }
        if (!owned.styles.size && !owned.classes.size && !owned.text && !owned.image && !owned.events.size && !binding?.active) records.delete(panel);
    }

    function sweep(all = false) {
        for (const panel of records.keys()) releaseRecord(panel, all);
    }

    function cancelTasks(group = null) {
        for (const [handle, task] of tasks) if (group === null || task.group === group) {
            $.CancelScheduled(handle); tasks.delete(handle);
        }
    }

    function schedule(callback, delay, group, guard = () => true) {
        const token = generation;
        const handle = $.Schedule(delay, () => {
            tasks.delete(handle);
            if (!running || token !== generation || !liveGeneration() || !guard()) return;
            try { callback(); } catch (e) { $.Msg('[QOLLock][QuickBuy] ' + group + ': ' + String(e)); }
        });
        tasks.set(handle, { group });
    }

    function cancelPoll() {
        if (pollHandle !== null) { $.CancelScheduled(pollHandle); pollHandle = null; }
    }

    function shutdown() {
        running = false; generation++;
        cancelPoll(); cancelTasks();
        try { sweep(true); } catch (e) { $.Msg('[QOLLock][QuickBuy] release: ' + String(e)); }
        if (eventHandle !== null && typeof $.UnregisterForUnhandledEvent === 'function') {
            $.UnregisterForUnhandledEvent('CitadelQuickbuyItemsChanged', eventHandle);
            eventHandle = null;
        }
        records.clear(); lookups = new WeakMap(); context = host = root = null;
    }

    function liveGeneration() {
        try {
            const current = nativeHost(root);
            return isAlive(context) && $.GetContextPanel() === context &&
                (!host || (belongsTo(context, host) && (!current.parent || current.panel === host) && (!current.panel || current.panel === host)));
        } catch (_) { return false; }
    }

    function discover() {
        let current;
        try { current = $.GetContextPanel(); } catch (_) { shutdown(); return false; }
        if (!isAlive(current)) { shutdown(); return false; }
        const chain = ancestors(current), currentRoot = chain[chain.length - 1];
        const currentHost = chain.find(panel => panel.id === 'CitadelHudQuickbuy') || resolve(currentRoot, 'CitadelHudQuickbuy');
        // Prefer the current direct host; old living contexts must not keep
        // mutating an orphan when the native owner has moved to another host.
        const native = nativeHost(currentRoot);
        if (currentHost && ((native.parent && native.panel !== currentHost) || (native.panel && native.panel !== currentHost))) { shutdown(); return false; }
        if (context !== current || host !== currentHost || root !== currentRoot) {
            generation++; cancelTasks(); sweep(true); lookups = new WeakMap();
            context = current; host = currentHost; root = currentRoot;
            lastShopOpen = false; notifyEnabled = false;
        }
        return true;
    }

    function collect(owner) {
        const items = [];
        function visit(panel, depth) {
            if (!isAlive(panel) || depth > 64) return;
            if (panel.BHasClass('QuickbuyItem')) items.push(panel);
            for (let i = 0; i < panel.GetChildCount(); i++) visit(panel.GetChild(i), depth + 1);
        }
        visit(owner, 0);
        return items;
    }

    function readEntries(queue) {
        return collect(queue).map(itemPanel => {
            const cost = resolve(itemPanel, 'ModCost'), name = resolve(itemPanel, 'ModName');
            const itemName = NormalizeQuickbuyItemName(name?.text || '');
            return { itemPanel, itemName, itemKey: CanonicalizeQuickbuyItemName(itemName),
                baseSoulsCost: ParseQuickbuySoulsCost(cost?.text || ''), effectiveSoulsCost: 0, cumulativeSoulsCost: 0, remainingSoulsCost: 0 };
        });
    }

    function readSouls() {
        for (const panel of ancestors(context)) {
            const amount = resolve(panel, 'CurrentGoldAmount');
            if (amount) return ParseQuickbuySoulsCost(resolve(amount, 'hudCurGoldLabel')?.text || '');
        }
        return 0;
    }

    function money(panel, color) {
        for (const [property, value] of Object.entries({ color, washColor: color, fontSize: '16px', fontWeight: 'bold', verticalAlign: 'center' })) style(panel, property, value);
    }

    function clearDragState(sourceHost) {
        if (!isAlive(sourceHost)) return;
        const visit = (panel, depth) => {
            if (!isAlive(panel) || depth > 64) return;
            for (const name of DRAG_CLASSES) if (panel.BHasClass(name)) panel.SetHasClass(name, false);
            for (let i = 0; i < panel.GetChildCount(); i++) visit(panel.GetChild(i), depth + 1);
        };
        visit(sourceHost, 0);
        $.DispatchEvent('DropInputFocus', sourceHost);
        $.DispatchEvent('CitadelUIHideTextTooltip');
    }

    function bindDrag(panel, queue, reorder = false) {
        if (!isAlive(panel)) return;
        let binding = bindings.get(panel);
        if (!binding) {
            binding = { active: false, seen: 0, queue: null, registered: new Set() };
            bindings.set(panel, binding);
            const cleanup = () => {
                if (!running || !binding.active || !isAlive(panel) || !isAlive(binding.queue) ||
                    resolve(context, binding.queue.id, true) !== binding.queue || !belongsTo(panel, binding.queue)) return false;
                cancelTasks('drag');
                const ownerHost = host;
                const guard = () => binding.active && isAlive(ownerHost) && host === ownerHost && belongsTo(panel, binding.queue);
                schedule(() => clearDragState(ownerHost), 0, 'drag', guard);
                schedule(() => clearDragState(ownerHost), 0.03, 'drag', guard);
                return false;
            };
            binding.cleanup = cleanup;
        }
        if (!binding.registered.has('DragEnd')) {
            $.RegisterEventHandler('DragEnd', panel, binding.cleanup);
            binding.registered.add('DragEnd');
        }
        if (!reorder && !binding.registered.has('DragDrop')) {
            $.RegisterEventHandler('DragDrop', panel, binding.cleanup);
            binding.registered.add('DragDrop');
        }
        binding.active = true; binding.seen = frame; binding.queue = queue;
        record(panel);
        if (reorder) panelEvent(panel, 'onmouseup', binding.cleanup, 'drag-cleanup', () => binding.active && belongsTo(panel, binding.queue));
    }

    function chatSources() {
        const chat = resolve(root, 'Chat');
        const controls = child(chat, 'ChatControls') || chat;
        const input = resolve(controls, 'ChatInput') || resolve(root, 'ChatInput');
        const target = resolve(controls, 'ChatTargetLabel');
        return { chat, input, target };
    }

    function closeChat(input, chat) {
        if (isAlive(input)) { $.DispatchEvent('CitadelChatInputBlur', input); $.DispatchEvent('DropInputFocus', input); }
        if (isAlive(chat)) { $.DispatchEvent('CitadelChatInputBlur', chat); $.DispatchEvent('DropInputFocus', chat); }
        schedule(() => $.DispatchEvent('CitadelChatInputBlur', input), 0, 'focus', () => readModel().notify && chatSources().input === input);
    }

    function sendChat(message, source, queue) {
        const now = Date.now();
        if (now - lastChatSubmitMs < CHAT_COOLDOWN_MS) return;
        const allowed = () => running && isAlive(context) && readModel().notify && belongsTo(source, queue) && resolve(context, 'QuickbuyQueue', true) === queue;
        if (!allowed()) return;
        const clean = String(message || '').replace(/["\r\n;]/g, ' ').trim();
        if (!clean) return;
        lastChatSubmitMs = now;
        cancelTasks('chat'); cancelTasks('focus');
        $.DispatchEvent('CitadelConCommand', 'say_chat_team');
        function attempt(index, readyCount) {
            const { chat, input, target } = chatSources();
            const targetText = String(target?.text || '').trim();
            const ready = isAlive(input) && isAlive(target) && targetText && targetText !== '#citadel_chat_placeholder' && !targetText.includes('(ALL)');
            if (ready) {
                if (readyCount < 1 && index < CHAT_RETRY_DELAYS.length - 1) {
                    schedule(() => attempt(index + 1, readyCount + 1), CHAT_RETRY_DELAYS[index + 1], 'chat', allowed); return;
                }
                const submit = () => { input.text = clean; $.DispatchEvent('CitadelChatInputSubmitted', input); input.text = ''; };
                try { submit(); } catch (_) { $.DispatchEvent('SetInputFocus', input); submit(); }
                closeChat(input, chat); return;
            }
            if (index < CHAT_RETRY_DELAYS.length - 1) schedule(() => attempt(index + 1, 0), CHAT_RETRY_DELAYS[index + 1], 'chat', allowed);
        }
        schedule(() => attempt(0, 0), CHAT_RETRY_DELAYS[0], 'chat', allowed);
    }

    function renderEntries(entries, queue, model) {
        for (const entry of entries) {
            const panel = entry.itemPanel, needed = entry.remainingSoulsCost;
            cls(panel, 'HasRemainingSoulsNeeded', needed > 0);
            bindDrag(panel, queue);
            bindDrag(resolve(panel, 'ReorderButton'), queue, true);
            const label = resolve(panel, 'QueueRemainingSoulsLabel');
            text(label, needed);
            const canNotify = model.notify && needed > 0;
            cls(label, 'CanClickToNotify', canNotify);
            const notify = resolve(panel, 'NotifyButton');
            cls(notify, 'CanClickToNotify', canNotify);
            if (model.notify) {
                const color = canNotify ? '#d64259' : '#66ffd9';
                money(label, color); money(resolve(panel, 'ModCost'), color);
                money(resolve(panel, 'QueueRemainingSoulsDivider'), '#d8d0c088');
                style(resolve(panel, 'goldIcon') || resolve(panel, 'ModCostIcon'), 'washColor', color);
            }
            if (canNotify) {
                const message = 'Need ' + String(Math.max(0, Math.floor(needed))).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' more for ' + (entry.itemName || 'item');
                panelEvent(notify, 'onactivate', () => sendChat(message, panel, queue), message,
                    () => belongsTo(notify, panel) && resolve(panel, 'NotifyButton', true) === notify);
            }
        }
    }

    function renderIcon(icon, source, itemName) {
        if (!isAlive(icon)) return;
        for (const name of ICON_CLASSES) cls(icon, name, !!source?.BHasClass(name));
        const sourceImage = resolve(source, 'ModIconImage');
        let path = sourceImage?.GetAttributeString('src', '') || '';
        if (!path && itemName) {
            const name = CanonicalizeQuickbuyItemName(itemName);
            const folder = source?.BHasClass('isArmor') ? 'vitality' : source?.BHasClass('isTech') ? 'spirit' : 'weapon';
            path = QUICKBUY_ICON_OVERRIDES[name] || (name ? 's2r://panorama/images/items/' + folder + '/' + name.replace(/\s+/g, '_') + '_psd.vtex' : '');
        }
        image(resolve(icon, 'ModIconImage'), path);
        const sourceTier = resolve(source, 'mod_tier_label'), tier = resolve(icon, 'mod_tier_label');
        for (const name of TIER_CLASSES) cls(tier, name, !!sourceTier?.BHasClass(name));
    }

    function renderPreviews(entries, count) {
        for (const slot of quickbuyUpcomingPreviewSlots) {
            const panel = resolve(context, slot.rootId), entry = slot.queueIndex < count ? entries[slot.queueIndex] : null;
            const target = resolve(panel, slot.entryPanelId) || resolve(context, slot.entryPanelId);
            cls(panel, 'HasPreviewItem', !!entry); cls(panel, 'CanAffordUpcoming', !!entry && entry.remainingSoulsCost <= 0);
            text(resolve(panel, slot.soulsLabelId) || resolve(context, slot.soulsLabelId), entry?.remainingSoulsCost || 0);
            renderIcon(resolve(target, 'ModIcon'), entry ? resolve(entry.itemPanel, 'ModIcon') : null, entry?.itemName || '');
        }
    }

    function update() {
        if (!running) return;
        cancelPoll();
        try {
            if (!discover()) return;
            frame++;
            const model = readModel();
            const active = model.enhanced || model.notify;
            if (notifyEnabled && !model.notify) { cancelTasks('chat'); cancelTasks('focus'); }
            notifyEnabled = model.notify;
            if (lastShopOpen && (!model.shopOpen || !active)) { cancelTasks('drag'); clearDragState(host); }
            lastShopOpen = active && model.shopOpen;
            const queue = resolve(context, 'QuickbuyQueue'), sellQueue = resolve(context, 'QuickbuySellQueue');
            const entries = active ? readEntries(queue) : [];
            const sales = active ? collect(sellQueue).map(panel => ({ itemPanel: panel, sellSoulsCredit: Math.floor(ParseQuickbuySoulsCost(resolve(panel, 'ModCost')?.text || '') / 2) })) : [];
            const total = BuildQuickbuyQueueCostProgress(entries, readSouls(), sales);
            text(resolve(context, 'QuickbuyShopTotalCostLabel'), total);
            text(resolve(context, 'QuickbuyNextSoulsNeededLabel'), entries[0]?.remainingSoulsCost || 0);
            if (active) {
                renderEntries(entries, queue, model);
                for (const sale of sales) { bindDrag(sale.itemPanel, sellQueue); bindDrag(resolve(sale.itemPanel, 'ReorderButton'), sellQueue, true); }
            }
            renderPreviews(entries, model.count);
            sweep();
        } catch (e) { $.Msg('[QOLLock][QuickBuy] update: ' + String(e)); }
        finally {
            if (running) pollHandle = $.Schedule(POLL_SECONDS, () => { pollHandle = null; update(); });
        }
    }

    InitializeQuickbuyRecipeComponents();
    if (typeof $.RegisterForUnhandledEvent === 'function') {
        eventHandle = $.RegisterForUnhandledEvent('CitadelQuickbuyItemsChanged', update);
    }
    pollHandle = $.Schedule(0, () => { pollHandle = null; update(); });

})();
