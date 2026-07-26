// features/ql_legacy_audio_passive/manifest.js
// =============================================================================
// QOLLOCK — Legacy Audio Passive
// =============================================================================
// OWNS:        Feature-specific HUD modifications
// DOES NOT OWN: Game state, other features
// DEPENDS ON:  QOL.core.FeatureRegistry, QOL.core.Scheduler
// CONFIG KEYS: Feature-specific config keys
// PATTERN:     Polling. Self-scheduling via Scheduler.createPollLoop.
// =============================================================================
(function(){"use strict";var FR=QOL.core.FeatureRegistry;if(!FR){$.Msg("[QOLLock] legacy_audio_passive: FeatureRegistry not found — aborting");return;}
FR.register({id:"ql_legacy_audio_passive",enabledByDefault:false,settings:[],create:function(ctx){var _loop=null;
function _tick(){var cfg=ctx.config.all();/* polling logic */ }
return{onEnable:function(){var S=QOL.core.Scheduler;_loop=S&&S.createPollLoop?S.createPollLoop(_tick,0.2,"ql_legacy_audio_passive"):null;},
onDisable:function(){if(_loop){_loop.stop();_loop=null;}},onSettingsChanged:function(){}};}});})();
