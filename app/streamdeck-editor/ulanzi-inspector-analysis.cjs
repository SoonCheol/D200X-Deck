'use strict';
// Inert HTML parsing. Field proposals are review artifacts, not executable
// property inspectors. Never load scripts, styles, network URLs or form data.
const parse5=require('parse5');
const acorn=require('acorn');
const path=require('node:path').posix;
const {validateNativeSettingsSchema}=require('./deck-core.js');
const {gifReport,svgReport}=require('./ulanzi-media-analysis.cjs');
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
  if(!inspector){
    const tags=new Set(['html','head','body','title','script']);
    const wrapper=scripts.length===1&&scripts[0].kind==='local'&&/\.js$/i.test(scripts[0].path)&&
      findings.every(f=>f.code==='script-review')&&all.every(n=>{
        const a=attrs(n);
        if(n.tagName==='script')return Object.keys(a).every(k=>['src','type'].includes(k))&&
          (a.type===undefined||a.type==='module'||a.type==='text/javascript')&&
          !(n.childNodes||[]).some(x=>x.nodeName==='#text'&&x.value.trim());
        if(n.tagName)return tags.has(n.tagName)&&Object.keys(a).length===0;
        return n.nodeName!=='#text'||!n.value.trim()||n.parentNode?.tagName==='title';
      });
    return {scripts,findings,staticWrapper:wrapper};
  }
  const forms=all.filter(n=>n.tagName==='form');
  const form=forms.find(n=>attrs(n).id==='property-inspector');
  if(!form){note('property-form-missing');return {scripts,findings,fields,settingsSchemaCandidate:[],requiresReview:true};}
  const formNodes=nodes(form),radioGroups=new Map();
  for(const node of formNodes){const a=attrs(node);if(node.tagName==='input'&&a.type?.toLowerCase()==='radio'){const group=radioGroups.get(a.name)||[];group.push(node);radioGroups.set(a.name,group);}}
  for(const n of formNodes){
    if(!['input','select','textarea'].includes(n.tagName))continue;
    const a=attrs(n),name=a.name,type=n.tagName==='input'?(a.type||'text').toLowerCase():n.tagName;
    if(type==='radio'&&radioGroups.get(name)?.[0]!==n)continue;
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
    }else if(type==='radio'){
      const group=radioGroups.get(name)||[],selected=group.filter(x=>Object.hasOwn(attrs(x),'checked'));
      if(group.length<2||selected.length!==1||group.some(x=>{
        const a=attrs(x);
        return a.value===undefined||['disabled','readonly','required','pattern','multiple','form'].some(k=>Object.hasOwn(a,k));
      })){field.reason='radio-contract-unknown';continue;}
      const options=group.map(x=>{
        const a=attrs(x),label=formNodes.find(y=>y.tagName==='label'&&a.id&&attrs(y).for===a.id);
        return {value:a.value,label:label?text(label):a.value};
      });
      proposal={key:name,label:near?text(near):name,type:'select',options,default:attrs(selected[0]).value};
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
  // Only a fully described inert form may enter source/schema binding.
  // Unknown markup, attributes, active/external resources and unrepresented
  // controls remain review-only rather than silently changing behavior.
  const allowedTags=new Set(['html','head','body','title','form','div','span','p','label','input','select','option','br','fieldset','legend']);
  const allowedAttrs=new Set(['id','class','for','name','type','value','maxlength','min','max','step','selected','checked']);
  const formSet=new Set(formNodes);
  const staticSchema=!!(forms.length===1&&scripts.length===0&&findings.length===0&&fields.length&&fields.length===proposals.length&&
    proposals.every(f=>['text','select'].includes(f.type))&&all.every(n=>
      (!n.tagName||allowedTags.has(n.tagName))&&Object.keys(attrs(n)).every(k=>allowedAttrs.has(k))&&
      (!['input','select','option'].includes(n.tagName)||formSet.has(n))));
  return {scripts,findings,fields,settingsSchemaCandidate:proposals,staticSchema,requiresReview:true};
}
// Inventory behavior of an inspector script without exporting literals,
// executing code or assuming form serialization semantics.
function analyzeInspectorScript(source){
  const flags=new Set(),sdk=new Set();
  if(typeof source!=='string'||Buffer.byteLength(source)>MAX)return {status:'oversize',requiresReview:true};
  let ast;
  try{ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'});}
  catch{return {status:'syntax-review',requiresReview:true};}
  const stack=[ast];let count=0;
  const prop=n=>n?.type==='MemberExpression'&&!n.computed&&n.property?.type==='Identifier'?n.property.name:null;
  const root=n=>n?.object?.type==='Identifier'?n.object.name:null;
  while(stack.length){
    const n=stack.pop();if(++count>100000)return {status:'node-limit',requiresReview:true};
    if(n.type==='CallExpression'){
      const name=prop(n.callee),owner=root(n.callee);
      if(owner==='$UD'&&name&&/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(name))sdk.add(name);
      if(owner==='Utils'&&name==='getFormValue')flags.add('form-serialization');
      if(owner==='Utils'&&name==='setFormValue')flags.add('form-restoration');
      if(owner==='document'&&name==='createElement'&&n.arguments[0]?.value==='option')flags.add('dynamic-options');
      if(name==='addEventListener')flags.add('event-listeners');
      if(name==='fetch'||n.callee?.name==='fetch'||n.callee?.name==='eval')flags.add('external-or-dynamic-execution');
    }
    if(n.type==='AssignmentExpression'){
      const lhs=n.left;
      if(prop(lhs)==='display'&&prop(lhs.object)==='style')flags.add('conditional-visibility');
      if(prop(lhs)&&root(lhs)==='ACTION_SETTING')flags.add('setting-rewrite');
      if(prop(lhs)==='innerHTML')flags.add('dynamic-markup');
    }
    if(n.type==='ImportDeclaration'||n.type==='ImportExpression')flags.add('dependencies');
    for(const value of Object.values(n)){
      if(Array.isArray(value)){for(const x of value)if(x?.type)stack.push(x);}
      else if(value?.type)stack.push(value);
    }
  }
  return {status:'static-inventory',sdkMethods:[...sdk].sort(),behaviors:[...flags].sort(),requiresReview:true};
}
function imageReport(bytes,relative){
  const ext=path.extname(relative).toLowerCase();
  if(ext==='.gif')return gifReport(bytes);
  if(ext==='.svg')return svgReport(bytes);
  if(ext!=='.png')return {format:ext.slice(1)||'unknown',status:'manual-resource-review'};
  if(bytes.length<33||bytes.length>256*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||
    bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR')
    return {format:'png',status:'invalid-or-oversize'};
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  return {format:'png',width,height,status:width>0&&height>0&&width<=144&&height<=144?'header-candidate':'resize-or-invalid'};
}
module.exports={analyzeHtml,analyzeInspectorScript,imageReport,localRef,MAX};
