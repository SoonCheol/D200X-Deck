'use strict';
// Private stdio MCP server: Fusion's existing localhost command catalogue ->
// read-only inspection and a user-imported D200X batch JSON. No direct profile
// modification, UI automation, shell evaluation, or Fusion command execution.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const readline=require('node:readline');
const B=require('../../app/streamdeck-editor/fusion-batch.js');
const PROTOCOL='2025-06-18';
const MAX_BODY=5*1024*1024;
function endpointFile(env=process.env,home=os.homedir()){
  return path.join(env.LOCALAPPDATA||path.join(home,'AppData','Local'),
    'FusionStreamDeck','endpoint.json');
}
async function findEndpoint({readFile=fs.readFile,env=process.env,home=os.homedir()}={}){
  const d=JSON.parse(await readFile(endpointFile(env,home),'utf8'));
  if(d.status!=='running'||!Number.isInteger(d.port)||d.port<=0||d.port>65535)
    throw Error('Fusion 360 애드인이 실행되지 않았거나 endpoint 파일이 유효하지 않습니다.');
  return 'http://127.0.0.1:'+d.port;
}
async function catalogue(query='',refresh=false,{fetcher=globalThis.fetch,discovery=findEndpoint}={}){
  if(typeof query!=='string'||query.length>120)throw Error('검색어가 너무 깁니다.');
  const endpoint=await discovery();
  const url=new URL('/commands',endpoint);
  if(query)url.searchParams.set('q',query);
  if(refresh)url.searchParams.set('refresh','1');
  const reply=await fetcher(url,{signal:AbortSignal.timeout(7000)});
  if(!reply.ok)throw Error('Fusion 명령 조회 실패: HTTP '+reply.status);
  const length=Number(reply.headers?.get?.('content-length')||0);
  if(length>MAX_BODY)throw Error('명령 목록 크기 제한 초과');
  const text=await reply.text();
  if(Buffer.byteLength(text)>MAX_BODY)throw Error('명령 목록 크기 제한 초과');
  const obj=JSON.parse(text);
  if(!obj.ok||!Array.isArray(obj.commands))throw Error('Fusion 명령 응답 형식 오류');
  return obj.commands.filter(v=>v&&typeof v.id==='string'&&
    v.id.length<=256&&typeof v.name==='string'&&v.name.length<=160)
    .map(v=>({id:v.id,name:v.name,tooltip:typeof v.tooltip==='string'?v.tooltip.slice(0,300):''}));
}
function selectCommands(available,args){
  if(!Array.isArray(available))throw Error('Fusion 명령 목록이 없습니다.');
  const all=args.all===true;
  const ids=args.command_ids;
  if(all===Array.isArray(ids))throw Error('all:true 또는 command_ids 배열 중 하나만 지정하세요.');
  if(ids&&(!ids.length||ids.length>B.MAX||ids.some(id=>typeof id!=='string')))
    throw Error('명령 ID 개수가 허용 범위를 초과했습니다.');
  const byId=new Map(available.map(x=>[x.id,x]));
  const selected=all?available:ids.map(id=>{
    const found=byId.get(id);
    if(!found)throw Error('현재 Fusion에서 찾을 수 없는 명령: '+id);
    return found;
  });
  const unique=new Map(selected.map(x=>[x.id,{id:x.id,name:x.name}]));
  if(!unique.size||unique.size>B.MAX)throw Error('등록 가능한 명령 개수는 1~'+B.MAX+'개입니다.');
  return Array.from(unique.values());
}
async function exportBatch(args,{getCommands=catalogue,writeFile=fs.writeFile,
  mkdir=fs.mkdir,env=process.env,home=os.homedir(),now=new Date()}={}){
  const entries=await getCommands('',true);
  const commands=selectCommands(entries,args);
  const name=typeof args.profile_name==='string'&&args.profile_name.trim()?
    args.profile_name.trim().slice(0,80):'Fusion 360 명령';
  const payload=B.validate({format:B.FORMAT,pluginUUID:B.PLUGIN,
    actionUUID:B.ACTION,profileName:name,commands});
  const output=env.D200X_FUSION_BATCH_DIR||path.join(home,'Downloads');
  await mkdir(output,{recursive:true});
  const stamp=now.toISOString().replace(/[:.]/g,'-');
  const destination=path.join(output,'D200X-Fusion-Commands-'+stamp+'.json');
  await writeFile(destination,JSON.stringify(payload,null,2)+'\n',{flag:'wx',encoding:'utf8',mode:0o600});
  return {path:destination,count:commands.length,pages:Math.ceil(commands.length/14),
    profile:payload.profileName,warning:'D200X 편집기에서 JSON을 가져와야 실제 버튼에 적용됩니다.'};
}
const TOOLS=[
 {name:'fusion_list_commands',description:'Fusion 360 애드인이 제공하는 현재 작업공간 명령을 검색합니다. 읽기 전용.',
  inputSchema:{type:'object',properties:{query:{type:'string'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100},refresh:{type:'boolean'}},additionalProperties:false}},
 {name:'fusion_export_batch',description:'선택한 Fusion 명령을 14키/페이지 D200X 새 프로필용 JSON으로 출력합니다. 기존 설정을 건드리지 않으며 D200X 앱에서 명시적 가져오기가 필요합니다.',
  inputSchema:{type:'object',properties:{all:{type:'boolean'},command_ids:{type:'array',items:{type:'string'},maxItems:1792},profile_name:{type:'string',maxLength:80}},
    additionalProperties:false}}
];
function reply(id,result){return {jsonrpc:'2.0',id,result};}
function content(value){return {content:[{type:'text',text:JSON.stringify(value,null,2)}]};}
async function dispatch(msg,{getCommands=catalogue,exporter=exportBatch}={}){
  if(msg.method==='initialize')return reply(msg.id,{protocolVersion:PROTOCOL,
    capabilities:{tools:{listChanged:false}},serverInfo:{name:'d200x-fusion-bulk',version:'0.1.0'}});
  if(msg.method==='ping')return reply(msg.id,{});
  if(msg.method==='tools/list')return reply(msg.id,{tools:TOOLS});
  if(msg.method==='tools/call'){
    try{
      const a=msg.params?.arguments||{};
      if(msg.params?.name==='fusion_list_commands'){
        const found=await getCommands(a.query||'',a.refresh===true);
        const start=Number.isInteger(a.offset)&&a.offset>=0?a.offset:0;
        const size=Number.isInteger(a.limit)?Math.max(1,Math.min(100,a.limit)):50;
        return reply(msg.id,content({total:found.length,offset:start,commands:found.slice(start,start+size)}));
      }
      if(msg.params?.name==='fusion_export_batch')
        return reply(msg.id,content(await exporter(a)));
      throw Error('존재하지 않는 MCP 도구입니다.');
    }catch(e){return reply(msg.id,{isError:true,content:[{type:'text',text:String(e.message||e)}]});}
  }
  if(msg.id!==undefined)return {jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}};
  return null;
}
if(require.main===module){
  const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  rl.on('line',async line=>{
    try{
      const msg=JSON.parse(line);
      const result=await dispatch(msg);
      if(result)process.stdout.write(JSON.stringify(result)+'\n');
    }catch(error){
      process.stderr.write('MCP 요청 처리 오류: '+String(error.message||error)+'\n');
    }
  });
}
module.exports={endpointFile,findEndpoint,catalogue,selectCommands,exportBatch,dispatch};
