'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/editor.js'),'utf8');
const start=src.indexOf('function isMomentaryIconAction(item){'),end=src.indexOf('// Share actual key visuals',start);
assert.ok(start>=0&&end>start,'Press icon source functions');
const funcs=src.slice(start,end);
const independentTitles=()=>({first:{enabled:true,title:'',style:{}},second:{enabled:true,title:'',style:{}}});
function apply(item,pressed=false,runtime=null){
 const window={D200XPhysicalKeyPressed:()=>pressed};
 const state={selected:0};
 const Core=require('../app/streamdeck-editor/deck-core.js');
 return vm.runInNewContext(funcs+';displayKeyPressItem(item,0)',{
  item,window,previewPressKeys:new Set(),state,DeckCore:{...Core,visibleActions:()=>[item],runtimeActionKey:()=>"test"},
  activeActionTimers:new Map(runtime&&item.type==='timer'?[['test',runtime]]:[]),runningMultiProgress:new Map(runtime&&item.type==='multi'?[['test',runtime]]:[]),
  haPreviewStates:new WeakMap(),sdkVisuals:new Map(),sdkContext:()=>'',
  DEFAULT_TITLE_STYLE:{visible:true,size:12},
  isFusionAction:action=>action?.type==='sd-plugin'&&action.settings?.pluginUUID==='com.autodesk.fusionstreamdeck',
  JSON
 });
}
test('Key Up is default and Key Down switches artwork only while physically pressed',()=>{
 const item={type:'hotkey',icon:{kind:'file',value:'old'},settings:{stateTitles:independentTitles(),keyPressIcons:{up:{kind:'file',value:'UP'},down:{kind:'file',value:'DOWN'}}}};
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
 const fusion={type:'sd-plugin',settings:{pluginUUID:'com.autodesk.fusionstreamdeck',stateTitles:independentTitles(),keyPressIcons:{down:{kind:'file',value:'active'}}},icon:{kind:'file',value:'cached'}};
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
 const first=src.indexOf("['up',item.type==='multi'?'대기 상태':'Key Up'");
 assert.ok(first>=0);
 assert.match(src.slice(first,first+150),/\['down',item.type==='multi'\?'실행 상태':'Key Down'/);
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
 assert.match(src,/function bindSdkStateIcons\(root,item\)\{\s*if\(item\.type!=='timer'&&\(item\.type!=='sd-plugin'\|\|isMomentaryIconAction\(item\)\)\)return;/);
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

test('folder and boolean fields use aligned independent rows',()=>{
 assert.doesNotMatch(src,/'folder':\[\['autoExitEnabled','autoExitSeconds'\]\]/);
 assert.match(src,/case "folder":return check\("autoExitEnabled","자동 나가기"\)/);
 assert.match(src,/class="unit-field"/);
 assert.match(src,/folder-editor-actions/);
 assert.match(src,/checkbox-setting-field/);
});
test('website has protocol-aware checkbox and blur normalization',()=>{
 assert.match(src,/id="url-https"/);
 assert.match(src,/url\.addEventListener\('blur',sync\)/);
 assert.match(src,/toggle\.addEventListener\('change'/);
});

test('Windows program drops and file selection update an existing action without replacing chosen artwork',()=>{
 assert.match(src,/armNativeGrid\(ev\)/);
 assert.match(src,/finishExternalGridDrop\(i\)/);
 assert.match(src,/visible&&!confirm/);
 assert.match(src,/inspectDroppedTarget\(filePath,allowAppId\)/);
 assert.match(src,/info\.kind==='folder'\?'folder-shortcut':'open-app'/);
 assert.match(src,/d\.dropEffect='link'/);
 assert.match(src,/item\.settings\?\.autoAppIcon===true/);
 assert.match(src,/updateApplicationArtwork\(item,selected,session\)/);
 assert.match(src,/async function updateApplicationArtwork\(item,filePath,session=inspectorSession\)/);
 assert.match(src,/if\(!inspectorTargetCurrent\(session,item\)\|\|\s*!\[item.settings\?\.path,item.settings\?\.app\]\.includes\(filePath\)\)return/);
});
test('action execution preserves argv as third parameter and forwards the folder option',()=>{
 assert.ok(src.includes("bridge.openLocalPath(outcome.path,outcome.target,outcome.args||'',outcome.alwaysNewWindow===true,outcome.foreground!==false)"));
});

test('OFF ON and Key Up Down use identical horizontal icon-card wrappers',()=>{
 const sdk=src.match(/function bindSdkStateIcons\(root,item\)\{([\s\S]*?)\nfunction bindKeyPressIconControls/);
 const momentary=src.match(/function bindKeyPressIconControls\(root,item\)\{([\s\S]*?)\nfunction bindExtendedActionFields/);
 assert.ok(sdk&&momentary,'both icon renderer functions present');
 for(const block of [sdk[1],momentary[1]]){
   assert.match(block,/className='sdk-state-icons/);
   assert.match(block,/cards\.append\(/);
   assert.match(block,/panel\.append\(cards\)/);
   assert.doesNotMatch(block,/panel\.append\((group|card)\)/);
 }
});


test('editing overlays and non-navigating search do not trigger unsaved leave prompt',()=>{
  const segment=src.slice(src.indexOf("document.addEventListener('click',event=>{",src.indexOf('function showInspectorLeaveDialog')),src.indexOf('let inspectorListener=new AbortController()'));
  assert.match(segment,/#icon-library/);
  assert.match(segment,/#icon-maker/);
  assert.match(segment,/#sdk-plugin-help-dialog/);
  assert.match(segment,/#action-search/);
  assert.match(segment,/\.library-tabs/);
  assert.match(segment,/\.profile-row-gear/);
  assert.match(segment,/\.icon-pack-remove/);
  assert.match(segment,/showInspectorLeaveDialog/);
});
test('other-key selection, external drops, right-click, and physical controls keep unsaved protection',()=>{
  assert.match(src,/function choose\(index\)\{\s*if\(state\.selected===index\)return;/);
  assert.match(src,/function setItem\(index,item\)\{\s*if\(inspectorSession\?\.dirty\)/);
  assert.match(src,/function controlDrop\(index,id,gesture='down',direct=true\)\{\s*if\(!isAssignableAction\(id\)\)return;\s*if\(inspectorSession\?\.dirty\)\{showInspectorLeaveDialog\(\(\)=>controlDrop\(index,id,gesture,direct\)\);return;\}/);
  assert.match(src,/addEventListener\("contextmenu",ev=>\{[\s\S]*?showInspectorLeaveDialog\(open\)/);
});
test('SDK help close control uses its own dark theme style, separate from the approved inspector layout',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/style.css'),'utf8');
  assert.match(src,/close\.className='sdk-plugin-help-close'/);
  assert.match(css,/#sdk-plugin-help-dialog \.sdk-plugin-help-close\{/);
  assert.match(css,/#sdk-plugin-help-dialog \.sdk-plugin-help-close:hover/);
});

test('each OFF ON and Key Up Down card has five fixed commands',()=>{
 const sdk=src.slice(src.indexOf('function bindSdkStateIcons'),src.indexOf('function bindKeyPressIconControls'));
 const press=src.slice(src.indexOf('function bindKeyPressIconControls'),src.indexOf('function bindExtendedActionFields'));
 for(const part of [sdk,press]){
   for(const label of ['라이브러리','파일','클립보드','특수문자','초기화'])
     assert.ok(part.includes("textContent='"+label+"'"),label);
   assert.match(part,/buttons\.append\([^;]*paste,symbol,reset\)/);
 }
 assert.match(src,/\$\("icon-library-open"\)\.remove\(\)/);
 assert.match(src,/\$\("icon-menu-trigger"\)\.remove\(\)/);
 assert.match(src,/applyStateIconData\(item,key,png\)/);
});
test('icon companion pairs are restricted to same pack, folder, and name source',()=>{
 const begin=src.indexOf('function iconPairType(icon){');
 const end=src.indexOf('function renderIconLibrary(){',begin);
 assert.ok(begin>=0&&end>begin);
 const js=src.slice(begin,end);
 const result=vm.runInNewContext(js+';\n'+String.raw`const pack={icons:[
  {filename:'a/fan_off.png',name:'fan off'},
  {filename:'a/fan_on.png',name:'fan on'},
  {filename:'b/fan_on.png',name:'fan on'},
  {filename:'a/fan_on@2x.png',name:'fan on high'},
  {name:'star off'},{name:'star on'}
]};
({exact:findIconCompanion(pack,pack.icons[0])===pack.icons[1],
crossFolder:findIconCompanion({icons:[pack.icons[0],pack.icons[2]]},pack.icons[0])===null,
nameOnly:findIconCompanion(pack,pack.icons[4])===pack.icons[5],
variant:iconPairType(pack.icons[3]).state==='on',
unrelated:findIconCompanion({icons:[pack.icons[0],{filename:'a/fan_disabled.png'}]},pack.icons[0])===null});
`);
 for(const [key,value] of Object.entries(result))assert.equal(value,true,key);
});
test('host manifest has non-destructive OFF ON artwork fallback',()=>{
 const host=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/sd-plugin-host.cjs'),'utf8');
 assert.match(host,/async defaultArtwork\(dir,base\)/);
 assert.match(host,/defaultImages:\{off:await this\.defaultArtwork/);
 assert.match(src,/const sdkActionDefaults=new Map\(\)/);
 assert.match(src,/haPreviewStates\.set\(item/);
 const css=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/style.css'),'utf8');
 assert.match(css,/grid-template-rows:auto auto;align-items:start/);
});

test('paired OFF ON artwork maps correctly regardless of launching card and clicked filename',()=>{
 const begin=src.indexOf('function iconPairType(icon){');
 const end=src.indexOf('function renderIconLibrary(){',begin);
 assert.ok(begin>=0&&end>begin);
 const source=src.slice(begin,end);
 for(const selectedCard of ['off','on']){
  for(const clickedState of ['off','on']){
   const settings={sdkStateIcons:{}};
   const image={filename:'room/fan_'+clickedState+'.png'};
   const pair=vm.runInNewContext(source+';iconPairType(icon)',{icon:image});
   assert.equal(pair.state,clickedState);
   const opposite=clickedState==='off'?'on':'off';
   // Card selection must not override the true state of the selected file.
   const values={off:'OFF_IMAGE',on:'ON_IMAGE'};
   vm.runInNewContext(source+';applyMatchedStateIcons(settings,pair,png,otherPng,"test-pack")',{
    settings,pair,png:values[clickedState],otherPng:values[opposite],selectedCard
   });
   assert.equal(settings.sdkStateIcons.off.value,'OFF_IMAGE',selectedCard+' / '+clickedState);
   assert.equal(settings.sdkStateIcons.on.value,'ON_IMAGE',selectedCard+' / '+clickedState);
   assert.equal(settings.sdkStateIcons.off.packId,'test-pack');
   assert.equal(settings.sdkStateIcons.on.packId,'test-pack');
  }
 }
});

test('icon pair uses right-side padding before enabling horizontal scrolling',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../app/streamdeck-editor/style.css'),'utf8');
 const segment=css.slice(css.indexOf('.inspector .inspector-icon-section{'),css.indexOf('.inspector .inspector-icon-section:empty'));
 assert.match(segment,/width:var\(--inspector-values-width\)/);
 assert.match(segment,/max-width:calc\(100% - var\(--inspector-values-left\) \+ 16px\)/);
 assert.match(segment,/margin-right:-16px/);
 assert.match(segment,/overflow-x:auto/,'overflow fallback remains for genuinely narrow windows');
 assert.match(css,/\.inspector \.inspector-icon-section \.sdk-state-icons\{[^}]*width:404px;min-width:404px;max-width:none;gap:12px/s);
 assert.match(css,/\.inspector \.inspector-icon-section \.sdk-state-icon\{flex:0 0 196px;min-width:196px;max-width:196px\}/);
});

test('timer state titles and multi runtime artwork do not follow the physical release',()=>{
 const stateTitles=independentTitles();
 const timer={type:'timer',settings:{seconds:60,stateTitles,sdkStateIcons:{off:{kind:'file',value:'OFF'},on:{kind:'file',value:'ON'}}}};
 assert.equal(apply(timer,true).title,'');assert.equal(apply(timer,true).icon.value,'OFF');
 const runtime={deadline:Date.now()+18000,seconds:60};
 const running=apply(timer,false,runtime);assert.equal(running.icon.value,'ON');assert.match(running.title,/^00:00:1[78]$/);
 const multi={type:'multi',settings:{stateTitles,keyPressIcons:{up:{kind:'file',value:'UP'},down:{kind:'file',value:'DOWN'}}}};
 assert.equal(apply(multi,true).icon.value,'UP');
 const step=apply(multi,false,{step:2,total:5});assert.equal(step.icon.value,'DOWN');assert.equal(step.title,'2/5');
 assert.equal(apply(multi,false,{step:2,total:5,gate:{paused:true}}).title,'Ⅱ 2/5');
});
