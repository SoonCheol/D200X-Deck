'use strict';
// DeckForge SDK API 1: bounded, declarative programs. No JS, shell or network.
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const SUFFIX='.deckforge-native.json', LIMIT=1024*1024;
const ID=/^com\.deckforge\.native\.[a-z0-9][a-z0-9.-]{0,110}$/;
const EVENTS=new Set(['appear','disappear','settings','press','release','rotateLeft','rotateRight','heldRotateLeft','heldRotateRight']);
const OPS=new Set(['title','titleFromSetting','state','toggleState','image']);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validText=(x,n)=>typeof x==='string'&&x.length>0&&x.length<=n;
const exact=(x,keys)=>obj(x)&&Object.keys(x).every(k=>keys.includes(k));
function check(ok,message){if(!ok)throw Error('DeckForge SDK: '+message);}
function validateNativeManifest(m){
  check(exact(m,['apiVersion','id','name','version','permissions','actions'])&&m.apiVersion===1&&
    typeof m.id==='string'&&ID.test(m.id)&&!m.id.endsWith('.')&&!m.id.includes('..')&&
    validText(m.name,180)&&validText(m.version,64),'invalid manifest or API version');
  check(Array.isArray(m.permissions)&&m.permissions.length===1&&m.permissions[0]==='display','unsupported permissions');
  check(Array.isArray(m.actions)&&m.actions.length>0&&m.actions.length<=64,'invalid actions');
  const ids=new Set();
  for(const a of m.actions){
    check(exact(a,['id','name','controllers','states','events'])&&typeof a.id==='string'&&
      a.id.startsWith(m.id+'.')&&/^[a-z0-9.-]+$/.test(a.id)&&a.id.length<=180&&
      !a.id.endsWith('.')&&!a.id.includes('..')&&!ids.has(a.id)&&validText(a.name,180),'invalid action');
    ids.add(a.id);
    check(Array.isArray(a.controllers)&&a.controllers.length>0&&a.controllers.length<=2&&
      new Set(a.controllers).size===a.controllers.length&&a.controllers.every(c=>['Keypad','Encoder'].includes(c))&&
      [1,2].includes(a.states)&&obj(a.events),'invalid action controllers, states or events');
    for(const [event,program] of Object.entries(a.events)){
      check(EVENTS.has(event)&&Array.isArray(program)&&program.length<=16,'unsupported event or program size');
      for(const op of program){
        check(obj(op)&&OPS.has(op.op),'unsupported operation');
        switch(op.op){
          case 'title':check(exact(op,['op','value'])&&typeof op.value==='string'&&op.value.length<=256,'invalid title');break;
          case 'titleFromSetting':check(exact(op,['op','key','fallback'])&&typeof op.key==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(op.key)&&
            !['__proto__','constructor','prototype'].includes(op.key)&&typeof op.fallback==='string'&&op.fallback.length<=256,'invalid setting reference');break;
          case 'state':check(exact(op,['op','value'])&&Number.isInteger(op.value)&&op.value>=0&&op.value<a.states,'invalid state');break;
          case 'toggleState':check(exact(op,['op'])&&a.states===2,'toggle requires two states');break;
          case 'image':{
            check(exact(op,['op','value'])&&typeof op.value==='string'&&op.value.length<=350000&&
              /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(op.value),'invalid PNG data URI');
            const bytes=Buffer.from(op.value.slice(22),'base64');
            check(bytes.length>=24&&bytes.length<=256*1024&&bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&
              bytes.toString('ascii',12,16)==='IHDR'&&bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(16)<=144&&
              bytes.readUInt32BE(20)>0&&bytes.readUInt32BE(20)<=144,'invalid PNG header or dimensions');break;
          }
        }
      }
    }
  }
  return m;
}
function catalog(m){return {uuid:m.id,name:m.name,version:m.version,runtime:'deckforge-sdk',
  actions:m.actions.map(a=>({uuid:a.id,name:a.name,states:a.states,controllers:a.controllers,
    propertyInspectorPath:'',defaultImages:{off:null,on:null}}))};}
