'use strict';
// Build-time only: reconstruct the two MIT-licensed Fluent UI icon packs
// from a pinned upstream GitHub ZIP. Never download icons at app runtime.
const fs=require('node:fs');
const path=require('node:path');
const JSZip=require('jszip');
const crypto=require('node:crypto');
const archive=process.argv[2];
if(!archive||!fs.existsSync(archive))throw new Error('Pass an upstream source ZIP file.');
const root=__dirname;
(async()=>{
  const zip=await JSZip.loadAsync(fs.readFileSync(archive));
  const files=Object.keys(zip.files);
  const licensePath=files.find(name=>/\/LICENSE\.md$/i.test(name)&&name.split('/').length===2);
  if(!licensePath)throw new Error('Upstream MIT license missing');
  const license=(await zip.file(licensePath).async('string'));
  if(!/MIT License[\s\S]*Carlo Zottmann/.test(license))throw new Error('Unexpected license');
  const specs=[
    {id:'builtin-fluentui-filled',folder:'fluentui-system-icons-filled.sdIconPack'},
    {id:'builtin-fluentui-regular',folder:'fluentui-system-icons-regular.sdIconPack'}
  ];
  const result=[];
  for(const spec of specs){
    const folder=files.find(name=>name.endsWith('/'+spec.folder+'/manifest.json'));
    if(!folder)throw new Error('Missing '+spec.folder);
    const base=folder.slice(0,-'manifest.json'.length);
    const manifest=JSON.parse(await zip.file(base+'manifest.json').async('string'));
    const metadata=JSON.parse(await zip.file(base+'icons.json').async('string'));
    if(!Array.isArray(metadata)||metadata.length<1500||metadata.length>3000)
      throw new Error('Unexpected icon count in '+spec.folder);
    const icons=[];
    for(const item of metadata){
      if(typeof item.path!=='string'||!/^[a-z0-9_.-]+\.png$/i.test(item.path))
        throw new Error('Unexpected icon path '+item.path);
      const entry=zip.file(base+'icons/'+item.path);
      if(!entry)throw new Error('Missing icon '+item.path);
      const bytes=await entry.async('nodebuffer');
      if(bytes.length>256*1024||!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))
        throw new Error('Unexpected PNG '+item.path);
      icons.push({
        name:typeof item.name==='string'?item.name:item.path,
        tags:Array.isArray(item.tags)?item.tags:[],
        image:'data:image/png;base64,'+bytes.toString('base64')
      });
    }
    result.push({id:spec.id,name:manifest.Name,version:manifest.Version,
      author:manifest.Author||'Carlo Zottmann / Microsoft',source:'bundled',icons});
    console.log(spec.folder+': '+icons.length+' icons');
  }
  const data=JSON.stringify(result);
  fs.writeFileSync(path.join(root,'builtin-iconpacks.json'),data);
  fs.writeFileSync(path.join(root,'fluentui-LICENSE.md'),license);
  const digest=crypto.createHash('sha256').update(data).digest('hex');
  console.log('Bundled Fluent UI icon packs:',(data.length/1024/1024).toFixed(2)+' MiB; sha256 '+digest);
})().catch(error=>{console.error(error);process.exitCode=1;});
