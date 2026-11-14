'use strict';
// Stream Deck SDK 3 host, first target: HTML-based cgiesche Home Assistant plugin.
// Installer never executes package contents. Execution begins only after user assigns an action.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {WebSocketServer}=require('ws');
const JSZip=require('jszip');
const {BrowserWindow,safeStorage,screen}=require('electron');
const UUID=/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,180}$/;
const MAX_ARCHIVE=40*1024*1024,MAX_FILES=2500,MAX_EXPANDED=100*1024*1024;
const DEVICE='d200x-device';
const json=x=>JSON.stringify(x);
const filename=x=>typeof x==='string'&&x.length>0&&x.length<1024&&!x.startsWith('/')&&!x.includes('\\')&&!/[\x00-\x1f\x7f]/.test(x)&&x.split('/').every(segment=>segment.length>0&&segment!=='.'&&segment!=='..'&&!segment.includes(':'));
function validateManifest(m){
  if(!m||!UUID.test(m.UUID)||!Array.isArray(m.Actions)||!m.Actions.length||
    !m.Actions.every(a=>UUID.test(a.UUID)&&typeof a.Name==='string')||
    !filename(m.CodePath)||!m.CodePath.toLowerCase().endsWith('.html'))
    throw Error('첫 단계는 HTML CodePath를 제공하는 Stream Deck SDK 플러그인만 지원합니다.');
  return m;
}
async function parseArchive(data){
  if(!Buffer.isBuffer(data)||data.length>MAX_ARCHIVE||data.length<50)throw Error('플러그인 압축 크기가 올바르지 않습니다.');
  const zip=await JSZip.loadAsync(data,{checkCRC32:true});
  const entries=Object.values(zip.files).filter(x=>!x.dir);
  if(entries.length>MAX_FILES)throw Error('압축 파일 수 제한 초과');
  const manifestEntries=entries.filter(x=>x.name.endsWith('.sdPlugin/manifest.json'));
  if(manifestEntries.length!==1)throw Error('단일 *.sdPlugin/manifest.json이 필요합니다.');
  const root=manifestEntries[0].name.slice(0,-'manifest.json'.length);
  const manifest=validateManifest(JSON.parse(await manifestEntries[0].async('string')));
  if(!entries.some(x=>x.name===root+manifest.CodePath))throw Error('CodePath 파일이 없습니다.');
  const files=[],names=new Set();let total=0;
  for(const entry of entries){
    const advertised=Number(entry._data?.uncompressedSize);
    if(Number.isFinite(advertised)&&advertised>=0&&total+advertised>MAX_EXPANDED)
      throw Error('압축 해제 예상 크기 제한 초과');
    if(!entry.name.startsWith(root))throw Error('압축에 플러그인 폴더 외부 파일이 있습니다.');
    const name=entry.name.slice(root.length);
    if(!filename(name)||names.has(name))throw Error('안전하지 않은 압축 경로입니다.');
    names.add(name);
    const unix=(entry.unixPermissions||0)&0xf000;
    if(unix===0xa000)throw Error('심볼릭 링크를 설치할 수 없습니다.');
    const bytes=await entry.async('nodebuffer');
    total+=bytes.length;if(total>MAX_EXPANDED)throw Error('압축 해제 크기 제한 초과');
    files.push({name,bytes});
  }
  return {manifest,files};
}
class StreamDeckPluginHost{
  constructor(userData,onUpdate=()=>{},getParent=()=>null){
    this.getParent=getParent;
    this.root=path.join(userData,'streamdeck-sdk-plugins');
    this.onUpdate=onUpdate;this.server=null;this.port=0;
    this.plugins=new Map();this.contexts=new Map();this.global=new Map();
    this.instances=new Map();this.inspectors=new Map();
  }
  async list(){
    await fs.promises.mkdir(this.root,{recursive:true});
    const dirs=await fs.promises.readdir(this.root,{withFileTypes:true});
    const items=[];
    for(const entry of dirs){
      if(!entry.isDirectory()||!entry.name.endsWith('.sdPlugin'))continue;
      try{
        const dir=path.join(this.root,entry.name);
        const manifest=validateManifest(JSON.parse(await fs.promises.readFile(path.join(dir,'manifest.json'),'utf8')));
        if(entry.name!==manifest.UUID+'.sdPlugin')continue;
        const target=path.resolve(dir,manifest.CodePath);
        if(!target.startsWith(dir+path.sep))continue;
        await fs.promises.access(target);
        items.push({uuid:manifest.UUID,name:String(manifest.Name||manifest.UUID),
          version:String(manifest.Version||''),actions:manifest.Actions.map(a=>({uuid:a.UUID,name:a.Name,
            states:Array.isArray(a.States)?a.States.length:1,controllers:Array.isArray(a.Controllers)?a.Controllers:['Keypad'],propertyInspectorPath:a.PropertyInspectorPath||''}))});
      }catch{}
    }
    return items;
  }
  async install(data){
    const pack=await parseArchive(data),{manifest}=pack;
    await fs.promises.mkdir(this.root,{recursive:true});
    const destination=path.join(this.root,manifest.UUID+'.sdPlugin');
    try{await fs.promises.access(destination);throw Error('같은 ID의 플러그인이 이미 있습니다. 기존 설정을 보호하기 위해 덮어쓰지 않습니다.');}
    catch(e){if(e.code!=='ENOENT')throw e;}
    const staging=path.join(this.root,'.import-'+crypto.randomUUID());
    await fs.promises.mkdir(staging);
    try{
      for(const file of pack.files){
        const to=path.join(staging,...file.name.split('/'));
        await fs.promises.mkdir(path.dirname(to),{recursive:true});
        await fs.promises.writeFile(to,file.bytes,{flag:'wx'});
      }
      await fs.promises.rename(staging,destination);
    }catch(e){await fs.promises.rm(staging,{recursive:true,force:true});throw e;}
    return {uuid:manifest.UUID,name:manifest.Name,version:manifest.Version,actions:manifest.Actions.map(a=>({uuid:a.UUID,name:a.Name}))};
  }
  async start(){
    if(this.server)return;
    this.server=new WebSocketServer({host:'localhost',port:0,maxPayload:1024*1024});
    await new Promise((resolve,reject)=>{this.server.once('listening',resolve);this.server.once('error',reject);});
    this.port=this.server.address().port;
    this.server.on('connection',ws=>{
      let owner=null,inspector=null;
      ws.on('message',raw=>{
        try{
          const msg=JSON.parse(String(raw));
          if(msg.event==='registerPlugin'){
            owner=[...this.instances.values()].find(x=>x.uuid===msg.uuid&&x.window&&!x.window.isDestroyed());
            if(!owner)return ws.close();
            owner.ws=ws;this.send(ws,{event:'applicationDidLaunch'});
            for(const ctx of this.contexts.values())if(ctx.pluginUUID===owner.uuid)this.willAppear(ctx);
            return;
          }
          if(msg.event==='registerPropertyInspector'){
            inspector=[...this.inspectors.values()].find(x=>x.context===msg.uuid);
            if(!inspector)return ws.close();
            inspector.ws=ws;
            this.send(ws,{event:'didReceiveSettings',action:inspector.actionUUID,context:inspector.context,device:DEVICE,payload:{
              controller:inspector.slot>=16?'Encoder':'Keypad',isInMultiAction:false,settings:this.contexts.get(inspector.context)?.settings||{}
            }});
            return;
          }
          if(owner||inspector)Promise.resolve(this.message(msg,owner,inspector,ws))
            .catch(error=>this.onUpdate({kind:'error',message:'SDK 설정 요청 실패: '+error.message}));
        }catch(error){this.onUpdate({kind:'error',message:'플러그인 메시지 처리 오류: '+error.message});}
      });
      ws.on('close',()=>{
        if(owner&&owner.ws===ws){
          owner.ws=null;
          for(const ctx of this.contexts.values())if(ctx.pluginUUID===owner.uuid)ctx.appeared=false;
        }
        if(inspector&&inspector.ws===ws)inspector.ws=null;
      });
    });
  }
  send(ws,msg){if(ws&&ws.readyState===1)ws.send(json(msg));}
  settingsFile(uuid){return path.join(this.root,uuid+'.globals');}
  async readGlobal(uuid){
    if(this.global.has(uuid))return this.global.get(uuid);
    let value={};
    try{
      const bytes=await fs.promises.readFile(this.settingsFile(uuid));
      if(!safeStorage.isEncryptionAvailable())throw Error('암호화 저장을 사용할 수 없습니다.');
      value=JSON.parse(safeStorage.decryptString(bytes));
    }catch(e){if(e.code!=='ENOENT')this.onUpdate({kind:'error',message:'플러그인 설정 복호화 실패'});}
    this.global.set(uuid,value);return value;
  }
  async storeGlobal(uuid,payload){
    if(!safeStorage.isEncryptionAvailable())throw Error('플러그인 인증 정보 암호화 저장이 불가능합니다.');
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('설정 형식 오류');
    const temp=this.settingsFile(uuid)+'.tmp';
    await fs.promises.writeFile(temp,safeStorage.encryptString(json(payload)));
    await fs.promises.rename(temp,this.settingsFile(uuid));
    this.global.set(uuid,payload);
  }
  async ensure(uuid){
    if(this.instances.has(uuid))return this.instances.get(uuid);
    await this.start();
    const plugins=await this.list();
    if(!plugins.some(x=>x.uuid===uuid))throw Error('설치되지 않은 플러그인입니다.');
    const dir=path.join(this.root,uuid+'.sdPlugin');
    const manifest=validateManifest(JSON.parse(await fs.promises.readFile(path.join(dir,'manifest.json'),'utf8')));
    const instance={uuid,manifest,dir,ws:null,window:null};
    const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:false,sandbox:true,webSecurity:true}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('file://'))event.preventDefault();});
    instance.window=win;this.instances.set(uuid,instance);
    win.on('closed',()=>{if(this.instances.get(uuid)===instance)this.instances.delete(uuid);});
    await win.loadFile(path.join(dir,manifest.CodePath));
    const info=json({application:{font:'Arial',language:'ko',platform:'windows',platformVersion:'10',version:'7.6.1'},devices:[{id:DEVICE,name:'D200X',size:{columns:4,rows:4},type:0}],plugin:{version:manifest.Version||'1.0.0'},devicePixelRatio:1});
    await win.webContents.executeJavaScript('typeof connectElgatoStreamDeckSocket==="function" && connectElgatoStreamDeckSocket('+[this.port,uuid,'registerPlugin',info,'{}'].map(json).join(',')+')');
    return instance;
  }
  payload(ctx){return {controller:ctx.slot>=16?'Encoder':'Keypad',
    coordinates:ctx.slot>=16?{column:ctx.slot-16,row:0}:{column:ctx.slot%4,row:Math.floor(ctx.slot/4)},isInMultiAction:false,
    settings:ctx.settings||{}};}
  willAppear(ctx){
    const inst=this.instances.get(ctx.pluginUUID);
    if(ctx.appeared||!inst?.ws||inst.ws.readyState!==1)return;
    this.send(inst.ws,{event:'willAppear',action:ctx.actionUUID,context:ctx.context,device:DEVICE,payload:this.payload(ctx)});
    ctx.appeared=true;
  }
  async sync(configs){
    const seen=new Set();
    for(const cfg of configs){
      if(!cfg||typeof cfg.context!=='string'||cfg.context.length>160||
        !UUID.test(cfg.pluginUUID)||!UUID.test(cfg.actionUUID)||!Number.isInteger(cfg.slot)||cfg.slot<0||cfg.slot>18)continue;
      const plugins=await this.list(),plugin=plugins.find(p=>p.uuid===cfg.pluginUUID);
      if(!plugin?.actions.some(a=>a.uuid===cfg.actionUUID))continue;
      seen.add(cfg.context);
      let ctx=this.contexts.get(cfg.context);
      if(!ctx||ctx.pluginUUID!==cfg.pluginUUID||ctx.actionUUID!==cfg.actionUUID){
        if(ctx)this.disappear(ctx);
        ctx={...cfg,settings:cfg.settings||{},appeared:false};
        this.contexts.set(cfg.context,ctx);
        await this.ensure(cfg.pluginUUID);
        this.willAppear(ctx);
      }else{ctx.settings=cfg.settings||{};ctx.slot=cfg.slot;}
    }
    for(const [key,ctx] of this.contexts)if(!seen.has(key)){
      this.disappear(ctx);this.contexts.delete(key);
    }
  }
  disappear(ctx){
    this.send(this.instances.get(ctx.pluginUUID)?.ws,{event:'willDisappear',action:ctx.actionUUID,context:ctx.context,device:DEVICE,payload:this.payload(ctx)});
  }
  key(context,gesture,ticks=1){
    const ctx=this.contexts.get(context);
    if(!ctx)return false;
    const event=gesture==='left'||gesture==='right'?'dialRotate':
      ctx.slot>=16?(gesture==='up'?'dialUp':'dialDown'):(gesture==='up'?'keyUp':'keyDown');
    const payload={...this.payload(ctx),...(event==='dialRotate'?{ticks:gesture==='left'?-Math.max(1,ticks):Math.max(1,ticks),pressed:false}: {})};
    this.send(this.instances.get(ctx.pluginUUID)?.ws,{event,action:ctx.actionUUID,context,device:DEVICE,payload});
    return true;
  }
  async inspector(context){
    const ctx=this.contexts.get(context);
    if(!ctx)throw Error('플러그인 동작이 현재 페이지에 등록되어 있지 않습니다.');
    const inst=await this.ensure(ctx.pluginUUID);
    const action=inst.manifest.Actions.find(a=>a.UUID===ctx.actionUUID);
    if(!action||!filename(action.PropertyInspectorPath))throw Error('이 동작에는 속성 편집기가 없습니다.');
    let pi=this.inspectors.get(context);
    if(pi?.window&&!pi.window.isDestroyed()){pi.window.show();pi.window.focus();return true;}
    const parent=this.getParent();
    const win=new BrowserWindow({width:560,height:780,minWidth:420,minHeight:500,
      show:false,backgroundColor:'#111217',title:inst.manifest.Name+' · 설정',
      ...(parent&&!parent.isDestroyed()?{parent,modal:true}:{}),
      webPreferences:{nodeIntegration:false,contextIsolation:false,sandbox:true,webSecurity:true}});
    if(parent&&!parent.isDestroyed()){
      const p=parent.getBounds();
      const area=screen.getDisplayMatching(p).workArea;
      const w=560,h=780;
      win.setPosition(
        Math.max(area.x,Math.min(area.x+area.width-w,p.x+Math.round((p.width-w)/2))),
        Math.max(area.y,Math.min(area.y+area.height-h,p.y+Math.round((p.height-h)/2)))
      );
    }
    win.webContents.setWindowOpenHandler(({url})=>{
      if(/^https?:\/\//i.test(url))require('electron').shell.openExternal(url).catch(()=>{});
      return {action:'deny'};
    });
    win.webContents.on('will-navigate',(event,url)=>{
      if(!url.startsWith('file://'))event.preventDefault();
    });
    pi={context,actionUUID:ctx.actionUUID,slot:ctx.slot,window:win,ws:null,pluginUUID:ctx.pluginUUID};
    this.inspectors.set(context,pi);
    win.on('closed',()=>{
      this.inspectors.delete(context);
      this.send(inst.ws,{event:'propertyInspectorDidDisappear',action:ctx.actionUUID,context,device:DEVICE});
    });
    await win.loadFile(path.join(inst.dir,action.PropertyInspectorPath));
    const info=json({application:{language:'ko',platform:'windows',version:'7.6.1'},devices:[{id:DEVICE,name:'D200X'}],plugin:{version:inst.manifest.Version}});
    const actionInfo=json({action:ctx.actionUUID,context,device:DEVICE,payload:this.payload(ctx)});
    await win.webContents.executeJavaScript('typeof connectElgatoStreamDeckSocket==="function" && connectElgatoStreamDeckSocket('+[this.port,context,'registerPropertyInspector',info,actionInfo].map(json).join(',')+')');
    this.send(inst.ws,{event:'propertyInspectorDidAppear',action:ctx.actionUUID,context,device:DEVICE});
    win.show();win.focus();
    return true;
  }
  async stateArtwork(ctx,rawState){
    const inst=this.instances.get(ctx.pluginUUID),manifestAction=inst?.manifest.Actions.find(x=>x.UUID===ctx.actionUUID);
    const state=Number(rawState);
    if(!Number.isInteger(state)||state<0||state>=Math.min(16,manifestAction?.States?.length||0))return null;
    const base=manifestAction.States[state]?.Image;
    if(!filename(base))return null;
    for(const extension of ['', '.png', '.svg', '.jpg', '.jpeg', '.webp']){
      const name=base+extension,mime=name.endsWith('.svg')?'image/svg+xml':
        name.endsWith('.jpg')||name.endsWith('.jpeg')?'image/jpeg':
        name.endsWith('.webp')?'image/webp':'image/png';
      const absolute=path.resolve(inst.dir,name);
      if(!absolute.startsWith(inst.dir+path.sep))continue;
      try{
        const stat=await fs.promises.stat(absolute);
        if(!stat.isFile()||stat.size>1024*1024)continue;
        return 'data:'+mime+';base64,'+(await fs.promises.readFile(absolute)).toString('base64');
      }catch(e){if(e.code!=='ENOENT')throw e;}
    }
    return null;
  }
  async message(msg,inst,pi,ws){
    const uuid=inst?.uuid||pi?.pluginUUID;
    const ctx=this.contexts.get(msg.context);
    switch(msg.event){
      case 'getGlobalSettings':
        this.send(ws,{event:'didReceiveGlobalSettings',context:msg.context,payload:{settings:await this.readGlobal(uuid)}});break;
      case 'setGlobalSettings':
        await this.storeGlobal(uuid,msg.payload);for(const target of [this.instances.get(uuid)?.ws,...[...this.inspectors.values()].filter(x=>x.pluginUUID===uuid).map(x=>x.ws)])
          this.send(target,{event:'didReceiveGlobalSettings',context:msg.context,payload:{settings:msg.payload}});
        break;
      case 'getSettings':
        if(ctx)this.send(ws,{event:'didReceiveSettings',action:ctx.actionUUID,context:ctx.context,device:DEVICE,payload:this.payload(ctx)});
        break;
      case 'setSettings':
        if(ctx&&ctx.pluginUUID===uuid){
          ctx.settings=msg.payload||{};
          this.onUpdate({kind:'settings',context:ctx.context,settings:ctx.settings});
          const payload=this.payload(ctx);
          // setSettings commonly originates in the Property Inspector, where inst is null.
          // Deliver to the live plugin by UUID, not just the message sender.
          this.send(this.instances.get(uuid)?.ws,{event:'didReceiveSettings',action:ctx.actionUUID,context:ctx.context,device:DEVICE,payload});
          this.send(this.inspectors.get(ctx.context)?.ws,{event:'didReceiveSettings',action:ctx.actionUUID,context:ctx.context,device:DEVICE,payload});
        }break;
      case 'sendToPlugin':if(ctx)this.send(this.instances.get(uuid)?.ws,msg);break;
      case 'sendToPropertyInspector':if(ctx)this.send(this.inspectors.get(ctx.context)?.ws,msg);break;
      case 'setTitle':case 'setImage':case 'setState':
        if(ctx&&ctx.pluginUUID===uuid){
          this.onUpdate({kind:msg.event,context:ctx.context,payload:msg.payload});
          if(msg.event==='setState'){
            const image=await this.stateArtwork(ctx,msg.payload?.state);
            if(image)this.onUpdate({kind:'setImage',context:ctx.context,payload:{image}});
          }
        }break;
      case 'showAlert':case 'showOk':
        this.onUpdate({kind:msg.event,context:msg.context});break;
      case 'logMessage':break;
      case 'openUrl':
        // URLs from plugins are not opened automatically.
        break;
      case 'setFeedback':case 'setFeedbackLayout':break;
    }
  }
  async close(){
    for(const pi of this.inspectors.values())if(!pi.window.isDestroyed())pi.window.close();
    for(const inst of this.instances.values())if(!inst.window.isDestroyed())inst.window.close();
    if(this.server)await new Promise(resolve=>this.server.close(resolve));
    this.server=null;
  }
}
module.exports={StreamDeckPluginHost,parseArchive,validateManifest};