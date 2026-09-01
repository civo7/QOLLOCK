// features/ql_stat_bonuses/manifest.js
// =============================================================================
// QOLLOCK — Stat Bonuses Overlay (Golden Statue bonuses)
// =============================================================================
// OWNS:        Stat bonuses overlay: fire rate, cooldown, spirit, clip, damage, health
// DOES NOT OWN: Golden statue mechanics, stat calculations
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_STAT_BONUSES, STAT_BONUSES_SCALE, STAT_BONUSES_X/Y_OFFSET
// PATTERN:     Polling (~5Hz). Creates overlay with 6 stat labels.
// =============================================================================
(function(){"use strict";var FR=QOL.core.FeatureRegistry;if(!FR){$.Msg("[QOLLock] stat_bonuses: FeatureRegistry not found — aborting");return;}
FR.register({id:"ql_stat_bonuses",enabledByDefault:false,settings:[
{key:"ENABLE_STAT_BONUSES",type:"toggle",default:false},
{key:"STAT_BONUSES_SCALE",type:"slider",min:50,max:200,step:1,default:100},
{key:"STAT_BONUSES_X_OFFSET",type:"slider",min:-1000,max:1000,step:5,default:0},
{key:"STAT_BONUSES_Y_OFFSET",type:"slider",min:0,max:1000,step:5,default:0}],
create:function(ctx){var _loop=null,_overlay=null;
function _tick(){var r=$.GetContextPanel(),cfg=ctx.config.view();if(!Number(cfg.ENABLE_STAT_BONUSES)){if(_overlay)_overlay.visible=false;return;}
var sc=Number(cfg.STAT_BONUSES_SCALE)/100,ox=Math.round(Number(cfg.STAT_BONUSES_X_OFFSET))||0,oy=Math.round(Number(cfg.STAT_BONUSES_Y_OFFSET))||0;
if(!_overlay){_overlay=r.FindChildTraverse("QOLStatBonusesOverlay");if(!_overlay){var gp=r.FindChildTraverse("gameplay_hud");if(!gp)return;
_overlay=$.CreatePanel("Panel",gp,"QOLStatBonusesOverlay",{hittest:"false"});}}
if(_overlay&&_overlay.style){_overlay.visible=true;_overlay.style.preTransformScale2d="1.00, 1.00";_overlay.style.uiScale=Math.round(sc*100)+"%";_overlay.style.marginLeft=(-520+ox)+"px";_overlay.style.marginBottom=(70+oy)+"px";}}
return{onEnable:function(){var S=QOL.core.Scheduler;_loop=S&&S.createPollLoop?S.createPollLoop(_tick,0.2,"ql_stat_bonuses"):null;},
onDisable:function(){if(_loop){_loop.stop();_loop=null;}if(_overlay){try{_overlay.DeleteAsync(0);}catch(e){}}_overlay=null;},onSettingsChanged:function(){}};},
test:function(ctx){try{var r=$.GetContextPanel(),gp=r?r.FindChildTraverse("gameplay_hud"):null;return{passed:!!gp,name:"Stat bonuses anchor panel exists",message:gp?"":"gameplay_hud not found",assertions:[{passed:!!gp,name:"gameplay_hud panel exists"}]};}catch(e){return{passed:false,name:"Stat bonuses panel check",message:(e&&e.message?e.message:String(e))};}}});})();
