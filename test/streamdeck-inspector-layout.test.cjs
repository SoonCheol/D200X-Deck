'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'../app/streamdeck-editor');
const editor=fs.readFileSync(path.join(base,'editor.js'),'utf8');
const css=fs.readFileSync(path.join(base,'style.css'),'utf8');
const block=editor.match(/const COMPACT_FIELD_GROUPS=([\s\S]*?);\s*const COMPACT_FIELD_LABELS/);
assert.ok(block,'compact field mapping must exist');
const groups=vm.runInNewContext('('+block[1]+')');
test('all approved short-parameter actions have correct grouped fields',()=>{
  const expected={
    'system-scroll':['axis','direction','step'],
    'system-volume':['direction','step'],
    'device-brightness':['direction','step'],
    'system-zoom':['operation','step'],
    'edit-history':['operation','step'],
    'timer':['seconds','sound'],
    'audio-play':['fade','fadeDuration'],
    'text':['enter','mode']
  };
  for(const [action,fields] of Object.entries(expected)){
    assert.deepEqual(Array.from(groups[action][0]),fields,action);
  }
  assert.match(editor,/groupCompactActionFields\(root,item\.type\)/);
  assert.equal(groups.folder,undefined,'folder must use aligned standard fields rather than compressed grouped checkboxes');
  assert.match(editor,/case "folder":return check\("autoExitEnabled","자동 나가기"\)/);
});
test('compact groups have a real grid layout with fixed total field width',()=>{
  assert.match(css,/\.fields>\.compact-property-group\s*\{[^}]*width:404px;[^}]*display:grid/s);
  assert.match(css,/\.compact-property-group\.compact-count-3\s*\{\s*grid-template-columns:/);
  assert.match(css,/\.compact-property-group\.compact-count-2\s*\{\s*grid-template-columns:/);
  assert.match(css,/\.compact-property-group>\.field\s*\{[^}]*flex-direction:column/s);
  assert.match(css,/\.fields>\.field>label\s*\{[^}]*white-space:nowrap/s);
  assert.match(css,/\.inspector\s*\{\s*padding:16px max\(20px,calc\(\(100% - 600px\)\/2\)\)/);
});
test('shortcut hint line removed; actual current shortcut appears inside title',()=>{
  assert.doesNotMatch(editor,/<label>단축키 안내<\/label>/);
  assert.match(editor,/function bindInspectorShortcut\(root,item\)/);
  assert.match(editor,/bindInspectorShortcut\(root,item\)/);
  assert.match(css,/\.title-line\.has-shortcut>input\s*\{[^}]*padding-right:/);
  assert.match(css,/\.title-shortcut-display\s*\{[^}]*position:absolute/s);
});
test('unsaved dialog remains interactive and original navigation is protected',()=>{
  assert.match(editor,/event\.target\.closest\('#inspector-unsaved-dialog, \.inspector-help-dialog, #sdk-plugin-help-dialog, #icon-maker, \.deckforge-input-dialog'\)\)return;/);
  assert.match(editor,/#icon-library/);
  assert.match(editor,/#action-search/);
  assert.match(editor,/add\('저장 안 함',/);
  assert.match(editor,/add\('저장 후 이동',/);
  assert.match(editor,/if\(inspectorSession\?\.dirty\|\|smartProfileBusy/);
});

test('breadcrumb starts with owning category and gives optional modal help',()=>{
  assert.match(editor,/function inspectorBreadcrumb\(item,action,inspectorName\)/);
  assert.match(editor,/const root=plugin\?'플러그인':'기본 액션'/);
  assert.match(editor,/updatePluginToolbar\(\);\s*renderLibrary\(\);\s*renderInspector\(\)/);
  assert.match(editor,/function appendInspectorHelp\(head,item\)/);
  assert.match(editor,/dialog\.showModal\(\)/);
  for(const key of ['multi','multi-switch','random','logic','timer']){
    assert.match(editor,new RegExp("(?:'"+key+"'|"+key+")\\s*:\\s*\\{"));
  }
  assert.match(editor,/appendInspectorHelp\(root\.querySelector\('\.action-head'\),item\)/);
});
test('preview keeps icon controls but no longer deletes assigned action',()=>{
  assert.doesNotMatch(editor,/id="delete-action"/);
  assert.match(editor,/id="icon-library-open"/);
  assert.match(editor,/id="icon-menu-trigger"/);
  assert.match(editor,/function removeSlotAction\(index\)/);
});
test('composites use one summary row and no duplicated verbose inline guidance',()=>{
  assert.match(editor,/function inspectorOverview\(item\)/);
  assert.match(editor,/className='field inspector-overview'/);
  assert.doesNotMatch(editor,/area\.append\(heading,note,list,toolbar\)/);
  assert.doesNotMatch(editor,/case "multi":return `<div class="field"><label>내용/);
  assert.doesNotMatch(editor,/case "multi-switch":return `<div class="field"><label>상태/);
  assert.match(css,/\.properties>\.fields>\.multi-action-editor\s*\{[^}]*max-width:404px/s);
});
test('state image selector is a naturally sized button, not a full-width input',()=>{
  assert.match(editor,/chooseImage\.className='state-image-choose'/);
  assert.match(editor,/imageActions\.className='state-image-actions'/);
  assert.match(css,/\.multi-switch-visuals>\.state-image-actions>button\s*\{[^}]*width:auto/s);
  assert.match(css,/\.state-image-actions>\.state-image-choose\s*\{[^}]*background:/s);
});

test('title visibility is by the input and presets update all controls in place',()=>{
  assert.match(editor,/class="field title-setting-field"><label class="title-visible-label"><input type="checkbox" id="title-visible"> 제목 표시<\/label>/);
  assert.doesNotMatch(editor,/<label><input type="checkbox" id="title-visible"> 제목 보기<\/label>/);
  assert.doesNotMatch(editor,/class="title-preset-heading"/);
  assert.match(editor,/<select id="title-preset-select" aria-label="저장한 제목 스타일 프리셋"><\/select>/);
  assert.match(editor,/Object\.assign\(style,chosen\.style\)/);
  assert.match(editor,/visible\.checked=style\.visible/);
  assert.match(editor,/family\.value=style\.family/);
  assert.match(editor,/\$\("title-size"\)\.value=String\(style\.size\)/);
  assert.match(editor,/\$\("title-color"\)\.value=style\.color/);
  assert.match(editor,/\$\("outline-color"\)\.value=style\.outlineColor/);
  assert.match(editor,/\$\("outline-width"\)\.value=style\.outlineWidth/);
  assert.match(editor,/persist\(\);renderGrid\(\);refreshTitlePreview\(item\)/);
  assert.match(css,/\.fields>\.field\.title-setting-field\{grid-template-columns:92px minmax\(0,404px\);\}/);
});

test('title alignment keeps original three buttons but uses legible 20px SVG icons',()=>{
 const fragment=editor.slice(editor.indexOf('<div class="title-align"'),editor.indexOf('</div>',editor.indexOf('<div class="title-align"')));
 for(const key of ['bottom','middle','top']){
   assert.match(fragment,new RegExp('data-align="'+key+'"[^>]*aria-label="[^"]+"'));
 }
 assert.equal((fragment.match(/<svg width="20" height="20" viewBox="0 0 24 24"/g)||[]).length,3);
 assert.doesNotMatch(fragment,/[▤▥≡]/);
 assert.match(css,/\.title-align button\{flex:1;border:1px solid #666;border-radius:3px;background:#515151;padding:6px\}/);
 assert.match(css,/\.title-align button svg\{display:block;width:20px;height:20px;margin:auto;pointer-events:none\}/);
 assert.match(css,/\.title-align button.active\{background:#217ce5;border-color:#217ce5\}/);
});

test('common key inspector moves bound options left, save right, and preview test outside the card',()=>{
  const move=editor.slice(editor.indexOf('// Move already-bound DOM nodes'),editor.indexOf('async function importSlotAction'));
  assert.match(move,/option\.prepend\(checkbox\)/);
  assert.match(move,/options\.append\(option\)/);
  assert.match(move,/if\(saveBar\)toolbar\.append\(saveBar\)/);
  assert.match(move,/title\.textContent='미리보기'/);
  assert.match(move,/preview\.append\(card,previewButton\)/);
  assert.match(move,/layout\.append\(iconRegion,preview\)/);
  assert.match(move,/properties\.before\(toolbar,layout\)/);
  assert.match(move,/pathInput\.placeholder='폴더 선택'/);
  assert.match(move,/pathInput\.title=pathInput\.value/);
  assert.match(editor,/if\(folderPicker\)inputNode\.title=inputNode\.value/);
  assert.match(editor,/check\('alwaysNewWindow','중복 열기 방지',true\)/);
  assert.match(editor,/node\.dataset\.inverted==="true"\?!node\.checked:node\.checked/);
  assert.match(editor,/pathPicker\("app","프로그램","app"\)\+input\("args","실행 인수"\)/);
  assert.match(css,/\.action-layout-inspector>\.action-layout-toolbar\{[^}]*margin:9px 0 7px/s);
  assert.match(css,/\.action-layout-inspector \.action-layout-option>label\{[^}]*white-space:nowrap/s);
  assert.match(css,/\.action-layout-inspector \.preview>\.action-preview-test\{[^}]*width:98px/s);
});

test('basic panel reclassification keeps every action ID and legacy accent',()=>{
  const originalPanel=fs.readFileSync(path.join(base,'action-panel-icons.js'),'utf8');
  const sandbox={window:{},localStorage:{getItem:()=>null,setItem:()=>{}}};
  vm.runInNewContext(originalPanel,sandbox);
  const panel=sandbox.window.D200XPanelIcons;
  const visible=Array.from(panel.groups).filter(([name])=>name!=='플러그인 · Home Assistant');
  assert.deepEqual(visible.map(([name])=>name),["D200X 장치·화면","D200X 탐색","앱·파일·웹 실행","멀티미디어","윈도우 창 관리","키보드·마우스","자동화·순차 동작","유틸리티","편집 작업 도구"]);
  const ids=visible.flatMap(([,ids])=>Array.from(ids));
  const core=require(path.join(base,'deck-core.js'));
  assert.equal(ids.length,44);
  assert.deepEqual([...ids].sort(),[...core.ACTION_IDS,...core.D200X_ACTION_IDS].sort());
  const colors=[["brightness","#60a5fa"],["sleep","#60a5fa"],["virtual","#60a5fa"],["device-brightness","#60a5fa"],["folder","#60a5fa"],["profile","#60a5fa"],["previous","#60a5fa"],["next","#60a5fa"],["goto","#60a5fa"],["indicator","#60a5fa"],["system-volume","#c4b5fd"],["system-mute","#c4b5fd"],["window-switch","#c4b5fd"],["window-state","#c4b5fd"],["window-monitor","#c4b5fd"],["desktop-switch","#c4b5fd"],["screenshot","#c4b5fd"],["explorer-open","#c4b5fd"],["hotkey","#fbbf24"],["hotkey-switch","#fbbf24"],["system-scroll","#fbbf24"],["clipboard-edit","#fbbf24"],["edit-history","#fbbf24"],["system-zoom","#fbbf24"],["text","#fbbf24"],["brush-size","#34d399"],["timeline-step","#34d399"],["timeline-zoom","#34d399"],["website","#22d3ee"],["open","#22d3ee"],["open-app","#22d3ee"],["close","#22d3ee"],["file-open","#22d3ee"],["folder-shortcut","#22d3ee"],["multi","#fb7185"],["multi-switch","#fb7185"],["random","#fb7185"],["logic","#fb7185"],["timer","#fb7185"],["audio-play","#f472b6"],["audio-stop","#f472b6"],["media","#f472b6"]];
  const white=panel.keyArtwork('timer');
  panel.setTheme('button');assert.equal(panel.keyArtwork('timer'),white);
  panel.setTheme('color');assert.equal(panel.keyArtwork('timer'),white);
  assert.match(decodeURIComponent(white),/stroke="#ffffff"/);
  assert.doesNotMatch(decodeURIComponent(white),/<rect width="96"|fill-opacity|fill="#293443"/);
  for(const [id,color] of colors)assert.ok(decodeURIComponent(panel.artwork(id)).includes(color),id);
  const help=editor.match(/const PANEL_ACTION_HELP=(\{[\s\S]*?\n\});/);
  assert.ok(help);
  const descriptions=vm.runInNewContext('('+help[1]+')');
  assert.deepEqual(Object.keys(descriptions).sort(),[...ids].sort());
  for(const id of ids)assert.ok(descriptions[id].length>=25,id);
  assert.match(editor,/showPanelActionHelp\(id,label\)/);
  assert.match(editor,/if\(!disabled\)tools\.append\(upload,file,reset\)/);
  assert.match(editor,/const disabled=id==='virtual'/);
  assert.match(editor,/\["sleep","D200X 화면 끄기"/);
  assert.match(editor,/\["folder","덱폴더"/);
});


test('action option menu dismisses only on outside click and opens one menu across groups',()=>{
  const code=editor.match(/function dismissPanelActionOptions\(event\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(code);
  let removed=0;
  const scope={document:{querySelectorAll:selector=>{
    assert.equal(selector,'#library-list .action-override-controls');
    return [{remove:()=>removed++},{remove:()=>removed++}];
  }}};
  vm.runInNewContext(code,scope);
  for(const inside of ['menu','trigger']){
    scope.dismissPanelActionOptions({target:{closest:()=>inside}});
    assert.equal(removed,0);
  }
  scope.dismissPanelActionOptions({target:{closest:()=>null}});
  assert.equal(removed,2);
  assert.match(editor,/document\.addEventListener\('click',dismissPanelActionOptions,true\)/);
  assert.match(editor,/const old=root\.querySelector\("\.action-override-controls"\)/);
  assert.match(editor,/const same=old\?\.parentElement===entry/);
  assert.match(editor,/root\.querySelectorAll\("\.action-override-controls"\)\.forEach\(menu=>menu\.remove\(\)\)/);
});


test('duplicate shortcut actions are hidden only in the basic panel',()=>{
  const render=editor.slice(editor.indexOf('function renderLibrary(){'),editor.indexOf('function renderLibrary(){')+2000);
  assert.match(render,/entries\.filter\(\(\[id,label\]\)=>!HIDDEN_BASIC_ACTION_IDS\.has\(id\)&&/);
  const hidden=JSON.parse(editor.match(/const HIDDEN_BASIC_ACTION_IDS=new Set\((\[[^\]]+\])\)/)[1]);
  assert.deepEqual(hidden,["explorer-open","screenshot","clipboard-edit","window-switch","window-state","window-monitor","desktop-switch","brush-size","timeline-step","timeline-zoom"]);
  const sandbox={window:{},localStorage:{getItem:()=>null}};
  vm.runInNewContext(fs.readFileSync(path.join(base,'action-panel-icons.js'),'utf8'),sandbox);
  const shown=Array.from(sandbox.window.D200XPanelIcons.groups,([name,ids])=>[name,Array.from(ids).filter(id=>!hidden.includes(id))]).filter(([name,ids])=>name!=='플러그인 · Home Assistant'&&ids.length);
  assert.equal(shown.length,7);
  assert.equal(shown.reduce((n,[,ids])=>n+ids.length,0),34);
  for(const id of hidden)assert.ok(require(path.join(base,'deck-core.js')).D200X_ACTION_IDS.includes(id),id);
  assert.match(editor,/\["explorer-open","파일 탐색기 열기"/);
  assert.match(editor,/explorer:'Win\+E'/);
  assert.match(editor,/\['explorer','파일 탐색기'\]/);
  const core=require(path.join(base,'deck-core.js'));
  assert.ok(core.D200X_ACTION_IDS.includes('explorer-open'));
  assert.match(editor,/case "screenshot":case "explorer-open":return ''/);
});


test('new shortcut presets map to the same Windows keys as the legacy actions',()=>{
  const presets=vm.runInNewContext('('+editor.match(/const HOTKEY_PRESETS=(\{[\s\S]*?\n\});/)[1]+')');
  const labels=vm.runInNewContext('('+editor.match(/const HOTKEY_PRESET_LABELS=(\[[\s\S]*?\n\]);/)[1]+')');
  const main=fs.readFileSync(path.join(base,'main.cjs'),'utf8');
  const context={parseWindowsHotkey:require(path.join(base,'hotkey-keys.js')).resolve};
  assert.match(main,/function parseWindowsHotkey\(value\)\{return DeckHotkeys\.resolve\(value\);\}/);
  const expected={"switchWindowPrevious":{"held":[18,16],"key":9},"windowMaximize":{"held":[91],"key":38},"windowRestore":{"held":[91],"key":40},"monitorLeft":{"held":[91,16],"key":37},"monitorRight":{"held":[91,16],"key":39},"desktopPrevious":{"held":[91,17],"key":37},"desktopNext":{"held":[91,17],"key":39},"brushDecrease":{"held":[],"key":219},"brushIncrease":{"held":[],"key":221},"timelinePrevious":{"held":[],"key":37},"timelineNext":{"held":[],"key":39},"timelineZoomIn":{"held":[17],"key":187},"timelineZoomOut":{"held":[17],"key":189}};
  for(const [id,keys] of Object.entries(expected)){
    assert.ok(labels.some(([key])=>key===id),id);
    const parsed=context.parseWindowsHotkey(presets[id]);
    assert.deepEqual({held:parsed.held,key:parsed.key},keys,id);
  }
});


test('DeckForge branding changes only own display text, not compatibility identifiers',()=>{
  const main=fs.readFileSync(path.join(base,'main.cjs'),'utf8');
  const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
  assert.match(editor,/DeckForge 아이콘 라이브러리 열기/);
  assert.doesNotMatch(editor,/Stream Deck 아이콘 라이브러리 열기/);
  assert.match(editor,/DeckForge 플러그인 \(Stream Deck SDK\)/);
  assert.match(main,/title:'DeckForge 플러그인 설치'/);
  assert.match(html,/DeckForge 아이콘팩 가져오기 \(Stream Deck·Ulanzi 호환 ZIP\)/);
  assert.match(editor,/const STORAGE_KEY="d200x-streamdeck-editor-prototype-v1"/);
  assert.match(editor,/com\.autodesk\.fusionstreamdeck/);
  assert.match(main,/extensions:\['streamDeckPlugin','zip'\]/);
  assert.match(main,/extensions:\['streamDeckIconPack','sdIconPack'\]/);
  assert.match(main,/actions\/workflows\/streamdeck-clean-preview\.yml/);
});


test('updated action display names preserve stable ids and hold options',()=>{
  assert.match(editor,/\["goto","선택 페이지"/);
  assert.match(editor,/\["close","프로그램 종료"/);
  assert.match(editor,/\["force","프로그램 강제 종료"\]/);
  assert.doesNotMatch(editor,/"선택 페이지로 이동"|"응용 프로그램 종료"/);
});


test('both Terminal catalogue actions have distinct titles and icon artwork',()=>{
  const sandbox={window:{},localStorage:{getItem:()=>null,setItem:()=>{}}};
  vm.runInNewContext(fs.readFileSync(path.join(base,'action-panel-icons.js'),'utf8'),sandbox);
  const panel=sandbox.window.D200XPanelIcons;
  const group=panel.groups.find(([name])=>name==='앱·파일·웹 실행')[1];
  assert.ok(group.includes('terminal')&&group.includes('terminal-admin'));
  assert.notEqual(panel.artwork('terminal'),panel.artwork('terminal-admin'));
  assert.match(editor,/\["terminal","터미널","▣"\]/);
  assert.match(editor,/\["terminal-admin","터미널\(관리자\)","▣"\]/);
});

test('preview has 6px side inset without resizing the state cards',()=>{
  assert.match(css,/\.action-layout-inspector \.action-preview-card\{[^}]*width:98px/s);
  assert.match(css,/\.action-layout-inspector \.action-preview-card \.preview-key\{width:86px;height:86px;margin:0 auto\}/);
});

test('dial stack keeps the unused single target visible but disabled',()=>{
  assert.match(editor,/target\.value=binding\[targetKey\];\s*target\.disabled=heldDisabled\|\|currentMode==='stack';/);
  assert.match(editor,/target\.addEventListener\('change',\(\)=>\{if\(target\.disabled\)return;binding\[targetKey\]=target\.value/);
  assert.match(editor,/config\.append\(label,target\)/);
  assert.match(css,/\.control-adjust-config>select:disabled\{opacity:\.45;cursor:default\}/);
});

test('knob modes use fixed common layout and pressed-rotation gate',()=>{
  const start=editor.indexOf('function renderControlInspector(){');
  const end=editor.indexOf('// Preview state title artwork',start);
  assert.ok(start>=0&&end>start);
  const block=editor.slice(start,end);
  assert.doesNotMatch(block,/조절형 액션/);
  assert.ok(block.indexOf('root.append(useRow)')<block.indexOf('const scopeRow='));
  assert.match(block,/scope\.disabled=heldDisabled/);
  assert.match(block,/mode\.disabled=heldDisabled/);
  assert.match(block,/stepSelect\.disabled=heldDisabled/);
  assert.match(block,/reverse\.disabled=heldDisabled/);
  assert.match(block,/area\.disabled=heldDisabled\|\|currentMode!=='stack'/);
  assert.match(block,/test\.dataset\.blocked=String\(heldDisabled/);
  assert.match(block,/knob-reserved-row/);
  assert.match(css,/\.knob-inspector \.control-gesture-tile\{height:50px;min-height:50px/);
  assert.match(css,/\.knob-inspector \.knob-reserved-row\{visibility:hidden\}/);
});

test('knob inspector fits available panel width without forcing 680px or hiding overflow',()=>{
  const knobCss=css.slice(css.indexOf('/* Knob inspector only:'));
  assert.ok(knobCss.startsWith('/* Knob inspector only:'));
  assert.doesNotMatch(knobCss,/--knob-min-width|min-width:680px|overflow-x:hidden/);
  assert.match(knobCss,/\.inspector\.knob-inspector\{[^}]*min-width:0;max-width:100%;container-type:inline-size;container-name:knob-properties;scrollbar-gutter:stable/);
  assert.match(knobCss,/\.knob-inspector>\.control-action-editor\{width:100%;min-width:0;max-width:100%/);
  assert.match(knobCss,/grid-template-columns:84px minmax\(0,1fr\) 84px minmax\(0,1fr\)/);
  assert.match(knobCss,/repeat\(5,minmax\(max-content,1fr\)\)/);
  assert.match(knobCss,/@container knob-properties \(max-width:550px\)/);
  assert.match(knobCss,/\.knob-inspector \.knob-stack label\{[^}]*white-space:nowrap/);
  assert.match(knobCss,/\.knob-inspector \.control-head>\.inspector-save-bar\{[^}]*margin:0 0 0 auto/);
  assert.match(knobCss,/\.knob-inspector \.knob-card-test\{position:absolute/);
});

test('all three hotkey dropdowns share the actual Windows key catalog',()=>{
  const api=require(path.join(base,'hotkey-keys.js'));
  assert.deepEqual(api.groups.map(group=>group.keys.length),[37,24,47]);
  for(const group of api.groups)for(const entry of group.keys){
    assert.equal(api.resolve(entry.id).key,entry.vk,entry.id);
    assert.equal(api.resolve('Ctrl+Alt+Shift+Win+'+entry.id).key,entry.vk,entry.id);
  }
  assert.deepEqual(api.resolve('Shift+PrtSc'),{held:[16],key:44,extended:true,scan:69});
  assert.equal(api.resolve('Alt+F24').key,0x87);
  assert.equal(api.resolve('NumpadEnter').extended,true);
  assert.equal(api.resolve('Enter').extended,false);
  assert.notEqual(api.resolve('Numpad1').key,api.resolve('1').key);
  assert.equal(api.resolve('Ctrl+NumpadAdd').key,0x6B);
  assert.equal(api.resolve('Ctrl+Plus').key,0xBB);
  assert.equal(api.capture({code:'PrintScreen',key:'PrintScreen',shiftKey:true}),'Shift+PrintScreen');
  assert.equal(api.capture({code:'NumpadEnter',key:'Enter',ctrlKey:true}),'Ctrl+NumpadEnter');
  assert.equal(api.capture({code:'Equal',key:'+',shiftKey:true}),'Shift+Plus');
  assert.equal(api.capture({code:'ArrowLeft',key:'ArrowLeft'}),'Left');
  assert.equal(api.resolve('A+B'),null);
  assert.equal(api.resolve('Ctrl+Ctrl+A'),null);
});
test('preset matching ignores modifier order and only unmatched Windows shortcuts get an advisory',()=>{
  const api=require(path.join(base,'hotkey-keys.js'));
  const presets={screenshot:'Win+Shift+S',copy:'Ctrl+C',lock:'Win+L'};
  assert.equal(api.matchPreset('Shift+Win+s',presets),'screenshot');
  assert.equal(api.advisory('Shift+Win+S',presets),'');
  assert.equal(api.advisory('Win+L',presets),'');
  assert.match(api.advisory('Win+R',presets),/실행 창/);
  assert.match(api.advisory('Ctrl+Alt+Delete',presets),/보안 화면/);
  assert.ok(api.resolve('Ctrl+Alt+Delete'),'advisory must not block registration');
  assert.equal(api.advisory('Ctrl+V',presets),'');
  assert.equal(api.advisory('Shift+PrintScreen',presets),'');
});
test('hotkey inputs reuse existing field rows, preset list and action preview',()=>{
  assert.match(editor,/case "hotkey":return select\("preset","동작 선택",HOTKEY_PRESET_LABELS\)/);
  assert.match(editor,/if\(item.type==='hotkey'\|\|item.type==='hotkey-switch'\)bindHotkeyFields\(root,item\)/);
  assert.match(editor,/button.disabled=mode!=='select'/);
  assert.match(editor,/menu.disabled=mode!=='select'/);
  assert.match(editor,/node.disabled=mode!=='keyboard'/);
  assert.match(editor,/api.matchPreset\(value,HOTKEY_PRESETS\)/);
  assert.match(editor,/applyPresetTitle\(id\)/);
  assert.match(editor,/node.addEventListener\('keyup'/);
  assert.match(editor,/previewButton.addEventListener\('click',\(\)=>runActionPreview\('down'\)\)/);
  assert.match(css,/\.hotkey-choices>\.hotkey-modifier,\.hotkey-choices>select\{height:31px;min-height:31px/);
  assert.match(css,/\.hotkey-function-name\[hidden\]\{display:none!important\}/);
  const main=fs.readFileSync(path.join(base,'main.cjs'),'utf8');
  const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
  assert.ok(html.indexOf('./hotkey-keys.js')>=0&&html.indexOf('./hotkey-keys.js')<html.indexOf('./editor.js'));
  assert.match(main,/emitWindowsKeys\(parsed.held,parsed.key,parsed\)/);
});

test('hotkey preset and input mode share a row; the function name sits inside the input',()=>{
  assert.match(editor,/combined\.append\(preset,modeLabel,modeBox\)/);
  assert.match(editor,/captureWrap\.append\(node,notice\)/);
  assert.match(editor,/const message=label\|\|advisory\.replace/);
  assert.match(css,/\.hotkey-preset-mode\{display:flex;align-items:center/);
  assert.match(css,/\.hotkey-capture-wrap\{[^}]*height:31px/);
  assert.match(css,/\.hotkey-function-name\{[^}]*text-align:right/);
  assert.doesNotMatch(editor,/hotkey-notice-row/);
});
test('hotkey automatic titles populate both state cards without changing selection flags',()=>{
  const start=editor.indexOf('  function applyPresetTitle(id){');
  const end=editor.indexOf('  function commit(node,value){',start);
  const source=editor.slice(start,end);
  assert.ok(start>=0&&end>start);
  function scenario(titles){
    const pair={first:{enabled:true,title:titles[0]},second:{enabled:false,title:titles[1]}};
    const item={type:'hotkey',title:titles[0],settings:{stateTitles:pair}};
    const titleFields=[{value:titles[0]},{value:titles[1]}],hiddenTitle={value:item.title};
    const root={id:'inspector',querySelectorAll:()=>titleFields,querySelector:()=>hiddenTitle};
    vm.runInNewContext(source+";applyPresetTitle('find')",{
      item,root,HOTKEY_PRESET_LABELS:[['copy','복사'],['find','찾기']],
      hasStateTitlePair:()=>true,ensureStateTitlePair:()=>pair
    });
    return {pair,titleFields,item};
  }
  const initial=scenario(['','']);
  assert.equal(initial.pair.first.title,'찾기');
  assert.equal(initial.pair.second.title,'찾기');
  assert.equal(initial.titleFields[1].value,'찾기');
  assert.equal(initial.pair.first.enabled,true);
  assert.equal(initial.pair.second.enabled,false);
  const custom=scenario(['복사','사용자 제목']);
  assert.equal(custom.pair.first.title,'찾기');
  assert.equal(custom.pair.second.title,'사용자 제목');
});
test('initial editor window is 40px shorter but keeps the minimum and centering',()=>{
  const main=fs.readFileSync(path.join(base,'main.cjs'),'utf8');
  const block=main.slice(main.indexOf('  const windowMargin=18;'),main.indexOf('  window = new BrowserWindow({'));
  assert.match(main,/y:workArea.y\+Math.max\(0,Math.floor\(\(workArea.height-initialHeight\)\/2\)\)/);
  for(const [height,expected] of [[1080,1004],[900,824],[700,630],[640,604]]){
    const result=vm.runInNewContext(block+';({initialHeight,minimumHeight,initialWidth,minimumWidth})',{workArea:{width:1920,height}});
    assert.equal(result.initialHeight,expected);
    assert.equal(result.minimumHeight,Math.min(630,expected));
    assert.equal(result.initialWidth,980);
    assert.equal(result.minimumWidth,960);
  }
});

test('page indicator uses standard paired cards with independent title and number style controls',()=>{
  assert.match(editor,/card\.append\(heading,titleLine,line,image,buttons\)/);
  assert.match(editor,/const down=buildCard\(true\)/);
  assert.match(editor,/down\.card\.append\(down\.heading,downTitle,downNumber,down\.image,down\.buttons\)/);
  assert.match(editor,/check\.id=number\?'indicator-down-number-visible':'indicator-down-title-visible'/);
  assert.match(editor,/root\._openIndicatorStyle\(font,field\)/);
  assert.match(editor,/titleLine\.prepend\(titleCheck\)/);
  assert.match(editor,/line\.prepend\(check,name\)/);
  assert.match(editor,/if\(\(hasStateTitlePair\(item\)\|\|item\.type==='indicator'\)&&iconRegion\)/);
  assert.match(editor,/const hasStateCards=hasStateTitlePair\(item\)\|\|item\.type==='indicator';/);
  assert.match(css,/\.indicator-inspector \.state-title-layout \.indicator-icon-cards>\.sdk-state-icon\{grid-template-rows:auto 31px 31px auto\}/);
  assert.match(css,/\.indicator-inspector \.state-title-layout \.indicator-icon-cards \.sdk-state-preview,.*\{grid-row:4\}/);
});

test('title and key background palettes use the right side of the entire inspector',()=>{
  assert.match(css,/\.title-style-popover #title-palette\{position:fixed;[^}]*max-height:calc\(100dvh - 16px\)/);
  assert.match(editor,/function openPalette\(field,trigger\)/);
  assert.match(editor,/positionAppearancePalette\(palette,trigger\)/);
  assert.match(editor,/positionAppearancePalette\(popup,trigger\)/);
  const start=editor.indexOf('function appearancePalettePosition('),end=editor.indexOf('function positionAppearancePalette(',start);
  const position=new Function(editor.slice(start,end)+';return appearancePalettePosition;')();
  for(const [width,height,inspectorRight] of [[960,630,680],[1180,800,860],[1920,1080,1600]]){
    const p=position({right:inspectorRight},{top:height-30},{width:251,height:280},width,height);
    assert.equal(p.x,inspectorRight+8);
    assert.equal(p.y,height-288);
    assert.ok(p.x+251<=width-8);
  }
  assert.match(editor,/openPalette\(field,event\.currentTarget\)/);
});

test('indicator management labels and template draft are preserved before one bulk save',()=>{
 const body=editor.slice(editor.indexOf('function bindIndicatorInspector('),editor.indexOf('function bindExtendedActionFields('));
 assert.match(body,/모든 페이지에 버튼 추가/);
 assert.match(body,/모든 페이지에 디자인 적용/);
 assert.match(body,/모든 페이지에서 버튼 제거/);
 assert.match(body,/if\(op==='remove'&&inspectorSession\?\.dirty\)/);
 assert.match(body,/if\(\(op==='add'\|\|op==='design'\)&&inspectorSession\?\.dirty&&!confirm/);
 assert.match(body,/if\(!persist\(\)\)\{state=before;inspectorSession=session;render\(\);return;\}/);
});

test('wide knob labels separate normal and held actions and retain the second line even when identical',()=>{
  const begin=editor.indexOf('const KNOB_TARGET_LABELS='),end=editor.indexOf('window.D200XKnobInfo=',begin);
  const label=new Function('DeckCore','ACTIONS',editor.slice(begin,end)+';return wideKnobLabels;')({
    activeControlAction:(binding,key)=>binding?.[key]||null
  },new Map([['hotkey',{label:'단축키'}]]));
  const binding={mode:'adjust',target:'page',heldEnabled:true,heldMode:'trigger',heldTarget:'volume',heldAutoAssign:true};
  assert.deepEqual(label(binding,0),{title:'페이지 이동',detail:'Windows 음량'});
  assert.deepEqual(label({...binding,heldEnabled:false},0),{title:'페이지 이동',detail:''});
  assert.deepEqual(label({...binding,heldTarget:'page'},0),{title:'페이지 이동',detail:'페이지 이동'});
  assert.deepEqual(label({...binding,heldMode:'stack',heldStack:['page','volume']},1),{title:'페이지 이동',detail:'Windows 음량'});
  assert.deepEqual(label({...binding,heldAutoAssign:false,holdLeft:{type:'hotkey',title:'복사'},holdRight:{type:'hotkey',title:'붙여넣기'}},0),{title:'페이지 이동',detail:'복사 / 붙여넣기'});
});

// Display-only rename must not change action IDs or user profile schemas.
test('sequential-action Korean terminology is consistent across renderer, core, AI and catalogue',()=>{
  const files=['editor.js','deck-core.js','action-panel-icons.js','ai/read-tools.cjs'];
  for(const file of files){
    const source=fs.readFileSync(path.join(base,file),'utf8');
    assert.doesNotMatch(source,/다중 동작/,file);
  }
  assert.match(editor,/\["multi","순차 동작"/);
  assert.match(editor,/\["multi-switch","순차 동작 스위치"/);
  assert.match(fs.readFileSync(path.join(base,'action-panel-icons.js'),'utf8'),/자동화·순차 동작/);
  assert.match(fs.readFileSync(path.join(base,'ai/read-tools.cjs'),'utf8'),/"multi":"순차 동작"/);
});
