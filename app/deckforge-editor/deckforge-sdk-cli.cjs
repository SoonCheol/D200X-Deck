'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {packageNativeManifest}=require('./deckforge-plugin.cjs');
const {LIMIT}=require('./deckforge-native-sdk.cjs');
const {analyzeDirectory}=require('./ulanzi-converter.cjs');
const {writeCorpusAudit}=require('./ulanzi-corpus-audit.cjs');
const {buildReviewRecord,reviewedCandidate}=require('./ulanzi-release-review.cjs');
async function packageFile(input,outputDir){
  const stat=await fs.lstat(input);
  if(!stat.isFile()||stat.size>LIMIT)throw Error('select a native manifest JSON file');
  const raw=await fs.readFile(input);
  if(raw.length>LIMIT)throw Error('native manifest size limit');
  const manifest=JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,''));
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
module.exports={packageFile,prepareReview,releaseReviewed,writeCorpusAudit};
if(require.main===module){
  const [command,input,output,releaseDir]=process.argv.slice(2);
  if(!((process.argv.length===5&&['package','review-ulanzi','audit-ulanzi'].includes(command))||(process.argv.length===6&&command==='release-ulanzi'))){
    console.error('Usage: node deckforge-sdk-cli.cjs package <native.json> <output-directory>\n       node deckforge-sdk-cli.cjs review-ulanzi <original.ulanziPlugin> <output-directory>\n       node deckforge-sdk-cli.cjs release-ulanzi <original.ulanziPlugin> <review-record.json> <output-directory>\n       node deckforge-sdk-cli.cjs audit-ulanzi <corpus-directory> <output-directory>');
    process.exitCode=2;
  }else (command==='package'?packageFile(input,output):command==='review-ulanzi'?prepareReview(input,output):command==='audit-ulanzi'?writeCorpusAudit(input,output):releaseReviewed(input,output,releaseDir))
    .then(file=>console.log(file)).catch(error=>{console.error('DeckForge SDK: '+error.message);process.exitCode=1;});
}
