'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs/promises');
const JSZip=require('../app/node_modules/jszip');
const {parseIconPack,parseIconFolder,readPacks,registerPack,removePack,exportIconImages}=require('../app/deckforge-editor/icon-pack.cjs');

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


test('imports 849 original-size icons, beyond the former 400-icon cap',async()=>{
  const zip=new JSZip(),prefix='com.elgato.defaulticonsblack.sdIconPack/';
  zip.file(prefix+'manifest.json',JSON.stringify({Name:'849 Icons',Version:'1.0.0'}));
  const items=Array.from({length:849},(_,i)=>({path:'icon_'+i+'.png',name:'Icon '+i}));
  zip.file(prefix+'icons.json',JSON.stringify(items));
  for(const item of items)zip.file(prefix+'icons/'+item.path,png);
  const pack=await parseIconPack(await zip.generateAsync({type:'nodebuffer'}));
  assert.equal(pack.icons.length,849);
});
test('reimporting an unchanged folder retains the same pack identity',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-icon-repeat-'));
  try{
    await fs.writeFile(path.join(dir,'light_off.png'),png);
    const a=await parseIconFolder(dir),b=await parseIconFolder(dir);
    assert.equal(a.id,b.id);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});


test('editor removal only changes library and never resets saved or draft artwork',async()=>{
  const vm=require('node:vm');
  const editor=await fs.readFile(path.join(__dirname,'../app/deckforge-editor/editor.js'),'utf8');
  const start=editor.indexOf('async function removeIconPackFromLibrary(pack)');
  const end=editor.indexOf('// Pair icon files only while selecting artwork;',start);
  assert.ok(start>=0&&end>start);
  const icon=()=>({kind:'file',value:'data:image/png;base64,'+png.toString('base64'),packId:'test-pack'});
  const state={profiles:[{pages:[{buttons:[{icon:icon(),settings:{keyPressIcons:{up:icon(),down:icon()},sdkStateIcons:{on:icon(),off:icon()}},stateVisuals:[{icon:icon()}]}]}]}]};
  const original=JSON.stringify(state);
  let confirmed=true,removed=true,fail=false,removes=0,refreshes=0;
  const messages=[];
  const context=vm.createContext({state,window:{confirm:()=>confirmed,deckBridge:{removeIconPack:async id=>{
    assert.equal(id,'test-pack');removes++;if(fail)throw Error('mock error');return removed;
  }},d200xActionStatus:message=>messages.push(message)},
  refreshImportedIconPacks:async()=>{refreshes++;},persist:()=>{throw Error('must not write profiles');},
  render:()=>{throw Error('must not reset or redraw buttons');}});
  vm.runInContext(editor.slice(start,end),context);
  const pack={id:'test-pack',name:'Test',source:'imported'};
  await context.removeIconPackFromLibrary({...pack,source:'bundled'});
  confirmed=false;await context.removeIconPackFromLibrary(pack);
  assert.equal(removes,0);assert.equal(refreshes,0);
  confirmed=true;await context.removeIconPackFromLibrary(pack);
  assert.equal(removes,1);assert.equal(refreshes,1);assert.match(messages.at(-1),/기존 버튼 이미지 유지/);
  removed=false;await context.removeIconPackFromLibrary(pack);
  fail=true;await context.removeIconPackFromLibrary(pack);
  assert.equal(removes,3);assert.equal(refreshes,1);assert.equal(JSON.stringify(state),original);
});


