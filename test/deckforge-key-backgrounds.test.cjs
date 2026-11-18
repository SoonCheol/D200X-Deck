'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'../app/streamdeck-editor');
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
test('state card background changes independently of linked title and legacy settings',()=>{
 const start=editor.indexOf('function hasStateTitlePair(item){'),end=editor.indexOf('function displayKeyPressItem(item,index){',start);
 const item={type:'sd-plugin',title:'Title',titleStyle:core.TITLE,settings:{keyBackgrounds:{first:{enabled:true,color:'#111111'},second:{enabled:false,color:'#222222'}},stateTitles:{first:{enabled:true,title:'Shared',style:core.TITLE},second:{enabled:false,title:'Hidden',style:core.TITLE}}}};
 const resolve=second=>vm.runInNewContext(editor.slice(start,end)+';resolveStateTitle(item,second)',{item,second,DEFAULT_TITLE_STYLE:core.TITLE,isMomentaryIconAction:()=>false});
 assert.equal(resolve(false).keyBackground.color,'#111111');assert.equal(resolve(true).keyBackground.color,'#222222');
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
 const start=source.indexOf('  // Same compositor feeds'),end=source.indexOf('  async function synchronize()',start);
 const calls=[],item={type:'sd-plugin'};
 const window={refreshSelectedVisual:()=>calls.push('representative')};
 vm.runInNewContext(source.slice(start,end),{window,renderGrid:()=>calls.push('grid'),state:{selected:0},DeckCore:{visibleActions:()=>[item]},refreshStateTitleCards:actual=>{assert.equal(actual,item);assert.equal(typeof window.renderDeckKeyImage,'function');calls.push('cards');}});
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
