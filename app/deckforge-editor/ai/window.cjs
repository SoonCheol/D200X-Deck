'use strict';
const path=require('node:path');
const fs=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
const {BrowserWindow,ipcMain,safeStorage,shell,app,screen,Menu}=require('electron');
const {ChatAuth}=require('./auth.cjs');
const {listModels,chat}=require('./responses.cjs');
const {prepareAttachments}=require('./attachments.cjs');

const FusionSetup=require('./fusion-setup.js');
function formatSaveReceipt(result){
  if(!result?.saved)return '변경안 저장 실패 · 저장 성공을 확인하지 못했습니다.';
  const names={put:'등록',update:'수정',delete:'삭제',copy:'복사',move:'이동',move_source:'이동 원본',add_page:'페이지 추가',folder_page:'덱폴더 페이지 추가',folder_settings:'덱폴더 설정',control:'물리 컨트롤',wide:'와이드 화면',composite:'복합 동작',state_design:'상태별 디자인',plugin:'플러그인 등록',page_structure:'페이지 구조 변경',profile_build:'새 프로필 생성',template_save:'템플릿 저장',template_apply:'템플릿으로 새 프로필 생성'};
  const clean=v=>String(v??'').replace(/[\r\n\t]/g,' ').slice(0,160);
  const lines=(result.rows||[]).map(row=>{
    const location=[row.page==null?(row.op==='template_save'?'사용자 템플릿':'새 프로필'):'페이지 '+row.page,row.folder?'폴더 '+clean(row.folder):'',row.slot?'버튼 '+row.slot:'',clean(row.control),clean(row.state)].filter(Boolean).join(' / ');
    return location+' · '+(names[row.op]||'변경')+(row.action?'\n  액션: '+clean(row.action)+'\n  제목: '+(clean(row.title)||'없음')+(row.value?'\n  등록 내용: '+clean(row.value):''):'');
  });
  return ['등록 및 저장 완료 · '+lines.length+'개 변경 사항','',lines.join('\n\n'),'',result.refreshError?'화면 또는 D200X 동기화 확인 필요':'D200X 동기화 요청 완료 · 실제 실행 여부는 별도 확인'].join('\n');
}
function registerAiWindow(assertEditor,newReadSession,editorEdits,runFusionSetup){
  let panel=null,auth=null,active=null,catalog=[],history=null,historyBusy=false,pending=null,undoId=null;
  const discardPending=async()=>{const old=pending;pending=null;if(old)await editorEdits.discard(old.id).catch(()=>{});};
  const dir=()=>path.join(app.getPath('userData'),'AI');
  const connection=()=>auth??=new ChatAuth({directory:dir(),safeStorage,openExternal:url=>shell.openExternal(url)});
  const send=payload=>{if(panel&&!panel.isDestroyed()&&!panel.webContents.isDestroyed())panel.webContents.send('deckforge-ai:event',payload);};
  function allowed(event){
    if(!panel||panel.isDestroyed()||event.sender!==panel.webContents||event.senderFrame!==panel.webContents.mainFrame)throw Error('허용되지 않은 AI 호출입니다.');
  }
  function idle(){if(active||historyBusy)throw Error('진행 중인 작업을 먼저 종료하세요.');}
  function begin(kind){
    idle();const controller=new AbortController();const job={kind,controller};active=job;return job;
  }
  function finish(job){if(active===job)active=null;}
  async function loadHistory(){
    if(history)return history;
    if(!safeStorage.isEncryptionAvailable())throw Error('보안 저장 기능을 사용할 수 없습니다.');
    try{
      const data=JSON.parse(safeStorage.decryptString(await fs.readFile(path.join(dir(),'history.enc'))));
      if(!Array.isArray(data)||data.length>100)throw Error('invalid');
      history=data;return history;
    }catch(e){if(e.code!=='ENOENT')throw Error('AI 대화 기록을 읽지 못했습니다. 기존 파일은 보존됩니다.');}
    return history=[];
  }
  async function saveHistory(value){
    if(!safeStorage.isEncryptionAvailable())throw Error('보안 저장 기능을 사용할 수 없습니다.');
    await fs.mkdir(dir(),{recursive:true});
    const file=path.join(dir(),'history.enc'),tmp=file+'.'+randomUUID()+'.tmp';
    const plain=JSON.stringify(value);if(Buffer.byteLength(plain)>12*1024*1024)throw Error('대화 기록 용량 제한에 도달했습니다. 오래된 대화를 삭제하세요.');
    try{await fs.writeFile(tmp,safeStorage.encryptString(plain),{flag:'wx',mode:0o600});await fs.rename(tmp,file);history=value;}
    finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
  }
  async function handle(name,fn,event,arg){
    allowed(event);
    try{return {ok:true,value:await fn(arg)};}
    catch(error){
      // Do not echo HTTP bodies, token-bearing URLs, or arbitrary server errors.
      const message=error?.name==='AbortError'?'작업을 중지했습니다.':error?.name==='TimeoutError'?'연결 시간이 초과되었습니다.':String(error?.message||'오류');
      return {ok:false,error:!(error instanceof SyntaxError)&&/^[가-힣A-Za-z0-9 .·()\/,:?]+$/.test(message)&&/[가-힣]/.test(message)?message.slice(0,220):'AI 요청을 완료하지 못했습니다. 연결 상태를 확인하세요.'};
    }
  }
  // Receipts are local facts. History write failure must never turn a successful
  // profile save into an apparent failed apply or let the user apply twice.
  async function appendSaveReceipt(conversationId,result){
    const receipt={role:'assistant',local:true,receipt:true,content:formatSaveReceipt(result)};
    let conversation=null;
    try{
      const all=await loadHistory(),old=all.find(c=>c.id===conversationId);
      if(!old)return {receipt,historySaved:false};
      conversation={...old,messages:[...old.messages,receipt],updated:Date.now()};
      await saveHistory([conversation,...all.filter(c=>c.id!==conversationId)]);
      return {receipt,conversation,historySaved:true};
    }catch{return {receipt,conversation,historySaved:false};}
  }
  let preferences=null;
  async function readPreferences(){
    if(preferences)return preferences;
    const defaults={read:false,edit:false};
    try{
      const raw=JSON.parse(await fs.readFile(path.join(dir(),'preferences.json'),'utf8'));
      return preferences={read:raw.read===true||raw.edit===true,edit:raw.edit===true};
    }catch{return preferences=defaults;}
  }
  async function savePreferences(value){
    if(!value||typeof value.read!=='boolean'||typeof value.edit!=='boolean'||Object.keys(value).length!==2)throw Error('조회 설정 형식 오류');
    const next={read:value.read||value.edit,edit:value.edit},file=path.join(dir(),'preferences.json'),temp=file+'.'+randomUUID()+'.tmp';
    await fs.mkdir(dir(),{recursive:true});
    try{await fs.writeFile(temp,JSON.stringify(next),{flag:'wx',mode:0o600});await fs.rename(temp,file);preferences=next;return next;}
    finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  }
  let preferenceTail=Promise.resolve();
  const handlers={
    preferences:async()=>{await preferenceTail.catch(()=>{});return readPreferences();},
    setPreferences:async value=>{const task=preferenceTail.catch(()=>{}).then(()=>savePreferences(value));preferenceTail=task;return task;},
    status:async()=>({ ...await connection().status(),busy:active?.kind||null,canUndo:!!undoId }),
    login:async()=>{
      const job=begin('login');
      try{const state=await connection().signIn(job.controller.signal);catalog=[];return state;}finally{finish(job);}
    },
    logout:async()=>{
      const job=begin('logout');try{catalog=[];return await connection().signOut();}finally{finish(job);}
    },
    models:async()=>{
      const job=begin('models');
      try{catalog=await listModels(await connection().access(job.controller.signal),fetch,job.controller.signal);return catalog;}
      catch(e){if(e.code==='signed-out'){catalog=[];await connection().clearSession();}throw e;}
      finally{finish(job);}
    },
    history:async()=>loadHistory(),
    delete:async(id)=>{
      idle();historyBusy=true;try{const all=await loadHistory();await saveHistory(all.filter(x=>x.id!==id));return history;}finally{historyBusy=false;}
    },
    send:async(args)=>{
      const job=begin('chat');let captureId=null,preview=null,keepPreview=false,previewFailure='';
      try{
        if(!args||typeof args.id!=='string'||typeof args.text!=='string'||args.text.length>12000)throw Error('모델 또는 메시지 입력을 확인하세요.');
        // Bytes are never written to encrypted history; only filenames are retained.
        const attachments=prepareAttachments(args.attachments);
        if(!args.text.trim()&&!attachments.parts.length)throw Error('메시지 또는 첨부 파일을 입력하세요.');
        const prompt=args.text.trim()||'첨부한 파일을 분석해 주세요.';
        const local=!attachments.parts.length&&FusionSetup.matches(prompt);
        if(local){if(args.localApproved!==true||typeof runFusionSetup!=='function'||pending)throw Error('로컬 연결 작업을 승인하고 기존 변경안을 먼저 처리하세요.');}
        else if(!catalog.some(m=>m.id===args.model))throw Error('모델 또는 메시지 입력을 확인하세요.');
        if(!/^[a-f0-9-]{36}$/.test(args.id))throw Error('대화 식별자 오류');
        const all=await loadHistory(),old=all.find(x=>x.id===args.id);
        if(!old&&all.length>=100)throw Error('대화 기록은 최대 100개입니다. 이전 대화를 삭제하세요.');
        const fileNote=attachments.names.length?'\n\n[첨부 파일: '+attachments.names.join(', ')+' · 원본은 대화 기록에 저장하지 않음]':'';
        const message={role:'user',content:prompt+fileNote},messages=[...(old?.messages||[]),message];
        if(messages.length>200)throw Error('이 대화의 메시지 한도에 도달했습니다. 새 대화를 시작하세요.');
        const signal=AbortSignal.any([job.controller.signal,AbortSignal.timeout(local?1800000:240000)]);
        if(local){
          const result=await runFusionSetup(signal);signal.throwIfAborted();
          const updated={id:args.id,title:old?.title||message.content.slice(0,48),messages:[...messages,{role:'assistant',local:true,content:FusionSetup.format(result)}],updated:Date.now()};
          await saveHistory([updated,...all.filter(x=>x.id!==args.id)]);
          return {conversation:updated,local:true,called:false,usage:{input_tokens:0,output_tokens:0,total_tokens:0},requests:0,toolCalls:0,preview:null,canUndo:!!undoId};
        }
        await discardPending();
        const editMode=args.editMode===true,readOnly=editMode||args.readOnly===true;
        if(editMode){captureId=randomUUID();await editorEdits.capture(captureId);}
        const result=await chat({token:await connection().access(signal),model:args.model,messages,attachments:attachments.parts,toolTest:!readOnly&&args.toolTest===true,readOnly,editMode,inspect:readOnly?newReadSession():undefined,
          propose:editMode?async(input,toolSignal)=>{
            try{
              preview=await editorEdits.prepare(captureId,input,message.content,toolSignal);
              toolSignal?.throwIfAborted();
              return {ok:true,previewReady:true,changeCount:preview.rows.length,applied:false};
            }catch(error){
              toolSignal?.throwIfAborted();
              // Only return controlled status. Raw system errors and local paths stay local.
              previewFailure=String(error?.message||'변경안 준비 실패').slice(0,200);
              return {ok:false,error:'local_preview_rejected',applied:false};
            }
          }:undefined,version:app.getVersion(),signal,emit:send});
        signal.throwIfAborted();
        if(!result.text.trim())throw Error('완료된 텍스트 응답이 없습니다.');
        const updated={id:args.id,title:old?.title||message.content.slice(0,48),messages:[...messages,{role:'assistant',content:result.text}],updated:Date.now()};
        await saveHistory([updated,...all.filter(x=>x.id!==args.id)]);
        signal.throwIfAborted();
        if(preview&&captureId){pending={id:captureId,conversationId:args.id};keepPreview=true;}
        return {conversation:updated,called:result.called,usage:result.usage,requests:result.requests,toolCalls:result.toolCalls,preview:keepPreview?preview:null,previewFailure,canUndo:!!undoId};
      }catch(e){if(e.code==='signed-out'){catalog=[];await connection().clearSession();}throw e;}
      finally{if(captureId&&!keepPreview)await editorEdits.discard(captureId).catch(()=>{});finish(job);}
    },
    applyEdit:async id=>{
      const job=begin('apply');try{
        if(typeof id!=='string'||!pending||pending.id!==id)throw Error('승인할 변경안이 없습니다.');
        const conversationId=pending.conversationId;
        let result;
        try{result=await editorEdits.apply(id);}catch(error){
          const message=String(error?.message||'').slice(0,180);
          result={saved:false,error:/^[가-힣A-Za-z0-9 .·()\/,:?]+$/.test(message)&&/[가-힣]/.test(message)?message:'저장 성공을 확인하지 못했습니다.'};
        }
        if(!result?.saved){
          return {saved:false,error:result?.error||'저장 결과를 확인하지 못했습니다.',canUndo:!!undoId,...await appendSaveReceipt(conversationId,{saved:false})};
        }
        undoId=id;pending=null;
        return {...result,canUndo:true,...await appendSaveReceipt(conversationId,result)};
      }finally{await discardPending();finish(job);}
    },
    discardEdit:async id=>{idle();if(pending?.id===id)await discardPending();return true;},
    undoEdit:async()=>{
      const job=begin('undo');try{
        if(pending||!undoId)throw Error('되돌릴 변경 사항이 없습니다.');
        const result=await editorEdits.undo(undoId);if(!result?.saved)throw Error('복구 결과를 확인하지 못했습니다.');
        undoId=null;return {...result,canUndo:false};
      }finally{finish(job);}
    },
    cancel:async()=>{if(active?.kind!=='logout')active?.controller.abort();return true;},
    usage:async()=>shell.openExternal('https://chatgpt.com/settings/usage')
  };
  for(const [name,fn] of Object.entries(handlers))ipcMain.handle('deckforge-ai:'+name,(event,arg)=>handle(name,fn,event,arg));
  const close=()=>{void discardPending();if(active?.kind!=='logout')active?.controller.abort();if(panel&&!panel.isDestroyed())panel.close();};
  ipcMain.handle('d200x:open-ai',async event=>{
    assertEditor(event);
    if(panel&&!panel.isDestroyed()){panel.show();panel.focus();return;}
    const editor=BrowserWindow.fromWebContents(event.sender),bounds=editor.getBounds(),area=screen.getDisplayMatching(bounds).workArea;
    const width=Math.min(400,area.width),height=Math.min(Math.max(580,bounds.height),area.height);
    const right=bounds.x+bounds.width,left=bounds.x-width;
    const x=right+width<=area.x+area.width?right:left>=area.x?left:Math.max(area.x,area.x+area.width-width);
    const current=new BrowserWindow({title:'DeckForge AI 도우미',x,y:Math.max(area.y,Math.min(bounds.y,area.y+area.height-height)),width,height,minWidth:Math.min(320,width),minHeight:Math.min(420,height),backgroundColor:'#292929',show:false,autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});
    panel=current;
    require('../text-context-menu.cjs').attachTextContextMenu(current,Menu,true,true);
    current.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    current.webContents.on('will-navigate',event=>event.preventDefault());
    current.webContents.on('will-attach-webview',event=>event.preventDefault());
    const onHide=()=>close();editor.once('hide',onHide);
    current.on('closed',()=>{editor.removeListener('hide',onHide);if(panel===current){panel=null;void discardPending();if(active?.kind!=='logout')active?.controller.abort();}});
    try{await current.loadFile(path.join(__dirname,'panel.html'));if(!current.isDestroyed())current.show();}
    catch{if(!current.isDestroyed())current.destroy();throw Error('AI 도우미 창을 열지 못했습니다.');}
  });
  app.on('before-quit',close);
}
module.exports={registerAiWindow};