test('editor import keeps 196px originals and scales larger static artwork without losing aspect ratio',async()=>{
  const vm=require('node:vm');
  const source=await fs.readFile(path.join(__dirname,'../app/deckforge-editor/main.cjs'),'utf8');
  const start=source.indexOf('async function normalizeImportedIcon('),end=source.indexOf('let builtinPacksCache',start);
  assert.ok(start>=0&&end>start);
  let calls=0,width=0,height=0,lastCanvas=null;
  class MockImage {
    set src(value){this.naturalWidth=width;this.naturalHeight=height;this.onload();}
  }
  const document={createElement:tag=>{
    assert.equal(tag,'canvas');
    return lastCanvas={width:0,height:0,getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/png;base64,AA=='};
  }};
  const context=vm.createContext({window:{isDestroyed:()=>false,webContents:{executeJavaScript:async script=>{
    calls++;return vm.runInNewContext(script,{Image:MockImage,document});
  }}}});
  vm.runInContext(source.slice(start,end),context);
  const normalize=context.normalizeImportedIcon;
  // Header fixtures exercise the fast path; real decoding remains Electron's job.
  const pngHeader=(w,h)=>{const bytes=Buffer.alloc(24);png.copy(bytes,0,0,24);bytes.writeUInt32BE(w,16);bytes.writeUInt32BE(h,20);return bytes;};
  for(const size of [144,196]){
    const bytes=pngHeader(size,size);
    assert.equal(await normalize(bytes,'image/png','square.png'),'data:image/png;base64,'+bytes.toString('base64'));
  }
  assert.equal(calls,0);
  width=392;height=196;
  await normalize(pngHeader(width,height),'image/png','wide.png');
  assert.equal(calls,1);assert.equal(lastCanvas.width,196);assert.equal(lastCanvas.height,98);
  width=196;height=196;
  const jpeg=Buffer.from('jpeg mock');
  assert.equal(await normalize(jpeg,'image/jpeg','square.jpg'),'data:image/jpeg;base64,'+jpeg.toString('base64'));
  width=392;height=392;
  await normalize(Buffer.from('<svg/>'),'image/svg+xml','vector.svg');
  assert.equal(lastCanvas.width,196);assert.equal(lastCanvas.height,196);
  const gif=Buffer.alloc(10);gif.write('GIF89a');gif.writeUInt16LE(196,6);gif.writeUInt16LE(196,8);
  const before=calls;
  assert.equal(await normalize(gif,'image/gif','animated.gif'),'data:image/gif;base64,'+gif.toString('base64'));
  assert.equal(calls,before);
  gif.writeUInt16LE(197,6);width=197;height=196;
  await assert.rejects(normalize(gif,'image/gif','oversized.gif'),/프레임 보존 변환/);
});

test('plain ZIP and folder export preserves names, original raster and SVG bytes, never overwrites',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'deckforge-export-'));
  try{
    const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>');
    const raw=await fixture({icons:[{path:'nested/lamp.svg'},{path:'Black.png'}],extra:{path:'nested/lamp.svg',buffer:svg}});
    const pack=await parseIconPack(raw,async()=> 'data:image/png;base64,'+png.toString('base64'));
    const zipPath=path.join(dir,'icons.zip'),folder=path.join(dir,'icons');
    assert.equal((await exportIconImages(pack,zipPath,'zip')).count,2);
    const zip=await JSZip.loadAsync(await fs.readFile(zipPath));
    assert.deepEqual(await zip.file('nested/lamp.svg').async('nodebuffer'),svg);
    assert.deepEqual(await zip.file('Black.png').async('nodebuffer'),png);
    assert.equal(zip.file('manifest.json'),null);
    await exportIconImages(pack,folder,'folder');
    assert.deepEqual(await fs.readFile(path.join(folder,'nested/lamp.svg')),svg);
    await assert.rejects(exportIconImages(pack,zipPath,'zip'),{code:'EEXIST'});
    await assert.rejects(exportIconImages(pack,folder,'folder'),{code:'EEXIST'});
    await assert.rejects(exportIconImages({...pack,icons:[{...pack.icons[0],filename:'../escape.svg'}]},path.join(dir,'bad.zip'),'zip'),/파일명/);
    const old={...pack,icons:[{...pack.icons[0],originalImage:undefined}]};
    const legacy=path.join(dir,'legacy.zip');await exportIconImages(old,legacy,'zip');
    assert.ok((await JSZip.loadAsync(await fs.readFile(legacy))).file('nested/lamp.png'));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
