'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
const start=src.indexOf('function isMomentaryIconAction(item){'),end=src.indexOf('// Share actual key visuals',start);
assert.ok(start>=0&&end>start,'Press icon source functions');
const funcs=src.slice(start,end);
function apply(item,pressed=false){
 const window={D200XPhysicalKeyPressed:()=>pressed};
 const state={selected:0};
 return vm.runInNewContext(funcs+';displayKeyPressItem(item,0)',{
  item,window,previewPressKeys:new Set(),isFusionAction:action=>action?.type==='sd-plugin'&&action.settings?.pluginUUID==='com.autodesk.fusionstreamdeck',
  JSON
 });
}
test('Key Up is default and Key Down switches artwork only while physically pressed',()=>{
 const item={type:'hotkey',icon:{kind:'file',value:'old'},settings:{keyPressIcons:{up:{kind:'file',value:'UP'},down:{kind:'file',value:'DOWN'}}}};
 assert.equal(apply(item,false).icon.value,'UP');
 assert.equal(apply(item,true).icon.value,'DOWN');
 assert.equal(apply(item,true).keyPressAlternate,true);
});
test('missing press icons preserve base icon and old shrink animation',()=>{
 const item={type:'hotkey',icon:{kind:'file',value:'original'},settings:{}};
 assert.equal(apply(item,false).icon.value,'original');
 assert.equal(apply(item,true).keyPressAlternate,false);
});
test('all Fusion commands use momentary icons, non-Fusion SDK and HA remain stateful',()=>{
 const fusion={type:'sd-plugin',settings:{pluginUUID:'com.autodesk.fusionstreamdeck',keyPressIcons:{down:{kind:'file',value:'active'}}},icon:{kind:'file',value:'cached'}};
 assert.equal(apply(fusion,true).icon.value,'active');
 assert.equal(apply(fusion,false).icon.value,'cached');
 const other={...fusion,settings:{...fusion.settings,pluginUUID:'some.other.plugin'}};
 assert.equal(apply(other,true).icon.value,'cached');
 assert.equal(apply({type:'ha-toggle',icon:{kind:'file',value:'OFF'},settings:{keyPressIcons:{down:{kind:'file',value:'bad'}}}},true).icon.value,'OFF');
});
test('page indicator and active timer do not gain momentary artwork',()=>{
 for(const type of ['indicator','timer','multi-switch','logic','sleep']){
  const item={type,icon:{kind:'file',value:'state'},settings:{keyPressIcons:{down:{kind:'file',value:'wrong'}}}};
  assert.equal(apply(item,true).icon.value,'state',type);
 }
});
test('icon settings survive existing DeckCore cleanAction without modifying status settings',()=>{
 const DeckCore=require('../app/streamdeck-editor/deck-core.js');
 const icon={kind:'file',value:'data:image/png;base64,dGVzdA=='};
 const old=DeckCore.createAction('hotkey');
 old.settings.keyPressIcons={up:icon,down:icon};
 const clean=DeckCore.cleanAction(old);
 assert.equal(clean.settings.keyPressIcons.up.value,icon.value);
 assert.equal(clean.settings.keyPressIcons.down.value,icon.value);
});
test('the first inspector editing card is Key Up, then Key Down',()=>{
 const first=src.indexOf("['up','Key Up'");
 assert.ok(first>=0);
 assert.match(src.slice(first,first+100),/\['down','Key Down'/);
});

test('inspector has four fixed and ordered regions and puts cards outside action fields',()=>{
 const header=src.indexOf('action-head inspector-title-region');
 const properties=src.indexOf('properties inspector-properties-region',header);
 const zone=src.indexOf('inspector-icon-section',properties);
 assert.ok(header>=0&&properties>header&&zone>properties,'DOM template must keep title, properties, icons in order');
 assert.match(src,/footer\.classList\.add\('inspector-footer-region'\)/);
 assert.match(src,/function bindKeyPressIconControls[\s\S]*?panel\.append\(cards\);/);
 assert.doesNotMatch(src,/fields\.prepend\(cards\)/);
});
test('momentary Fusion cannot also render OFF ON SDK cards',()=>{
 assert.match(src,/function bindSdkStateIcons\(root,item\)\{\s*if\(item\.type!=='sd-plugin'\|\|isMomentaryIconAction\(item\)\)return;/);
 assert.match(src,/case "sd-plugin":return "";/);
 assert.match(src,/bindSdkStateIcons\(root,item\);\s*bindKeyPressIconControls\(root,item\);\s*appendInspectorSaveBar\(root\);/);
});
test('icon layout has one nonwrapping 404px line, equal 196px cards and aligned starts',()=>{
 const css=require('node:fs').readFileSync(path.join(__dirname,'../app/streamdeck-editor/style.css'),'utf8');
 assert.match(css,/--inspector-values-left:calc\(var\(--inspector-preview-width\)/);
 assert.match(css,/\.inspector \.inspector-icon-section \.sdk-state-icons\{[\s\S]*?flex-wrap:nowrap;[\s\S]*?min-width:404px/);
 assert.match(css,/\.inspector \.inspector-icon-section \.sdk-state-icon\{flex:0 0 196px/);
 assert.match(css,/\.inspector \.inspector-icon-section:empty\{display:none\}/);
});
