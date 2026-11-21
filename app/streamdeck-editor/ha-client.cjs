'use strict';
// Home Assistant REST integration: no credentials in profile/action JSON.
const ID=/^(light|switch|fan|input_boolean)\.[a-z0-9_]+$/;
function normalizeUrl(value){
  const u=new URL(String(value||'').trim());
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)
    throw new Error('Home Assistant 주소는 http(s) 서버 URL이어야 합니다.');
  if(u.pathname!=='/'&&u.pathname!=='')throw new Error('서버 주소에 경로를 포함하지 마세요.');
  return u.origin;
}
function validateEntity(value){
  if(typeof value!=='string'||!ID.test(value))throw new Error('지원하는 엔티티 ID(light/switch/fan/input_boolean)가 아닙니다.');
  return value;
}
async function request(config,endpoint,{method='GET',data,fetcher=globalThis.fetch}={}){
  if(!config?.url||!config?.token)throw new Error('Home Assistant 연결 설정이 필요합니다.');
  const url=normalizeUrl(config.url)+endpoint;
  const response=await fetcher(url,{
    method,headers:{Authorization:'Bearer '+config.token,Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})},
    ...(data?{body:JSON.stringify(data)}:{}),
    signal:AbortSignal.timeout(7000)
  });
  if(!response.ok)throw new Error('Home Assistant HTTP '+response.status);
  const text=await response.text();
  try{return text?JSON.parse(text):null;}catch{throw new Error('Home Assistant 응답이 JSON이 아닙니다.');}
}
async function test(config,fetcher){return request(config,'/api/',{fetcher});}
async function listEntities(config,fetcher){
  const states=await request(config,'/api/states',{fetcher});
  if(!Array.isArray(states))throw new Error('엔티티 목록 형식이 올바르지 않습니다.');
  return states.filter(x=>x&&ID.test(x.entity_id)).map(x=>({
    entity_id:x.entity_id,state:String(x.state||''),
    name:String(x.attributes?.friendly_name||x.entity_id).slice(0,120)
  })).slice(0,2000);
}
async function toggle(config,entityId,fetcher){
  const id=validateEntity(entityId),domain=id.split('.')[0];
  await request(config,'/api/services/'+domain+'/toggle',{
    method:'POST',data:{entity_id:id},fetcher
  });
  return true;
}
module.exports={normalizeUrl,validateEntity,request,test,listEntities,toggle};
