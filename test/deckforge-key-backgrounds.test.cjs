'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'../app/deckforge-editor');
const core=require(path.join(dir,'deck-core.js'));
const editor=fs.readFileSync(path.join(dir,'editor.js'),'utf8');
const source=fs.readFileSync(path.join(dir,'device-sync.js'),'utf8');
function draw(title,style={}){
 const ops=[];
 const ctx={fillStyle:'#fff',globalAlpha:1,measureText:value=>({width:value.length*10}),
 save(){this.saved=[this.fillStyle,this.globalAlpha];},restore(){[this.fillStyle,this.globalAlpha]=this.saved;},
 beginPath(){},roundRect(...args){ops.push(['rect',...args]);},fill(){ops.push(['fill',this.fillStyle,this.globalAlpha]);},
 strokeText(){},fillText(value){ops.push(['text',value,this.fillStyle,this.globalAlpha]);},fillRect(){}};
 const start=source.indexOf('  function drawText('),end=source.indexOf('  function imageLoaded(',start);
 assert.ok(start>=0&&end>start);
 vm.runInNewContext(source.slice(start,end)+';drawText(ctx,title,144,144,style)',{ctx,title,style:{...core.TITLE,...style}});
 return ops;
}
test('legacy and disabled backgrounds retain appearance and saved values',()=>{
 const action=core.createAction('hotkey');
 assert.equal(action.titleStyle.backgroundEnabled,false);
 action.titleStyle={...action.titleStyle,backgroundEnabled:false,backgroundColor:'#123456',backgroundOpacity:0};
 action.settings.keyBackgrounds={first:{enabled:false,color:'#112233'},second:{enabled:true,color:'#445566'}};
 const cleaned=core.cleanAction(action);
 assert.equal(cleaned.titleStyle.backgroundOpacity,0);
 assert.equal(cleaned.settings.keyBackgrounds.first.color,'#112233');
 assert.equal(cleaned.settings.keyBackgrounds.second.enabled,true);
 assert.equal(draw('Test').some(op=>op[0]==='rect'),false);
});
test('manual break, longest line, rounded rectangle, alpha and opaque text',()=>{
 const ops=draw('Longer<br>Hi',{backgroundEnabled:true,backgroundColor:'#112233',backgroundOpacity:50});
 assert.deepEqual(ops.filter(x=>x[0]==='text').map(x=>x[1]),['Longer','Hi']);
 const rect=ops.find(x=>x[0]==='rect');
 assert.equal(rect[3],72);assert.equal(rect[1],36);assert.ok(rect[5]>0);
 assert.deepEqual(ops.find(x=>x[0]==='fill'),['fill','#112233',0.5]);
 assert.ok(ops.filter(x=>x[0]==='text').every(x=>x[2]==='#ffffff'&&x[3]===1));
});
test('automatic wrapping and blank explicit line retain bounded geometry',()=>{
 const ops=draw('abcdefghijklmnop<br>Hi',{backgroundEnabled:true});
 assert.equal(ops.filter(x=>x[0]==='text').length,3);
 const rect=ops.find(x=>x[0]==='rect');assert.ok(rect[1]>=0&&rect[3]<=144&&rect[2]+rect[4]<=144);
 assert.deepEqual(draw('A<br><br>B').filter(x=>x[0]==='text').map(x=>x[1]),['A','','B']);
});
test('state card background follows the selected display properties without overwriting stored values',()=>{
 const start=editor.indexOf('function hasStateTitlePair(item){'),end=editor.indexOf('function displayKeyPressItem(',start);
 const item={type:'sd-plugin',title:'Title',titleStyle:core.TITLE,settings:{keyBackgrounds:{first:{enabled:true,color:'#111111'},second:{enabled:false,color:'#222222'}},stateTitles:{first:{enabled:true,title:'Shared',style:core.TITLE},second:{enabled:false,title:'Hidden',style:core.TITLE}}}};
 const resolve=second=>vm.runInNewContext(editor.slice(start,end)+';resolveStateTitle(item,second)',{item,second,DEFAULT_TITLE_STYLE:core.TITLE,isMomentaryIconAction:()=>false});
 assert.equal(resolve(false).keyBackground.color,'#111111');assert.equal(resolve(true).keyBackground.color,'#111111');
 assert.equal(item.settings.keyBackgrounds.second.color,'#222222');
 assert.equal(resolve(false).title,'Shared');assert.equal(resolve(true).title,'Shared');
});
test('one shared 60-color palette preserves storage and fixed ordering',()=>{
 const colors=JSON.parse(editor.match(/const SHARED_COLOR_PALETTE=(\[[^\n]+\]);/)[1]);
 assert.equal(colors.length,60);assert.equal(new Set(colors).size,60);
 assert.match(editor,/d200x-streamdeck-custom-title-colors-v1/);
 const start=editor.indexOf('function sharedPaletteMarkup('),end=editor.indexOf('function bindSharedColorPalette(',start);
 const markup=vm.runInNewContext(editor.slice(start,end)+";sharedPaletteMarkup('test','색상')");
 assert.ok(markup.indexOf('나의 색상')<markup.indexOf('기본 색상'));
 assert.ok(markup.indexOf('기본 색상')<markup.indexOf('현재 색상을 나의 색상에 저장'));
 const css=fs.readFileSync(path.join(dir,'style.css'),'utf8');
 assert.match(css,/palette-default-colors\{[^}]*grid-auto-rows:33px;max-height:111px;overflow-y:auto/);
});

