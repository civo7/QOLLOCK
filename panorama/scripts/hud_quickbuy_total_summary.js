(function(){'use strict';
var QUICKBUY_TOTAL_UPDATE_INTERVAL_SECONDS=0.05;
var quickbuyUpcomingPreviewSlots=[
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
	}
];
var QUICKBUY_ITEM_NAME_ALIASES={
	'basic magazine':'extended magazine',
	'dispel magic':'debuff remover',
	'mystic reach':'mystic expansion',
	'mystic regen':'mystic regeneration',
	'improved cooldown':'compress cooldown',
	'sharp shooter':'sharpshooter',
	'spellslinger headshots':'spirit rend'
};
var QUICKBUY_ICON_OVERRIDES={
	'compress cooldown':'s2r://panorama/images/items/spirit/improved_cooldown_psd.vtex',
	'mystic expansion':'s2r://panorama/images/items/spirit/mystic_reach_psd.vtex',
	'mystic regeneration':'s2r://panorama/images/items/spirit/mystic_regen_psd.vtex',
	'debuff reducer':'s2r://panorama/images/items/vitality/debuff_reducer_psd.vtex',
	'dispel magic':'s2r://panorama/images/items/vitality/debuff_remover_psd.vtex'
};
var QUICKBUY_RAW_RECIPE_COMPONENTS={
	'Arcane Surge':['Extra Stamina'],
	'Arctic Blast':['Cold Front'],
	'Armor Piercing Rounds':['High Velocity Rounds'],
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
	'Express Shot':['High Velocity Rounds'],
	'Focus Lens':['Spirit Sap'],
	'Fortitude':['Extra Health'],
	'Fury Trance':['Bullet Lifesteal'],
	'Greater Expansion':['Mystic Expansion'],
	'Headhunter':['Headshot Booster'],
	'Healing Booster':['Extra Regen'],
	'Healing Nova':['Healing Rite'],
	'Healing Tempo':['Healing Booster'],
	'Improved Spirit':['Extra Spirit'],
	'Infuser':['Spirit Lifesteal'],
	'Juggernaut':['Enduring Speed'],
	'Kinetic Dash':['Extra Stamina'],
	'Leech':['Bullet Lifesteal','Spirit Lifesteal'],
	'Lifestrike':['Melee Lifesteal'],
	'Lightning Scroll':['Mystic Slow'],
	'Mercurial Magnum':['Quicksilver Reload'],
	'Point Blank':['Close Quarters'],
	'Radiant Regeneration':['Mystic Regeneration'],
	'Rapid Recharge':['Extra Charge'],
	'Rescue Beam':['Healing Rite'],
	'Sharpshooter':['Long Range'],
	'Spellbreaker':['Debuff Reducer'],
	'Spirit Rend':['Spirit Shredder Bullets'],
	'Spirit Snatch':['Spirit Strike'],
	'Stamina Mastery':['Extra Stamina'],
	'Superior Cooldown':['Compress Cooldown'],
	'Superior Duration':['Duration Extender'],
	'Surge of Power':['Extra Spirit'],
	'Swift Striker':['Rapid Rounds'],
	'Tankbuster':['Mystic Burst'],
	'Titanic Magazine':['Extended Magazine'],
	'Transcendent Cooldown':['Superior Cooldown'],
	'Trophy Collector':['Sprint Boots'],
	'Unstoppable':['Debuff Reducer'],
	'Vampiric Burst':['Bullet Lifesteal'],
	'Vortex Web':['Slowing Hex'],
	'Weighted Shots':['Slowing Bullets']
};
var QUICKBUY_RECIPE_COMPONENTS={};
var QUICKBUY_CHAT_SUBMIT_COOLDOWN_MS=1000;
var QUICKBUY_CHAT_RETRY_DELAYS=[0,0.008,0.012,0.016,0.032];
var quickbuyLastChatSubmitMs=0;
var quickbuyChatCache={
	panel:null,
	input:null,
	targetLabel:null
};

function ParseQuickbuySoulsCost(costText){
	if(!costText)return 0;
	var digits=costText.toString().match(/\d+/g);
	if(!digits||digits.length===0)return 0;
	var soulsCost=parseInt(digits.join(''),10);
	return isFinite(soulsCost)?soulsCost:0;
}

function NormalizeQuickbuyItemName(itemNameText){
	if(!itemNameText)return '';
	return itemNameText.toString().replace(/\s+/g,' ').replace(/^\s+|\s+$/g,'');
}

function CanonicalizeQuickbuyItemName(itemNameText){
	var normalizedItemName=NormalizeQuickbuyItemName(itemNameText)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g,' ')
		.replace(/\s+/g,' ')
		.replace(/^\s+|\s+$/g,'');

	if(QUICKBUY_ITEM_NAME_ALIASES[normalizedItemName])return QUICKBUY_ITEM_NAME_ALIASES[normalizedItemName];
	return normalizedItemName;
}

