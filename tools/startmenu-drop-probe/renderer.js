const log=document.querySelector('#log'),records=[];
document.querySelector('#version').textContent='Probe 0.2.0 | '+JSON.stringify(probe.versions);
function add(x){records.push({time:new Date().toISOString(),label:document.querySelector('#label').value,...x});log.value=JSON.stringify({probeVersion:'0.2.0',versions:probe.versions,records},null,2);}
function chooseEffect(d){
 const allowed=d.effectAllowed;
 if(allowed==='link'||allowed==='linkMove')return 'link';
 if(['copy','copyLink','copyMove','all','uninitialized'].includes(allowed))return 'copy';
 if(allowed==='move')return 'move';
 return 'none';
}
let lastOver=0,lastEffect='';
for(const event of ['dragenter','dragover','drop'])window.addEventListener(event,e=>{
 const d=e.dataTransfer;if(!d)return;
 e.preventDefault();
 const before=d.dropEffect;
 if(event!=='drop')d.dropEffect=chooseEffect(d);
 if(event==='dragenter'){lastOver=0;lastEffect='';}
 if(event==='dragover'){
  const now=Date.now(),key=d.effectAllowed+'/'+d.dropEffect;
  if(now-lastOver<500&&key===lastEffect)return;
  lastOver=now;lastEffect=key;
 }
 const files=Array.from(d.files,f=>{let path,error;try{path=probe.pathForFile(f)}catch(e){error=String(e)}return {name:f.name,size:f.size,type:f.type,path,error}});
 const strings={};if(event==='drop')for(const t of d.types)if(t!=='Files'){try{strings[t]=d.getData(t).slice(0,4096)}catch(e){strings[t]=String(e)}}
 add({event,types:Array.from(d.types),items:Array.from(d.items,i=>({kind:i.kind,type:i.type})),files,strings,effectAllowed:d.effectAllowed,dropEffectBefore:before,dropEffect:d.dropEffect});
});
document.querySelector('#save').onclick=()=>probe.save(log.value);document.querySelector('#clear').onclick=()=>{records.length=0;lastOver=0;lastEffect='';log.value='';};
