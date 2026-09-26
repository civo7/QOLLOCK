"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHud}=require('../scripts/simulator');
function setup(){const env=createHud({inHideout:false});env.assertLoaded();return {...env,Q:env.sandbox.global.QOL};}

test('scoreboard reads native listener state and follows listener replacement',()=>{
 const {Q,root,doc}=setup();let listener=doc.create('Panel',{id:'minimap_persp'});root.addChild(listener);
 listener.SetHasClass('gScoreboardOpen',true);
 assert.equal(Q.core.hud.isScoreboardOpen(root),true);
 listener.SetHasClass('gScoreboardOpen',false);assert.equal(Q.core.hud.isScoreboardOpen(root),false);
 const other=doc.create('Panel',{id:'Detached'});listener.SetParent(other);
 listener=doc.create('Panel',{id:'minimap_persp'});root.addChild(listener);listener.SetHasClass('gScoreboardOpen',true);
 assert.equal(Q.core.hud.isScoreboardOpen(root),true);
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
 Q.core.EventBus.emit('engine:scoreboard_toggle');clock.advance(61000);assert.equal(second.samples.length,count);
 assert.equal(first.status,'replaced');
});