function InitializeQuickbuyRecipeComponents(){
	for(var upgradeName in QUICKBUY_RAW_RECIPE_COMPONENTS){
		if(!QUICKBUY_RAW_RECIPE_COMPONENTS.hasOwnProperty(upgradeName))continue;
		var canonicalUpgradeName=CanonicalizeQuickbuyItemName(upgradeName);
		QUICKBUY_RECIPE_COMPONENTS[canonicalUpgradeName]=[];
		for(var componentIndex=0;componentIndex<QUICKBUY_RAW_RECIPE_COMPONENTS[upgradeName].length;componentIndex++){
			QUICKBUY_RECIPE_COMPONENTS[canonicalUpgradeName].push(CanonicalizeQuickbuyItemName(QUICKBUY_RAW_RECIPE_COMPONENTS[upgradeName][componentIndex]));
		}
	}
}

function FindChildTraverseInAncestors(startPanel,targetChildId){
	var searchPanel=startPanel;
	while(searchPanel){
		var foundPanel=searchPanel.FindChildTraverse(targetChildId);
		if(foundPanel)return foundPanel;
		if(!searchPanel.GetParent)break;
		searchPanel=searchPanel.GetParent();
	}
	return null;
}

function FindQuickbuyHostPanel(startPanel){
	var panel=startPanel;
	while(panel){
		if(panel.id==='CitadelHudQuickbuy')return panel;
		if(!panel.GetParent)break;
		panel=panel.GetParent();
	}
	return FindChildTraverseInAncestors(startPanel,'CitadelHudQuickbuy');
}

function IsEnhancedQuickbuyActive(contextPanel){
	var quickbuyHostPanel=FindQuickbuyHostPanel(contextPanel);
	if(quickbuyHostPanel&&quickbuyHostPanel.BHasClass&&quickbuyHostPanel.BHasClass('enhanced_quickbuy_active'))return true;

	var scanPanel=contextPanel;
	while(scanPanel){
		if(scanPanel.BHasClass&&scanPanel.BHasClass('enhanced_quickbuy_active'))return true;
		if(!scanPanel.GetParent)break;
		scanPanel=scanPanel.GetParent();
	}

	return false;
}

function IsClickToNotifyActive(contextPanel){
	var quickbuyHostPanel=FindQuickbuyHostPanel(contextPanel);
	if(quickbuyHostPanel&&quickbuyHostPanel.BHasClass&&quickbuyHostPanel.BHasClass('shop_click_to_notify_active'))return true;

	var scanPanel=contextPanel;
	while(scanPanel){
		if(scanPanel.BHasClass&&scanPanel.BHasClass('shop_click_to_notify_active'))return true;
		if(!scanPanel.GetParent)break;
		scanPanel=scanPanel.GetParent();
	}

	return false;
}

function IsQuickbuyCostFeatureActive(contextPanel){
	return IsEnhancedQuickbuyActive(contextPanel)||IsClickToNotifyActive(contextPanel);
}

function FormatQuickbuySoulsAmount(value){
	var n=Math.max(0,Math.floor(Number(value)||0));
	return String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',');
}

function FindQuickbuyRootPanel(startPanel){
	var panel=startPanel;
	while(panel&&panel.GetParent&&panel.GetParent())panel=panel.GetParent();
	return panel||startPanel||null;
}

function GetQuickbuyChatPanel(){
	if(quickbuyChatCache.panel&&quickbuyChatCache.panel.IsValid&&quickbuyChatCache.panel.IsValid())return quickbuyChatCache.panel;
	var root=FindQuickbuyRootPanel($.GetContextPanel());
	if(!root||!root.FindChildTraverse)return null;
	var chatPanel=root.FindChildTraverse('Chat');
	if(chatPanel&&chatPanel.IsValid&&chatPanel.IsValid()){
		quickbuyChatCache.panel=chatPanel;
		return chatPanel;
	}
	return null;
}

