"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHud } = require("../scripts/simulator");
const { audit } = require("../scripts/audit_helper_calls");
function setup() { const env = createHud({inHideout:false}); env.assertLoaded(); return {...env, Q:env.sandbox.global.QOL, U:env.sandbox.global.QOL_UTILS}; }

test("runtime helper calls resolve to existing exports, including scoped aliases", () => {
 const result=audit(); assert.ok(result.calls>1000); assert.deepEqual(result.missing,[]);
});

test("HUD resolution retries after a fallback root and changes with its context", () => {
 const {doc,sandbox,Q}=setup();
 const outer=doc.create("Panel",{id:"LoadingRoot"});
 sandbox.global.$.GetContextPanel=()=>outer;
 assert.equal(Q.core.panel.findHud(),outer);
 const hud=doc.create("CitadelHud",{id:"Hud"}); outer.addChild(hud);
 assert.equal(Q.core.panel.findHud(),hud,"a previously returned fallback must not stick");
 const another=doc.create("CitadelHud",{id:"Hud"});
 sandbox.global.$.GetContextPanel=()=>another;
 assert.equal(Q.core.panel.findHud(),another);
});

test("panel root helpers honor explicit context and safely reject deleted native traversal", () => {
 const {doc,Q,U}=setup();
 const outer=doc.create("Panel",{id:"OtherRoot"}); const child=doc.create("Panel",{id:"Child"}); outer.addChild(child);
 assert.equal(Q.core.panel.findRoot(child),outer);
 child.GetParent=()=>{throw Error("freed parent")};
 assert.equal(Q.core.panel.findRoot(child),null);
 assert.equal(U.HasClassInHierarchy(child,"absent"),false);
 assert.equal(U.FindAncestorWithClass(child,"absent"),null);
 child.BHasClass=()=>{throw Error("freed panel")};
 assert.equal(U.PanelHasClass(child,"absent"),false);
 child.Children=()=>{throw Error("freed children")};
 assert.equal(Q.core.panel.readTextDeep(child),"");
 assert.equal(U.IsPanelListValid({}),false);
 assert.equal(U.IsPanelListValid([outer]),true);
});

test("style batches retry after a partial native failure instead of accepting its signature", () => {
 const {doc,Q}=setup();const panel=doc.create("Panel",{id:"PartialStyle"});let fail=true;
 panel.style=new Proxy({}, {set(o,k,v){if(k==='opacity'&&fail)throw Error('native setter unavailable');o[k]=v;return true;}});
 const styles={x:"10px",opacity:"0.5"};const first=Q.core.panel.syncStyles(panel,styles);
 fail=false;const second=Q.core.panel.syncStyles(panel,styles,first.sig);
 assert.equal(second.changed,true);assert.equal(panel.style.opacity,"0.5");
 assert.equal(Q.core.panel.syncStyles(panel,styles,second.sig).changed,false);
});

test("typed resolver follows root/id changes and live reparenting", () => {
 const {doc,Q}=setup();const cache=Q.panelCache;
 const a=doc.create("Panel",{id:"A"}),b=doc.create("Panel",{id:"B"});
 const one=doc.create("Panel",{id:"Target"}),two=doc.create("Panel",{id:"Target"});a.addChild(one);b.addChild(two);
 assert.equal(cache.resolve(a,"testTarget","Target"),one);
 assert.equal(cache.resolve(b,"testTarget","Target"),two);
 const other=doc.create("Panel",{id:"Other"});b.addChild(other);
 assert.equal(cache.resolve(b,"testTarget","Other"),other);
 assert.equal(cache.resolve(a,"testTarget","Target"),one);
 one.SetParent(b);
 assert.equal(cache.resolve(a,"testTarget","Target"),null);
 assert.equal(Q.panelCacheResolve(null,"testTarget","Target"),null);
});

test("event dispatch survives self-unsubscription and defers new listeners", () => {
 const {Q}=setup();const bus=Q.core.EventBus,seen=[];
 const late=()=>seen.push('late');const first=()=>{seen.push('first');bus.off('audit:test',first);bus.on('audit:test',late);};
 bus.on('audit:test',first);bus.on('audit:test',()=>seen.push('second'));
 bus.emit('audit:test');assert.deepEqual(seen,['first','second']);
 bus.emit('audit:test');assert.deepEqual(seen,['first','second','second','late']);
});

test("scheduler stops when native owner validity throws", () => {
 const {Q,root,clock}=setup();let count=0;
 Q.core.Scheduler.createPollLoop(()=>count++,0.2,'audit_owner');
 root.IsValid=()=>{throw Error('freed owner')};clock.advance(200);
 assert.equal(count,0);assert.deepEqual(clock.errors,[]);
});

test("safe style and position helpers contain native getter races",()=>{
 const {U}=setup();const panel={get style(){throw Error('freed style');}, get actualxoffset(){throw Error('freed layout');}};
 assert.doesNotThrow(()=>U.SetStyleSafe(panel,'opacity','0.5'));
 assert.equal(U.SetStyleIfChanged(panel,'opacity','0.5'),false);
 assert.doesNotThrow(()=>U.ClearStyleSafe(panel,'opacity'));
 assert.doesNotThrow(()=>U.SetPanelOpacitySafe(panel,0.5,1));
 assert.equal(U.GetPanelPositionRelativeToAncestor(panel,{}),null);
});

test("manual call profiler reports the actual interval and resets across disable",()=>{
 const {U,clock,sandbox}=setup();U.SetProfilerEnabled(true);
 for(let i=0;i<100;i++)U.ProfileHit('audit_hit');
 clock.advance(10000);U.DumpProfile();
 assert.ok(sandbox.messages.some(line=>line.includes('audit_hit')&&line.includes('100 calls (10/s)')));
 U.SetProfilerEnabled(false);clock.advance(50000);U.SetProfilerEnabled(true);
 for(let i=0;i<20;i++)U.ProfileHit('audit_again');
 clock.advance(10000);U.DumpProfile();
 assert.ok(sandbox.messages.some(line=>line.includes('audit_again')&&line.includes('20 calls (2/s)')));
});

test("managed one-shot callbacks run once and are cancelled with their feature", () => {
 const {Q,clock}=setup();let calls=0;
 Q.core.Scheduler.scheduleOnce(()=>calls++,0.1,'audit_once');
 clock.advance(200);assert.equal(calls,1);clock.advance(200);assert.equal(calls,1);
 Q.core.Scheduler.scheduleOnce(()=>calls++,0,'audit_once');
 Q.core.Scheduler.cancelAllForFeature('audit_once');clock.advance(200);assert.equal(calls,1);
 const handle=Q.core.Scheduler.scheduleOnce(()=>calls++,0,'audit_once');handle.stop();handle.stop();
 clock.advance(200);assert.equal(calls,1);
});

for (const method of ['enable','boot']) test(`failed ${method} unwinds partial resources before retry`, () => {
 const {Q,clock}=setup();const registry=Q.core.FeatureRegistry;let cleanup=0,calls=0;
 registry.register({id:'audit_failure',enabledByDefault:true,create:()=>({
  onEnable(){Q.core.Scheduler.scheduleOnce(()=>calls++,0,'audit_failure');throw Error('partial setup');},
  onDisable(){cleanup++;}
 })});
 if(method==='boot')registry.boot();else registry.enable('audit_failure');
 assert.equal(cleanup,1);assert.equal(registry.isEnabled('audit_failure'),false);
 clock.advance(100);assert.equal(calls,0);
});
