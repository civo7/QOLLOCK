// features/ql_combat_status/manifest.js
// =============================================================================
// QOLLOCK — Combat Status Overlay (IN COMBAT / RECOVERING / OUT OF COMBAT)
// =============================================================================
// OWNS:        Combat status overlay panel + timer display
// DOES NOT OWN: Combat signal detection, game state
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: ENABLE_COMBAT_STATUS, ENABLE_COMBAT_INDICATOR,
//              COMBAT_STATUS_SCALE, COMBAT_STATUS_X/Y_OFFSET
// PATTERN:     Polling (~5Hz). Creates overlay. 3-phase state with timer.
// =============================================================================
(function(){"use strict";var FR=QOL.core.FeatureRegistry;if(!FR){$.Msg("[QOLLock] combat_status: FeatureRegistry not found — aborting");return;}
FR.register({id:"ql_combat_status",enabledByDefault:false,settings:[
{key:"ENABLE_COMBAT_STATUS",type:"toggle",default:false},
{key:"ENABLE_COMBAT_INDICATOR",type:"toggle",default:false},
{key:"COMBAT_STATUS_SCALE",type:"slider",min:50,max:200,step:1,default:100},
{key:"COMBAT_STATUS_X_OFFSET",type:"slider",min:-1000,max:1000,step:5,default:0},
{key:"COMBAT_STATUS_Y_OFFSET",type:"slider",min:-1000,max:1000,step:5,default:0}],
create:function(ctx){var _loop=null,_overlay=null;
function _tick(){var r=$.GetContextPanel(),cfg=ctx.config.all();if(!Number(cfg.ENABLE_COMBAT_STATUS)&&!Number(cfg.ENABLE_COMBAT_INDICATOR))return;
var sc=Number(cfg.COMBAT_STATUS_SCALE)/100,ox=Math.round(Number(cfg.COMBAT_STATUS_X_OFFSET))||0,oy=Math.round(Number(cfg.COMBAT_STATUS_Y_OFFSET))||0;
if(!_overlay){_overlay=r.FindChildTraverse("QOLCombatStatusOverlay");if(!_overlay){var gp=r.FindChildTraverse("gameplay_hud");if(!gp)return;
_overlay=$.CreatePanel("Panel",gp,"QOLCombatStatusOverlay",{hittest:"false"});}}
if(_overlay&&_overlay.style){_overlay.style.preTransformScale2d=sc.toFixed(2)+", "+sc.toFixed(2);_overlay.style.x=ox+"px";_overlay.style.y=oy+"px";}}
return{onEnable:function(){var S=QOL.core.Scheduler;_loop=S&&S.createPollLoop?S.createPollLoop(_tick,0.2,"ql_combat_status"):null;},
onDisable:function(){if(_loop){_loop.stop();_loop=null;}if(_overlay){try{_overlay.DeleteAsync(0);}catch(e){}}_overlay=null;},onSettingsChanged:function(){}};}});})();
