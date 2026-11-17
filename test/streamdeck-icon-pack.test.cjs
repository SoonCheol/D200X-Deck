'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs/promises');
const JSZip=require('../app/node_modules/jszip');
const {parseIconPack,parseIconFolder,readPacks,registerPack,removePack}=require('../app/streamdeck-editor/icon-pack.cjs');

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

test('removes only user-imported pack, leaving other packs intact',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'d200x-iconpack-remove-'));
  const target=path.join(dir,'packs.json');
  try{
    const pack=await parseIconPack(await fixture());
    await registerPack(target,pack);
    await registerPack(target,{...pack,id:'second-pack',name:'Second'});
    assert.equal(await removePack(target,pack.id),true);
    assert.equal(await removePack(target,pack.id),false);
    assert.deepEqual((await readPacks(target)).map(x=>x.name),['Second']);
    await assert.rejects(removePack(target,'builtin-fluentui-filled'),/기본 아이콘팩/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('imports SVG from original Stream Deck icon metadata and passes it to the renderer',async()=>{
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"><circle cx="72" cy="72" r="30"/></svg>');
  const source=await fixture({icons:[{path:'lamp_on.svg',name:'Lamp ON'}],extra:{path:'lamp_on.svg',buffer:svg}});
  const received=[];
  const pack=await parseIconPack(source,async (bytes,mime,filename)=>{
    received.push({mime,filename,content:bytes.toString()});
    return 'data:image/png;base64,'+png.toString('base64');
  });
  assert.equal(pack.icons[0].filename,'lamp_on.svg');
  assert.equal(received[0].mime,'image/svg+xml');
  assert.equal(received[0].filename,'lamp_on.svg');
  assert.match(pack.icons[0].image,/^data:image\/png;base64,/);
});
test('rejects unsafe SVG content without executing it',async()=>{
  const source=await fixture({icons:[{path:'unsafe.svg'}],extra:{path:'unsafe.svg',
    buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')}});
  await assert.rejects(parseIconPack(source,async()=> 'data:image/png;base64,AA=='),/올바르지 않습니다/);
});
test('imports ordinary icon ZIP without Stream Deck metadata',async()=>{
  const zip=new JSZip();
  zip.file('room/fan_off.png',png);
  zip.file('room/fan_on.png',png);
  const pack=await parseIconPack(await zip.generateAsync({type:'nodebuffer'}),null,'Home Icons');
  assert.equal(pack.name,'Home Icons');
  assert.deepEqual(pack.icons.map(i=>i.filename),['room/fan_off.png','room/fan_on.png']);
});
test('imports original icon folder without requiring user ZIP conversion',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-icon-folder-'));
  try{
    await fs.mkdir(path.join(dir,'icons'));
    await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({Name:'Folder Pack',Version:'2.0.0'}));
    await fs.writeFile(path.join(dir,'icons.json'),JSON.stringify([{path:'switch_off.png',name:'Switch OFF'}]));
    await fs.writeFile(path.join(dir,'icons','switch_off.png'),png);
    const pack=await parseIconFolder(dir);
    assert.equal(pack.name,'Folder Pack');
    assert.equal(pack.icons[0].filename,'switch_off.png');
    assert.match(pack.icons[0].image,/^data:image\/png;base64,/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
