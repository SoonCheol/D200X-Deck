'use strict';
// Inert HTML parsing. Field proposals are review artifacts, not executable
// property inspectors. Never load scripts, styles, network URLs or form data.
const parse5=require('parse5');
const path=require('node:path').posix;
const {validateNativeSettingsSchema}=require('./deck-core.js');
const MAX=256*1024;
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,48}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v);
const sensitive=v=>/token|password|secret|credential|authorization|headers?|api[_-]?key|cookie|request[_-]?body|url|endpoint/i.test(v);
const attrs=n=>Object.fromEntries((n.attrs||[]).map(a=>[a.name,a.value]));
function nodes(root){
  const list=[],stack=[root];
  while(stack.length){
    const n=stack.pop();if(list.length>=20000)throw Error('HTML node limit');
    list.push(n);
    if(n.childNodes)for(let i=n.childNodes.length-1;i>=0;i--)stack.push(n.childNodes[i]);
  }
  return list;
}
function text(n){return nodes(n).filter(x=>x.nodeName==='#text').map(x=>x.value).join(' ').replace(/\s+/g,' ').trim().slice(0,100);}
function localRef(entry,ref){
  if(typeof ref!=='string'||!ref||ref.length>1024||/[:\\?#%\x00-\x20\x7f]/.test(ref)||ref.startsWith('/'))return null;
  const normalized=path.normalize(path.join(path.dirname(entry),ref));
  if(normalized==='..'||normalized.startsWith('../')||normalized.startsWith('/')||normalized==='.')return null;
  return normalized;
}
function parseHtml(html){
  if(typeof html!=='string'||Buffer.byteLength(html)>MAX)throw Error('HTML size limit');
  return nodes(parse5.parse(html,{scriptingEnabled:false}));
}
function analyzeHtml(entry,html,{inspector=false}={}){
  const all=parseHtml(html),scripts=[],findings=[],fields=[],proposals=[],names=new Set();
  const note=(code,key='')=>{if(findings.length<200)findings.push({code,key});};
  for(const n of all){
    const a=attrs(n);
    if(n.tagName==='script'){
      const local=localRef(entry,a.src);
      scripts.push({path:local,kind:local?'local':a.src?'external':'inline'});
      note(local?'script-review':'unsupported-script');
    }
    if(Object.keys(a).some(k=>k.startsWith('on')))note('inline-handler');
    if(['iframe','object','embed','base'].includes(n.tagName))note('unsupported-element',n.tagName);
  }
  if(!inspector)return {scripts,findings};
  const form=all.find(n=>n.tagName==='form'&&attrs(n).id==='property-inspector');
  if(!form){note('property-form-missing');return {scripts,findings,fields,settingsSchemaCandidate:[],requiresReview:true};}
  const formNodes=nodes(form);
  for(const n of formNodes){
    if(!['input','select','textarea'].includes(n.tagName))continue;
    const a=attrs(n),name=a.name,type=n.tagName==='input'?(a.type||'text').toLowerCase():n.tagName;
    if(!key(name)||names.has(name)){note('invalid-or-duplicate-field',typeof name==='string'?name.slice(0,48):'');continue;}
    names.add(name);
    const label=formNodes.find(x=>x.tagName==='label'&&a.id&&attrs(x).for===a.id);
    let parent=n.parentNode,near=null;
    while(parent&&parent!==form){
      if((attrs(parent).class||'').split(/\s+/).includes('uspi-item')){
        near=nodes(parent).find(x=>(attrs(x).class||'').split(/\s+/).includes('uspi-item-label'));break;
      }
      parent=parent.parentNode;
    }
    const title=(label&&text(label))||(near&&text(near))||name;
    const field={key:name,label:title,type,status:'review'};
    fields.push(field);
    // Do not export raw default values for fields likely to contain secrets.
    if(sensitive(name)||sensitive(title)||['password','hidden','file'].includes(type)){field.reason='sensitive-or-external-value';continue;}
    if(['disabled','readonly','required','pattern','multiple'].some(k=>Object.hasOwn(a,k))){
      field.reason='unsupported-constraints';continue;
    }
    let proposal=null;
    if(type==='text'){
      const maxLength=a.maxlength===undefined?256:Number(a.maxlength);
      proposal={key:name,label:title,type:'text',maxLength,default:a.value||''};
    }else if(type==='number'){
      if(a.min===undefined||a.max===undefined||a.value===undefined||a.step&&a.step!=='1'){
        field.reason='number-contract-unknown';continue;
      }
      proposal={key:name,label:title,type:'integer',min:Number(a.min),max:Number(a.max),default:Number(a.value)};
    }else if(type==='checkbox'){
      // HTML form serialization is often string-valued (e.g. "digital"/"on").
      // Do not silently replace that contract with a boolean.
      field.reason='checkbox-serialization-review';continue;
    }else if(type==='select'){
      const choices=nodes(n).filter(x=>x.tagName==='option');
      if(!choices.length){field.reason='dynamic-options';continue;}
      if(choices.some(x=>Object.hasOwn(attrs(x),'disabled'))){field.reason='disabled-options';continue;}
      const options=choices.map(x=>({value:attrs(x).value??text(x),label:text(x)}));
      const selected=choices.filter(x=>Object.hasOwn(attrs(x),'selected'));
      if(selected.length>1){field.reason='multiple-defaults';continue;}
      proposal={key:name,label:title,type:'select',options,default:selected.length?(attrs(selected[0]).value??text(selected[0])):options[0].value};
    }else {field.reason='unsupported-control';continue;}
    try{
      validateNativeSettingsSchema([...proposals,proposal]);
      proposals.push(proposal);field.status='schema-proposal';field.reason='requires-source-setting-contract-review';
    }catch{field.reason='native-schema-limit';}
  }
  return {scripts,findings,fields,settingsSchemaCandidate:proposals,requiresReview:true};
}
function imageReport(bytes,relative){
  const ext=path.extname(relative).toLowerCase();
  if(ext!=='.png')return {format:ext.slice(1)||'unknown',status:'manual-resource-review'};
  if(bytes.length<33||bytes.length>256*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||
    bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR')
    return {format:'png',status:'invalid-or-oversize'};
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  return {format:'png',width,height,status:width>0&&height>0&&width<=144&&height<=144?'header-candidate':'resize-or-invalid'};
}
module.exports={analyzeHtml,imageReport,localRef,MAX};
