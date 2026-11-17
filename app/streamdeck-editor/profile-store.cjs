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
class ProfileStore{
  constructor(userData){
    this.root=path.join(userData,'Profiles');
    this.file=path.join(this.root,'profiles.json');
    this.icons=path.join(userData,'Resources','Icons');
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
    if(!fs.existsSync(this.file))return null;
    const raw=fs.readFileSync(this.file);
    if(raw.length>MAX_PROFILE_BYTES)throw Error('프로필 파일 용량 제한을 초과했습니다.');
    return JSON.parse(raw.toString('utf8'),(_key,value)=>
      typeof value==='string'?this.readIcon(value):value);
  }
  write(state){
    if(!state||typeof state!=='object'||Array.isArray(state))throw Error('잘못된 프로필 데이터입니다.');
    const serialized=JSON.stringify(state,(_key,value)=>
      typeof value==='string'?this.storeIcon(value):value);
    if(Buffer.byteLength(serialized,'utf8')>MAX_PROFILE_BYTES)throw Error('프로필 파일 용량 제한을 초과했습니다.');
    fs.mkdirSync(this.root,{recursive:true});
    const tmp=this.file+'.'+crypto.randomUUID()+'.tmp';
    try{
      fs.writeFileSync(tmp,serialized,{encoding:'utf8',flag:'wx'});
      if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.bak');
      fs.renameSync(tmp,this.file);
    }finally{if(fs.existsSync(tmp))fs.rmSync(tmp,{force:true});}
    return true;
  }
}
module.exports={ProfileStore};
