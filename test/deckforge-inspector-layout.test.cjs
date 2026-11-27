'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'../app/deckforge-editor');
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
    'audio-play':['mode','fade','fadeDuration'],
    'text':['enter','mode']
  };
  for(const [action,fields] of Object.entries(expected)){
    assert.deepEqual(Array.from(groups[action][0]),fields,action);
  }
  assert.match(editor,/groupCompactActionFields\(root,item\.type\)/);
  assert.deepEqual(Array.from(groups['audio-play'][1]),['output','volume']);
  assert.equal(groups.folder,undefined,'folder must use aligned standard fields rather than compressed grouped checkboxes');
  assert.match(editor,/case "folder":return check\("autoExitEnabled","자동 나가기"\)/);
});

test('effect playback has the two requested rows and independent live volume with cancel/save',()=>{
  const markup=editor.split('case "audio-play":return')[1]?.split('\n')[0]||'';
  const order=['select("mode"','select("fade"','select("fadeDuration"','select("output"','data-field="volume"'];
  let at=-1;
  for(const part of order){
    const next=markup.indexOf(part);
    assert.ok(next>at,'audio field order: '+part);
    at=next;
  }
  assert.ok(css.includes('.compact-property-group.audio-play-property-group:has([data-field="mode"])'));
  assert.ok(css.includes('.compact-property-group.audio-play-property-group:has([data-field="volume"])'));
  assert.ok(editor.includes("node.tagName==='TEXTAREA'||node.type==='range'?'input':'change'"));
  assert.ok(editor.includes('updateActiveAudioVolume(item.settings,value)'));
  assert.ok(editor.includes("if(item.type==='audio-play')persistInspectorChange()"));
  const from=editor.indexOf('function updateActiveAudioVolume(settings,percentage){');
  const to=editor.indexOf('function fadeAudio(',from);
  assert.ok(from>=0&&to>from);
  const settingsA={},settingsB={};
  const a={volume:.5},b={volume:.3},levelA={level:.5},levelB={level:.3};
  const context={
    allPlayingAudio:new Set([a,b]),
    audioActionSettings:new WeakMap([[a,settingsA],[b,settingsB]]),
    audioActionLevels:new WeakMap([[a,levelA],[b,levelB]]),
    pendingAudioVolumes:new WeakMap()
  };
  const controls=vm.runInNewContext(editor.slice(from,to)+';({updateActiveAudioVolume,commitPendingAudioVolumes,revertPendingAudioVolumes})',context);
  controls.updateActiveAudioVolume(settingsA,20);
  assert.equal(a.volume,.2);assert.equal(levelA.level,.2);
  assert.equal(b.volume,.3);assert.equal(levelB.level,.3,'another action remains unchanged');
  controls.revertPendingAudioVolumes();
  assert.equal(a.volume,.5);assert.equal(levelA.level,.5);
  controls.updateActiveAudioVolume(settingsA,80);
  controls.commitPendingAudioVolumes();
  controls.revertPendingAudioVolumes();
  assert.equal(a.volume,.8);assert.equal(levelA.level,.8,'saved level remains applied');
  assert.ok(editor.includes('audioActionSettings.set(audio,settings)'));
  assert.ok(editor.includes('audioActionLevels.set(audio,targetVolume)'));
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
  assert.match(editor,/event\.target\.closest\('#inspector-unsaved-dialog, \.inspector-help-dialog, #sdk-plugin-help-dialog, #icon-maker, \.deckforge-message-dialog, \.deckforge-input-dialog'\)\)return;/);
  assert.match(editor,/#icon-library/);
  assert.match(editor,/#action-search/);
  assert.match(editor,/add\('저장 안 함',/);
  assert.match(editor,/add\('저장 후 이동',/);
  assert.match(editor,/const smartProfileBlocked=\(\)=>profileStorageFailure\|\|inspectorSession\?\.dirty/);
  assert.match(editor,/if\(smartProfileBusy\|\|smartProfileBlocked\(\)/);
  assert.match(editor,/if\(startProfile!==state\.profileId\|\|smartProfileBlocked\(\)\)return;/);
});

test('redundant catalogue path and upper-left inspector help are removed',()=>{
  assert.doesNotMatch(editor,/function inspectorBreadcrumb\(item,action,inspectorName\)/);
  assert.match(editor,/class="action-head inspector-title-region"><\/div>/);
  assert.match(editor,/if\(actionHeader&&!actionHeader\.childElementCount\)actionHeader\.remove\(\)/);
  assert.match(editor,/updatePluginToolbar\(\);\s*renderLibrary\(\);\s*renderInspector\(\)/);
  assert.match(editor,/function appendInspectorHelp\(head,item\)/);
  assert.match(editor,/dialog\.showModal\(\)/);
  for(const key of ['multi','multi-switch','random','logic','timer']){
    assert.match(editor,new RegExp("(?:'"+key+"'|"+key+")\\s*:\\s*\\{"));
  }
  assert.doesNotMatch(editor,/appendInspectorHelp\(root\.querySelector\('\.action-head'\),item\)/);
  assert.match(editor,/trigger\.textContent='\?'/); // Legacy optional help helper kept, not attached to inspector.
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
  assert.match(editor,/lookup\('title-size'\)\.value=String\(style\.size\)/);
  assert.match(editor,/lookup\('title-color'\)\.value=style\.color/);
  assert.match(editor,/lookup\('outline-color'\)\.value=style\.outlineColor/);
  assert.match(editor,/lookup\('outline-width'\)\.value=style\.outlineWidth/);
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
  assert.equal(ids.length,45);
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
  assert.equal(shown.reduce((n,[,ids])=>n+ids.length,0),35);
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
  assert.match(editor,/label:'DeckForge 플러그인'/);
  assert.doesNotMatch(editor,/DeckForge 플러그인 \(Stream Deck SDK\)/);
  const ai=fs.readFileSync(path.join(base,'ai','read-tools.cjs'),'utf8');
  assert.match(ai,/"sd-plugin":"DeckForge 플러그인"/);
  assert.doesNotMatch(ai,/DeckForge 플러그인 \(Stream Deck SDK\)/);
  assert.match(main,/title:'DeckForge 플러그인 설치'/);
  assert.match(html,/DeckForge 아이콘팩 가져오기 \(Stream Deck·Ulanzi 호환 ZIP\)/);
  assert.match(editor,/const STORAGE_KEY="d200x-streamdeck-editor-prototype-v1"/);
  assert.match(editor,/com\.autodesk\.fusionstreamdeck/);
  assert.match(main,/extensions:\['streamDeckPlugin','zip'\]/);
  assert.match(main,/extensions:\['streamDeckIconPack','sdIconPack'\]/);
  assert.match(main,/ipcMain\.handle\('d200x:update-status'/);
  assert.match(main,/actions\/runs\/['"]\+info\.runId/,'updates open the verified build page');
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
  assert.doesNotMatch(knobCss,/--knob-min-width|min-width:680px/);
  // Inspect only knob selectors: the ordinary LCD-button inspector may clip overflow.
  assert.doesNotMatch(knobCss,/\.knob-inspector[^{}]*\{[^}]*overflow-x:hidden/);
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
  assert.match(main,/emitVerifiedWindowsHotkey\(parsed\)/);
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
  assert.match(editor,/if\(\(hasStateTitlePair\(item\)\|\|item\.type==='indicator'\|\|hasSingleBasicIconCard\(item\)\|\|DeckCore\.isNativeForeground\(item,typeof sdkPlugins==='undefined'\?null:sdkPlugins\)\)&&iconRegion\)/);
  assert.match(editor,/const hasStateCards=hasStateTitlePair\(item\)\|\|item\.type==='indicator';/);
  assert.match(css,/\.indicator-inspector \.state-title-layout \.indicator-icon-cards>\.sdk-state-icon\{grid-template-rows:auto 31px 31px auto\}/);
  assert.match(css,/\.indicator-inspector \.state-title-layout \.indicator-icon-cards \.sdk-state-preview,.*\{grid-row:4\}/);
});

test('background palettes and title properties use outer card right edge and top with viewport fallback',()=>{
  assert.match(css,/\.title-style-popover #title-palette\{position:fixed;[^}]*max-height:calc\(100dvh - 16px\)/);
  assert.match(editor,/function openPalette\(field,trigger\)/);
  assert.match(editor,/positionAppearancePalette\(palette,trigger\)/);
  assert.match(editor,/positionAppearancePalette\(popup,trigger\)/);
  assert.match(editor,/positionIconAppearancePopover\(popup,trigger\)/);
  assert.match(editor,/positionIconAppearancePopover\(menu,trigger\)/);
  const start=editor.indexOf('function appearancePalettePosition('),end=editor.indexOf('function appearanceIconAnchor(',start);
  const position=new Function(editor.slice(start,end)+';return appearancePalettePosition;')();
  const up={left:24,right:256,top:106},down={left:268,right:499,top:106};
  for(const bounds of [{width:251,height:240},{width:277,height:240}]){
    assert.deepEqual(position(up,bounds,894,600),{x:264,y:106});
    assert.deepEqual(position(down,bounds,894,600),{x:507,y:106});
    assert.equal(position({left:640,right:772,top:106},bounds,894,600).x,640-8-bounds.width);
    const tight=position(down,bounds,500,300);
    assert.ok(tight.x>=8&&tight.x+bounds.width<=492&&tight.y+bounds.height<=292);
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

test('legacy renderer text also uses the sequential-action terminology',()=>{
  const legacy=path.join(base,'../renderer');
  for(const file of ['action-catalog.js','key-context-menu.js','ko.js']){
    assert.doesNotMatch(fs.readFileSync(path.join(legacy,file),'utf8'),/다중 동작/,file);
  }
});

test('gesture tabs are above the original artwork and share the Cancel/Save toolbar',()=>{
 const t=editor.slice(editor.indexOf('function renderPressTabs('),editor.indexOf('async function updateApplicationArtwork('));
 assert.match(t,/if\(toolbar\)toolbar\.prepend\(host\)/);
 assert.doesNotMatch(t,/visual\.after\(host\)/);
 assert.match(editor,/layout\.append\(iconRegion,preview\)/);
 assert.match(editor,/if\(ordinaryPress\)renderPressTabs\(rootItem,root\)/);
 assert.match(editor,/root\.prepend\(toolbar\);renderPressTabs\(rootItem,root\);return;/);
 assert.match(css,/\.action-layout-inspector>\.action-layout-toolbar>\.press-tabs-section\{flex:1;min-width:0;margin:0\}/);
});

test('basic and SDK catalogue tiles never register an action on click',()=>{
  const basic=editor.slice(editor.indexOf('function renderLibrary(){'),editor.indexOf('function bindActionAppearance(){'));
  const sdk=editor.slice(editor.indexOf('function renderInstalledSdkPlugins('),editor.indexOf('async function configureHomeAssistant()'));
  assert.match(basic,/entry\.addEventListener\("dragstart"/);
  assert.match(sdk,/tile\.addEventListener\('dragstart'/);
  assert.doesNotMatch(basic,/entry\.addEventListener\("click"/);
  assert.doesNotMatch(sdk,/tile\.addEventListener\('click'/);
  assert.match(basic,/customise\.addEventListener\("click"/);
});

test('inspector accepts action drops on active gesture and keeps explicit tab drops',()=>{
  const start=editor.indexOf('function bindInspectorActionDrop(){');
  const end=editor.indexOf('async function importSlotAction(',start);
  assert.ok(start>=0&&end>start);
  const drop=editor.slice(start,end);
  assert.match(drop,/inspector\.addEventListener\('dragover'/);
  assert.match(drop,/inspector\.addEventListener\('drop'/);
  assert.match(drop,/event\.target\.closest\?\.\('\.press-tab-tile'\)/);
  assert.match(drop,/setPressSlot\(state\.selected,activePressTab,newAction\(id\),true\)/);
  assert.match(drop,/return !current\|\|pressIsOrdinary\(current\)/);
  assert.match(editor,/bindInspectorActionDrop\(\);bindActionAppearance\(\)/);
  assert.match(editor,/setPressSlot\(state\.selected,slot,newAction\(id\),true\)/);
});

test('three tabs are shorter and equal width without resizing the separate icon region',()=>{
  assert.match(editor,/press-empty-inspector press-gesture-inspector/);
  assert.match(editor,/className='inspector-visual-placeholder'/);
  assert.match(css,/\.action-layout-inspector\.press-gesture-inspector>\.action-layout-toolbar\{[^}]*grid-template-columns:minmax\(0,1fr\) max-content/s);
  assert.match(css,/\.action-layout-inspector\.press-gesture-inspector>\.action-layout-toolbar \.press-tabs-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/s);
  assert.match(css,/\.action-layout-inspector\.press-gesture-inspector>\.action-layout-toolbar \.press-tab-tile\{[^}]*height:46px/s);
  assert.match(css,/\.action-layout-inspector\.press-gesture-inspector>\.state-title-layout,[\s\S]*?\.inspector-visual-placeholder\{[^}]*min-height:225px/s);
  assert.match(css,/\.action-layout-inspector\.press-gesture-inspector>\.state-title-layout\{[^}]*grid-template-columns:minmax\(0,1fr\) 98px/s);
  assert.match(css,/scrollbar-gutter:stable/);
  assert.match(css,/\.action-layout-inspector\.press-gesture-inspector>\.inspector-properties-region/);
  assert.match(editor,/layout\.append\(iconRegion,preview\)/);
});


test('Key Logic context menu only wraps executable actions and leaves unsupported SDK data intact',()=>{
 const Core=require('../app/deckforge-editor/deck-core.js');
 const menuSource=editor.slice(editor.indexOf('function showMenu('),editor.indexOf('let clipboard=null,clipboardMode='));
 const allow=editor.match(/const MULTI_ALLOWED=(\[[\s\S]*?\]);/);
 assert.ok(menuSource.startsWith('function showMenu(')&&allow);
 const state=Core.migrateState(null),menu={items:[],style:{},hidden:true,replaceChildren(){this.items=[];},append(b){this.items.push(b);}};
 const sandbox={DeckCore:Core,state,$:()=>menu,reservedWideSlot:()=>false,currentPage:()=>Core.currentActions(state),
   document:{createElement(tag){return {tag,addEventListener(_event,fn){this.click=fn;}};}},
   window:{innerWidth:1000,innerHeight:800},canCutSlot:()=>true,clipboard:null,
   newAction:Core.createAction,setItem:(index,item)=>{Core.currentActions(state)[index]=item;}};
 const show=vm.runInNewContext('const MULTI_ALLOWED='+allow[1]+';'+menuSource+';showMenu',sandbox);
 const action=type=>{const a=Core.createAction(type);Core.currentActions(state)[0]=a;return a;};
 const row=()=>menu.items.find(b=>b.textContent==='Key Logic으로 이동');
 for(const type of ['sd-plugin','folder','logic','multi','multi-switch','random','indicator','virtual','profile']){
   const item=action(type),before=JSON.stringify(state);show(0,0,0);
   assert.ok(row()?.disabled,type);assert.equal(row().click,undefined);
   assert.equal(Core.currentActions(state)[0],item);assert.equal(JSON.stringify(state),before);
 }
 const sdk=action('sd-plugin');sdk.settings.pluginUUID='com.deckforge.native.example';sdk.settings.actionUUID='com.deckforge.native.example.key';
 const old=Core.createAction('logic');old.slots={single:sdk,double:null,hold:null};
 const reloaded=Core.cleanAction(old);
 assert.equal(reloaded.slots.single.instanceId,sdk.instanceId);
 assert.deepEqual(reloaded.slots.single.settings,sdk.settings);
 const hotkey=action('hotkey');hotkey.settings.keys='Ctrl+A';show(0,0,0);
 assert.equal(row().disabled,undefined);row().click();
 const wrapped=Core.currentActions(state)[0];assert.equal(wrapped.type,'logic');
 assert.equal(wrapped.slots.single.type,'hotkey');assert.equal(wrapped.slots.single.settings.keys,'Ctrl+A');
});


test('failed grid paste restores prior button and retains cut identity until a successful write',()=>{
 const Core=require('../app/deckforge-editor/deck-core.js');
 const state=Core.migrateState(null),page=Core.currentActions(state);
 const original=Core.createAction('sd-plugin'),target=Core.createAction('sd-plugin');
 original.settings.pluginUUID='com.deckforge.native.example';original.settings.actionUUID=original.settings.pluginUUID+'.key';
 target.settings.pluginUUID=original.settings.pluginUUID;target.settings.actionUUID=original.settings.actionUUID;
 page[1]=target;state.selected=0;
 const setSource=editor.slice(editor.indexOf('function setItem('),editor.indexOf('function removeSlotAction('));
 const pasteSource=editor.slice(editor.indexOf('function pasteClipboardAction('),editor.indexOf('function showMenu('));
 const retired=[],writes=[],syncs=[];
 let success=false;
 const sandbox={DeckCore:Core,state,clipboard:original,clipboardMode:'cut',inspectorSession:null,inspectorEditing:false,
   clone:x=>JSON.parse(JSON.stringify(x)),currentPage:()=>page,reservedWideSlot:i=>i===13,
   confirm:()=>true,sdkContext:i=>'old-'+i,clearSdkVisualContext:c=>retired.push(c),
   persist:schedule=>{assert.equal(schedule,false);writes.push(page[state.selected].instanceId);return success;},
   render(){},window:{scheduleDeckSync:()=>syncs.push(true)}};
 const paste=vm.runInNewContext(setSource+'\n'+pasteSource+'\npasteClipboardAction',sandbox);
 assert.equal(paste(1),false);assert.equal(page[1],target);assert.equal(state.selected,0);
 assert.equal(sandbox.clipboardMode,'cut');assert.deepEqual(retired,[]);assert.deepEqual(syncs,[]);
 success=true;assert.equal(paste(1),true);assert.equal(page[1].instanceId,original.instanceId);
 assert.equal(sandbox.clipboardMode,'copy');assert.deepEqual(retired,['old-1']);assert.equal(syncs.length,1);
 assert.equal(paste(2),true);assert.notEqual(page[2].instanceId,original.instanceId);
 assert.deepEqual(page[2].settings,original.settings);
 assert.equal(writes[0],original.instanceId);assert.equal(writes[1],original.instanceId);
});


test('immediate gesture edits preserve original button and nested settings on profile write failure',()=>{
 const Core=require('../app/deckforge-editor/deck-core.js'),state=Core.migrateState(null),page=Core.currentActions(state);
 const original=Core.createAction('hotkey');original.settings.keys='Ctrl+A';
 original.pressActions={double:Core.createAction('hotkey'),hold:null};original.pressActions.double.settings.keys='Ctrl+C';
 original.pressMeta={enabled:{single:true,double:true,hold:true},representative:'single'};
 page[1]=original;state.selected=0;
 const before=JSON.stringify(original),syncs=[];
 let success=false;
 const source=editor.slice(editor.indexOf('function pressEnsureMeta('),editor.indexOf('function attachPressPreviewBadges('));
 const sandbox={DeckCore:Core,state,currentPage:()=>page,clone:x=>JSON.parse(JSON.stringify(x)),
   PRESS_TABS:[['single','single'],['double','double'],['hold','hold']],
   inspectorSession:null,inspectorEditing:false,activePressTab:'single',
   pressIsOrdinary:a=>!!a&&Core.PRESS_ACTION_TYPES.includes(a.type),
   pressSlotAction:(a,k)=>k==='single'?a:a.pressActions?.[k],
   confirm:()=>true,persist:schedule=>{assert.equal(schedule,false);return success;},
   render(){},window:{scheduleDeckSync:()=>syncs.push(true)}};
 const set=vm.runInNewContext(source+'\nsetPressSlot',sandbox);
 const next=Core.createAction('hotkey');next.settings.keys='Ctrl+V';
 assert.equal(set(1,'double',next,true),false);
 assert.equal(page[1],original);assert.equal(JSON.stringify(original),before);assert.equal(state.selected,0);
 assert.equal(sandbox.activePressTab,'single');assert.deepEqual(syncs,[]);
 success=true;assert.equal(set(1,'double',next,true),true);
 assert.notEqual(page[1],original);assert.equal(JSON.stringify(original),before);
 assert.equal(page[1].pressActions.double.settings.keys,'Ctrl+V');assert.equal(page[1].settings.keys,'Ctrl+A');
 assert.equal(state.selected,1);assert.equal(sandbox.activePressTab,'double');assert.equal(syncs.length,1);
});

test('Fusion manager remains visible when its only runcommand action is intentionally hidden',()=>{
  const source=editor.slice(editor.indexOf('function sdkPanelActions('),editor.indexOf('async function configureHomeAssistant()'));
  const fusion='com.autodesk.fusionstreamdeck',generic='ha.generic';
  const plugin={uuid:fusion,name:'Autodesk Fusion',version:'1.0.0',runtime:'streamdeck-sdk',actions:[{uuid:fusion+'.runcommand',name:'Run Command'}]};
  const other={uuid:'other.plugin',name:'Other',version:'1.0.0',runtime:'streamdeck-sdk',actions:[{uuid:generic,name:'Hidden'}]};
  const element=()=>({children:[],style:{},append(...children){this.children.push(...children);},addEventListener(){}});
  const render=(query,exactActionId=null,basic=false)=>{
    const root=element();
    Function('sdkPlugins','FUSION_PLUGIN','HA_GENERIC_ACTION','exactActionId','document','sdkCatalogueLabel','pluginHelpButton','window','root','query','basic',source+'\nrenderInstalledSdkPlugins(root,query,basic);')([plugin,other],fusion,generic,exactActionId,{createElement:element},a=>a.name,element,{},root,query,basic);
    return root.children;
  };
  for(const query of ['','fusion','명령 관리자']){
    const groups=render(query);
    assert.equal(groups.length,1);
    const body=groups[0].children[1];
    assert.equal(body.children.length,1);
    assert.equal(body.children[0].textContent,'Fusion 명령 관리자');
  }
  assert.equal(render('unrelated').length,0);
  assert.equal(render('','sd::other.plugin::action').length,0);
  assert.equal(render('',null,true).length,0);
});


test('website fields normalize URLs in every editor and retain the inactive browser path',()=>{
  const start=editor.indexOf('function bindFieldEnabledWhen('),end=editor.indexOf('function bindExtendedActionFields(',start);
  const bind=vm.runInNewContext(editor.slice(start,end)+'\nbindWebsiteFields');
  const node=value=>({value,checked:false,disabled:false,listeners:{},addEventListener(k,fn){this.listeners[k]=fn;},fire(k){this.listeners[k]?.();}});
  const url=node(''),toggle=node(''),mode=node('default'),browser=node('C:\\Tools\\browser.exe'),picker=node('');
  const nodes={'[data-field="url"]':url,'#url-https':toggle,'[data-field="open"]':mode,'[data-field="browserPath"]':browser,'[data-path-picker="browserPath"]':picker};
  const item={settings:{url:'',browserPath:browser.value}};
  let writes=0;bind({querySelector:k=>nodes[k]},item,()=>writes++);
  assert.equal(writes,0);assert.equal(browser.disabled,true);assert.equal(picker.disabled,true);
  url.value='example.org';url.fire('change');assert.equal(item.settings.url,'http://example.org');
  toggle.checked=true;toggle.fire('change');assert.equal(item.settings.url,'https://example.org');
  url.value='http://other.org';url.fire('blur');assert.equal(toggle.checked,false);
  assert.equal(item.settings.url,'http://other.org');
  url.value='';url.fire('change');assert.equal(item.settings.url,'');
  mode.value='choose';mode.fire('change');assert.equal(browser.disabled,false);assert.equal(picker.disabled,false);
  mode.value='get';mode.fire('change');assert.equal(browser.disabled,true);
  assert.equal(item.settings.browserPath,'C:\\Tools\\browser.exe');
  assert.match(editor,/if\(item.type==='website'\)bindWebsiteFields\(root,item,persistInspectorChange\)/);
  assert.match(editor,/if\(draft.type==='website'\)bindWebsiteFields\(fields,draft,\(\)=>\{\}\)/);
  assert.match(editor,/fields.innerHTML=actionFields\(current\);bindExtendedActionFields\(fields,current\)/);
});


test('shared input dependencies update scroll choices and text count without altering data at bind time',()=>{
  const start=editor.indexOf('function bindInputFieldDependencies('),end=editor.indexOf('function bindExtendedActionFields(',start);
  const {bindInputFieldDependencies:bind,bindNestedAudioFields:audio}=vm.runInNewContext(editor.slice(start,end)+'\n({bindInputFieldDependencies,bindNestedAudioFields})',{Option:class{constructor(label,value){this.label=label;this.value=value;}}});
  const node=value=>({value,listeners:{},addEventListener(k,fn){this.listeners[k]=fn;},fire(k){this.listeners[k]?.();},replaceChildren(...nodes){this.options=nodes;}});
  const axis=node('vertical'),direction=node('up'),body=node(''),count=node(''),volume=node('50'),display=node('');
  const elements={'[data-field="axis"]':axis,'[data-field="direction"]':direction,'[data-field="body"]':body,'#text-count':count,'[data-field="volume"]':volume,'#volume-display':display};
  const root={querySelector:k=>elements[k]};
  const item={type:'system-scroll',settings:{axis:'vertical',direction:'up'}};
  bind(root,item);assert.equal(item.settings.direction,'up');
  axis.value='horizontal';axis.fire('change');assert.equal(item.settings.axis,'horizontal');assert.equal(item.settings.direction,'right');assert.equal(direction.value,'right');
  assert.equal(Array.from(direction.options,x=>x.value).join(','),'right,left');
  axis.value='vertical';axis.fire('change');assert.equal(direction.value,'down');
  assert.equal(Array.from(direction.options,x=>x.value).join(','),'down,up');
  bind(root,{type:'text',settings:{body:'old'}});body.value='한글';body.fire('input');assert.equal(count.textContent,'2 / 2048');
  audio(root,{type:'audio-play'});volume.value='72';volume.fire('input');assert.equal(display.textContent,'72');
  assert.match(editor,/<textarea id="s-body" data-field="body" maxlength="2048">/);
  assert.match(editor,/bindInputFieldDependencies\(fields,draft\)/);
  assert.match(editor,/bindInputFieldDependencies\(root,item\)/);
  assert.match(editor,/if\(draft.type==='audio-play'\)void populateAudioOutputs/);
});


test('nested timer retains alert path and volume and enables the path only for custom sound',()=>{
  const start=editor.indexOf('function bindFieldEnabledWhen('),end=editor.indexOf('function bindExtendedActionFields(',start);
  const bind=vm.runInNewContext(editor.slice(start,end)+'\nbindNestedTimerFields',{DeckCore:{timerSeconds:n=>Math.max(1,Math.min(86400,Math.round(Number(n)||30)))}});
  const node=value=>({value,disabled:false,listeners:{},addEventListener(k,fn){this.listeners[k]=fn;},fire(k){this.listeners[k]?.();}});
  const seconds=node('30'),sound=node('connect'),file=node('C:\\alarm.wav'),picker=node(''),volume=node('63'),display=node('');
  const nodes={'[data-field="seconds"]':seconds,'[data-field="sound"]':sound,'[data-field="soundFile"]':file,'[data-path-picker="soundFile"]':picker,'[data-field="soundVolume"]':volume,'#timer-sound-volume-display':display};
  const item={type:'timer',settings:{seconds:30,sound:'connect',soundFile:file.value,soundVolume:63}};
  bind({querySelector:k=>nodes[k]},item);
  assert.equal(file.disabled,true);assert.equal(picker.disabled,true);
  sound.value='custom';sound.fire('change');assert.equal(file.disabled,false);assert.equal(picker.disabled,false);
  sound.value='none';sound.fire('change');assert.equal(file.disabled,true);assert.equal(item.settings.soundFile,'C:\\alarm.wav');
  seconds.value='99999';seconds.fire('change');assert.equal(seconds.value,'86400');
  volume.value='25';volume.fire('input');assert.equal(display.textContent,'25%');
  assert.equal(item.settings.soundVolume,63,'binding alone does not write saved settings');
  assert.match(editor,/bindNestedTimerFields\(fields,draft\)/);
  assert.match(editor,/bindNestedTimerFields\(root,item\)/);
  assert.match(editor,/bindNestedAudioFields\(fields,step\)/);
  assert.match(editor,/bindNestedAudioFields\(fields,action\)/);
});


test('HA sensor interval is editable only in auto mode and disabled drafts are not committed',()=>{
  const start=editor.indexOf('function syncHaSensorInterval('),end=editor.indexOf('async function openNativeSettings(',start);
  const sync=vm.runInNewContext(editor.slice(start,end)+'\nsyncHaSensorInterval');
  const interval={value:'15',disabled:false},inputs=[{field:{key:'seconds'},input:interval}];
  for(const [mode,disabled] of [['all',true],['press',true],['auto',false]]){
    sync(inputs,{mode});assert.equal(interval.disabled,disabled);assert.equal(interval.value,'15');
  }
  assert.match(editor,/if\(haSensor\)syncHaSensorInterval\(inputs,values\)/);
  assert.match(editor,/fieldRows\.get\(field\.key\)\?\.hidden\|\|haSensor&&field\.key==='seconds'&&entry\.input\?\.disabled/);
});


test('GitHub settings can refresh repositories after a failed lookup without opening credential management',()=>{
 const source=editor.slice(editor.indexOf('async function openNativeSettings('),editor.indexOf('function updateSdkAvailabilityInspector('));
 const start=source.indexOf('  let githubLoading='),end=source.indexOf('  if(githubBuild)bindGithubRepositoryLabel(',start);
 assert.ok(start>=0&&end>start);
 assert.match(source,/githubReloadButton\.textContent='목록 새로 고침'/);
 assert.match(source,/githubReloadButton\.addEventListener\('click',\(\)=>void refreshGithub\(\)\)/);
 const mockSelect=value=>({value,disabled:false,options:[],replaceChildren(){this.options=[];},append(option){this.options.push(option);}});
 const repo=mockSelect('SoonCheol/D200X-Deck'),branch=mockSelect('main'),workflow=mockSelect('deckforge-windows-build.yml');
 const fields=new Map([['repository',repo],['branch',branch],['workflow',workflow]]);
 const credential={disabled:false},reload={disabled:false},notice={textContent:''},connection=[];
 let fail=true,requests=0;
 const window={deckBridge:{nativeGitHubOptions:async value=>{
   requests++;assert.equal(reload.disabled,true);assert.equal(credential.disabled,true);
   if(fail)throw Error('조회 실패');
   return value?{branches:[{value:'main',label:'main'}],workflows:[{value:'123',label:'Windows',file:'deckforge-windows-build.yml'}]}:{repositories:[{value:repo.value,label:repo.value}]};
 }}};
 const get=vm.runInNewContext('(function(){'+source.slice(start,end)+'\ngithubCredentialButton=credential;githubReloadButton=reload;return {refreshGithub,verified:()=>githubVerified};})()',{
 githubBuild:true,closed:false,githubFields:fields,window,document:{createElement:()=>({})},showConnection:(...args)=>connection.push(args),notice,credential,reload,inspectorPickerCurrent:()=>true,session:{},item:{}
 });
 return (async()=>{
  await get.refreshGithub();assert.equal(get.verified(),false);assert.equal(reload.disabled,false);assert.equal(workflow.value,'deckforge-windows-build.yml');
  fail=false;
  await Promise.all([get.refreshGithub(),get.refreshGithub()]);
  assert.equal(requests,3);assert.equal(get.verified(),true);assert.equal(reload.disabled,false);assert.equal(credential.disabled,false);assert.equal(repo.value,'SoonCheol/D200X-Deck');assert.equal(branch.value,'main');assert.equal(workflow.value,'123');
 })();
});


test('Fusion command inspector identifies its read-only dialog and resolves pending lookups without changing settings',async()=>{
 const start=editor.indexOf('function sdkInspectorButtonLabel('),end=editor.indexOf('function updateSdkAvailabilityInspector(',start);
 const label=vm.runInNewContext(editor.slice(start,end)+'\nsdkInspectorButtonLabel',{FUSION_PLUGIN:'fusion',isFusionAction:item=>item?.settings?.pluginUUID==='fusion',DeckCore:{isNativeHaSensor:item=>item?.type==='sensor'}});
 const item={type:'sd-plugin',settings:{pluginUUID:'fusion',actionUUID:'fusion.runcommand',pluginSettings:{commandId:'Line',name:'선'}}};
 assert.equal(label(item),'Fusion 명령 속성');assert.equal(label({type:'sensor'}),'센서 설정');assert.equal(label(null),'플러그인 속성 열기');
 const before=JSON.stringify(item);
 const node=()=>({children:[],textContent:'',append(...children){this.children.push(...children);},replaceChildren(){this.children=[];}});
 let info,resolveDetails,resolveArt,close;
 const window={deckBridge:{fusionCommandDetails:()=>new Promise(r=>resolveDetails=r),fusionIconRead:()=>new Promise(r=>resolveArt=r)},DeckForgeDialogs:{show:opts=>{info=opts;return new Promise(r=>close=r)}}};
 const openStart=editor.indexOf('async function openFusionCommandProperties('),openEnd=editor.indexOf('// URL controls have the same semantics',openStart);
 const open=vm.runInNewContext(editor.slice(openStart,openEnd)+'\nopenFusionCommandProperties',{window,document:{createElement:node},inspectorSession:{},fusionCommandId:()=>item.settings.pluginSettings.commandId,inspectorPickerCurrent:()=>true,fusionButtonNames:{ko:{},en:{}},fusionIconCache:new Map()});
 const task=open({querySelector:()=>null},item);
 assert.equal(info.title,'Fusion 명령 속성');assert.equal(info.headerTitleOnly,true);
 const [card,desc]=info.content.children;
 assert.equal(desc.textContent,'명령 설명 확인 중…');assert.equal(card.children[0].textContent,'확인 중…');
 await Promise.resolve();
 resolveDetails({ko:'선',en:'Line',tooltip:'선 그리기'});resolveArt(null);
 for(let i=0;i<8;i++)await Promise.resolve();
 assert.equal(desc.textContent,'선 그리기');assert.equal(card.children[0].textContent,'아이콘 없음');
 close();await task;assert.equal(JSON.stringify(item),before);
 assert.match(editor,/button\.textContent=label\?'⚠ '\+label:'⚙ '\+sdkInspectorButtonLabel\(item\)/);
});


test('shared action field binder keeps event choice, checkbox conversions and owner-specific commits',()=>{
 const start=editor.indexOf('const fieldChecked='),end=editor.indexOf('let active=null;',start);
 assert.ok(start>=0&&end>start);
 const bind=vm.runInNewContext(editor.slice(start,end)+';bindActionSettingFields');
 const node=(field,type,value,options={})=>({dataset:{field,...options.dataset},type,value,checked:options.checked??false,tagName:options.tagName??'INPUT',listeners:{},addEventListener(k,fn){this.listeners[k]=fn;},fire(k){this.listeners[k]?.();}});
 const check=node('enabled','checkbox','on',{checked:true}),invert=node('disabled','checkbox','on',{checked:true,dataset:{inverted:'true'}});
 const clip=node('mode','checkbox','on',{checked:true,dataset:{textClipboard:'true'}});
 const body=node('body','textarea','한글',{tagName:'TEXTAREA'}),volume=node('volume','range','72'),seconds=node('seconds','number','30'),direction=node('direction','select-one','up');
 const nodes=[check,invert,clip,body,volume,seconds,direction],root={querySelectorAll:selector=>{assert.equal(selector,'[data-field]');return nodes;}};
 const item={settings:{enabled:false,disabled:true,mode:'typing',body:'old',volume:10,seconds:5,direction:'down'}};
 const before=JSON.stringify(item),writes=[];
 bind(root,item,(input,value)=>{assert.equal(item.settings[input.dataset.field],value);writes.push(input.dataset.field);});
 assert.equal(JSON.stringify(item),before);assert.deepEqual(writes,[]);
 for(const input of nodes){const event=input===body||input===volume?'input':'change';assert.deepEqual(Object.keys(input.listeners),[event]);input.fire(event);}
 assert.deepEqual(item.settings,{enabled:true,disabled:false,mode:'clipboard',body:'한글',volume:72,seconds:30,direction:'up'});
 assert.deepEqual(writes,nodes.map(n=>n.dataset.field));
 clip.checked=false;clip.fire('change');assert.equal(item.settings.mode,'typing');
 const draft={settings:{body:'old'}},draftInput=node('body','textarea','draft',{tagName:'TEXTAREA'});
 bind({querySelectorAll:()=>[draftInput]},draft);assert.equal(draft.settings.body,'old');draftInput.fire('input');assert.equal(draft.settings.body,'draft');assert.equal(item.settings.body,'한글');
 for(const name of ['step','action','current'])assert.match(editor,new RegExp('bindActionSettingFields\\(fields,'+name+',\\(\\)=>persist\\(\\)\\)'));
 assert.match(editor,/bindActionSettingFields\(fields,draft\)/);
 assert.match(editor,/bindActionSettingFields\(root,item,\(node,value\)=>/);
});


test('shared inspector command and help dialog preserve handlers, order and text-only content',()=>{
 const start=editor.indexOf('function createInspectorCommand('),end=editor.indexOf('function showPanelActionHelp(',start);
 assert.ok(start>=0&&end>start);
 const node=tag=>({tag,children:[],listeners:{},append(...nodes){this.children.push(...nodes);},addEventListener(type,fn){this.listeners[type]=fn;},close(){this.listeners.close?.();},remove(){this.removed=true;}});
 const {createInspectorCommand,createActionHelpDialog}=vm.runInNewContext(editor.slice(start,end)+';({createInspectorCommand,createActionHelpDialog})',{document:{createElement:node}});
 const calls=[],cancel=createInspectorCommand('취소',()=>calls.push('cancel'),'inspector-cancel',true),save=createInspectorCommand('저장',()=>calls.push('save'),'inspector-save');
 assert.equal(cancel.disabled,true);assert.equal(save.disabled,false);assert.equal(save.type,'button');
 save.listeners.click();assert.deepEqual(calls,['save']);
 const dialog=createActionHelpDialog('제목','<text>',[['사용 방법',['첫째','둘째']],['참고 사항',[]]]);
 assert.deepEqual(dialog.children.map(n=>n.tag),['strong','p','h3','ul','button']);
 assert.equal(dialog.children[1].textContent,'<text>');assert.deepEqual(dialog.children[3].children.map(n=>n.textContent),['첫째','둘째']);
 dialog.children[4].listeners.click();assert.equal(dialog.removed,true);
 assert.match(editor,/createInspectorCommand\('저장',saveInspector/);
 assert.match(editor,/createInspectorCommand\('취소',discardInspector/);
});
test('ordered draft validation prevents incomplete shortcuts without modifying data',()=>{
 const start=editor.indexOf('function validateOrderedActionDraft('),end=editor.indexOf('function orderedMultiDialog(',start);
 const messages=[],validate=vm.runInNewContext(editor.slice(start,end)+';validateOrderedActionDraft',{window:{DeckHotkeys:{canonical:x=>x||''},d200xActionStatus:x=>messages.push(x)}});
 const draft={type:'hotkey-switch',settings:{first:'Ctrl+A',second:''}},before=JSON.stringify(draft);
 assert.equal(validate(draft),false);assert.equal(JSON.stringify(draft),before);assert.equal(messages.length,1);
 draft.settings.second='Ctrl+B';assert.equal(validate(draft),true);
 assert.equal(validate({type:'text',settings:{}}),true);
 assert.match(editor,/if\(!validateOrderedActionDraft\(draft\)\)return;\s*apply\(draft\);dialog\.close\(\)/);
});


test('all 35 exposed basic actions have an explicit standard or dedicated paired card route',()=>{
 const sandbox={window:{},localStorage:{getItem:()=>null}};
 vm.runInNewContext(fs.readFileSync(path.join(base,'action-panel-icons.js'),'utf8'),sandbox);
 const hidden=JSON.parse(editor.match(/const HIDDEN_BASIC_ACTION_IDS=new Set\((\[[^\]]+\])\)/)[1]);
 const ids=Array.from(sandbox.window.D200XPanelIcons.groups).filter(([name])=>name!=='플러그인 · Home Assistant').flatMap(([,ids])=>Array.from(ids).filter(id=>!hidden.includes(id)));
 const momentaryStart=editor.indexOf('function isMomentaryIconAction('),momentaryEnd=editor.indexOf('// Text action labels',momentaryStart);
 const singleStart=editor.indexOf('function hasSingleBasicIconCard('),singleEnd=editor.indexOf('function bindNativeForegroundIconCard(',singleStart);
 const classify=vm.runInNewContext(editor.slice(momentaryStart,momentaryEnd)+'\n'+editor.slice(singleStart,singleEnd)+';({isMomentaryIconAction,hasStateTitlePair,hasSingleBasicIconCard})');
 const expectedSingle=['sleep','virtual','logic'],expectedState=['timer','hotkey-switch','multi-switch'],expectedDedicated=['indicator'];
 assert.equal(ids.length,35);assert.equal(new Set(ids).size,35);
 for(const type of ids){
   const item={type};
   const actual=classify.hasSingleBasicIconCard(item)?'single':classify.isMomentaryIconAction(item)?'momentary':classify.hasStateTitlePair(item)?'state':type==='indicator'?'indicator':'missing';
   const expected=expectedSingle.includes(type)?'single':expectedState.includes(type)?'state':expectedDedicated.includes(type)?'indicator':'momentary';
   assert.equal(actual,expected,type);
 }
 const indicator=editor.slice(editor.indexOf('function bindIndicatorInspector('),editor.indexOf('function bindExtendedActionFields('));
 assert.match(indicator,/createStateIconCard\(pressed\?'Key Down':'Key Up'\)/);
 assert.match(indicator,/createStateIconButtons\(\{/);
 assert.match(indicator,/bindKeyBackgroundControl\(image,item,pressed\?'second':'default'\)/);
 assert.match(indicator,/card\.append\(heading,titleLine,line,image,buttons\)/);
 assert.match(indicator,/down\.card\.append\(down\.heading,downTitle,downNumber,down\.image,down\.buttons\)/);
});