class NativePluginHost{
  constructor(userData,onUpdate=()=>{}){
    this.root=path.join(userData,'Plugins');this.onUpdate=onUpdate;
    this.contexts=new Map();this.suspended=false;this.closed=false;
  }
  async manifests(){
    await fs.mkdir(this.root,{recursive:true});const items=[];
    for(const e of await fs.readdir(this.root,{withFileTypes:true})){
      if(!e.isFile()||!e.name.endsWith(SUFFIX))continue;
      try{
        const file=path.join(this.root,e.name),st=await fs.lstat(file);
        check(st.isFile()&&st.size<=LIMIT,'invalid installed program');
        const m=validateNativeManifest(JSON.parse(await fs.readFile(file,'utf8')));
        check(e.name===m.id+SUFFIX,'file ID mismatch');items.push(m);
      }catch(error){this.report(e.name,error);}
    }
    return items;
  }
  report(id,error){this.onUpdate({kind:'error',message:'DeckForge SDK '+id+': '+String(error?.message||error).slice(0,300)});}
  async install(m){
    validateNativeManifest(m);const data=JSON.stringify(m);
    check(Buffer.byteLength(data)<=LIMIT,'program too large');
    await fs.mkdir(this.root,{recursive:true});
    const tmp=path.join(this.root,'.native-'+randomUUID()),target=path.join(this.root,m.id+SUFFIX);
    try{
      await fs.writeFile(tmp,data,{flag:'wx'});
      // Exclusive publication: never replace the existing installed program.
      await fs.link(tmp,target);
    }finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
    return catalog(m);
  }
  run(ctx,event){
    if(ctx.failed||this.closed||this.suspended)return false;
    try{
      for(const op of ctx.action.events[event]||[]){
        const send=(kind,payload)=>this.onUpdate({kind,context:ctx.context,payload});
        if(op.op==='title')send('setTitle',{title:op.value});
        if(op.op==='titleFromSetting'){
          const value=Object.hasOwn(ctx.settings,op.key)?ctx.settings[op.key]:undefined;
          send('setTitle',{title:typeof value==='string'?value.slice(0,256):op.fallback});
        }
        if(op.op==='state'||op.op==='toggleState'){
          ctx.state=op.op==='state'?op.value:1-ctx.state;send('setState',{state:ctx.state});
        }
        if(op.op==='image')send('setImage',{image:op.value});
      }
      return true;
    }catch(error){ctx.failed=true;ctx.pressed=false;this.report(ctx.pluginUUID,error);return false;}
  }
  sync(configs,manifests){
    if(this.closed)return;
    const plugins=new Map(manifests.map(m=>[m.id,m])),seen=new Set();
    for(const cfg of configs){
      if(!cfg||typeof cfg.context!=='string'||!cfg.context||cfg.context.length>160||
        !Number.isInteger(cfg.slot)||cfg.slot<0||cfg.slot>18||seen.has(cfg.context))continue;
      const a=plugins.get(cfg.pluginUUID)?.actions.find(x=>x.id===cfg.actionUUID);
      if(!a||!a.controllers.includes(cfg.slot>=16?'Encoder':'Keypad'))continue;
      seen.add(cfg.context);
      const incoming=obj(cfg.settings)?cfg.settings:{};
      let ctx=this.contexts.get(cfg.context);
      const signature=JSON.stringify(a);
      if(!ctx||ctx.pluginUUID!==cfg.pluginUUID||ctx.action.id!==a.id||ctx.signature!==signature||ctx.slot!==cfg.slot||ctx.gesture!==cfg.gesture){
        if(ctx)this.run(ctx,'disappear');
        ctx={...cfg,action:a,signature,settings:incoming,state:0,pressed:false,failed:false};
        this.contexts.set(cfg.context,ctx);this.run(ctx,'appear');
      }else{
        const changed=JSON.stringify(ctx.settings)!==JSON.stringify(incoming);
        ctx.settings=incoming;
        if(changed)this.run(ctx,'settings');
      }
    }
    for(const [id,ctx] of this.contexts)if(!seen.has(id)){this.run(ctx,'disappear');this.contexts.delete(id);}
  }
  key(context,gesture,ticks=1){
    const ctx=this.contexts.get(context);
    if(!ctx||this.closed||this.suspended||ctx.failed)return false;
    if(gesture==='down'){if(ctx.pressed)return false;ctx.pressed=true;return this.run(ctx,'press');}
    if(gesture==='up'){if(!ctx.pressed)return false;ctx.pressed=false;return this.run(ctx,'release');}
    if(ctx.slot<16||!['left','right'].includes(gesture)||!Number.isInteger(ticks)||ticks<1||ticks>32)return false;
    const event=(ctx.gesture==='hold-left'||ctx.gesture==='hold-right'||ctx.pressed?'heldRotate':'rotate')+(gesture==='left'?'Left':'Right');
    for(let i=0;i<ticks;i++)if(!this.run(ctx,event))return false;
    return true;
  }
  suspend(){this.suspended=true;for(const ctx of this.contexts.values())ctx.pressed=false;}
  resume(){this.suspended=false;for(const ctx of this.contexts.values()){ctx.failed=false;this.run(ctx,'appear');}}
  close(){this.closed=true;this.contexts.clear();}
}
// Compatibility host stays unchanged; only validated native IDs are routed here.
class PluginRouter{
  constructor(legacy,native){this.legacy=legacy;this.native=native;this.queue=Promise.resolve();this.closed=false;}
  serial(fn){const task=this.queue.then(()=>{if(this.closed)throw Error('Plugin host closed');return fn();});this.queue=task.catch(()=>{});return task;}
  async catalog(){
    const legacy=await this.legacy.list(),ids=new Set(legacy.map(x=>x.uuid.toLowerCase()));
    const native=(await this.native.manifests()).filter(m=>!ids.has(m.id));
    return {legacy,native};
  }
  async list(){const {legacy,native}=await this.catalog();return [...legacy,...native.map(catalog)];}
  install(bytes){return this.serial(async()=>{
    // Existing archive validator remains authoritative; native collisions cannot shadow a legacy plugin.
    const {parseArchive}=require('./sd-plugin-host.cjs');
    const {manifest}=await parseArchive(bytes);
    check(!(await this.native.manifests()).some(m=>m.id===manifest.UUID.toLowerCase()),'plugin ID already installed');
    return this.legacy.install(bytes);
  });}
  installDirectory(dir){return this.serial(async()=>{
    const installed=new Set((await this.native.manifests()).map(m=>m.id));
    const id=path.basename(dir).replace(/\.sdPlugin$/i,'').toLowerCase();
    check(!installed.has(id),'plugin ID already installed');
    // The existing folder importer ultimately uses the manifest UUID, not its folder name.
    if(installed.size){
      const file=path.join(dir,'manifest.json'),st=await fs.lstat(file);
      check(st.isFile()&&st.size<=LIMIT,'invalid SDK manifest');
      const m=JSON.parse(await fs.readFile(file,'utf8'));
      check(typeof m.UUID==='string'&&!installed.has(m.UUID.toLowerCase()),'plugin ID already installed');
    }
    return this.legacy.installDirectory(dir);
  });}
  installNative(m){return this.serial(async()=>{
    validateNativeManifest(m);
    check(!(await this.legacy.list()).some(p=>p.uuid.toLowerCase()===m.id),'plugin ID already installed');
    return this.native.install(m);
  });}
  sync(configs){return this.serial(async()=>{
    const {native}=await this.catalog(),ids=new Set(native.map(m=>m.id));
    const local=configs.filter(c=>ids.has(c?.pluginUUID));
    const other=configs.filter(c=>!ids.has(c?.pluginUUID));
    // Remove stale legacy contexts before publishing a new native context.
    try{await this.legacy.sync(other);}finally{if(!this.closed)this.native.sync(local,native);}
  });}
  key(context,gesture,ticks){if(this.closed)return false;return this.native.contexts.has(context)?this.native.key(context,gesture,ticks):this.legacy.key(context,gesture,ticks);}
  inspector(context){return this.native.contexts.has(context)?false:this.legacy.inspector(context);}
  onSystemSuspend(){this.native.suspend();this.legacy.onSystemSuspend();}
  onSystemResume(){this.native.resume();this.legacy.onSystemResume();}
  async close(){this.closed=true;this.native.close();await this.legacy.close();}
}
module.exports={validateNativeManifest,NativePluginHost,PluginRouter,LIMIT};