function GetQuickbuyChatInput(){
	if(quickbuyChatCache.input&&quickbuyChatCache.input.IsValid&&quickbuyChatCache.input.IsValid())return quickbuyChatCache.input;
	var chatPanel=GetQuickbuyChatPanel();
	var chatInput=null;
	if(chatPanel&&chatPanel.FindChildTraverse){
		var chatControls=chatPanel.FindChildTraverse('ChatControls');
		chatInput=(chatControls&&chatControls.FindChildTraverse)?chatControls.FindChildTraverse('ChatInput'):null;
		if(!chatInput)chatInput=chatPanel.FindChildTraverse('ChatInput');
	}
	if(!chatInput){
		var root=FindQuickbuyRootPanel($.GetContextPanel());
		if(root&&root.FindChildTraverse)chatInput=root.FindChildTraverse('ChatInput');
	}
	if(chatInput&&chatInput.IsValid&&chatInput.IsValid()){
		quickbuyChatCache.input=chatInput;
		return chatInput;
	}
	return null;
}

function GetQuickbuyChatTargetLabel(){
	if(quickbuyChatCache.targetLabel&&quickbuyChatCache.targetLabel.IsValid&&quickbuyChatCache.targetLabel.IsValid())return quickbuyChatCache.targetLabel;
	var chatPanel=GetQuickbuyChatPanel();
	if(!chatPanel||!chatPanel.FindChildTraverse)return null;
	var chatControls=chatPanel.FindChildTraverse('ChatControls');
	var targetLabel=(chatControls&&chatControls.FindChildTraverse)?chatControls.FindChildTraverse('ChatTargetLabel'):null;
	if(!targetLabel)targetLabel=chatPanel.FindChildTraverse('ChatTargetLabel');
	if(targetLabel&&targetLabel.IsValid&&targetLabel.IsValid()){
		quickbuyChatCache.targetLabel=targetLabel;
		return targetLabel;
	}
	return null;
}

function IsQuickbuyTeamChatReady(chatInput,targetLabel){
	if(!chatInput||!targetLabel)return false;
	if(chatInput.IsValid&&!chatInput.IsValid())return false;
	if(targetLabel.IsValid&&!targetLabel.IsValid())return false;
	var labelText=String(targetLabel.text||'').replace(/^\s+|\s+$/g,'');
	if(!labelText||labelText==='#citadel_chat_placeholder')return false;
	if(labelText==='To (ALL):'||labelText.indexOf('(ALL)')!==-1)return false;
	return true;
}

function CloseQuickbuyChatUi(chatInput){
	var chatPanel=GetQuickbuyChatPanel();
	try{$.DispatchEvent('CitadelChatInputBlur',chatInput);}catch(e0){}
	try{$.DispatchEvent('DropInputFocus',chatInput);}catch(e1){}
	if(chatPanel){
		try{$.DispatchEvent('CitadelChatInputBlur',chatPanel);}catch(e2){}
		try{$.DispatchEvent('DropInputFocus',chatPanel);}catch(e3){}
	}
	$.Schedule(0,function(){
		try{$.DispatchEvent('CitadelChatInputBlur',chatInput);}catch(e4){}
	});
}

function SubmitQuickbuyTeamChat(chatInput,message){
	try{
		chatInput.text=message;
		$.DispatchEvent('CitadelChatInputSubmitted',chatInput);
		chatInput.text='';
		return true;
	}catch(e0){
		return false;
	}
}

function TrySubmitQuickbuyTeamChat(message,delayIndex,targetRetryCount){
	var chatInput=GetQuickbuyChatInput();
	var targetLabel=GetQuickbuyChatTargetLabel();
	if(IsQuickbuyTeamChatReady(chatInput,targetLabel)){
		if(targetRetryCount<1&&delayIndex<QUICKBUY_CHAT_RETRY_DELAYS.length-1){
			$.Schedule(QUICKBUY_CHAT_RETRY_DELAYS[delayIndex+1],function(){TrySubmitQuickbuyTeamChat(message,delayIndex+1,targetRetryCount+1);});
			return;
		}
		if(!SubmitQuickbuyTeamChat(chatInput,message)){
			try{$.DispatchEvent('SetInputFocus',chatInput);}catch(e0){}
			SubmitQuickbuyTeamChat(chatInput,message);
		}
		CloseQuickbuyChatUi(chatInput);
		return;
	}
	if(delayIndex>=QUICKBUY_CHAT_RETRY_DELAYS.length-1)return;
	$.Schedule(QUICKBUY_CHAT_RETRY_DELAYS[delayIndex+1],function(){TrySubmitQuickbuyTeamChat(message,delayIndex+1,0);});
}

