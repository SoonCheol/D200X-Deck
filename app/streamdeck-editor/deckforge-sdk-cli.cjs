'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {packageNativeManifest}=require('./deckforge-plugin.cjs');
const {LIMIT}=require('./deckforge-native-sdk.cjs');
const {analyzeDirectory}=require('./ulanzi-converter.cjs');
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
// Preserve the original directory. No review flags can promote it here.
async function prepareReview(folder,outputDir){
  const report=await analyzeDirectory(folder),root=await fs.realpath(folder),dir=await fs.realpath(outputDir);
  if(dir===root||dir.startsWith(root+path.sep))throw Error('review output must be outside source directory');
  const name=report.source.id.replace(/[^a-zA-Z0-9.-]/g,'-')+'.conversion-review.json';
  const target=path.join(dir,name);
  await fs.writeFile(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  return target;
}
module.exports={packageFile,prepareReview};
if(require.main===module){
  const [command,input,output]=process.argv.slice(2);
  if(process.argv.length!==5||!['package','review-ulanzi'].includes(command)){
    console.error('Usage: node deckforge-sdk-cli.cjs package <native.json> <output-directory>\n       node deckforge-sdk-cli.cjs review-ulanzi <original.ulanziPlugin> <output-directory>');
    process.exitCode=2;
  }else (command==='package'?packageFile(input,output):prepareReview(input,output))
    .then(file=>console.log(file)).catch(error=>{console.error('DeckForge SDK: '+error.message);process.exitCode=1;});
}
