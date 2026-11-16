'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const integration=require('../app/streamdeck-editor/bundled-integration.cjs');

class WindowMock extends EventEmitter{
 constructor(bounds){super();this.bounds={...bounds}}
 getBounds(){return {...this.bounds}}
 setBounds(next){const moved=this.bounds.x!==next.x||this.bounds.y!==next.y;
  const resized=this.bounds.width!==next.width||this.bounds.height!==next.height;
  this.bounds={...next};if(moved)this.emit('move');if(resized)this.emit('resize')}
 isDestroyed(){return false}
}
const display={getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1080}})};
test('magnet joins windows at DeckForge height and restores independent size',()=>{
 const deck=new WindowMock({x:470,y:50,width:980,height:850});
 const manager=new WindowMock({x:40,y:80,width:698,height:873});
 const magnet=integration.createMagnet(deck,manager,display);
 assert.equal(magnet.attach(),true);
 let a=deck.getBounds(),b=manager.getBounds();
 assert.equal(b.x,a.x+a.width);assert.equal(b.y,a.y);assert.equal(b.height,a.height);
 deck.setBounds({x:70,y:70,width:980,height:760});
 a=deck.getBounds();b=manager.getBounds();
 assert.equal(b.y,a.y);assert.equal(b.height,760);
 assert.equal(magnet.toggle().enabled,false);
 assert.equal(manager.getBounds().height,873);
});
test('missing default plugins are installed but existing ones are never overwritten',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'d200x-bundled-'));
 try{
  const fusion=path.join(root,'com.autodesk.fusionstreamdeck.sdPlugin');
  await fs.mkdir(fusion);await fs.writeFile(path.join(fusion,'manifest.json'),'{}');
  const archive=path.join(root,'de.perdoctus.streamdeck.homeassistant.streamDeckPlugin');
  await fs.writeFile(archive,'fake zip for mocked installation');
  const calls=[];
  const host={list:async()=>[{uuid:'com.autodesk.fusionstreamdeck'}],
    installDirectory:async()=>calls.push('fusion'),install:async()=>calls.push('ha')};
  const result=await integration.installMissingPlugins(host,root);
  assert.deepEqual(result,{fusion:'existing',ha:'installed'});
  assert.deepEqual(calls,['ha']);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('integrated installer stages both runtime components without editing saved profiles',async()=>{
 const source=await fs.readFile(path.join(__dirname,'../.github/workflows/streamdeck-clean-preview.yml'),'utf8');
 const main=await fs.readFile(path.join(__dirname,'../app/streamdeck-editor/main.cjs'),'utf8');
 const ui=await fs.readFile(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
 const manager=await fs.readFile(path.join(__dirname,'../tools/fusion-manager/main.cjs'),'utf8');
 assert.match(source,/com\.autodesk\.fusionstreamdeck\.sdPlugin/);
 assert.match(source,/de\.perdoctus\.streamdeck\.homeassistant\.streamDeckPlugin/);
 assert.match(source,/fusion-manager\/main\.cjs/);
 assert.match(main,/d200x:open-fusion-manager/);
 assert.match(main,/d200x:fusion-addin-install/);
 assert.match(ui,/Fusion 애드인 설치/);
 assert.match(ui,/Home Assistant 사용법/);
 assert.match(manager,/openEmbeddedManager/);
});
