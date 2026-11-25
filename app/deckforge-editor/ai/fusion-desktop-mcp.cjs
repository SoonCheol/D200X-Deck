'use strict';
// Fixed local Fusion MCP operations. No renderer/model-supplied Python or URL.
const URL='http://127.0.0.1:27182/mcp';
const MAX=16*1024*1024;
const SCRIPT_TOOL='fusion_mcp_execute';
async function readReply(response,id){
 if(!response.ok||!response.body)throw Error('Fusion MCP HTTP '+response.status);
 const reader=response.body.getReader(),decoder=new TextDecoder();
 const sse=(response.headers.get('content-type')||'').includes('text/event-stream');
 let text='',bytes=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done){text+=decoder.decode();break;}
   bytes+=value.byteLength;if(bytes>MAX)throw Error('Fusion MCP response too large');
   text+=decoder.decode(value,{stream:true});
   if(sse){
    let match;
    while((match=/\r?\n\r?\n/.exec(text))){
     const event=text.slice(0,match.index);text=text.slice(match.index+match[0].length);
     const data=event.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
     if(data){const row=JSON.parse(data);if(row.id===id)return row;}
    }
   }
  }
  if(sse){
   const data=text.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
   if(data){const row=JSON.parse(data);if(row.id===id)return row;}
   throw Error('Fusion MCP response missing');
  }
  const row=JSON.parse(text);if(row.id!==id)throw Error('Fusion MCP response ID mismatch');return row;
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
function createClient(fetcher=fetch){
 async function execute(script,readOnly,signal){
  const headers={Accept:'application/json, text/event-stream','Content-Type':'application/json'};
  let next=0;
  async function call(method,params,timeout=15000,notify=false){
   signal?.throwIfAborted();
   const body={jsonrpc:'2.0',method,params};
   if(!notify)body.id=++next;
   const deadline=AbortSignal.timeout(timeout);
   const response=await fetcher(URL,{method:'POST',headers:{...headers},body:JSON.stringify(body),redirect:'error',signal:signal?AbortSignal.any([deadline,signal]):deadline});
   if(method==='initialize'){
    const session=response.headers.get('mcp-session-id');
    if(session)headers['Mcp-Session-Id']=session;
   }
   if(notify){if(!response.ok)throw Error('Fusion MCP notification failed');await response.body?.cancel();return;}
   const reply=await readReply(response,body.id);
   if(reply.error||!reply.result)throw Error('Fusion MCP '+method+' failed');
   return reply.result;
  }
  const init=await call('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'DeckForge',version:'1.0'}},5000);
  if(!init.capabilities?.tools||!['2025-11-25','2025-06-18','2025-03-26'].includes(init.protocolVersion))throw Error('Fusion MCP protocol unavailable');
  headers['MCP-Protocol-Version']=init.protocolVersion;
  await call('notifications/initialized',{},5000,true);
  const tools=await call('tools/list',{});
  if(!tools.tools?.some(t=>t.name===SCRIPT_TOOL&&t.inputSchema?.properties?.featureType?.enum?.includes('script')))throw Error('Fusion MCP script tool unavailable');
  const result=await call('tools/call',{name:SCRIPT_TOOL,arguments:{featureType:'script',object:{script,readOnly}}},90000);
  if(result.isError)throw Error('Fusion MCP script rejected');
  const block=result.content?.find(x=>x.type==='text'&&typeof x.text==='string');
  const output=JSON.parse(block?.text||'null');
  if(output?.success!==true||typeof output.message!=='string')throw Error('Fusion MCP script failed');
  return JSON.parse(output.message);
 }
 return {
  ensureAddin(folder,signal){
   if(typeof folder!=='string'||!folder.endsWith('FusionStreamDeck')||folder.length>1024)throw Error('Invalid add-in folder');
   // JSON string escaping is valid for the Windows path in a Python string literal.
   const script='import adsk.core\nimport json\n\ndef run(_context):\n    scripts = adsk.core.Application.get().scripts\n    folder = '+JSON.stringify(folder)+'\n    s = scripts.itemByPath(folder)\n    registered = False\n    if not s:\n        s = scripts.addExisting(folder)\n        registered = bool(s)\n    if not s or not s.isAddIn or s.name.lower() != "fusionstreamdeck":\n        raise RuntimeError("Expected add-in not found")\n    s.isRunOnStartup = True\n    before = s.isRunning\n    requested = True if before else s.run(False)\n    print(json.dumps({"registered": registered, "runningBefore": before, "requested": requested, "startup": s.isRunOnStartup}))\n';
   return execute(script,false,signal);
  },
  async listCommands(signal){
   const script='import adsk.core\nimport json\n\ndef run(_context):\n    defs = adsk.core.Application.get().userInterface.commandDefinitions\n    rows = []\n    errors = 0\n    for c in defs:\n        try:\n            cid = c.id\n            name = c.name\n        except Exception:\n            errors += 1\n            continue\n        try:\n            tooltip = c.tooltip or ""\n        except Exception:\n            errors += 1\n            tooltip = ""\n        rows.append({"id": cid, "name": name, "tooltip": tooltip[:4000]})\n    print(json.dumps({"commands": rows, "errors": errors, "count": defs.count}, ensure_ascii=False))\n';
   const result=await execute(script,true,signal);
   if(!Array.isArray(result?.commands)||result.commands.length>30000)throw Error('Invalid Fusion command catalogue');
   return result;
  }
 };
}
function plainTooltip(value){
 return typeof value==='string'?value.replace(/<br\s*\/?>/gi,'\n').replace(/<\/p\s*>/gi,'\n\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/gi,' ').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&amp;/gi,'&').trim():'';
}
module.exports={createClient,plainTooltip};