function SendQuickbuyNeededSoulsChatMessage(message){
	var now=Date.now?Date.now():(new Date()).getTime();
	if(now-quickbuyLastChatSubmitMs<QUICKBUY_CHAT_SUBMIT_COOLDOWN_MS)return;
	quickbuyLastChatSubmitMs=now;
	var cleanMessage=String(message||'').replace(/["\r\n;]/g,' ').replace(/^\s+|\s+$/g,'');
	if(!cleanMessage)return;
	try{$.DispatchEvent('CitadelConCommand','say_chat_team');}catch(e0){}
	$.Schedule(QUICKBUY_CHAT_RETRY_DELAYS[0],function(){TrySubmitQuickbuyTeamChat(cleanMessage,0,0);});
}

function SetQuickbuyPanelStyleIfChanged(panel,styleName,styleValue){
	if(!panel||!panel.style||!styleName)return;
	var cacheName='_qolQuickbuyStyle_' + styleName;
	if(panel[cacheName]===styleValue)return;
	panel.style[styleName]=styleValue;
	panel[cacheName]=styleValue;
}

function StyleQuickbuyMoneyLabel(panel,color){
	if(!panel)return;
	SetQuickbuyPanelStyleIfChanged(panel,'color',color);
	SetQuickbuyPanelStyleIfChanged(panel,'washColor',color);
	SetQuickbuyPanelStyleIfChanged(panel,'fontSize','16px');
	SetQuickbuyPanelStyleIfChanged(panel,'fontWeight','bold');
	SetQuickbuyPanelStyleIfChanged(panel,'verticalAlign','center');
}

function CollectQuickbuyItemPanels(panel,quickbuyItemPanels){
	if(!panel)return;
	if(panel.BHasClass&&panel.BHasClass('QuickbuyItem'))quickbuyItemPanels.push(panel);
	for(var childIndex=0;childIndex<panel.GetChildCount();childIndex++)CollectQuickbuyItemPanels(panel.GetChild(childIndex),quickbuyItemPanels);
}

function CollectQuickbuyQueueEntries(quickbuyQueuePanel){
	var quickbuyQueueEntries=[];
	if(quickbuyQueuePanel){
		var quickbuyItemPanels=[];
		CollectQuickbuyItemPanels(quickbuyQueuePanel,quickbuyItemPanels);
		for(var itemIndex=0;itemIndex<quickbuyItemPanels.length;itemIndex++){
			var quickbuyItemPanel=quickbuyItemPanels[itemIndex];
			var modCostLabel=quickbuyItemPanel.FindChildTraverse('ModCost');
			var modNameLabel=quickbuyItemPanel.FindChildTraverse('ModName');
			quickbuyQueueEntries.push({
				itemPanel:quickbuyItemPanel,
				itemName:NormalizeQuickbuyItemName(modNameLabel?modNameLabel.text:''),
				itemKey:CanonicalizeQuickbuyItemName(modNameLabel?modNameLabel.text:''),
				baseSoulsCost:ParseQuickbuySoulsCost(modCostLabel?modCostLabel.text:''),
				effectiveSoulsCost:0,
				cumulativeSoulsCost:0,
				remainingSoulsCost:0
			});
		}
	}
	return quickbuyQueueEntries;
}

function CollectQuickbuySellQueueEntries(quickbuySellQueuePanel){
	var quickbuySellQueueEntries=[];
	if(quickbuySellQueuePanel){
		var quickbuySellItemPanels=[];
		CollectQuickbuyItemPanels(quickbuySellQueuePanel,quickbuySellItemPanels);
		for(var sellIndex=0;sellIndex<quickbuySellItemPanels.length;sellIndex++){
			var quickbuySellItemPanel=quickbuySellItemPanels[sellIndex];
			var sellCostLabel=quickbuySellItemPanel.FindChildTraverse('ModCost');
			quickbuySellQueueEntries.push({
				itemPanel:quickbuySellItemPanel,
				sellSoulsCredit:Math.floor(ParseQuickbuySoulsCost(sellCostLabel?sellCostLabel.text:'')/2)
			});
		}
	}
	return quickbuySellQueueEntries;
}

function GetCurrentSoulsAmount(){
	var contextPanel=$.GetContextPanel();
	var currentSoulsAmountPanel=FindChildTraverseInAncestors(contextPanel,'CurrentGoldAmount');
	if(!currentSoulsAmountPanel)return 0;
	var currentSoulsLabel=currentSoulsAmountPanel.FindChildTraverse('hudCurGoldLabel');
	return currentSoulsLabel?ParseQuickbuySoulsCost(currentSoulsLabel.text):0;
}

function GetQuickbuySellQueueSoulsCredit(quickbuySellQueueEntries){
	var totalSellSoulsCredit=0;
	for(var sellIndex=0;sellIndex<quickbuySellQueueEntries.length;sellIndex++)totalSellSoulsCredit+=quickbuySellQueueEntries[sellIndex].sellSoulsCredit;
	return totalSellSoulsCredit;
}

function BuildQuickbuyQueueCostProgress(quickbuyQueueEntries,currentSoulsAmount,quickbuySellQueueEntries){
	var adjustedQuickbuyTotalSoulsCost=0;
	var runningQuickbuySoulsCost=0;
	var componentPurchasePoolByName={};
	var availableSoulsAmount=currentSoulsAmount+GetQuickbuySellQueueSoulsCredit(quickbuySellQueueEntries);
	var queueIndex=0,componentIndex=0;

	for(queueIndex=0;queueIndex<quickbuyQueueEntries.length;queueIndex++){
		var quickbuyQueueEntry=quickbuyQueueEntries[queueIndex];
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
		var queuedUpgradeName=quickbuyQueueEntries[queueIndex].itemKey;
		var requiredComponentNames=QUICKBUY_RECIPE_COMPONENTS[queuedUpgradeName];
		if(!requiredComponentNames)continue;

		for(componentIndex=0;componentIndex<requiredComponentNames.length;componentIndex++){
			var requiredComponentName=requiredComponentNames[componentIndex];
			var purchasedComponentPool=componentPurchasePoolByName[requiredComponentName];
			if(!purchasedComponentPool)continue;

			for(var purchasedComponentIndex=0;purchasedComponentIndex<purchasedComponentPool.length;purchasedComponentIndex++){
				var purchasedComponent=purchasedComponentPool[purchasedComponentIndex];
				if(purchasedComponent.isConsumedByLaterUpgrade)continue;
				if(purchasedComponent.queueIndex>=queueIndex)continue;

				quickbuyQueueEntries[queueIndex].effectiveSoulsCost-=purchasedComponent.baseSoulsCost;
				purchasedComponent.isConsumedByLaterUpgrade=true;
				break;
			}
		}
	}

	for(queueIndex=0;queueIndex<quickbuyQueueEntries.length;queueIndex++){
		var queueEntry=quickbuyQueueEntries[queueIndex];
		if(queueEntry.effectiveSoulsCost<0)queueEntry.effectiveSoulsCost=0;
		runningQuickbuySoulsCost+=queueEntry.effectiveSoulsCost;
		queueEntry.cumulativeSoulsCost=runningQuickbuySoulsCost;
		queueEntry.remainingSoulsCost=runningQuickbuySoulsCost-availableSoulsAmount;
		if(queueEntry.remainingSoulsCost<0)queueEntry.remainingSoulsCost=0;
	}

	adjustedQuickbuyTotalSoulsCost=runningQuickbuySoulsCost-GetQuickbuySellQueueSoulsCredit(quickbuySellQueueEntries);
	return adjustedQuickbuyTotalSoulsCost<0?0:adjustedQuickbuyTotalSoulsCost;
}

function UpdateQuickbuyQueueEntryRemainingSouls(quickbuyQueueEntries,clickToNotifyActive){
	for(var queueIndex=0;queueIndex<quickbuyQueueEntries.length;queueIndex++){
		var queueEntry=quickbuyQueueEntries[queueIndex];
		if(!queueEntry.itemPanel)continue;
		queueEntry.itemPanel.SetHasClass('HasRemainingSoulsNeeded',queueEntry.remainingSoulsCost>0);

		var queueRemainingSoulsLabel=queueEntry.itemPanel.FindChildTraverse('QueueRemainingSoulsLabel');
		if(queueRemainingSoulsLabel){
			queueRemainingSoulsLabel.text=String(queueEntry.remainingSoulsCost);
			var canNotify=clickToNotifyActive&&queueEntry.remainingSoulsCost>0;
			queueRemainingSoulsLabel.SetHasClass('CanClickToNotify',canNotify);
			if(clickToNotifyActive)StyleQuickbuyMoneyLabel(queueRemainingSoulsLabel,canNotify?'#d64259':'#66ffd9');
			var queueRemainingSoulsDivider=queueEntry.itemPanel.FindChildTraverse('QueueRemainingSoulsDivider');
			if(queueRemainingSoulsDivider)StyleQuickbuyMoneyLabel(queueRemainingSoulsDivider,'#d8d0c088');
			var modCostLabel=queueEntry.itemPanel.FindChildTraverse('ModCost');
			var goldIcon=queueEntry.itemPanel.FindChildTraverse('goldIcon')||queueEntry.itemPanel.FindChildTraverse('ModCostIcon');
			if(clickToNotifyActive){
				StyleQuickbuyMoneyLabel(modCostLabel,canNotify?'#d64259':'#66ffd9');
				if(goldIcon)SetQuickbuyPanelStyleIfChanged(goldIcon,'washColor',canNotify?'#d64259':'#66ffd9');
			}
			if(canNotify){
				var chatMessage='Need ' + FormatQuickbuySoulsAmount(queueEntry.remainingSoulsCost) + ' more for ' + (queueEntry.itemName||'item');
				if(queueRemainingSoulsLabel._qolClickToNotifyMessage!==chatMessage){
					queueRemainingSoulsLabel._qolClickToNotifyMessage=chatMessage;
					queueRemainingSoulsLabel.SetPanelEvent('onactivate',(function(message){
						return function(){SendQuickbuyNeededSoulsChatMessage(message);};
					})(chatMessage));
				}
			}else if(queueRemainingSoulsLabel._qolClickToNotifyMessage){
				queueRemainingSoulsLabel._qolClickToNotifyMessage='';
				queueRemainingSoulsLabel.SetPanelEvent('onactivate',function(){});
			}
		}
	}
}

function GetQuickbuyNextRemainingSouls(quickbuyQueueEntries){
	if(quickbuyQueueEntries.length>0)return quickbuyQueueEntries[0].remainingSoulsCost;
	return 0;
}

function SetKnownModIconClasses(targetModIcon,sourceModIcon){
	if(!targetModIcon)return;
	var modIconClassNames=[
		'hasAbility',
		'isWeapon',
		'isArmor',
		'isTech',
		'isTier0',
		'isTier5',
		'HideModTierLabel',
		'isEnhanced',
		'hasUpgradeLevel',
		'Locked',
		'unowned',
		'owned',
		'newSlotUnlocked',
		'IsNewItem'
	];

	for(var classIndex=0;classIndex<modIconClassNames.length;classIndex++){
		var className=modIconClassNames[classIndex];
		var hasClass=false;
		if(sourceModIcon&&sourceModIcon.BHasClass)hasClass=!!sourceModIcon.BHasClass(className);
		targetModIcon.SetHasClass(className,hasClass);
	}
}

function BuildQuickbuyPreviewIconPath(itemName,sourceModIcon){
	var canonicalItemName=CanonicalizeQuickbuyItemName(itemName);
	if(QUICKBUY_ICON_OVERRIDES[canonicalItemName])return QUICKBUY_ICON_OVERRIDES[canonicalItemName];

	var iconFolder='weapon';
	if(sourceModIcon&&sourceModIcon.BHasClass){
		if(sourceModIcon.BHasClass('isArmor'))iconFolder='vitality';
		else if(sourceModIcon.BHasClass('isTech'))iconFolder='spirit';
	}

	var iconName=canonicalItemName.replace(/\s+/g,'_');
	if(!iconName)return '';
	return 's2r://panorama/images/items/' + iconFolder + '/' + iconName + '_psd.vtex';
}

function SyncQuickbuyPreviewModIcon(previewModIcon,sourceModIcon,itemName){
	if(!previewModIcon)return;

	SetKnownModIconClasses(previewModIcon,sourceModIcon);

	var targetModIconImage=previewModIcon.FindChildTraverse('ModIconImage');
	var sourceModIconImage=sourceModIcon?sourceModIcon.FindChildTraverse('ModIconImage'):null;
	var sourceImagePath='';

	if(sourceModIconImage&&sourceModIconImage.GetAttributeString)sourceImagePath=sourceModIconImage.GetAttributeString('src','');
	if(!sourceImagePath)sourceImagePath=BuildQuickbuyPreviewIconPath(itemName,sourceModIcon);
	if(targetModIconImage&&targetModIconImage.SetImage)targetModIconImage.SetImage(sourceImagePath||'');

	var targetTierLabel=previewModIcon.FindChildTraverse('mod_tier_label');
	var sourceTierLabel=sourceModIcon?sourceModIcon.FindChildTraverse('mod_tier_label'):null;
	var tierClassNames=['ModTierLevel1','ModTierLevel2','ModTierLevel3','ModTierLevel4','ModTierLevel5'];
	for(var tierClassIndex=0;tierClassIndex<tierClassNames.length;tierClassIndex++){
		var tierClassName=tierClassNames[tierClassIndex];
		if(targetTierLabel){
			var hasTierClass=false;
			if(sourceTierLabel&&sourceTierLabel.BHasClass)hasTierClass=!!sourceTierLabel.BHasClass(tierClassName);
			targetTierLabel.SetHasClass(tierClassName,hasTierClass);
		}
	}
}

function UpdateQuickbuyUpcomingPreviewSlots(quickbuyQueueEntries){
	var contextPanel=$.GetContextPanel();
	for(var previewSlotIndex=0;previewSlotIndex<quickbuyUpcomingPreviewSlots.length;previewSlotIndex++){
		var previewSlot=quickbuyUpcomingPreviewSlots[previewSlotIndex];
		var previewRoot=contextPanel.FindChildTraverse(previewSlot.rootId);
		var previewEntryPanel=contextPanel.FindChildTraverse(previewSlot.entryPanelId);
		var previewModIcon=previewEntryPanel?previewEntryPanel.FindChildTraverse('ModIcon'):null;
		var previewSoulsLabel=contextPanel.FindChildTraverse(previewSlot.soulsLabelId);
		if(!previewRoot)continue;

		previewRoot.SetHasClass('HasPreviewItem',false);
		previewRoot.SetHasClass('CanAffordUpcoming',false);
		if(previewSoulsLabel)previewSoulsLabel.text='0';
		SyncQuickbuyPreviewModIcon(previewModIcon,null,'');

		if(previewSlot.queueIndex>=quickbuyQueueEntries.length)continue;

		var previewQueueEntry=quickbuyQueueEntries[previewSlot.queueIndex];
		if(!previewQueueEntry||!previewQueueEntry.itemPanel)continue;

		var sourceModIcon=previewQueueEntry.itemPanel.FindChildTraverse('ModIcon');
		if(previewSoulsLabel)previewSoulsLabel.text=String(previewQueueEntry.remainingSoulsCost);
		SyncQuickbuyPreviewModIcon(previewModIcon,sourceModIcon,previewQueueEntry.itemName);

		previewRoot.SetHasClass('HasPreviewItem',true);
		previewRoot.SetHasClass('CanAffordUpcoming',previewQueueEntry.remainingSoulsCost<=0);
	}
}

function ResetQuickbuyUpcomingPreviewSlots(contextPanel){
	for(var previewSlotIndex=0;previewSlotIndex<quickbuyUpcomingPreviewSlots.length;previewSlotIndex++){
		var previewSlot=quickbuyUpcomingPreviewSlots[previewSlotIndex];
		var previewRoot=contextPanel.FindChildTraverse(previewSlot.rootId);
		var previewSoulsLabel=contextPanel.FindChildTraverse(previewSlot.soulsLabelId);
		var previewEntryPanel=contextPanel.FindChildTraverse(previewSlot.entryPanelId);
		var previewModIcon=previewEntryPanel?previewEntryPanel.FindChildTraverse('ModIcon'):null;
		if(previewRoot){
			previewRoot.SetHasClass('HasPreviewItem',false);
			previewRoot.SetHasClass('CanAffordUpcoming',false);
		}
		if(previewSoulsLabel)previewSoulsLabel.text='0';
		SyncQuickbuyPreviewModIcon(previewModIcon,null,'');
	}
}

function ResetQuickbuyQueuePanels(contextPanel){
	var quickbuyTotalCostLabel=contextPanel.FindChildTraverse('QuickbuyShopTotalCostLabel');
	var quickbuyNextSoulsNeededLabel=contextPanel.FindChildTraverse('QuickbuyNextSoulsNeededLabel');
	var quickbuyQueuePanel=contextPanel.FindChildTraverse('QuickbuyQueue');
	if(quickbuyTotalCostLabel)quickbuyTotalCostLabel.text='0';
	if(quickbuyNextSoulsNeededLabel)quickbuyNextSoulsNeededLabel.text='0';
	ResetQuickbuyUpcomingPreviewSlots(contextPanel);

	var quickbuyQueueEntries=CollectQuickbuyQueueEntries(quickbuyQueuePanel);
	for(var queueIndex=0;queueIndex<quickbuyQueueEntries.length;queueIndex++){
		var queueEntry=quickbuyQueueEntries[queueIndex];
		if(!queueEntry.itemPanel)continue;
		queueEntry.itemPanel.SetHasClass('HasRemainingSoulsNeeded',false);
		var queueRemainingSoulsLabel=queueEntry.itemPanel.FindChildTraverse('QueueRemainingSoulsLabel');
		if(queueRemainingSoulsLabel){
			queueRemainingSoulsLabel.text='0';
			queueRemainingSoulsLabel.SetHasClass('CanClickToNotify',false);
			queueRemainingSoulsLabel._qolClickToNotifyMessage='';
			queueRemainingSoulsLabel.SetPanelEvent('onactivate',function(){});
		}
	}
}

function UpdateQuickbuyQueueCostPanels(){
	var contextPanel=$.GetContextPanel();
	if(!contextPanel){
		$.Schedule(QUICKBUY_TOTAL_UPDATE_INTERVAL_SECONDS,UpdateQuickbuyQueueCostPanels);
		return;
	}

	if(!IsQuickbuyCostFeatureActive(contextPanel)){
		ResetQuickbuyQueuePanels(contextPanel);
		$.Schedule(QUICKBUY_TOTAL_UPDATE_INTERVAL_SECONDS,UpdateQuickbuyQueueCostPanels);
		return;
	}
	var clickToNotifyActive=IsClickToNotifyActive(contextPanel);

	var quickbuyTotalCostLabel=contextPanel.FindChildTraverse('QuickbuyShopTotalCostLabel');
	var quickbuyNextSoulsNeededLabel=contextPanel.FindChildTraverse('QuickbuyNextSoulsNeededLabel');
	var quickbuyQueuePanel=contextPanel.FindChildTraverse('QuickbuyQueue');
	var quickbuySellQueuePanel=contextPanel.FindChildTraverse('QuickbuySellQueue');
	if(!quickbuyTotalCostLabel){
		$.Schedule(QUICKBUY_TOTAL_UPDATE_INTERVAL_SECONDS,UpdateQuickbuyQueueCostPanels);
		return;
	}

	var currentSoulsAmount=GetCurrentSoulsAmount();
	var quickbuyQueueEntries=CollectQuickbuyQueueEntries(quickbuyQueuePanel);
	var quickbuySellQueueEntries=CollectQuickbuySellQueueEntries(quickbuySellQueuePanel);
	var adjustedQuickbuyTotalSoulsCost=BuildQuickbuyQueueCostProgress(quickbuyQueueEntries,currentSoulsAmount,quickbuySellQueueEntries);

	quickbuyTotalCostLabel.text=String(adjustedQuickbuyTotalSoulsCost);
	UpdateQuickbuyQueueEntryRemainingSouls(quickbuyQueueEntries,clickToNotifyActive);
	UpdateQuickbuyUpcomingPreviewSlots(quickbuyQueueEntries);

	if(quickbuyNextSoulsNeededLabel)quickbuyNextSoulsNeededLabel.text=String(GetQuickbuyNextRemainingSouls(quickbuyQueueEntries));

	$.Schedule(QUICKBUY_TOTAL_UPDATE_INTERVAL_SECONDS,UpdateQuickbuyQueueCostPanels);
}

InitializeQuickbuyRecipeComponents();
$.Schedule(0.0,UpdateQuickbuyQueueCostPanels);
})();
