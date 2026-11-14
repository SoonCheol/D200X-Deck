'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const JSZip=require('../app/node_modules/jszip');
const {parseArchive,validateManifest}=require('../app/streamdeck-editor/sd-plugin-host.cjs');
const M={UUID:'de.perdoctus.streamdeck.homeassistant',Name:'Home Assistant',Version:'3.8.4',
  CodePath:'plugin.html',Actions:[
    {UUID:'de.perdoctus.streamdeck.homeassistant.entity',Name:'Entity (generic)',PropertyInspectorPath:'pi.html'}
  ]};
async function zipWith(entries){
  const z=new JSZip();for(const [name,body] of Object.entries(entries))z.file(name,body);
  return z.generateAsync({type:'nodebuffer'});
}
test('Stream Deck SDK manifest is compatible with HTML Home Assistant action',()=>{
  assert.equal(validateManifest(M).UUID,M.UUID);
  assert.throws(()=>validateManifest({...M,CodePath:'plugin.exe'}),/HTML CodePath/);
});
test('SDK plugin importer extracts nested sdPlugin folder and preserves manifest',async()=>{
  const prefix=M.UUID+'.sdPlugin/';
  const bytes=await zipWith({[prefix+'manifest.json']:JSON.stringify(M),[prefix+'plugin.html']:'<html></html>',
    [prefix+'pi.html']:'<html></html>'});
  const pack=await parseArchive(bytes);
  assert.equal(pack.manifest.UUID,M.UUID);
  assert.deepEqual(pack.files.map(x=>x.name).sort(),['manifest.json','pi.html','plugin.html']);
});
test('SDK plugin importer blocks unsafe paths and missing manifest',async()=>{
  await assert.rejects(parseArchive(await zipWith({'other/file.txt':'x'})),/manifest/);
  const prefix=M.UUID+'.sdPlugin/';
  await assert.rejects(parseArchive(await zipWith({
    [prefix+'manifest.json']:JSON.stringify(M),[prefix+'plugin.html']:'ok','outside.txt':'bad'
  })),/외부 파일/);
});