test('startup compositor explicitly repaints the selected state cards',()=>{
 const start=source.indexOf('  // Same compositor feeds'),end=source.indexOf('  async function synchronize(',start);
 assert.ok(start>=0&&end>start,'startup compositor source block');
 const calls=[],item={type:'sd-plugin'};
 const prepareDeckKeyImage=()=>({signature:'test',render:async()=> 'png'});
 const window={refreshSelectedVisual:()=>calls.push('representative')};
 vm.runInNewContext(source.slice(start,end),{window,prepareDeckKeyImage,document:{fonts:{}},renderGrid:()=>calls.push('grid'),state:{selected:0},DeckCore:{visibleActions:()=>[item]},refreshStateTitleCards:actual=>{assert.equal(actual,item);assert.equal(typeof window.renderDeckKeyImage,'function');calls.push('cards');}});
 assert.equal(window.prepareDeckKeyImage,prepareDeckKeyImage);
 assert.deepEqual(calls,['grid','representative','cards']);
});
test('opening state title style does not create profile data; real edits commit drafts',()=>{
 const start=editor.indexOf('function bindTitleStyle(item){'),end=editor.indexOf('// Inspector writes remain drafts',start);
 const block=editor.slice(start,end),open=block.slice(block.indexOf('root._openStateTitleStyle='),block.indexOf('document.addEventListener("pointerdown"'));
 assert.doesNotMatch(open,/ensureStateTitlePair\(/);
 assert.match(open,/style=\{\.\.\.DEFAULT_TITLE_STYLE,\.\.\.entry.style\}/);
 assert.match(block,/if\(activeStateTitle\)ensureStateTitlePair\(item\)\[activeStateTitle\]\.style=\{\.\.\.style\}/);
 assert.match(block,/persistInspectorChange\(\);renderGrid\(\);refreshTitlePreview\(item\)/);
});
test('saved-color tile has a text-only context menu, basic palette has no delete tile',()=>{
 const start=editor.indexOf('function bindSharedColorPalette('),end=editor.indexOf('function bindKeyBackgroundControl(',start);
 const block=editor.slice(start,end);
 assert.match(block,/if\(saved\)\{[\s\S]*?tile\.addEventListener\('contextmenu'/);
 assert.match(block,/remove\.textContent='삭제'/);
 assert.match(block,/store\(load\(\)\.filter\(c=>c!==color\)\)/);
 assert.doesNotMatch(block,/title-color-remove|parent\.append\(remove\)|trash/);
});

test('all four checkbox combinations share title, background and ordinary icon without changing saved values',()=>{
 const start=editor.indexOf('function hasStateTitlePair(item){'),end=editor.indexOf('function displayKeyPressItem(',start);
 const first={kind:'file',value:'A'},second={kind:'file',value:'B'};
 const item=core.createAction('hotkey');
 item.settings.keyBackgrounds={first:{enabled:true,color:'#123456'},second:{enabled:true,color:'#abcdef'}};
 item.settings.stateTitles={first:{enabled:true,title:'A<br>1',style:{...core.TITLE,size:17,backgroundEnabled:true,backgroundColor:'#111111',backgroundOpacity:20}},second:{enabled:true,title:'B',style:{...core.TITLE,size:24,backgroundEnabled:false,backgroundColor:'#222222',backgroundOpacity:90}}};
 const resolve=(item,secondState,paired=false)=>vm.runInNewContext(editor.slice(start,end)+';resolveStateTitle(item,secondState,artwork)',{item,secondState,artwork:{first,second,paired},DEFAULT_TITLE_STYLE:core.TITLE});
 for(const [a,b,expected] of [[true,true,['A','B']],[true,false,['A','A']],[false,true,['B','B']],[false,false,['A','B']]]){
  item.settings.stateTitles.first.enabled=a;item.settings.stateTitles.second.enabled=b;
  const restored=core.cleanAction(JSON.parse(JSON.stringify(item))),before=JSON.stringify(restored);
  for(const [i,secondState] of [false,true].entries()){
   const result=resolve(restored,secondState);
   assert.equal(result.icon.value,expected[i]);
   assert.equal(result.titleStyle.visible,a||b);
   if(!a&&!b){assert.equal(result.keyBackground.enabled,false);assert.equal(result.title,'');continue;}
   const key=expected[i]==='A'?'first':'second';
   assert.equal(result.title,restored.settings.stateTitles[key].title);
   assert.equal(result.titleStyle.size,restored.settings.stateTitles[key].style.size);
   assert.equal(result.titleStyle.backgroundOpacity,restored.settings.stateTitles[key].style.backgroundOpacity);
   assert.equal(result.titleStyle.backgroundEnabled,restored.settings.stateTitles[key].style.backgroundEnabled);
   assert.equal(result.keyBackground.color,restored.settings.keyBackgrounds[key].color);
   assert.equal(resolve(restored,secondState,true).icon.value,secondState?'B':'A');
  }
  assert.equal(JSON.stringify(restored),before);
 }
});
test('named-pair markers are explicit and changing one image ends the exception',()=>{
 const start=editor.indexOf('function hasStateTitlePair(item){'),end=editor.indexOf('function displayKeyPressItem(',start);
 const icons={off:{kind:'file',value:'A',packId:'pack',statePair:'id'},on:{kind:'file',value:'B',packId:'pack',statePair:'id'}};
 const check=()=>vm.runInNewContext(editor.slice(start,end)+';isNamedStateIconPair(icons)',{icons});
 assert.equal(check(),true);
 icons.on={kind:'file',value:'C',packId:'pack'};assert.equal(check(),false);
 icons.off={kind:'file',value:'A',packId:'pack'};assert.equal(check(),false);
 assert.match(editor,/await raster\(candidate\)!==off.value\|\|await raster\(companion\)!==on.value/);
});


test('state artwork swaps never detach palette or gesture controls',()=>{
 const start=editor.indexOf('function replaceStateCardArtwork('),end=editor.indexOf('// Preview state title artwork',start);
 const swap=vm.runInNewContext(editor.slice(start,end)+';replaceStateCardArtwork');
 const removed=[],palette={nodeType:1,matches:()=>true,remove:()=>removed.push('palette')},badge={nodeType:1,matches:()=>true,remove:()=>removed.push('badge')};
 const artwork={nodeType:1,matches:()=>false,remove:()=>removed.push('artwork')},text={nodeType:3,remove:()=>removed.push('text')};
 const next={};let prepended;
 swap({childNodes:[artwork,palette,badge,text],prepend:x=>prepended=x},next);
 assert.deepEqual(removed,['artwork','text']);assert.equal(prepended,next);
});
test('palette opens from either card, retains independent drafts, toggles and cleans up on inspector abort',()=>{
 const start=editor.indexOf('let activeKeyBackgroundClose=null;'),end=editor.indexOf('// Prefer the action panel beside',start);
 assert.ok(start>=0&&end>start);
 const root={addEventListener(){}},body={append(node){node.isConnected=true;}};
 const listener=new AbortController();let positioned=[],saved=0;
 function element(){
  const handlers={},nodes={};return {isConnected:false,handlers,attrs:{},setAttribute(k,v){this.attrs[k]=v;},
   addEventListener(k,fn){handlers[k]=fn;},append(node){this.child=node;node.isConnected=true;},
   remove(){this.isConnected=false;},contains(x){return x===this;},querySelector(k){return nodes[k]??=(element());}};
 }
 const document={body,createElement:element,addEventListener(){}};
 const ctx={state:{selected:0},$:()=>root,document,window:{addEventListener(){}},inspectorListener:listener,
  PALETTE_ICON:'svg',sharedPaletteMarkup:()=>'',validPaletteColor:()=>true,bindSharedColorPalette:(popup,_p,_g,apply)=>{popup.apply=apply;},
  positionAppearancePalette:(popup,trigger)=>positioned.push({popup,trigger}),persistInspectorChange:()=>saved++,renderGrid(){},refreshTitlePreview(){}};
 const bind=vm.runInNewContext(editor.slice(start,end)+';bindKeyBackgroundControl',ctx);
 const up=element(),down=element(),item={settings:{}},click={stopPropagation(){}};
 bind(up,item,'first');bind(down,item,'second');
 up.child.handlers.click(click);const first=positioned.at(-1).popup;
 assert.equal(first.isConnected,true);assert.equal(up.child.attrs['aria-expanded'],'true');
 first.apply('#ff0000');assert.equal(item.settings.keyBackgrounds.first.color,'#ff0000');
 first.querySelector('.key-background-enabled').checked=true;first.querySelector('.key-background-enabled').handlers.change();
 assert.equal(item.settings.keyBackgrounds.first.enabled,true);
 down.child.handlers.click(click);const second=positioned.at(-1).popup;
 assert.equal(first.isConnected,false);assert.equal(up.child.attrs['aria-expanded'],'false');
 second.apply('#00ff00');assert.equal(item.settings.keyBackgrounds.second.color,'#00ff00');assert.equal(item.settings.keyBackgrounds.first.color,'#ff0000');
 assert.equal(saved,3);down.child.handlers.click(click);assert.equal(second.isConnected,false);
 up.child.handlers.click(click);const third=positioned.at(-1).popup;listener.abort();assert.equal(third.isConnected,false);
});

test('body-level key background palette remains inside the dirty inspector edit session',()=>{
 const start=editor.indexOf('function isInspectorEditTarget('),end=editor.indexOf('let inspectorListener=new AbortController();',start);
 assert.ok(start>=0&&end>start);
 const handlers=new Map(),timers=[],warnings=[],root={contains:target=>target.inInspector===true};
 const document={addEventListener(type,fn,capture){assert.equal(capture,true);if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);}};
 const ctx={document,$:()=>root,inspectorSession:{dirty:true},inspectorEditing:false,setTimeout:fn=>timers.push(fn),showInspectorLeaveDialog:fn=>warnings.push(fn)};
 vm.runInNewContext(editor.slice(start,end),ctx);
 function target(kind){return {inInspector:kind==='inspector',isConnected:true,click(){},closest(selector){return ({palette:'.key-background-popover',maker:'#icon-maker',multi:'.ordered-multi-dialog',library:'#icon-library',packRemove:'#icon-library'})[kind]&&selector.includes(({palette:'.key-background-popover',maker:'#icon-maker',multi:'.ordered-multi-dialog',library:'#icon-library',packRemove:'#icon-library'})[kind])?this:kind==='packRemove'&&selector==='.icon-pack-remove'?this:null;}};}
 function fire(type,node){
  const event={target:node,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
  for(const fn of handlers.get(type)||[]){fn(event);if(event.stopped)break;}
  return event;
 }
 // Checkbox, swatches, color input, save/delete custom color and close all
 // belong to the same viewport-level palette, including its descendants.
 for(const dirty of [false,true]){
  ctx.inspectorSession.dirty=dirty;
  for(const type of ['click','change','input']){
   for(const kind of ['palette','inspector','maker','multi','library']){
    const node=target(kind);
    const event=fire(type,node);
    assert.equal(event.prevented,false);assert.equal(event.stopped,false);assert.equal(ctx.inspectorEditing,true);
    assert.equal(warnings.length,0);while(timers.length)timers.shift()();assert.equal(ctx.inspectorEditing,false);
   }
  }
 }
 // A genuine outside navigation still opens the existing unsaved guard.
 ctx.inspectorSession.dirty=true;
 const outside=fire('click',target('outside'));
 assert.equal(outside.prevented,true);assert.equal(outside.stopped,true);assert.equal(warnings.length,1);
 assert.equal(ctx.inspectorSession.dirty,true);
 assert.equal(fire('click',target('packRemove')).prevented,true);assert.equal(warnings.length,2);
 ctx.inspectorSession.dirty=false;
 assert.equal(fire('click',target('outside')).prevented,false);assert.equal(warnings.length,2);
});
