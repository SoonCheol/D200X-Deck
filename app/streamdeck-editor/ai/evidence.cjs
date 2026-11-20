'use strict';
// Bounded, local-only evidence. No raw action contents, paths, credentials or error strings.
const STAGES=new Set(['renderer','resolved','planned','warning','held-consumed','held-replay','wide-debounce','wide-switch','unresolved','hold','logic','sdk-dispatch','release','duplicate','no-plan','unsaved-block','dispatch-return','dispatch-throw','request','request-resolved','request-false','request-rejected','helper']);
const TYPES=new Set(['down','up','left','right','hold-left','hold-right']);
const safe=v=>typeof v==='string'&&/^[a-z0-9_-]{1,64}$/i.test(v)?v:undefined;
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max?v:undefined;
const bool=v=>typeof v==='boolean'?v:undefined;
function createEvidence({limit=128,clock=()=>Date.now(),id}={}){
  const rows=new Map(),helpers=new Map();let serial=0;
  const now=()=>new Date(clock()).toISOString();
  const append=(key,record)=>{
    const row=rows.get(key);if(!row||!STAGES.has(record?.stage))return false;
    const entry={at:now(),stage:record.stage,slot:integer(record.slot,0,18),gesture:TYPES.has(record.gesture)?record.gesture:undefined,action:safe(record.action),outcome:safe(record.outcome),page:integer(record.page,1,128),profile:integer(record.profile,1,50),folder:bool(record.folder),dirty:bool(record.dirty),handled:bool(record.handled),status:safe(record.status),mode:safe(record.mode),helperStage:safe(record.helperStage),helperTrace:safe(record.helperTrace),error:bool(record.error),ms:integer(record.ms,0,3600000),count:integer(record.count,0,10000)};
    row.events.push(entry);
    if(row.events.length>18){row.events.splice(1,1);row.truncated=true;}
    return true;
  };
  return {
    receive(event,delivery){
      const key=id?id():String(++serial);
      rows.set(key,{id:key,at:now(),index:integer(Number(event.index),0,255),kind:integer(Number(event.kind),0,255),state:integer(Number(event.state),0,255),pressed:bool(event.pressed),knob:bool(event.knob),delivered:!!delivery,events:[]});
      while(rows.size>limit)rows.delete(rows.keys().next().value);
      return key;
    },
    append,
    has:key=>typeof key==='string'&&rows.has(key),
    link:(trace,key)=>{if(rows.has(key)&&typeof trace==='string'&&trace.length<=80){helpers.set(trace,key);while(helpers.size>limit*2)helpers.delete(helpers.keys().next().value);}},
    helper(record){
      const key=rows.has(record?.traceId)?record.traceId:helpers.get(record?.traceId);
      if(!key)return;
      append(key,{stage:'helper',helperStage:record.stage,helperTrace:record.traceId,status:record.result?.status,mode:record.mode,error:!!record.error||!!record.result?.error,handled:bool(record.ok)});
    },
    list(){return [...rows.values()].map(x=>({...x,events:x.events.map(e=>({...e}))}));}
  };
}
function assess(row){
  const e=row.events||[],last=stage=>e.findLast(x=>x.stage===stage),all=stage=>e.filter(x=>x.stage===stage);
  const failures=all('request-rejected').length+all('request-false').length+all('dispatch-throw').length;
  const requests=all('request').length,settled=all('request-resolved').length+all('request-rejected').length+all('request-false').length;
  const helper=e.filter(x=>x.stage==='helper').at(-1),planned=last('planned'),resolved=last('resolved');
  let finding='received_only';
  if(!row.delivered)finding='editor_unavailable';
  else if(failures)finding='request_reported_failure';
  else if(e.some(x=>x.stage==='unsaved-block'||x.stage==='warning'))finding='unsaved_confirmation';
  else if(requests>settled)finding='request_pending_or_evidence_missing';
  else if(helper?.status==='focused')finding='native_focus_reported';
  else if(helper?.status==='present')finding='window_present_not_focus_proof';
  else if(helper?.helperStage==='launch-unconfirmed'||helper?.helperStage==='open-missing')finding='launch_not_confirmed';
  else if(all('request-resolved').length)finding='request_returned_not_effect_proof';
  else if(e.some(x=>['duplicate','wide-debounce','held-consumed','release'].includes(x.stage)))finding='input_filtered_or_deferred';
  else if(last('no-plan')||last('unresolved'))finding='no_action_plan';
  else if(last('logic')||last('hold'))finding='gesture_deferred_or_handled';
  else if(last('dispatch-return'))finding=last('dispatch-return').handled?'renderer_returned':'renderer_no_action_returned';
  return {id:row.id,at:row.at,index:row.index,state:row.state,pressed:row.pressed,delivered:row.delivered,slot:resolved?.slot===undefined?undefined:resolved.slot+1,gesture:resolved?.gesture,action:resolved?.action,outcome:planned?.outcome,page:last('renderer')?.page,profile:last('renderer')?.profile,folder:last('renderer')?.folder,dirty:last('renderer')?.dirty,finding,requests,settled,failures,helper:helper?{trace:helper.helperTrace,stage:helper.helperStage,status:helper.status,mode:helper.mode,error:helper.error}:undefined,truncated:!!row.truncated};
}
module.exports={createEvidence,assess};
