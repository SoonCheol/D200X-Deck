'use strict';
// DeckForge test-stage profiles: standalone atomic JSON + content-addressed icons.
// Existing localStorage is deliberately left untouched, but is not migrated.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const MIME_TO_EXT={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg'};
const EXT_TO_MIME=Object.fromEntries(Object.entries(MIME_TO_EXT).map(([mime,ext])=>[ext,mime]));
const REF=/^deckforge-icon:\/\/([0-9a-f]{64})\.(png|jpg|webp|gif|svg)$/;
const IMAGE=/^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=]+)$/;
const MAX_ICON_BYTES=8*1024*1024;
const MAX_PROFILE_BYTES=128*1024*1024;
const RECEIPTS='_deckforgeNativeSettingsReceiptsV1';
const RECEIPT_LIMIT=4096,RECEIPT_TTL=24*60*60*1000;
const {validSdkMount,visibleActions,activeControlAction,controlBinding}=require('./deck-core.js');
const requestId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const digestRequest=request=>hash([request.context,request.instanceId,request.mountGeneration,request.expectedRevision,
  request.pluginUUID,request.actionUUID,request.slot,request.gesture,request.expectedSettings,request.operation.value,request.expiresAt]);
function requestItem(state,request){
  if(!state)return null;
  const item=request.slot<14?visibleActions(state)[request.slot]:activeControlAction(controlBinding(state,request.slot),request.gesture);
  return item?.type==='sd-plugin'&&item.instanceId===request.instanceId&&
    item.settings?.pluginUUID===request.pluginUUID&&item.settings?.actionUUID===request.actionUUID?item:null;
}
class ProfileStore{
  constructor(userData){
    this.root=path.join(userData,'Profiles');
    this.file=path.join(this.root,'profiles.json');
    this.icons=path.join(userData,'Resources','Icons');
    this.receipts=null;
  }
  storeIcon(text){
    const m=IMAGE.exec(text);
    if(!m)return text;
    const bytes=Buffer.from(m[2],'base64');
    if(!bytes.length||bytes.length>MAX_ICON_BYTES)throw Error('아이콘 크기가 허용 범위를 벗어났습니다.');
    const hash=crypto.createHash('sha256').update(bytes).digest('hex');
    const ext=MIME_TO_EXT[m[1]],name=hash+'.'+ext;
    fs.mkdirSync(this.icons,{recursive:true});
    const dest=path.join(this.icons,name);
    if(!fs.existsSync(dest)){
      const tmp=dest+'.'+crypto.randomUUID()+'.tmp';
      try{fs.writeFileSync(tmp,bytes,{flag:'wx'});fs.renameSync(tmp,dest);}
      finally{if(fs.existsSync(tmp))fs.rmSync(tmp,{force:true});}
    }
    return 'deckforge-icon://'+name;
  }
  readIcon(value){
    const m=REF.exec(value);
    if(!m)return value;
    const filename=m[1]+'.'+m[2];
    const bytes=fs.readFileSync(path.join(this.icons,filename));
    if(bytes.length>MAX_ICON_BYTES)throw Error('저장된 아이콘 크기가 올바르지 않습니다.');
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==m[1])throw Error('아이콘 파일 검증에 실패했습니다.');
    return 'data:'+EXT_TO_MIME[m[2]]+';base64,'+bytes.toString('base64');
  }
  read(){
    if(!fs.existsSync(this.file)){this.receipts=[];return null;}
    const raw=fs.readFileSync(this.file);
    if(raw.length>MAX_PROFILE_BYTES)throw Error('프로필 파일 용량 제한을 초과했습니다.');
    const state=JSON.parse(raw.toString('utf8'),(_key,value)=>
      typeof value==='string'?this.readIcon(value):value);
    if(!object(state))throw Error('잘못된 프로필 데이터입니다.');
    const receipts=Object.hasOwn(state,RECEIPTS)?state[RECEIPTS]:[];
    if(!Array.isArray(receipts)||receipts.length>RECEIPT_LIMIT||
       new Set(receipts.map(r=>r?.id)).size!==receipts.length||
       receipts.some(r=>!object(r)||!requestId(r.id)||typeof r.context!=='string'||r.context.length>160||
         !/^[0-9a-f]{64}$/.test(r.digest)||!Number.isSafeInteger(r.at)||r.status!=='saved'))
      throw Error('SDK 저장 결과 기록이 손상되었습니다.');
    this.receipts=receipts;
    delete state[RECEIPTS];
    return state;
  }
  loadReceipts(){
    if(this.receipts===null)this.read();
    return this.receipts;
  }
  nativeReceipt(context,id){
    return this.loadReceipts().find(r=>r.id===id&&r.context===context)?.status||null;
  }
  // The request is taken from the trusted active host, never from a plugin or
  // the renderer's proposed profile. Only one committed action is changed.
  commitNativeSettings(request,now=Date.now()){
    if(!request||!requestId(request.requestId)||request.requestId!==request.receiptId||
       !validSdkMount({...request,configRevision:request.expectedRevision})||
       !request.pluginUUID.startsWith('com.deckforge.native.')||
       request.operation?.op!=='settings'||!object(request.operation.value)||!object(request.expectedSettings)||
       Buffer.byteLength(JSON.stringify(request.operation.value))>8192||
       !Number.isFinite(request.expiresAt))return {status:'rejected'};
    const state=this.read(),receipts=this.loadReceipts();
    const digest=digestRequest(request);
    const prior=receipts.find(r=>r.id===request.requestId);
    if(prior&&prior.digest!==digest)return {status:'rejected'};
    if(now>request.expiresAt||!state)return {status:'rejected'};
    const item=requestItem(state,request);
    if(!item)return {status:'rejected'};
    const actual=item.settings.pluginSettings||{};
    if(prior)return {status:JSON.stringify(actual)===JSON.stringify(request.operation.value)?'saved':'rejected',duplicate:true};
    if(JSON.stringify(actual)!==JSON.stringify(request.expectedSettings))return {status:'rejected'};
    const retained=receipts.filter(r=>now-r.at<=RECEIPT_TTL);
    if(retained.length>=RECEIPT_LIMIT)return {status:'rejected'};
    item.settings.pluginSettings=structuredClone(request.operation.value);
    const next=[...retained,{id:request.requestId,context:request.context,digest,at:now,status:'saved'}];
    // State and receipt are one atomic replacement, not two files.
    this.writeDocument(state,next);
    return {status:'saved'};
  }
  // Read-only reconciliation: never repeat a write after a lost reply.
  nativeSettingsOutcome(request){
    try{
      if(!request||!requestId(request.requestId)||request.requestId!==request.receiptId)return {status:'unknown'};
      const state=this.read(),prior=this.loadReceipts().find(r=>r.id===request.requestId);
      if(!state)return {status:'unknown'};
      const item=requestItem(state,request);
      if(prior){
        if(prior.context!==request.context||prior.digest!==digestRequest(request)||!item||
           JSON.stringify(item.settings.pluginSettings||{})!==JSON.stringify(request.operation.value))
          return {status:'unknown'};
        return {status:'saved',recovered:true};
      }
      return item&&JSON.stringify(item.settings.pluginSettings||{})===JSON.stringify(request.expectedSettings)?
        {status:'rejected'}:{status:'unknown'};
    }catch{return {status:'unknown'};}
  }
  commitNativeSettingsChecked(request){
    try{return this.commitNativeSettings(request);}
    catch{return this.nativeSettingsOutcome(request);}
  }
  write(state){
    return this.writeDocument(state,this.loadReceipts().filter(r=>Date.now()-r.at<=RECEIPT_TTL));
  }
  writeDocument(state,receipts){
    if(!object(state))throw Error('잘못된 프로필 데이터입니다.');
    const document={...state};delete document[RECEIPTS];
    if(receipts.length)document[RECEIPTS]=receipts;
    const serialized=JSON.stringify(document,(_key,value)=>
      typeof value==='string'?this.storeIcon(value):value);
    if(Buffer.byteLength(serialized,'utf8')>MAX_PROFILE_BYTES)throw Error('프로필 파일 용량 제한을 초과했습니다.');
    fs.mkdirSync(this.root,{recursive:true});
    const tmp=this.file+'.'+crypto.randomUUID()+'.tmp';
    try{
      fs.writeFileSync(tmp,serialized,{encoding:'utf8',flag:'wx',flush:true});
      if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.bak');
      fs.renameSync(tmp,this.file);
      this.receipts=receipts;
    }finally{if(fs.existsSync(tmp))fs.rmSync(tmp,{force:true});}
    return true;
  }
}
module.exports={ProfileStore};
