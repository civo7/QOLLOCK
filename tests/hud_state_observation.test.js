"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHud}=require('../scripts/simulator');
function setup(){const env=createHud({inHideout:false});env.assertLoaded();return {...env,Q:env.sandbox.global.QOL};}

test('gameplay HUD visibility distinguishes hideout rooms and reads live native gates',()=>{
 const {Q,root,doc}=setup();const read=()=>Q.core.hud.isGameplayHudShown(root);
 root.AddClass('joined_team');root.AddClass('connectedToHideout');
 const core=doc.create('Panel',{classes:['HudCore']});root.addChild(core);
 const gameplay=doc.create('Panel',{id:'gameplay_hud'});core.addChild(gameplay);
 assert.equal(read(),true,'connectedToHideout alone permits the combat room');
 for(const cls of ['InHideout','ShowEscapeMenu','HudTakeoverEnabled','inPostGame','GameStatePostGame','HudHiddenPanel']){
  root.AddClass(cls);assert.equal(read(),false,cls);root.RemoveClass(cls);assert.equal(read(),true,cls+' cleared');
 }
 root.RemoveClass('joined_team');assert.equal(read(),false);root.AddClass('joined_team');
 gameplay.AddClass('gShopOpen');assert.equal(read(),false);gameplay.RemoveClass('gShopOpen');
 gameplay.visible=false;assert.equal(read(),false);gameplay.visible=true;
 for(const panel of [core,gameplay]){
  panel.style.visibility='collapse';assert.equal(read(),false);panel.style.visibility='';
  panel.style.opacity='0';assert.equal(read(),false);panel.style.opacity='';assert.equal(read(),true,'unset opacity is not zero');
 }
 doc.absRoot.AddClass('InHideout');assert.equal(read(),false,'area gate can belong to a Hud ancestor');doc.absRoot.RemoveClass('InHideout');
 const loading=doc.create('Panel',{id:'Loading'});assert.equal(Q.core.hud.isGameplayHudShown(loading),false,'a findHud fallback is not gameplay evidence');
});

test('gameplay visibility rebinds replaced native panels and retries a missing HUD',()=>{
 const {Q,root,doc,clock}=setup();root.AddClass('joined_team');
 assert.equal(Q.core.hud.isGameplayHudShown(root),false);
 const core=doc.create('Panel',{classes:['HudCore']});root.addChild(core);
 let gameplay=doc.create('Panel',{id:'gameplay_hud'});core.addChild(gameplay);
 clock.advance(800);assert.equal(Q.core.hud.isGameplayHudShown(root),true,'late native HUD is discovered');
 const retired=doc.create('Panel',{id:'Retired'});doc.absRoot.addChild(retired);
 gameplay.SetParent(retired);
 gameplay=doc.create('Panel',{id:'gameplay_hud'});core.addChild(gameplay);gameplay.visible=false;
 assert.equal(Q.core.hud.isGameplayHudShown(root),false,'a live old generation cannot mask the hidden replacement');
 gameplay.visible=true;assert.equal(Q.core.hud.isGameplayHudShown(root),true);
 gameplay.DeleteAsync(0);clock.advance(0);
 assert.equal(Q.core.hud.isGameplayHudShown(root),false);
});

test('scoreboard reads native listener state and follows listener replacement',()=>{
 const {Q,root,doc}=setup();let listener=doc.create('Panel',{id:'minimap_persp'});root.addChild(listener);
 listener.SetHasClass('gScoreboardOpen',true);
 assert.equal(Q.core.hud.isScoreboardOpen(root),true);
 listener.SetHasClass('gScoreboardOpen',false);assert.equal(Q.core.hud.isScoreboardOpen(root),false);
 const other=doc.create('Panel',{id:'Detached'});listener.SetParent(other);
 listener=doc.create('Panel',{id:'minimap_persp'});root.addChild(listener);listener.SetHasClass('gScoreboardOpen',true);
 assert.equal(Q.core.hud.isScoreboardOpen(root),true);
 let stable=doc.create('Panel',{id:'DamageReportGlobalClassListener'});root.addChild(stable);
 assert.equal(Q.core.hud.isScoreboardOpen(root,listener),false,'stationary listener overrides a stale minimap class');
 stable.SetHasClass('gScoreboardOpen',true);listener.SetHasClass('gScoreboardOpen',false);
 assert.equal(Q.core.hud.isScoreboardOpen(root,listener),true,'stationary listener tracks Tab after minimap class loss');
 stable.SetParent(other);stable=doc.create('Panel',{id:'DamageReportGlobalClassListener'});root.addChild(stable);
 assert.equal(Q.core.hud.isScoreboardOpen(root),false,'replaced stationary listener is resolved again');
});

