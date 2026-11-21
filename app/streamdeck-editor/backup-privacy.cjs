'use strict';
// Local-only heuristic scan before an unencrypted DeckForge backup.
// Never include matched text or secrets in the scan result.
const MAX_FINDINGS=24, MAX_NODES=200000, MAX_TEXT=100000;
const SENSITIVE_KEY=/(?:^|[_.-])(?:password|passwd|passphrase|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credential|authorization|비밀번호|토큰|인증키)(?:$|[_.-])/i;
const EMAIL=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE=/(?<!\d)01[016789][ -]?\d{3,4}[ -]?\d{4}(?!\d)/;
const LANDLINE=/(?<!\d)(?:02|0[3-6][1-5])[ -]?\d{3,4}[ -]?\d{4}(?!\d)/;
const ADDRESS=/(?:[가-힣\d]{2,}(?:로|길)\s*\d{1,4}(?:-\d{1,4})?|[가-힣]{2,}(?:동|읍|면|리)\s*\d{1,4}(?:-\d{1,4})?)/;
const INLINE_SECRET=/(?:Bearer\s+[A-Za-z0-9._-]{12,}|(?:api[_-]?key|access[_-]?token|password|passwd|secret|token|비밀번호|토큰|인증키)\s*[:=]\s*["']?[^\s"'&]{4,})/i;
const ACCOUNT_CONTEXT=/(?:계좌(?:번호)?|은행|입금|송금|예금주|bank\s*account|account\s*(?:no|number))/i;
const ACCOUNT_NUMBER=/(?<!\d)\d{2,6}(?:[- ]\d{2,6}){1,3}(?!\d)/;
function luhn(digits){
  let sum=0,double=false;
  for(let i=digits.length-1;i>=0;i--){
    let n=Number(digits[i]);if(double){n*=2;if(n>9)n-=9;}
    sum+=n;double=!double;
  }
  return sum%10===0;
}
function rrn(text){
  const pattern=/(?<!\d)(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[ -]?([1-8])\d{6}(?!\d)/g;
  for(const match of text.matchAll(pattern)){
    const year=[1,2,5,6].includes(Number(match[4]))?1900+Number(match[1]):2000+Number(match[1]);
    const month=Number(match[2]),day=Number(match[3]);
    const valid=new Date(Date.UTC(year,month-1,day));
    if(valid.getUTCFullYear()===year&&valid.getUTCMonth()===month-1&&valid.getUTCDate()===day)return true;
  }
  return false;
}
function cards(text){
  const pattern=/(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g;
  for(const item of text.matchAll(pattern)){
    const digits=item[0].replace(/\D/g,'');
    if(digits.length>=13&&digits.length<=19&&luhn(digits))return true;
  }
  return false;
}
function classify(value,key=''){
  if(!value||/^data:(?:image|audio|video)\//i.test(value))return [];
  const found=[];
  if(SENSITIVE_KEY.test(key)&&value.trim())found.push('인증 정보');
  if(INLINE_SECRET.test(value))found.push('인증 정보');
  if(rrn(value))found.push('주민등록번호 의심');
  if(cards(value))found.push('카드번호 의심');
  if(PHONE.test(value))found.push('휴대전화번호');
  if(LANDLINE.test(value))found.push('일반 전화번호');
  if(EMAIL.test(value))found.push('이메일 주소');
  if(ADDRESS.test(value))found.push('주소 의심');
  if(ACCOUNT_CONTEXT.test(value)&&ACCOUNT_NUMBER.test(value))found.push('계좌번호 의심');
  return [...new Set(found)];
}
function scan(data){
  if(!data||typeof data!=='object'||!data.profiles)throw Error('검사할 백업 데이터가 없습니다.');
  const findings=[],recorded=new Set(),state=data.profiles;
  let total=0,nodes=0,incomplete=false;
  function record(type,location){
    const id=type+'\0'+location;
    if(recorded.has(id))return;
    recorded.add(id);total++;
    if(findings.length<MAX_FINDINGS)findings.push({type,location});
  }
  function walk(node,location,key='',depth=0){
    if(++nodes>MAX_NODES){incomplete=true;return;}
    if(depth>32){incomplete=true;return;}
    if(typeof node==='string'){
      if(node.length>MAX_TEXT)incomplete=true;
      for(const type of classify(node.slice(0,MAX_TEXT),key))record(type,location);
    }else if(Array.isArray(node)){
      for(const item of node)walk(item,location,key,depth+1);
    }else if(node&&typeof node==='object'){
      for(const [name,value] of Object.entries(node)){
        if(['icon','titleStyle','image','dataUrl','keyBackgrounds','titleBackground','outlineColor','backgroundColor'].includes(name))continue;
        walk(value,location,name,depth+1);
      }
    }
  }
  function scanSnapshot(snapshot,base){
    if(!snapshot||typeof snapshot!=='object')return;
    (snapshot.pages||[]).forEach((page,p)=>{
      if(!Array.isArray(page))return;
      page.forEach((action,i)=>{if(action)walk(action,base+' · '+(p+1)+'페이지 · '+(i+1)+'번 버튼');});
    });
    (snapshot.pinned||[]).forEach((action,i)=>{if(action)walk(action,base+' · 고정 버튼 '+(i+1));});
    (snapshot.controls?.global||[]).forEach((binding,i)=>walk(binding,base+' · 공통 입력 '+(i+1)));
    (snapshot.controls?.pages||[]).forEach((row,p)=>row?.forEach((binding,i)=>walk(binding,base+' · '+(p+1)+'페이지 · 물리 입력 '+(i+1))));
    if(snapshot.wideDisplay)walk(snapshot.wideDisplay,base+' · 와이드 화면');
  }
  (state.profileNames||[]).forEach((profile,index)=>{
    const base='프로필 '+(index+1),snapshot=profile.id===state.profileId?state:(state.inactiveProfiles||[]).find(s=>s.id===profile.id);
    walk(profile.name||'',base,'name');walk(profile.appPath||'',base+' · 연결 프로그램','appPath');
    scanSnapshot(snapshot,base);
  });
  (state.profileTemplates||[]).forEach((item,index)=>{
    walk(item.name||'','템플릿 '+(index+1),'name');
    scanSnapshot(item.snapshot,'템플릿 '+(index+1));
  });
  (data.packs||[]).forEach((pack,index)=>{
    walk(pack.name||'','아이콘팩 '+(index+1),'name');
    (pack.icons||[]).forEach((icon,i)=>walk(icon.name||'','아이콘팩 '+(index+1)+' · 아이콘 '+(i+1),'name'));
  });
  return {findings,total,incomplete};
}
module.exports={scan};
