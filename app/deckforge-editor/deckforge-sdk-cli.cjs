'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {simulateFile}=require('./deckforge-sdk-simulate.cjs');
const {packageNativeManifest}=require('./deckforge-plugin.cjs');
const {LIMIT,validateNativeManifest}=require('./deckforge-native-sdk.cjs');
const {analyzeDirectory}=require('./ulanzi-converter.cjs');
const {writeCorpusAudit}=require('./ulanzi-corpus-audit.cjs');
const {buildReviewRecord,reviewedCandidate}=require('./ulanzi-release-review.cjs');
async function readManifest(input){
  const stat=await fs.lstat(input);
  if(!stat.isFile()||stat.size>LIMIT)throw Error('select a native manifest JSON file');
  const raw=await fs.readFile(input);
  if(raw.length>LIMIT)throw Error('native manifest size limit');
  const manifest=JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,''));
  return validateNativeManifest(manifest);
}
async function validateFile(input){
  const m=await readManifest(input);
  return {valid:true,id:m.id,version:m.version,apiVersion:m.apiVersion};
}
async function inspectFile(input){
  const m=await readManifest(input);
  return {valid:true,id:m.id,name:m.name,version:m.version,apiVersion:m.apiVersion,requiresDeckForge:m.requiresDeckForge||null,
    permissions:[...m.permissions],dependencies:{...(m.dependencies||{})},background:!!m.service,
    nodeTaskCount:Object.keys(m.nodeTasks||{}).length,viewCount:Object.keys(m.views||{}).length,networkEndpointCount:(m.networkEndpoints||[]).length,
    actions:m.actions.map(a=>({id:a.id,name:a.name,controllers:[...a.controllers],states:a.states,settingCount:(a.settingsSchema||[]).length,
      customSettings:!!a.settingsView,tickIntervalMs:a.tickIntervalMs||null}))};
}
async function initManifest(id,outputDir){
  if(typeof id!=='string'||!/^com\.deckforge\.native\.[a-z0-9][a-z0-9.-]{0,110}$/.test(id)||id.startsWith('com.deckforge.native.ulanzi-'))throw Error('choose an independent DeckForge plugin ID');
  const m=validateNativeManifest({apiVersion:2,id,name:'New DeckForge plugin',version:'1.0.0',permissions:['display'],actions:[{id:id+'.button',name:'Example button',controllers:['Keypad','Encoder'],states:1,script:"if(event.type==='appear'||event.type==='press')api.setTitle('Hello DeckForge');"}]});
  const dir=await fs.realpath(outputDir),target=path.join(dir,id+'.native.json');
  await fs.writeFile(target,JSON.stringify(m,null,2)+'\n',{flag:'wx'});return target;
}
async function packageFile(input,outputDir){
  const manifest=await readManifest(input);
  if(String(manifest?.id||'').startsWith('com.deckforge.native.ulanzi-'))
    throw Error('Ulanzi candidates require a separate reviewed conversion release');
  const pack=await packageNativeManifest(manifest);
  const dir=await fs.realpath(outputDir);
  const target=path.join(dir,pack.filename);
  await fs.writeFile(target,pack.archive,{flag:'wx'});
  return target;
}
// Conversion output is explicitly a review document, NOT an install package.
// Preserve the original directory. Release requires a separate evidence record.
async function prepareReview(folder,outputDir){
  const report=await analyzeDirectory(folder,{fullFingerprint:true}),root=await fs.realpath(folder),dir=await fs.realpath(outputDir);
  if(dir===root||dir.startsWith(root+path.sep))throw Error('review output must be outside source directory');
  const name=report.source.id.replace(/[^a-zA-Z0-9.-]/g,'-')+'.conversion-review.json';
  const target=path.join(dir,name);
  await fs.writeFile(target,JSON.stringify({...report,review:buildReviewRecord(report)},null,2)+'\n',{flag:'wx'});
  return target;
}
async function releaseReviewed(folder,record,outputDir){
  const root=await fs.realpath(folder),dir=await fs.realpath(outputDir);
  if(dir===root||dir.startsWith(root+path.sep))throw Error('release output must be outside source directory');
  const {manifest,source}=await reviewedCandidate(folder,record);
  const pack=await packageNativeManifest(manifest,source);
  const target=path.join(dir,pack.filename);
  await fs.writeFile(target,pack.archive,{flag:'wx'});
  return target;
}
module.exports={packageFile,prepareReview,releaseReviewed,writeCorpusAudit,validateFile,inspectFile,initManifest,simulateFile};
if(require.main===module){
  const [command,input,output,releaseDir]=process.argv.slice(2);
  const usage='Usage: node deckforge-sdk-cli.cjs validate <native.json>\n       node deckforge-sdk-cli.cjs inspect <native.json>\n       node deckforge-sdk-cli.cjs init <plugin-id> <output-directory>\n       node deckforge-sdk-cli.cjs simulate <native.json> <scenario.json>\n       node deckforge-sdk-cli.cjs package <native.json> <output-directory>\n       node deckforge-sdk-cli.cjs review-ulanzi <original.ulanziPlugin> <output-directory>\n       node deckforge-sdk-cli.cjs release-ulanzi <original.ulanziPlugin> <review-record.json> <output-directory>\n       node deckforge-sdk-cli.cjs audit-ulanzi <corpus-directory> <output-directory>';
  const count=process.argv.length;
  if(count===3&&['help','--help','-h'].includes(command))console.log(usage);
  else if(!((count===4&&['validate','inspect'].includes(command))||(count===5&&['init','package','review-ulanzi','audit-ulanzi','simulate'].includes(command))||(count===6&&command==='release-ulanzi'))){
    console.error(usage);process.exitCode=2;
  }else (command==='validate'?validateFile(input):command==='inspect'?inspectFile(input):command==='init'?initManifest(input,output):command==='simulate'?simulateFile(input,output):command==='package'?packageFile(input,output):command==='review-ulanzi'?prepareReview(input,output):command==='audit-ulanzi'?writeCorpusAudit(input,output):releaseReviewed(input,output,releaseDir))
    .then(result=>{console.log(typeof result==='string'?result:JSON.stringify(result,null,2));if(command==='simulate'&&!result.ok)process.exitCode=1;}).catch(error=>{console.error('DeckForge SDK: '+error.message);process.exitCode=1;});
}