test('HUD life evidence stays unknown for ambiguous, spectator and replay states',()=>{
 const {Q,root}=setup();const read=()=>Q.core.hud.readHudLifeState(root);
 root.SetHasClass('alive',false);root.SetHasClass('dead',false);assert.equal(read(),'unknown');
 root.SetHasClass('alive',true);assert.equal(read(),'alive');
 root.SetHasClass('dead',true);assert.equal(read(),'unknown');
 root.SetHasClass('alive',false);assert.equal(read(),'dead');
 for(const cls of ['spec_mode','replay_playback','deathReplayActive','InHideout','connectedToHideout']){
  root.SetHasClass(cls,true);assert.equal(read(),'unknown',cls);root.SetHasClass(cls,false);
 }
});

test('state recorder distinguishes event-time classes from later state and publishes completion',()=>{
 const {Q,root,clock}=setup();const cfg=JSON.stringify(Q.core.ConfigStore.all());
 root.SetAttributeString('QOL_DiagRequest','state_audit');Q.core.app.syncDiagnosticState(root,Date.now());
 const result=Q.core.ManifestTests.getHudStateObservation();assert.equal(result.status,'running');
 Q.core.EventBus.emit('engine:scoreboard_toggle');
 assert.equal(result.samples.at(-1).source,'engine:scoreboard_toggle');assert.equal(result.samples.at(-1).scoreboard,false);
 root.SetHasClass('gScoreboardOpen',true);clock.advance(500);
 assert.ok(result.samples.some(row=>row.source==='poll'&&row.scoreboard));
 clock.advance(60500);assert.equal(result.status,'complete');
 assert.ok(result.workSamples.length > 1 && result.workSamples.length <= 64);
 assert.ok(result.workFeatures.length > 0 && result.workFeatures.length <= 128);
 assert.ok(result.report.includes('Quiet counters do not clear the mod'));
 const snapshot=JSON.parse(root.GetAttributeString('QOL_Diag',''));
 assert.equal(snapshot.hudStateObservation.token,'state_audit');assert.ok(snapshot.hudStateObservation.report.includes('END HUD'));
 const count=result.samples.length;Q.core.EventBus.emit('engine:scoreboard_toggle');clock.advance(500);
 assert.equal(result.samples.length,count);assert.equal(JSON.stringify(Q.core.ConfigStore.all()),cfg);
});

test('state recorder bounds samples and replacement/cancellation remove subscriptions',()=>{
 const {Q,clock}=setup();const api=Q.core.ManifestTests;
 api.observeHudStates('first');const first=api.getHudStateObservation();
 for(let i=0;i<150;i++)Q.core.EventBus.emit('engine:scoreboard_toggle');
 assert.equal(first.samples.length,128);assert.ok(first.dropped>0);
 api.observeHudStates('second');assert.equal(first.status,'replaced');const second=api.getHudStateObservation();
 api.cancel();assert.equal(second.status,'cancelled');const count=second.samples.length;
 const work=JSON.stringify(second.workFeatures);
 Q.core.EventBus.emit('engine:scoreboard_toggle');clock.advance(61000);assert.equal(second.samples.length,count);
 assert.equal(JSON.stringify(second.workFeatures),work);
 assert.equal(first.status,'replaced');
});
