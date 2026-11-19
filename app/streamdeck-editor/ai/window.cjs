'use strict';
const path=require('node:path');
const fs=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
const {BrowserWindow,ipcMain,safeStorage,shell,app,screen,Menu}=require('electron');
const {ChatAuth}=require('./auth.cjs');
const {listModels,chat}=require('./responses.cjs');

function registerAiWindow(assertEditor,newReadSession){
  let panel=null,auth=null,active=null,catalog=[],history=null,historyBusy=false;
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
  const handlers={
    status:async()=>({ ...await connection().status(),busy:active?.kind||null }),
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
      const job=begin('chat');
      try{
        if(!args||typeof args.id!=='string'||!catalog.some(m=>m.id===args.model)||typeof args.text!=='string'||!args.text.trim()||args.text.length>12000)throw Error('모델 또는 메시지 입력을 확인하세요.');
        if(!/^[a-f0-9-]{36}$/.test(args.id))throw Error('대화 식별자 오류');
        const all=await loadHistory(),old=all.find(x=>x.id===args.id);
        if(!old&&all.length>=100)throw Error('대화 기록은 최대 100개입니다. 이전 대화를 삭제하세요.');
        const message={role:'user',content:args.text.trim()},messages=[...(old?.messages||[]),message];
        if(messages.length>200)throw Error('이 대화의 메시지 한도에 도달했습니다. 새 대화를 시작하세요.');
        const signal=AbortSignal.any([job.controller.signal,AbortSignal.timeout(240000)]);
        const readOnly=args.readOnly===true;
        const result=await chat({token:await connection().access(signal),model:args.model,messages,toolTest:!readOnly&&args.toolTest===true,readOnly,inspect:readOnly?newReadSession():undefined,version:app.getVersion(),signal,emit:send});
        signal.throwIfAborted();
        if(!result.text.trim())throw Error('완료된 텍스트 응답이 없습니다.');
        const updated={id:args.id,title:old?.title||message.content.slice(0,48),messages:[...messages,{role:'assistant',content:result.text}],updated:Date.now()};
        await saveHistory([updated,...all.filter(x=>x.id!==args.id)]);
        return {conversation:updated,called:result.called,usage:result.usage,requests:result.requests,toolCalls:result.toolCalls};
      }catch(e){if(e.code==='signed-out'){catalog=[];await connection().clearSession();}throw e;}
      finally{finish(job);}
    },
    cancel:async()=>{if(active?.kind!=='logout')active?.controller.abort();return true;},
    usage:async()=>shell.openExternal('https://chatgpt.com/settings/usage')
  };
  for(const [name,fn] of Object.entries(handlers))ipcMain.handle('deckforge-ai:'+name,(event,arg)=>handle(name,fn,event,arg));
  const close=()=>{if(active?.kind!=='logout')active?.controller.abort();if(panel&&!panel.isDestroyed())panel.close();};
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
    require('../text-context-menu.cjs').attachTextContextMenu(current,Menu,true);
    current.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    current.webContents.on('will-navigate',event=>event.preventDefault());
    current.webContents.on('will-attach-webview',event=>event.preventDefault());
    const onHide=()=>close();editor.once('hide',onHide);
    current.on('closed',()=>{editor.removeListener('hide',onHide);if(panel===current){panel=null;if(active?.kind!=='logout')active?.controller.abort();}});
    try{await current.loadFile(path.join(__dirname,'panel.html'));if(!current.isDestroyed())current.show();}
    catch{if(!current.isDestroyed())current.destroy();throw Error('AI 도우미 창을 열지 못했습니다.');}
  });
  app.on('before-quit',close);
}
module.exports={registerAiWindow};
