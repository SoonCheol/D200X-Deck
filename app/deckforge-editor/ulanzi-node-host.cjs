'use strict';
// Ulanzi V3.1 wire protocol. Separate from the existing external SDK host.
// Experimental Node-only runtime. Caller must authorize the original package
// before start(); no installer, editor routing or automatic execution here.
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {WebSocketServer}=require('ws');
const {nodeRuntime,spawnNodePlugin}=require('./deckforge-node-runtime.cjs');
const {validateValue}=require('./deckforge-native-settings.cjs');
const ID=/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+){3}$/;
const relative=s=>typeof s==='string'&&s.length<1024&&s.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[:\\\x00-\x1f\x7f]/.test(p)&&!/[. ]$/.test(p));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const snapshot=v=>{validateValue(v);return JSON.parse(JSON.stringify(v));};
function validateOriginalNodeManifest(m){
  if(!object(m)||!ID.test(m.UUID)||typeof m.Name!=='string'||!m.Name.trim()||typeof m.Version!=='string'||m.Type!=='JavaScript'||
    !relative(m.CodePath)||!/\.(js|cjs|mjs)$/i.test(m.CodePath)||!Array.isArray(m.Actions)||!m.Actions.length||m.Actions.length>64)throw Error('invalid Ulanzi Node manifest');
  const ids=new Set();
  for(const a of m.Actions){
    if(!object(a)||typeof a.UUID!=='string'||!a.UUID.startsWith(m.UUID+'.')||!/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+){4,11}$/.test(a.UUID)||ids.has(a.UUID)||typeof a.Name!=='string')throw Error('invalid Ulanzi action');
    if(a.Controllers!==undefined&&(!Array.isArray(a.Controllers)||!a.Controllers.length||a.Controllers.some(c=>!['Keypad','Encoder'].includes(c))))throw Error('invalid Ulanzi controller');
    ids.add(a.UUID);
  }
  return m; // PrivateAPI is metadata, not a blanket prohibition.
}
class UlanziNodeHost{
  constructor(directory,onUpdate=()=>{}){
    this.directory=directory;this.onUpdate=onUpdate;this.mounts=new Map();this.socket=null;this.server=null;this.child=null;this.closed=false;this.started=false;
  }
  emit(update){this.onUpdate(update);}
  send(message,ws=this.socket){
    if(ws?.readyState!==1)return false;
    try{ws.send(JSON.stringify(message));return true;}catch{return false;}
  }
  address(ctx){return {uuid:ctx.actionUUID,key:ctx.key,actionid:ctx.actionid};}
  event(ctx,cmd,extra={}){return this.send({cmd,...this.address(ctx),param:ctx.settings,...extra});}
  appear(ctx){this.event(ctx,'add');this.event(ctx,'paramfromapp');}
  async start({approved=false,language='ko'}={}){
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
      const runtime=await nodeRuntime(20);
      if(this.closed)throw Error('Ulanzi host closed');
      const server=this.server=new WebSocketServer({host:'127.0.0.1',port:0,maxPayload:1024*1024});
      server.on('connection',ws=>{
        if(this.closed){ws.close();return;}
        let registered=false;
        const timer=setTimeout(()=>{if(!registered)ws.terminate();},5000);
        ws.on('error',()=>{});
        ws.on('close',()=>{clearTimeout(timer);if(this.socket===ws){this.socket=null;this.emit({kind:'pluginConnection',pluginUUID:this.manifest.UUID,connected:false});}});
        ws.on('message',raw=>{
          try{
            const msg=JSON.parse(String(raw));
            if(!object(msg))return;
            if(!registered){
              if(msg.cmd!=='connected'||msg.code!==0||msg.uuid!==this.manifest.UUID||this.socket||!this.child||this.child.exitCode!==null){ws.close();return;}
              registered=true;clearTimeout(timer);this.socket=ws;
              this.emit({kind:'pluginConnection',pluginUUID:this.manifest.UUID,connected:true});
              for(const ctx of this.mounts.values())this.appear(ctx);
              return;
            }
            if(this.socket===ws&&msg.code===undefined)this.receive(msg);
          }catch{this.emit({kind:'error',message:'Ulanzi protocol message rejected'});}
        });
      });
      await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
      if(this.closed)throw Error('Ulanzi host closed');
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
    for(const [id,old] of this.mounts)if(desired.get(id)?.actionid!==old.actionid)this.send({cmd:'clear',param:[this.address(old)]});
    const previous=this.mounts;this.mounts=desired;
    for(const [id,ctx] of desired){
      const old=previous.get(id);
      if(old?.actionid!==ctx.actionid)this.appear(ctx);
      else if(JSON.stringify(old.settings)!==JSON.stringify(ctx.settings))this.event(ctx,'paramfromapp');
    }
  }
  key(context,gesture,ticks=1){
    const ctx=this.mounts.get(context);if(!ctx||!this.socket||this.closed)return false;
    if(['left','right','hold-left','hold-right'].includes(gesture)){
      if(ctx.slot<16||!Number.isInteger(ticks)||ticks<1||ticks>32)return false;
      const rotateEvent=gesture.startsWith('hold-')?gesture:['hold-left','hold-right'].includes(ctx.gesture)?'hold-'+gesture:gesture;
      // V3.1 specifies direction; emit one event per hardware step.
      for(let i=0;i<ticks;i++)if(!this.event(ctx,'dialrotate',{rotateEvent}))return false;
      return true;
    }
    if(!['down','up'].includes(gesture))return false;
    const cmd=ctx.slot>=16?'dial'+gesture:'key'+gesture;
    const sent=this.event(ctx,cmd);
    if(sent&&gesture==='down'&&ctx.slot<16)this.event(ctx,'run');
    return sent;
  }
  receive(msg){
    const address=msg.cmd==='setTitle'||msg.cmd==='setState'||msg.cmd==='setImage'?msg.param:msg;
    const ctx=object(address)&&[...this.mounts.values()].find(c=>c.actionUUID===address.uuid&&c.key===address.key&&c.actionid===address.actionid);
    const ack=code=>this.send({...msg,cmdType:'NOTIFY',code});
    if(!ctx){ack(1);return;}
    switch(msg.cmd){
      case 'setTitle':
        if(typeof address.text!=='string'||address.text.length>256){ack(1);return;}
        this.emit({kind:'setTitle',context:ctx.context,payload:{title:address.text}});break;
      case 'setState':{
        const action=this.manifest.Actions.find(a=>a.UUID===ctx.actionUUID);
        if(!Number.isInteger(address.state)||address.state<0||address.state>=Math.max(1,action.States?.length||1)){ack(1);return;}
        this.emit({kind:'setState',context:ctx.context,payload:{state:address.state}});break;
      }
      case 'getSettings':
        this.send({cmd:'didReceiveSettings',...this.address(ctx),settings:ctx.settings});return;
      case 'setSettings':case 'paramfromplugin':
        ctx.settings=snapshot(msg.cmd==='setSettings'?msg.settings:msg.param);
        this.emit({kind:'settings',context:ctx.context,settings:ctx.settings});
        this.send({cmd:'didReceiveSettings',...this.address(ctx),settings:ctx.settings});break;
      case 'showAlert':this.emit({kind:'showAlert',context:ctx.context});break;
      default:this.emit({kind:'unsupportedUlanziCommand',pluginUUID:this.manifest.UUID,command:String(msg.cmd).slice(0,80)});ack(1);return;
    }
    ack(0);
  }
  async close(){
    if(this.closed)return;this.closed=true;
    for(const ctx of this.mounts.values())this.send({cmd:'clear',param:[this.address(ctx)]});
    this.mounts.clear();
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
