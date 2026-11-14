'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs/promises');
const JSZip=require('../app/node_modules/jszip');
const {parseIconPack,readPacks,registerPack}=require('../app/streamdeck-editor/icon-pack.cjs');

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y5fAJkAAAAASUVORK5CYII=','base64');
async function fixture(overrides={}){
  const zip=new JSZip();
  const base='com.example.gray.sdIconPack/';
  zip.file(base+'manifest.json',JSON.stringify({Name:'Gray Test',Version:'1.0.1',Author:'Tester'}));
  zip.file(base+'icons.json',JSON.stringify(overrides.icons||[
    {path:'Black.png',name:'Black',tags:['gray','monochrome']}]));
  zip.file(base+'icons/Black.png',png);
  if(overrides.extra)zip.file(base+'icons/'+overrides.extra.path,overrides.extra.buffer);
  return zip.generateAsync({type:'nodebuffer'});
}
test('imports Stream Deck icon pack metadata and PNG data',async()=>{
  const pack=await parseIconPack(await fixture());
  assert.equal(pack.name,'Gray Test');
  assert.equal(pack.version,'1.0.1');
  assert.equal(pack.icons.length,1);
  assert.equal(pack.icons[0].name,'Black');
  assert.deepEqual(pack.icons[0].tags,['gray','monochrome']);
  assert.match(pack.icons[0].image,/^data:image\/png;base64,/);
  assert.deepEqual(Buffer.from(pack.icons[0].image.split(',')[1],'base64'),png);
});
test('rejects traversal and missing icon image entries',async()=>{
  await assert.rejects(parseIconPack(await fixture({icons:[{path:'../secrets.png'}]})),/경로/);
  await assert.rejects(parseIconPack(await fixture({icons:[{path:'missing.png'}]})),/없습니다/);
});
test('persists icon packs separately from profiles and overwrites duplicate registration',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'d200x-iconpacks-'));
  const target=path.join(dir,'packs.json');
  try{
    const pack=await parseIconPack(await fixture());
    assert.deepEqual(await readPacks(target),[]);
    await registerPack(target,pack);
    await registerPack(target,pack);
    const installed=await readPacks(target);
    assert.equal(installed.length,1);
    assert.equal(installed[0].name,'Gray Test');
    assert.deepEqual(installed[0].icons[0].image,pack.icons[0].image);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
