'use strict';
// Ulanzi V3.1 wire protocol. Separate from the existing external SDK host.
// Caller must authorize the original package before starting Node or HTML.
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {WebSocketServer}=require('ws');
const {nodeRuntime,spawnNodePlugin}=require('./deckforge-node-runtime.cjs');
const {validateValue}=require('./deckforge-native-settings.cjs');
const {base64Image,pathImage,applyImage,currentImage}=require('./ulanzi-original-image.cjs');
const {pickerOptions,viewOptions,externalUrl}=require('./ulanzi-original-dialog.cjs');
const {NativeAnimationPlayer}=require('./deckforge-native-animation.cjs');
const DeckHotkeys=require('./hotkey-keys.js');
const ID=/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+){3}$/;
const relative=s=>typeof s==='string'&&s.length<1024&&s.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[:\\\x00-\x1f\x7f]/.test(p)&&!/[. ]$/.test(p));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const snapshot=v=>{validateValue(v);return JSON.parse(JSON.stringify(v));};
function validateOriginalNodeManifest(m){
  if(!object(m)||!ID.test(m.UUID)||typeof m.Name!=='string'||!m.Name.trim()||typeof m.Version!=='string'||m.Type!=='JavaScript'||
    !relative(m.CodePath)||!/\.(js|cjs|mjs|html?)$/i.test(m.CodePath)||!Array.isArray(m.Actions)||!m.Actions.length||m.Actions.length>64)throw Error('invalid Ulanzi Node manifest');
  const ids=new Set();
  for(const a of m.Actions){
    if(!object(a)||typeof a.UUID!=='string'||!a.UUID.startsWith(m.UUID+'.')||!/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+){4,11}$/.test(a.UUID)||ids.has(a.UUID)||typeof a.Name!=='string')throw Error('invalid Ulanzi action');
    if(a.Controllers!==undefined&&(!Array.isArray(a.Controllers)||!a.Controllers.length||a.Controllers.some(c=>!['Keypad','Encoder'].includes(c))))throw Error('invalid Ulanzi controller');
    if(a.PropertyInspectorPath!==undefined&&a.PropertyInspectorPath!==''&&(!relative(a.PropertyInspectorPath)||!/\.html?$/i.test(a.PropertyInspectorPath)))throw Error('invalid Ulanzi inspector path');
    ids.add(a.UUID);
  }
  return m; // PrivateAPI is metadata, not a blanket prohibition.
}
class UlanziNodeHost{
  constructor(directory,onUpdate=()=>{}){
    this.directory=directory;this.onUpdate=onUpdate;this.mounts=new Map();this.socket=null;this.server=null;this.child=null;this.closed=false;this.started=false;this.mainWindow=null;this.inspectors=new Map();this.visuals=new Map();this.feedback=new Map();this.globalSettings={};this.globalWrite=null;this.globalQueue=Promise.resolve();this.views=new Set();this.pickerBusy=false;this.linkBusy=false;this.linkGrant=null;this.lastToast=0;this.diagnostics=new Map();
    this.hotkeyGrant=null;this.hotkeyBusy=false;this.sendHotkey=async()=>false;
    this.openExternal=href=>require('electron').shell.openExternal(href);
    this.confirmExternal=(parent,options)=>require('electron').dialog.showMessageBox(parent,options);
    this.animations=new NativeAnimationPlayer((id,image)=>{const ctx=[...this.mounts.values()].find(c=>c.actionid===id);if(ctx&&!this.closed)this.emit({kind:'setImage',context:ctx.context,payload:{image,clear:true}});},undefined,{originalTiming:true});this.getParent=()=>null;
    this.pickDialog=(parent,options)=>require('electron').dialog.showOpenDialog(parent,options);
    this.makeView=(entry,options)=>require('./ulanzi-original-window.cjs').createOriginalWindow(this.directory,entry,options);
  }
  emit(update){this.onUpdate(update);}
  send(message,ws=this.socket){
    if(ws?.readyState!==1)return false;
    try{ws.send(JSON.stringify(message));return true;}catch{return false;}
  }
  address(ctx){return {uuid:ctx.actionUUID,key:ctx.key,actionid:ctx.actionid};}
  event(ctx,cmd,extra={}){return this.send({cmd,...this.address(ctx),param:ctx.settings,...extra});}
  appear(ctx){this.event(ctx,'add');this.event(ctx,'paramfromapp');this.event(ctx,'setactive',{active:true});}
  visual(ctx){let v=this.visuals.get(ctx.actionid);if(!v){const a=this.manifest.Actions.find(a=>a.UUID===ctx.actionUUID);v={state:Number.isInteger(a.state)&&a.state>=0&&a.state<(a.States?.length||1)?a.state:0,temporary:null,defaults:new Map()};this.visuals.set(ctx.actionid,v);}return v;}
  displayImage(ctx,visual){
    const action=this.manifest.Actions.find(a=>a.UUID===ctx.actionUUID),image=currentImage(this.directory,action,visual),id=ctx.actionid;
    if(image?.startsWith('data:image/gif;base64,')){
      if(ctx.slot>=13)throw Error('GIF requires normal button');
      const prepared=this.animations.prepare(id,image);
      if(!this.animations.start(id,prepared,()=>!this.closed&&!!this.socket&&this.mounts.get(ctx.context)?.actionid===id))throw Error('GIF playback capacity or inactive context');
      return;
    }
    this.animations.stop(id);this.emit({kind:'setImage',context:ctx.context,payload:{image,clear:true}});
  }
  alive(){return !this.closed&&(this.child?this.child.exitCode===null&&this.child.signalCode===null&&!this.child.killed:!!this.mainWindow&&!this.mainWindow.isDestroyed());}
  closeInspector(context){const pi=this.inspectors.get(context);if(!pi)return;this.inspectors.delete(context);this.closeViews(r=>r.ws===pi.ws||r.context===context);pi.ws?.terminate();if(pi.server){for(const ws of pi.server.clients)ws.terminate();pi.server.close();}if(pi.win&&!pi.win.isDestroyed())pi.win.destroy();}
  async openInspector(context,parent){
    const ctx=this.mounts.get(context),action=this.manifest?.Actions.find(a=>a.UUID===ctx?.actionUUID);
    if(!ctx||!action?.PropertyInspectorPath||!this.alive()||!this.socket)throw Error('원본 속성창을 사용할 수 없습니다.');
    this.closeInspector(context);
    // Older original HTML SDKs register a property inspector with UUID only.
    // Give each inspector its own loopback listener, so the registration can
    // be bound to the exact selected mount without guessing among duplicates.
    const server=new WebSocketServer({host:'127.0.0.1',port:0,maxPayload:1024*1024});
    const pi={win:null,actionid:ctx.actionid,ws:null,server};this.inspectors.set(context,pi);
    const current=()=>!this.closed&&this.socket?.readyState===1&&this.inspectors.get(context)===pi&&this.mounts.get(context)?.actionid===pi.actionid;
    server.on('error',()=>{});
    server.on('connection',ws=>{
      if(!current()||pi.ws){ws.terminate();return;}
      const timer=setTimeout(()=>ws.terminate(),5000);
      ws.on('error',()=>{});
      ws.on('close',()=>{clearTimeout(timer);this.closeViews(r=>r.ws===ws);if(pi.ws===ws)pi.ws=null;});
      ws.on('message',raw=>{
        try{
          if(!current()){ws.terminate();return;}
          const msg=JSON.parse(String(raw));if(!object(msg))return;
          const mounted=this.mounts.get(context);
          if(pi.ws!==ws){
            if(pi.ws||msg.cmd!=='connected'||msg.code!==0||msg.uuid!==mounted.actionUUID||
               msg.key!==undefined&&msg.key!==mounted.key||msg.actionid!==undefined&&msg.actionid!==mounted.actionid){ws.terminate();return;}
            clearTimeout(timer);pi.ws=ws;
            this.send({cmd:'paramfromapp',...this.address(mounted),param:mounted.settings},ws);
            this.event(mounted,'paramfromapp');return;
          }
          if(msg.code===undefined)this.receive(msg,ws,pi);
        }catch{this.emit({kind:'error',message:'Ulanzi inspector message rejected'});}
      });
    });
    try{
      await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);server.once('close',()=>reject(Error('inspector listener closed')));});
      if(!current())throw Error('원본 속성창 등록이 취소되었습니다.');
      const {createOriginalWindow}=require('./ulanzi-original-window.cjs');
      const {win,url}=createOriginalWindow(this.directory,action.PropertyInspectorPath,{parent,title:action.Name,visible:true,params:{...this.address(ctx),port:server.address().port,address:'127.0.0.1',language:this.language,controller:ctx.slot>=16?'Encoder':'Keypad',device:'d200x-device'}});
      pi.win=win;win.on('closed',()=>{if(this.inspectors.get(context)===pi)this.closeInspector(context);});
      await win.loadURL(url);if(!current()||win.isDestroyed())throw Error('원본 속성창 등록이 취소되었습니다.');
      win.show();return win;
    }catch(error){if(this.inspectors.get(context)===pi)this.closeInspector(context);throw error;}
  }
  async start({approved=false,language='ko',verifyBeforeSpawn=null}={}){
    if(approved!==true)throw Error('original plugin approval required');
    if(this.closed||this.started)throw Error('Ulanzi host already started or closed');
    this.started=true;
    try{
      const root=await fs.realpath(this.directory);
      const manifestFile=await fs.realpath(path.join(root,'manifest.json'));
      const inside=f=>{const rel=path.relative(root,f);return rel&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);};
      if(!inside(manifestFile))throw Error('manifest outside plugin');
      this.manifest=validateOriginalNodeManifest(JSON.parse(await fs.readFile(manifestFile,'utf8')));
      const entry=await fs.realpath(path.join(root,this.manifest.CodePath));
      if(!inside(entry)||!(await fs.stat(entry)).isFile())throw Error('entry outside plugin');
      const html=/\.html?$/i.test(entry),runtime=html?null:await nodeRuntime(20);
      this.language=language;
      if(this.closed)throw Error('Ulanzi host closed');
      const server=this.server=new WebSocketServer({host:'127.0.0.1',port:0,maxPayload:1024*1024});
      server.on('connection',ws=>{
        if(this.closed){ws.close();return;}
        let registered=false;
        const timer=setTimeout(()=>{if(!registered)ws.terminate();},5000);
        ws.on('error',()=>{});
        ws.on('close',()=>{clearTimeout(timer);this.closeViews(r=>r.ws===ws);if(this.socket===ws){this.socket=null;this.linkGrant=null;this.hotkeyGrant=null;this.animations.close();this.emit({kind:'pluginConnection',pluginUUID:this.manifest.UUID,connected:false});}});
        ws.on('message',raw=>{
          try{
            const msg=JSON.parse(String(raw));
            if(!object(msg))return;
            if(!registered){
              if(msg.cmd!=='connected'||msg.code!==0||!this.alive()){ws.close();return;}
              if(msg.uuid!==this.manifest.UUID){ws.close();return;}
              if(this.socket){ws.close();return;}
              registered=true;clearTimeout(timer);this.socket=ws;
              this.emit({kind:'pluginConnection',pluginUUID:this.manifest.UUID,connected:true});
              for(const ctx of this.mounts.values())this.appear(ctx);
              return;
            }
            if(msg.code===undefined&&this.socket===ws)this.receive(msg,ws);
          }catch{this.emit({kind:'error',message:'Ulanzi protocol message rejected'});}
        });
      });
      await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
      if(this.closed)throw Error('Ulanzi host closed');
      if(verifyBeforeSpawn&&!await verifyBeforeSpawn())throw Error('original package approval changed');
      if(this.closed)throw Error('Ulanzi host closed');
      if(html){
        const {createOriginalWindow}=require('./ulanzi-original-window.cjs');
        const {win,url}=createOriginalWindow(root,this.manifest.CodePath,{title:this.manifest.Name,params:{uuid:this.manifest.UUID,address:'127.0.0.1',port:server.address().port,language}});
        this.mainWindow=win;win.on('closed',()=>this.socket?.terminate());
        await win.loadURL(url);return this.manifest;
      }
      this.child=spawnNodePlugin(runtime,entry,['127.0.0.1',String(server.address().port),language],root);
      this.child.stdout?.resume();this.child.stderr?.resume();
      this.child.on('error',()=>{this.emit({kind:'error',message:'Ulanzi Node process failed'});this.socket?.terminate();});
      this.child.on('exit',()=>this.socket?.terminate());
      return this.manifest;
    }catch(error){await this.close();throw error;}
  }
  sync(configs){
    if(this.closed||!this.manifest)throw Error('Ulanzi host unavailable');
    const desired=new Map();
    for(const cfg of configs){
      if(!object(cfg)||typeof cfg.context!=='string'||!cfg.context||desired.has(cfg.context)||cfg.pluginUUID!==this.manifest.UUID||
        !Number.isInteger(cfg.slot)||cfg.slot<0||cfg.slot>18)throw Error('invalid Ulanzi mount');
      const action=this.manifest.Actions.find(a=>a.UUID===cfg.actionUUID);
      if(!action||!(action.Controllers||['Keypad']).includes(cfg.slot>=16?'Encoder':'Keypad'))throw Error('unsupported Ulanzi action');
      const settings=snapshot(cfg.settings||{}),old=this.mounts.get(cfg.context);
      const same=old&&['actionUUID','slot','gesture','instanceId','mountGeneration'].every(k=>old[k]===cfg[k]);
      desired.set(cfg.context,{...cfg,settings,key:same?old.key:cfg.slot>=16?'dial_'+(cfg.slot-16):cfg.slot%4+'_'+Math.floor(cfg.slot/4),actionid:same?old.actionid:randomUUID()});
    }
    for(const [id,old] of this.mounts)if(desired.get(id)?.actionid!==old.actionid){this.closeInspector(id);this.closeViews(r=>r.context===id);this.animations.stop(old.actionid);this.visuals.delete(old.actionid);this.feedback.delete(old.actionid);this.send({cmd:'clear',param:[this.address(old)]});}
    const previous=this.mounts;this.mounts=desired;
    for(const [id,ctx] of desired){
      const old=previous.get(id);
      if(old?.actionid!==ctx.actionid)this.appear(ctx);
      else if(JSON.stringify(old.settings)!==JSON.stringify(ctx.settings)){this.event(ctx,'paramfromapp');const pi=this.inspectors.get(id);if(pi?.ws)this.send({cmd:'paramfromapp',...this.address(ctx),param:ctx.settings},pi.ws);}
    }
  }
  key(context,gesture,ticks=1){
    const ctx=this.mounts.get(context);if(!ctx||!this.socket||this.closed)return false;
    if(['left','right','hold-left','hold-right'].includes(gesture)){
      if(ctx.slot<16||!Number.isInteger(ticks)||ticks<1||ticks>32)return false;
      const rotateEvent=gesture.startsWith('hold-')?gesture:['hold-left','hold-right'].includes(ctx.gesture)?'hold-'+gesture:gesture;
      // V3.1 specifies direction; emit one event per hardware step.
      this.hotkeyGrant=null;
      for(let i=0;i<ticks;i++)if(!this.event(ctx,'dialrotate',{rotateEvent}))return false;
      this.hotkeyGrant={actionid:ctx.actionid,ws:this.socket,expires:Date.now()+1500};
      return true;
    }
    if(!['down','up'].includes(gesture))return false;
    const cmd=ctx.slot>=16?'dial'+gesture:'key'+gesture;
    if(gesture==='down')this.linkGrant={actionid:ctx.actionid,expires:Date.now()+1500};
    const sent=this.event(ctx,cmd);
    if(!sent&&gesture==='down')this.linkGrant=null;
    this.hotkeyGrant=sent?{actionid:ctx.actionid,ws:this.socket,expires:Date.now()+1500}:null;
    if(sent&&gesture==='down'&&ctx.slot<16)this.event(ctx,'run');
    return sent;
  }
  closeViews(predicate=()=>true){
    for(const record of [...this.views])if(predicate(record)){this.views.delete(record);if(!record.win.isDestroyed())record.win.destroy();}
  }
  recordDiagnostic(command,level='unsupported'){
    if(!/^[a-zA-Z0-9_.-]{1,80}$/.test(command))command='invalid';
    const key=level+':'+command;
    if(!this.diagnostics.has(key)&&this.diagnostics.size>=64)return;
    this.diagnostics.set(key,Math.min(1000000,(this.diagnostics.get(key)||0)+1));
  }
  diagnosticSummary(){return [...this.diagnostics].map(([key,count])=>({key,count}));}
  interactiveRequest(msg,ws,inspector){
    const main=!inspector&&ws===this.socket&&msg.uuid===this.manifest.UUID;
    const ctx=[...this.mounts.values()].find(c=>c.actionUUID===msg.uuid&&c.key===msg.key&&c.actionid===msg.actionid);
    const active=()=>!this.closed&&this.alive()&&(main?this.socket===ws:
      !!ctx&&this.mounts.get(ctx.context)?.actionid===ctx.actionid&&
      (inspector?this.inspectors.get(ctx.context)===inspector&&inspector.ws===ws:this.socket===ws));
    const error=()=>{if(active())this.send({cmd:msg.cmd,cmdType:'NOTIFY',code:1},ws);};
    if(!active())return;
    if(msg.cmd==='hotkey'){
      const keys=typeof msg.keylist==='string'&&msg.keylist.split('+').every(part=>part.trim())?DeckHotkeys.canonical(msg.keylist):'';
      const grant=this.hotkeyGrant;
      const valid=()=>active()&&!inspector&&grant&&grant.ws===ws&&Date.now()<=grant.expires&&[...this.mounts.values()].some(c=>c.actionid===grant.actionid)&&(main||ctx?.actionid===grant.actionid);
      if(!keys||this.hotkeyBusy||!valid()){error();return;}
      this.hotkeyGrant=null;this.hotkeyBusy=true;
      Promise.resolve().then(async()=>{
        if(!valid())return;
        const ok=await this.sendHotkey(keys);
        if(active())this.send({cmd:'hotkey',cmdType:'NOTIFY',code:ok===true?0:1},ws);
      }).catch(error).finally(()=>{this.hotkeyBusy=false;});return;
    }
    if(msg.cmd==='logMessage'){
      if(typeof msg.message!=='string'||msg.message.length>4096||!['info','debug','warn','error'].includes(msg.level||'info')){error();return;}
      // Keep only diagnostic counts: plugin logs may contain tokens or private paths.
      this.recordDiagnostic('logMessage',msg.level||'info');
      this.send({cmd:msg.cmd,cmdType:'NOTIFY',code:0},ws);return;
    }
    if(msg.cmd==='toast'){
      if(typeof msg.msg!=='string'||!msg.msg.trim()||msg.msg.length>256){error();return;}
      if(Date.now()-this.lastToast>=1500){
        this.lastToast=Date.now();this.emit({kind:'ulanziToast',pluginUUID:this.manifest.UUID,...(ctx?{context:ctx.context}:{}),message:msg.msg});
      }
      this.send({cmd:msg.cmd,cmdType:'NOTIFY',code:0},ws);return;
    }
    const parent=inspector?.win||this.getParent();
    if(!parent||parent.isDestroyed()){error();return;}
    const title=String(this.manifest.Name).slice(0,120);
    if(msg.cmd==='openurl'&&msg.local!==true){
      let href;try{href=externalUrl(msg);}catch{error();return;}
      if(this.linkBusy){error();return;}
      this.linkBusy=true;
      const grant=this.linkGrant;
      const direct=!inspector&&grant&&Date.now()<=grant.expires&&[...this.mounts.values()].some(c=>c.actionid===grant.actionid)&&(main||ctx?.actionid===grant.actionid);
      if(direct)this.linkGrant=null;
      Promise.resolve().then(async()=>{
        if(!active())return;
        if(!direct){
          const result=await this.confirmExternal(parent,{type:'question',title:'Ulanzi 원본 외부 링크',message:title+'에서 웹사이트를 열려고 합니다.',detail:href,buttons:['취소','브라우저에서 열기'],defaultId:0,cancelId:0,noLink:true});
          if(result.response!==1){error();return;}
        }
        if(!active()||direct&&!([...this.mounts.values()].some(c=>c.actionid===grant.actionid)&&Date.now()<=grant.expires))return;
        await this.openExternal(href);
        if(active())this.send({cmd:msg.cmd,cmdType:'NOTIFY',code:0},ws);
      }).catch(error).finally(()=>{this.linkBusy=false;});return;
    }
    if(msg.cmd==='selectdialog'){
      if(this.pickerBusy){error();return;}
      let options;try{options=pickerOptions(msg,title+' · '+(msg.type==='folder'?'폴더 선택':'파일 선택'));}catch{error();return;}
      this.pickerBusy=true;
      Promise.resolve().then(()=>active()?this.pickDialog(parent,options):null).then(result=>{
        if(!active()||!result)return;
        const selected=!result.canceled&&typeof result.filePaths?.[0]==='string'?result.filePaths[0].replace(/\\/g,'/'):'';
        this.send({cmd:'selectdialog',cmdType:'REQUEST',code:0,uuid:msg.uuid,key:msg.key||'',actionid:msg.actionid||'',type:msg.type,path:selected},ws);
      }).catch(error).finally(()=>{this.pickerBusy=false;});
      return;
    }
    let record;
    try{
      if(this.views.size>=4)throw Error('view capacity');
      const {entry,...options}=viewOptions({...msg,param:msg.param??{}});
      const {win,url}=this.makeView(entry,{...options,parent,title,visible:true});
      record={win,ws,context:ctx?.context,actionid:ctx?.actionid};
      this.views.add(record);win.on('closed',()=>this.views.delete(record));
      Promise.resolve(win.loadURL(url)).then(()=>{
        if(!active()||!this.views.has(record)){this.closeViews(r=>r===record);return;}
        if(!win.isDestroyed())win.show();
        this.send({cmd:msg.cmd,cmdType:'NOTIFY',code:0},ws);
      }).catch(()=>{this.closeViews(r=>r===record);error();});
    }catch{if(record)this.closeViews(r=>r===record);error();}
  }
  receive(msg,ws=this.socket,inspector=null){
    if(['selectdialog','openview','openurl','toast','logMessage','hotkey'].includes(msg.cmd)){this.interactiveRequest(msg,ws,inspector);return;}
    if(['getGlobalSettings','setGlobalSettings'].includes(msg.cmd)){
      const main=!inspector&&ws===this.socket&&msg.uuid===this.manifest.UUID;
      const ctx=[...this.mounts.values()].find(c=>c.actionUUID===msg.uuid&&c.key===msg.key&&c.actionid===msg.actionid);
      if(!main&&(!ctx||inspector&&this.inspectors.get(ctx.context)!==inspector))return;
      const active=()=>!this.closed&&(main?this.socket===ws:!inspector?this.socket===ws&&this.mounts.get(ctx.context)?.actionid===ctx.actionid:this.inspectors.get(ctx.context)===inspector&&inspector.ws===ws);
      const work=this.globalQueue.then(async()=>{
        if(!active())return;
        if(msg.cmd==='setGlobalSettings'){
          const next=snapshot(msg.settings);
          if(!this.globalWrite||!await this.globalWrite(next,active)||!active())throw Error('global settings save failed');
          this.globalSettings=next;
          this.send({cmd:'didReceiveGlobalSettings',uuid:this.manifest.UUID,key:'',actionid:'',settings:next});
          for(const [context,pi] of this.inspectors){const target=this.mounts.get(context);if(target&&pi.ws)this.send({cmd:'didReceiveGlobalSettings',...this.address(target),settings:next},pi.ws);}
        }else this.send({cmd:'didReceiveGlobalSettings',uuid:msg.uuid,key:msg.key,actionid:msg.actionid,settings:this.globalSettings},ws);
      });
      this.globalQueue=work.catch(()=>{if(active())this.send({cmd:msg.cmd,cmdType:'NOTIFY',code:1},ws);});return;
    }
    if(msg.cmd==='state'){
      if(inspector||!Array.isArray(msg.param?.statelist)||!msg.param.statelist.length||msg.param.statelist.length>32)return;
      let ok=true;
      for(const item of msg.param.statelist){
        const ctx=[...this.mounts.values()].find(c=>c.actionUUID===item?.uuid&&c.key===item.key&&c.actionid===item.actionid);
        if(!ctx){ok=false;continue;}
        const action=this.manifest.Actions.find(a=>a.UUID===ctx.actionUUID),visual=this.visual(ctx);
        if(item.type===0&&Number.isInteger(item.state)&&item.state>=0&&item.state<(action.States?.length||1)){
          visual.state=item.state;visual.temporary=null;this.emit({kind:'setState',context:ctx.context,payload:{state:item.state}});
        }else if([1,2,3,4].includes(item.type)){
          const image=item.type===1?base64Image(item.data):item.type===2?pathImage(this.directory,item.path):item.type===3&&item.gifdata!==undefined?base64Image(item.gifdata):pathImage(this.directory,item.gifpath);
          if([3,4].includes(item.type)&&!image?.startsWith('data:image/gif;base64,')){ok=false;continue;}
          if(!image){ok=false;continue;}visual.temporary=image;
        }else{ok=false;continue;}
        try{this.displayImage(ctx,visual);}catch{ok=false;continue;}
        if(item.showtext===true&&typeof item.textData==='string')this.emit({kind:'setTitle',context:ctx.context,payload:{title:item.textData.slice(0,256)}});
      }
      this.send({cmd:'state',cmdType:'NOTIFY',code:ok?0:1},ws);return;
    }
    const address=msg.cmd==='setTitle'||msg.cmd==='setState'||msg.cmd==='setImage'?msg.param:msg;
    const ctx=object(address)&&[...this.mounts.values()].find(c=>c.actionUUID===address.uuid&&c.key===address.key&&c.actionid===address.actionid);
    const ack=code=>this.send({cmd:msg.cmd,cmdType:'NOTIFY',code},ws);
    if(!ctx||inspector&&(this.inspectors.get(ctx.context)!==inspector||inspector.actionid!==ctx.actionid)){ack(1);return;}
    if(inspector&&!['getSettings','setSettings','paramfromplugin','sendToPlugin','showAlert'].includes(msg.cmd)){ack(1);return;}
    switch(msg.cmd){
      case 'setTitle':
        if(typeof address.text!=='string'||address.text.length>256){ack(1);return;}
        this.emit({kind:'setTitle',context:ctx.context,payload:{title:address.text}});break;
      case 'setState':{
        const action=this.manifest.Actions.find(a=>a.UUID===ctx.actionUUID);
        if(!Number.isInteger(address.state)||address.state<0||address.state>=Math.max(1,action.States?.length||1)){ack(1);return;}
        const visual=this.visual(ctx);visual.state=address.state;visual.temporary=null;
        this.emit({kind:'setState',context:ctx.context,payload:{state:address.state}});try{this.displayImage(ctx,visual);}catch{ack(1);return;}break;
      }
      case 'setImage':{
        const action=this.manifest.Actions.find(a=>a.UUID===ctx.actionUUID);
        try{const next=applyImage(this.directory,action,this.visual(ctx),address);this.displayImage(ctx,next);this.visuals.set(ctx.actionid,next);}catch{ack(1);return;}break;
      }
      case 'setFeedbackLayout':{
        if(ctx.slot<16||ctx.slot>18||msg.layout!=='$UA1'){ack(1);return;}
        const next={layout:msg.layout};this.feedback.set(ctx.actionid,next);
        this.emit({kind:'ulanziFeedback',context:ctx.context,payload:{...next}});break;
      }
      case 'setFeedback':{
        if(ctx.slot<16||ctx.slot>18||!object(msg.layout)){ack(1);return;}
        const prior=this.feedback.get(ctx.actionid)||{layout:'$UA1'},next={...prior};
        for(const [key,value] of Object.entries(msg.layout)){
          if(key==='title'&&object(value)&&typeof value.text==='string'&&value.text.length<=256)next.title=value.text;
          else if(key==='icon'&&object(value)&&typeof value.value==='string'){
            if(value.value==='')delete next.icon;
            else {const image=pathImage(this.directory,value.value)||base64Image(value.value);if(!image||image.startsWith('data:image/gif;')){ack(1);return;}next.icon=image;}
          }else {ack(1);return;}
        }
        this.feedback.set(ctx.actionid,next);this.emit({kind:'ulanziFeedback',context:ctx.context,payload:{...next}});break;
      }
      case 'getSettings':
        this.send({cmd:'didReceiveSettings',...this.address(ctx),settings:ctx.settings},ws);return;
      case 'setSettings':case 'paramfromplugin':
        ctx.settings=snapshot(msg.cmd==='setSettings'?msg.settings:msg.param);
        this.emit({kind:'settings',context:ctx.context,settings:ctx.settings});
        const pi=this.inspectors.get(ctx.context);
        this.send({cmd:'didReceiveSettings',...this.address(ctx),settings:ctx.settings});
        if(pi?.ws)this.send({cmd:'didReceiveSettings',...this.address(ctx),settings:ctx.settings},pi.ws);
        if(msg.cmd==='paramfromplugin'){
          if(inspector)this.event(ctx,'paramfromplugin');else if(pi?.ws)this.send({cmd:'paramfromplugin',...this.address(ctx),param:ctx.settings},pi.ws);
        }break;
      case 'sendToPlugin':if(!inspector){ack(1);return;}this.send({cmd:msg.cmd,...this.address(ctx),payload:snapshot(msg.payload)});break;
      case 'sendToPropertyInspector':{
        const pi=this.inspectors.get(ctx.context);if(!pi?.ws){ack(1);return;}this.send({cmd:msg.cmd,...this.address(ctx),payload:snapshot(msg.payload)},pi.ws);break;
      }
      case 'showAlert':this.emit({kind:'showAlert',context:ctx.context});break;
      default:this.recordDiagnostic(String(msg.cmd));this.emit({kind:'unsupportedUlanziCommand',pluginUUID:this.manifest.UUID,command:String(msg.cmd).slice(0,80)});ack(1);return;
    }
    ack(0);
  }
  async close(){
    if(this.closed)return;this.closed=true;
    for(const ctx of this.mounts.values())this.send({cmd:'clear',param:[this.address(ctx)]});
    this.mounts.clear();this.visuals.clear();this.feedback.clear();this.linkGrant=null;this.hotkeyGrant=null;this.animations.close();this.closeViews();await this.globalQueue;for(const context of [...this.inspectors.keys()])this.closeInspector(context);
    if(this.mainWindow&&!this.mainWindow.isDestroyed())this.mainWindow.destroy();this.mainWindow=null;
    const child=this.child;this.child=null;
    if(child&&child.exitCode===null&&child.signalCode===null){
      await new Promise(resolve=>{const timer=setTimeout(resolve,2500);child.once('exit',()=>{clearTimeout(timer);resolve();});try{child.kill();}catch{clearTimeout(timer);resolve();}});
    }
    const server=this.server;this.server=null;
    if(server){for(const ws of server.clients)ws.terminate();await new Promise(resolve=>server.close(()=>resolve()));}
    this.socket=null;
  }
}
module.exports={validateOriginalNodeManifest,UlanziNodeHost};
