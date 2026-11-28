'use strict';
// Native plugin views are independent renderers; no editor bridge or Node access.
const path=require('node:path');
const {createHash}=require('node:crypto');
const {validateValue}=require('./deckforge-native-settings.cjs');
const ID=/^[a-z][a-z0-9_-]{0,63}$/;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).every(k=>keys.includes(k));
const size=(v,min,max)=>v===undefined||(Number.isInteger(v)&&v>=min&&v<=max);
function validateNativeViews(views,enabled){
  if(!enabled){if(views!==undefined)throw Error('views requires view.open');return;}
  if(!object(views)||Object.keys(views).length<1||Object.keys(views).length>16)throw Error('invalid views');
  for(const [id,v] of Object.entries(views)){
    if(!ID.test(id)||['constructor','prototype','__proto__'].includes(id)||!exact(v,['title','mode','width','height','html'])||
      typeof v.title!=='string'||!v.title.trim()||v.title.length>120||/[\x00-\x1f\x7f]/.test(v.title)||
      !['window','modal'].includes(v.mode)||!size(v.width,320,1600)||!size(v.height,220,1200)||
      typeof v.html!=='string'||!v.html.trim()||Buffer.byteLength(v.html)>65536)throw Error('invalid native view');
  }
}
function snapshot(value){validateValue(value);const copy=JSON.parse(JSON.stringify(value));return validateValue(copy);}
function validateViewOperation(op,views){
  if(!exact(op,['op','view','input'])||Object.keys(op).length!==3||op.op!=='openView'||typeof op.view!=='string'||!views||!Object.hasOwn(views,op.view))throw Error('unknown native view');
  snapshot(op.input);
}
const channels={input:'deckforge:native-view-input',submit:'deckforge:native-view-submit',close:'deckforge:native-view-close'};
const configured=new WeakSet();
const CSP="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
function documentUrl(html){
  return 'data:text/html;charset=utf-8;base64,'+Buffer.from('<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+CSP+'">'+html,'utf8').toString('base64');
}
class NativeViewManager{
  constructor(getParent=()=>null,{visible=true}={}){
    const {ipcMain}=require('electron');
    this.ipcMain=ipcMain;this.getParent=getParent;this.visible=visible;this.closed=false;this.records=new Map();
    ipcMain.handle(channels.input,event=>snapshot(this.sender(event).input));
    ipcMain.handle(channels.submit,(event,value)=>{
      const record=this.sender(event),result=snapshot(value);
      record.finish({status:'submitted',value:result});return true;
    });
    ipcMain.handle(channels.close,event=>{this.sender(event).finish({status:'closed'});return true;});
  }
  sender(event){
    const record=this.records.get(event.sender.id);
    if(!record||record.win.isDestroyed()||event.sender!==record.win.webContents||
      event.senderFrame!==record.win.webContents.mainFrame||!record.active())throw Error('inactive native view');
    return record;
  }
  cancel(ctx){
    for(const record of [...this.records.values()])if(record.ctx===ctx)record.finish({status:'cancelled'});
  }
  cancelPlugin(id){for(const record of [...this.records.values()])if(record.ctx.pluginUUID===id)record.finish({status:'cancelled'});}
  cancelAll(){for(const record of [...this.records.values()])record.finish({status:'cancelled'});}
  close(){
    if(this.closed)return;this.closed=true;
    this.cancelAll();
    for(const channel of Object.values(channels))this.ipcMain.removeHandler(channel);
  }
  async open(ctx,op,active){
    if(this.closed||!active())return {status:'cancelled'};
    const m=ctx.viewManifest;
    if(!m?.permissions.includes('view.open'))return {status:'unavailable'};
    validateViewOperation(op,m.views);
    const existing=[...this.records.values()].find(r=>r.ctx.pluginUUID===ctx.pluginUUID);
    if(existing){if(existing.ctx===ctx&&!existing.win.isDestroyed()&&this.visible){existing.win.show();existing.win.focus();}return {status:'busy'};}
    if(this.records.size>=8)return {status:'busy'};
    const {BrowserWindow,session}=require('electron'),view=m.views[op.view];
    const parent=view.mode==='modal'?this.getParent():null;
    if(view.mode==='modal'&&(!parent||parent.isDestroyed()))return {status:'unavailable'};
    const partition='deckforge-native-view-'+createHash('sha256').update(m.id).digest('hex');
    const ses=session.fromPartition(partition,{cache:false});
    if(!configured.has(ses)){
      ses.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
      ses.setPermissionCheckHandler(()=>false);
      ses.setDisplayMediaRequestHandler?.((_request,cb)=>cb({}));
      ses.on('will-download',event=>event.preventDefault());
      ses.webRequest.onBeforeRequest((details,cb)=>cb({cancel:! /^(data|blob):/i.test(details.url)}));
      configured.add(ses);
    }
    const win=new BrowserWindow({show:false,title:m.name+' · '+view.title,width:view.width??560,height:view.height??480,
      autoHideMenuBar:true,...(parent?{parent,modal:true}:{}),
      webPreferences:{session:ses,preload:path.join(__dirname,'deckforge-view-preload.cjs'),
        sandbox:true,contextIsolation:true,nodeIntegration:false,nodeIntegrationInSubFrames:false,nodeIntegrationInWorker:false,
        webSecurity:true,webviewTag:false,allowRunningInsecureContent:false}});
    const wc=win.webContents,id=wc.id;
    return new Promise(resolve=>{
      let done=false,timer=null;
      const finish=result=>{
        if(done)return;done=true;clearTimeout(timer);this.records.delete(id);
        try{if(!win.isDestroyed())win.destroy();}catch{}
        resolve(result);
      };
      const record={ctx,win,input:snapshot(op.input),active,finish};this.records.set(id,record);
      win.on('closed',()=>finish({status:'closed'}));
      win.on('page-title-updated',event=>event.preventDefault());
      wc.on('render-process-gone',()=>finish({status:'error'}));
      wc.setWindowOpenHandler(()=>({action:'deny'}));
      for(const event of ['will-navigate','will-frame-navigate','will-redirect','will-attach-webview'])wc.on(event,e=>e.preventDefault());
      wc.setWebRTCIPHandlingPolicy?.('disable_non_proxied_udp');
      timer=setTimeout(()=>finish({status:'error'}),10000);
      win.loadURL(documentUrl(view.html)).then(()=>{
        clearTimeout(timer);if(done)return;
        if(!active())return finish({status:'cancelled'});
        if(this.visible){if(parent&&!parent.isVisible())parent.show();win.show();win.focus();}
      }).catch(()=>finish({status:'error'}));
    });
  }
}
module.exports={validateNativeViews,validateViewOperation,NativeViewManager};
