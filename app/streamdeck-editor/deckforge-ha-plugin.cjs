'use strict';
// DeckForge-owned HA plugin. Protocol reference: HA WebSocket API and
// home-assistant-js-websocket states.ts (interoperability only; no copied code).
const ID='com.deckforge.native.home-assistant';
function service(event,settings,state,memory,api){
  const clean=(v,n=100)=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,n):'';
  const valid=id=>typeof id==='string'&&id.length<=256&&/^[a-z0-9_]+\.[a-z0-9_]+$/.test(id);
  const control=id=>['switch','light','fan','input_boolean','script','scene','automation','button','input_button'].includes(id.split('.')[0]);
  const sensor=id=>['sensor','binary_sensor'].includes(id.split('.')[0]);
  const old=api.getSharedState();
  function publish(s){
    if(new TextEncoder().encode(JSON.stringify(s)).length>262144){api.publishSharedState({status:'목록 용량 초과',controls:[],sensors:[],entities:{}});return;}
    api.publishSharedState(s);
  }
  const empty=status=>({status,controls:[],sensors:[],entities:{},groups:{},devices:{}});
  const send=(id,type)=>api.sendSocket({id,type});
  if(event.type==='start'){memory.next=10;publish(empty('연결 중'));api.connectSocket('ha');return;}
  if(event.type==='serviceMessage'){
    const id=event.response?.message?.entity;
    if(old.status!=='연결됨'||!valid(id)||!control(id)||!Object.hasOwn(old.entities||{},id))return;
    const entry=old.entities[id],domain=id.split('.')[0];
    if(['unknown','unavailable',''].includes(entry.value))return;
    const operation=domain==='automation'?'trigger':domain==='button'||domain==='input_button'?'press':domain==='script'||domain==='scene'?'turn_on':'toggle';
    memory.next=(memory.next||10)+1;
    api.sendSocket({id:memory.next,type:'call_service',domain,service:operation,target:{entity_id:id}});return;
  }
  if(event.type!=='socketEvent')return;
  const response=event.response||{};
  if(response.event==='open'){memory.next=10;publish(empty('기기 조회 중'));send(1,'config/device_registry/list');return;}
  if(response.event!=='message'){publish(empty(response.event==='reconnecting'?'재연결 중':'연결 끊김'));return;}
  let m;try{m=JSON.parse(response.body);}catch{return;}
  if(!m||typeof m!=='object')return;
  if(m.type==='result'&&m.id===1){
    const next=empty('기기 조회 중');
    for(const d of Array.isArray(m.result)?m.result:[]){const id=clean(d?.id,64),name=clean(d?.name_by_user||d?.name);if(/^[a-f0-9]{32}$/.test(id)&&name)next.devices[id]=name;}
    publish(next);send(2,'config/entity_registry/list_for_display');return;
  }
  if(m.type==='result'&&m.id===2){
    const next={...old,groups:{},devices:{}};
    for(const e of Array.isArray(m.result?.entities)?m.result.entities:[]){
      if(valid(e?.ei)&&(control(e.ei)||sensor(e.ei))){
        const device=clean(e.di,64);if(/^[a-f0-9]{32}$/.test(device))next.groups[e.ei]=old.devices?.[device]||'기기 '+device.slice(0,8);
      }
    }
    publish(next);send(3,'subscribe_entities');return;
  }
  if(m.type==='result'&&m.id===3&&m.success===false){publish(empty('상태 구독 실패'));return;}
  if(m.type==='result'&&m.id>10&&m.success===false){publish({...old,commandError:'HA 제어 실패'});return;}
  if(m.type!=='event'||m.id!==3||!m.event||old.status==='목록 용량 초과')return;
  const changes=m.event,entities={...(old.entities||{})};
  const merge=(id,part,removed,reset)=>{
    if(!valid(id)||!(sensor(id)||control(id)))return;
    const prior=reset?{}:entities[id];if(!prior)return;
    const a=part?.a||{},record={...prior};
    if(typeof part?.s==='string')record.value=clean(part.s,80);
    if(Object.hasOwn(a,'friendly_name'))record.label=clean(a.friendly_name)||id.slice(0,100);
    if(Object.hasOwn(a,'unit_of_measurement'))record.unit=clean(a.unit_of_measurement,20);
    if(Object.hasOwn(a,'device_class'))record.kind=clean(a.device_class,40);
    if(Array.isArray(removed?.a))for(const key of removed.a){
      if(key==='friendly_name')record.label=id.slice(0,100);
      if(key==='unit_of_measurement')record.unit='';
      if(key==='device_class')record.kind='';
    }
    entities[id]={label:record.label||id.slice(0,100),value:record.value||'unknown',unit:record.unit||'',kind:record.kind||''};
  };
  for(const [id,part] of Object.entries(changes.a||{}))merge(id,part,null,true);
  for(const [id,part] of Object.entries(changes.c||{}))merge(id,part?.['+'],part?.['-'],false);
  if(Array.isArray(changes.r))for(const id of changes.r)if(valid(id))delete entities[id];
  const controls=[],sensors=[];
  for(const [id,e] of Object.entries(entities)){
    const group=old.groups?.[id]||(sensor(id)?'기기 미분류 센서':'기기 미분류 제어');
    (sensor(id)?sensors:controls).push({value:id,label:e.label,group});
  }
  publish({...old,status:'연결됨',entities,controls,sensors});
}
function controlKey(event,settings,state,memory,api){
  const shared=api.getSharedState(),id=settings.entity,entry=shared.entities?.[id];
  const ready=shared.status==='연결됨'&&entry&&!['unknown','unavailable'].includes(entry.value);
  if(event.type==='press'&&ready){api.sendServiceMessage({entity:id});return;}
  if(!['appear','settings','sharedState','tick'].includes(event.type))return;
  const active=ready&&entry.value==='on',name=(entry?.label||'기기 선택').slice(0,30);
  const value=ready?(entry.value==='on'?'켜짐':entry.value==='off'?'꺼짐':entry.value):id?(shared.status==='연결됨'?'사용 불가':shared.status||'연결 안 됨'):'설정 필요';
  const frame=JSON.stringify([name,value,active]);if(memory.frame===frame&&event.type!=='appear'&&event.type!=='settings')return;memory.frame=frame;
  api.setTitle('');api.setState(active?1:0);
  api.drawKey({width:144,height:144,background:'#121820',commands:[
    {type:'circle',x:72,y:44,radius:25,color:active?'#39AF80':'#657384'},
    {type:'line',x:72,y:26,toX:72,toY:43,width:4,color:'#FFFFFF'},
    {type:'text',x:72,y:83,text:value.slice(0,24),size:24,bold:true,color:active?'#6EF3BC':'#FFFFFF'},
    {type:'text',x:72,y:120,text:name,size:17,color:'#CFD7E2'}
  ]});
}
function sensorKey(event,settings,state,memory,api){
  const shared=api.getSharedState(),ids=Array.isArray(settings.entities)?settings.entities:[],mode=settings.mode;
  if(event.type==='settings'||event.type==='appear'){memory.index=0;memory.since=Date.now();}
  if(event.type==='press'&&mode==='press'&&ids.length>1){memory.index=((memory.index||0)+1)%ids.length;memory.since=Date.now();}
  if(event.type==='tick'&&mode==='auto'&&ids.length>1&&Date.now()-(memory.since||0)>=settings.seconds*1000){
    memory.index=((memory.index||0)+1)%ids.length;memory.since=Date.now();
  }
  if(!['appear','settings','sharedState','tick','press'].includes(event.type))return;
  const selected=mode==='all'?ids:ids.length?[ids[(memory.index||0)%ids.length]]:[];
  const color=settings.color||'#FFFFFF',commands=[];
  const add=(text,y,size,c,bold=false)=>commands.push({type:'text',x:72,y,text:String(text).slice(0,80),size,color:c,bold});
  if(!selected.length){add('센서 선택',72,24,'#CFD7E2',true);}
  else if(shared.status!=='연결됨'){add(shared.status||'연결 안 됨',72,22,'#CFD7E2',true);}
  else {
    const h=144/selected.length;
    selected.forEach((id,i)=>{
      const row=shared.entities?.[id],label=(row?.label||id).slice(0,35);
      let value=row?.value??'unknown';
      if(value==='unknown'||value==='unavailable')value='—';
      else if(id.startsWith('binary_sensor.'))value=value==='on'?'감지 / 열림':value==='off'?'정상 / 닫힘':value;
      else if(value!==''&&Number.isFinite(Number(value))&&settings.decimals>=0)value=Number(value).toFixed(settings.decimals);
      if(settings.unit&&row?.unit&&value!=='—')value+=' '+row.unit;
      if(settings.labels)add(label,i*h+h*0.26,selected.length===1?20:13,'#CFD7E2');
      add(value,i*h+h*(settings.labels?0.66:0.5),Math.min(settings.fontSize,selected.length===1?48:selected.length===2?34:24),color,true);
    });
  }
  const frame=JSON.stringify(commands);if(memory.frame===frame&&event.type!=='appear'&&event.type!=='settings')return;memory.frame=frame;
  api.setTitle('');api.drawKey({width:144,height:144,background:'#121820',commands});
}
function createHomeAssistantManifest(server){
  if(typeof server!=='string'||server.length>1024)throw Error('HA 주소를 확인하세요.');
  const u=new URL(server.trim());
  if(!['https:','wss:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||!['/','/api/websocket'].includes(u.pathname))throw Error('HTTPS/WSS 서버 주소만 지원합니다.');
  u.protocol='wss:';u.pathname='/api/websocket';
  const script=f=>'return ('+f.toString()+')(event,settings,state,memory,api);';
  const select=(key,label,value,options)=>({key,label,type:'select',default:value,options:options.map(([value,label])=>({value,label}))});
  return {apiVersion:2,id:ID,name:'DeckForge Home Assistant',version:'0.1.0',requiresDeckForge:'>=1.1.172',
    permissions:['display','background.run','network.websocket','timer.tick'],
    networkEndpoints:[{id:'ha',url:u.href,method:'WSS',auth:'home-assistant',reconnect:true,maxReceiveBytes:262144}],
    service:{script:script(service),sharedStateBytes:262144},
    actions:[
      {id:ID+'.control',name:'HA 기기 제어',controllers:['Keypad'],states:2,script:script(controlKey),
       settingsSchema:[{key:'entity',label:'기기 선택',type:'dynamicSelect',source:'controls',default:''}]},
      {id:ID+'.sensor',name:'HA 센서 표시',controllers:['Keypad'],states:1,script:script(sensorKey),tickIntervalMs:1000,
       settingsSchema:[
         {key:'entities',label:'표시 항목',type:'dynamicMultiSelect',source:'sensors',maxItems:4,default:[]},
         select('mode','표시 방식','all',[['all','동시에 표시'],['press','누를 때 전환'],['auto','자동 전환']]),
         {key:'seconds',label:'자동 전환 간격 (초)',type:'integer',min:2,max:60,default:5},
         {key:'labels',label:'항목 이름 표시',type:'boolean',default:true},
         {key:'unit',label:'측정 단위 표시',type:'boolean',default:true},
         {key:'decimals',label:'소수점 (-1: 원본)',type:'integer',min:-1,max:3,default:-1},
         {key:'fontSize',label:'측정값 크기',type:'integer',min:16,max:48,default:36},
         select('color','측정값 색상','#FFFFFF',[['#FFFFFF','흰색'],['#65BDFF','하늘색'],['#FFAD55','주황'],['#86D99A','연두']])
       ]}
    ]};
}
module.exports={createHomeAssistantManifest,service,controlKey,sensorKey};
