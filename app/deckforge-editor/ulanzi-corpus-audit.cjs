'use strict';
// Read-only corpus assessment. Never install, execute, or export candidate
// scripts, settings defaults, original image data or absolute source paths.
const fs=require('node:fs/promises');
const path=require('node:path');
const {analyzeDirectory}=require('./ulanzi-converter.cjs');
const MAX_PLUGINS=16;
const inc=(map,key)=>map.set(key,(map.get(key)||0)+1);
const sorted=map=>[...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([name,count])=>({name,count}));
async function auditCorpus(folder){
  const st=await fs.lstat(folder);
  if(!st.isDirectory()||st.isSymbolicLink())throw Error('select a corpus directory');
  const root=await fs.realpath(folder),entries=await fs.readdir(root,{withFileTypes:true});
  const sources=entries.filter(e=>/\.ulanziPlugin$/i.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name));
  if(!sources.length||sources.length>MAX_PLUGINS)throw Error('corpus requires 1–16 immediate plugin directories');
  const findings=new Map(),methods=new Map(),resources=new Map(),behaviors=new Map(),plugins=[];
  const counts={candidateReviewRequired:0,manualConversionRequired:0,unreadable:0};
  for(const [index,entry] of sources.entries()){
    const sourceIndex=index+1;
    if(!entry.isDirectory()||entry.isSymbolicLink()){
      plugins.push({sourceIndex,status:'unreadable',reason:'unsafe-source-entry'});counts.unreadable++;continue;
    }
    try{
      const report=await analyzeDirectory(path.join(root,entry.name),{fullFingerprint:true});
      const codes=[...new Set(report.findings.map(f=>f.code))].sort();
      const unsupported=report.calls.filter(c=>c.support!=='candidate').map(c=>c.name);
      const resourceStates=[...new Set(report.resources.map(r=>r.status||'unknown'))].sort();
      const inspectorBehaviors=[...new Set(report.inspectors.flatMap(i=>(i.scripts||[]).flatMap(s=>s.behavior?.behaviors||[])))].sort();
      for(const code of codes)inc(findings,code);
      for(const method of new Set(unsupported))if(/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(method))inc(methods,method);
      for(const status of resourceStates)inc(resources,status);
      for(const behavior of inspectorBehaviors)inc(behaviors,behavior);
      const candidate=report.status==='candidate-review-required';
      counts[candidate?'candidateReviewRequired':'manualConversionRequired']++;
      plugins.push({sourceIndex,id:report.source.id,version:report.source.version,treeSha256:report.source.treeSha256,
        status:report.status,findings:codes,unsupportedMethods:unsupported.filter(m=>/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(m)),
        resourceStates,inspectorBehaviors,verification:report.verification?{status:report.verification.status,passed:report.verification.passed,total:report.verification.total}:null,
        installationAllowed:false});
    }catch{
      // Error messages can contain private paths or source values.
      plugins.push({sourceIndex,status:'unreadable',reason:'analysis-failed'});counts.unreadable++;
    }
  }
  return {auditVersion:1,total:sources.length,counts,plugins,blockerFrequency:{findings:sorted(findings),unsupportedMethods:sorted(methods),resources:sorted(resources),inspectorBehaviors:sorted(behaviors)},originalExecuted:false,hardwareVerified:false,installationAllowed:false};
}
async function writeCorpusAudit(folder,outputDir){
  const root=await fs.realpath(folder),dir=await fs.realpath(outputDir);
  if(dir===root||dir.startsWith(root+path.sep))throw Error('audit output must be outside source directory');
  const report=await auditCorpus(folder),target=path.join(dir,'ulanzi-corpus-audit.json');
  await fs.writeFile(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  return target;
}
module.exports={auditCorpus,writeCorpusAudit};
