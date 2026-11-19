'use strict';
const RESOURCE='https://api.openai.com/v1';
const MAX_TEXT=120000,MAX_INPUT=60000;
function errorFor(code,status){
  if(code==='subscription_sharing_usage_limit_exceeded'||code==='subscription_sharing_usage_unavailable'||status===429)return Error('ChatGPT 구독 또는 앱 사용량 한도를 확인하세요. 유료 API로 전환하지 않습니다.');
  if(status===401||code==='subscription_sharing_invalid_user')return Object.assign(Error('ChatGPT 연결이 만료되었거나 해제되었습니다. 다시 로그인하세요.'),{code:'signed-out'});
  if(code==='subscription_sharing_user_not_eligible')return Error('이 계정에서 구독 연동을 사용할 수 없습니다.');
  if(code==='subscription_sharing_unsupported_capability')return Error('선택한 모델 또는 요청 기능이 구독 연동에서 지원되지 않습니다.');
  return Error('ChatGPT 요청 실패'+(status?' (HTTP '+status+')':'')+'. 다시 시도하세요.');
}
async function checked(response){if(response.ok)return response;let data;try{data=await response.json();}catch{}throw errorFor(data?.error?.code,response.status);}
function modelsOf(body){
  if(!Array.isArray(body?.models))throw Error('ChatGPT 모델 목록 형식 오류');
  return body.models.filter(m=>m?.visibility==='list'&&typeof m.slug==='string'&&m.slug.length<=100&&/^[a-zA-Z0-9._:-]+$/.test(m.slug)).map(m=>({id:m.slug,label:typeof m.display_name==='string'?m.display_name.slice(0,100):m.slug}));
}
async function listModels(token,fetcher=fetch,signal){
  const r=await checked(await fetcher(RESOURCE+'/models',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)}));
  return modelsOf(await r.json());
}
async function* sse(body){
  if(!body)throw Error('응답 스트림이 없습니다.');
  const decoder=new TextDecoder();let buffer='',data=[],size=0;
  for await(const chunk of body){
    buffer+=decoder.decode(chunk,{stream:true});
    if(buffer.length>MAX_TEXT*2)throw Error('응답 크기 제한 초과');
    let pos;
    while((pos=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,pos).replace(/\r$/,'');buffer=buffer.slice(pos+1);
      if(line===''){if(data.length){const raw=data.join('\n');data=[];size=0;if(raw!=='[DONE]')yield JSON.parse(raw);}}
      else if(line.startsWith('data:')){const part=line.slice(5).replace(/^ /,'');size+=part.length;if(size>MAX_TEXT*2)throw Error('이벤트 크기 제한 초과');data.push(part);}
    }
  }
  // Require a properly framed terminal SSE event; partial data is never success.
}
function cleanHistory(messages){
  if(!Array.isArray(messages))throw Error('대화 형식 오류');
  const result=[];let size=0;
  for(const m of messages.slice(-40).reverse()){
    if(!['user','assistant'].includes(m?.role)||typeof m.content!=='string'||!m.content.trim()||m.content.length>MAX_TEXT)throw Error('대화 내용 형식 오류');
    if(size+m.content.length>MAX_INPUT){if(!result.length)throw Error('입력 크기 제한 초과');break;}
    size+=m.content.length;result.unshift({role:m.role,content:m.content});
  }
  if(result.at(-1)?.role!=='user')throw Error('사용자 메시지가 필요합니다.');
  return result;
}
const tools=[{type:'namespace',name:'deckforge',description:'DeckForge 읽기 전용 로컬 조회',tools:[{type:'function',name:'get_version',description:'현재 실행 중인 DeckForge 버전 조회',parameters:{type:'object',properties:{},additionalProperties:false,required:[]},strict:true}]}];
async function turn({token,model,input,toolTest,signal,emit=()=>{},fetcher=fetch}){
  const request={model,input,store:false,stream:true,instructions:'You are DeckForge AI. Reply in Korean unless asked otherwise. No PC control or access is available except explicitly supplied tools. Never invent tool results.',...(toolTest?{tools,include:['reasoning.encrypted_content']}: {})};
  const response=await checked(await fetcher(RESOURCE+'/responses',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(request),signal}));
  let text='',completed;
  for await(const event of sse(response.body)){
    signal?.throwIfAborted();
    if(event.type==='response.output_text.delta'&&typeof event.delta==='string'){
      text+=event.delta;if(text.length>MAX_TEXT)throw Error('응답 크기 제한 초과');emit({type:'delta',text:event.delta});
    }else if(event.type==='response.failed'||event.type==='error')throw errorFor(event.response?.error?.code||event.code||event.error?.code);
    else if(event.type==='response.incomplete')throw Error('응답이 완료되지 않았습니다.');
    else if(event.type==='response.completed'){completed=event.response;break;}
  }
  if(!completed||completed.status&&completed.status!=='completed')throw Error('응답 완료 이벤트를 받지 못했습니다.');
  return {text,output:Array.isArray(completed.output)?completed.output:[],usage:completed.usage};
}
async function chat({token,model,messages,toolTest=false,version,signal,emit,fetcher=fetch}){
  let input=cleanHistory(messages),called=false,text='',usage;
  for(let i=0;i<2;i++){
    const result=await turn({token,model,input,toolTest,signal,emit,fetcher});text+=result.text;usage=result.usage;
    const calls=result.output.filter(o=>o.type==='function_call');
    if(!calls.length)return {text,called,usage};
    if(!toolTest||called||calls.length!==1)throw Error('허용되지 않은 함수 호출 횟수입니다.');
    const c=calls[0];
    if(!['get_version','deckforge.get_version'].includes(c.name)||(c.namespace!=null&&c.namespace!=='deckforge')||typeof c.call_id!=='string'||c.call_id.length>200||typeof c.arguments!=='string'||c.arguments.length>100)throw Error('허용되지 않은 함수 호출입니다.');
    const args=JSON.parse(c.arguments);if(!args||Array.isArray(args)||typeof args!=='object'||Object.keys(args).length)throw Error('잘못된 함수 인자입니다.');
    signal?.throwIfAborted();called=true;emit?.({type:'tool',name:'get_version',version});
    // Carry response output items forward over HTTP; no previous_response_id.
    input=[...input,...result.output,{type:'function_call_output',call_id:c.call_id,output:JSON.stringify({version})}];
  }
  throw Error('함수 호출 반복 제한에 도달했습니다.');
}
module.exports={modelsOf,listModels,sse,cleanHistory,chat,errorFor};
