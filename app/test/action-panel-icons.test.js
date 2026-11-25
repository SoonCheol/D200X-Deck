"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../deckforge-editor/action-panel-icons.js"),"utf8");
function load(){
  const storage=new Map();
  const localStorage={
    getItem:k=>storage.has(k)?storage.get(k):null,
    setItem:(k,v)=>storage.set(k,String(v))
  };
  function element(tag){
    return {tag,children:[],style:{setProperty(){}},attributes:{},
      append(child){this.children.push(child);},
      setAttribute(k,v){this.attributes[k]=v;}};
  }
  const window={};
  vm.runInNewContext(source,{window,localStorage,document:{
    createElement:element,createElementNS:(_ns,name)=>element(name)
  },console});
  return {panel:window.D200XPanelIcons,storage};
}
test("45 action icons and two separate HA plugin icons are preserved",()=>{
  const {panel}=load();
  const ids=panel.groups.flatMap(group=>group[1]);
  assert.equal(ids.length,47);
  assert.equal(new Set(ids).size,47);
  assert.equal(panel.ids.length,47);
  assert.deepEqual([...ids].sort(),Array.from(panel.ids).sort());
  assert.deepEqual(Array.from(panel.groups.at(-1)[1]),['ha-toggle','ha-other']);
  assert.equal(panel.groups.slice(0,-1).flatMap(group=>group[1]).length,45);
  for(const id of ids){
    assert.ok(panel.ids.includes(id),id);
    const icon=panel.create(id);
    assert.equal(icon.children[0].tag,"svg");
    assert.ok(icon.children[0].innerHTML.includes("<"),id);
  }
});
test("Three themes apply without editing any assigned key",()=>{
  const {panel}=load();
  for(const theme of ["line","color","button"]){
    panel.setTheme(theme);
    assert.equal(panel.theme,theme);
    assert.equal(panel.create("window-monitor").className,"panel-action-svg theme-"+theme);
  }
});
test("Individual image override can be applied and reset",()=>{
  const {panel}=load();
  const data="data:image/png;base64,iVBORw0KGgo=";
  assert.equal(panel.setOverride("window-monitor",data),true);
  assert.equal(panel.hasOverride("window-monitor"),true);
  assert.equal(panel.create("window-monitor").children[0].tag,"img");
  panel.clearOverride("window-monitor");
  assert.equal(panel.hasOverride("window-monitor"),false);
  assert.equal(panel.create("window-monitor").children[0].tag,"svg");
});
test("Unsupported data URLs are refused",()=>{
  const {panel}=load();
  assert.equal(panel.setOverride("window-monitor","data:image/svg+xml;base64,PHN2Zz4="),false);
  assert.equal(panel.setOverride("missing","data:image/png;base64,AA=="),false);
});

test("action search separates exact IDs from partial text and sorts current tab",()=>{
  const editor=fs.readFileSync(path.join(__dirname,"../deckforge-editor/editor.js"),"utf8");
  const helpers=editor.slice(editor.indexOf("function sdkPanelActions("),editor.indexOf("function renderInstalledSdkPlugins("));
  const context={libraryTab:'keys',exactActionId:null,HA_GENERIC_ACTION:'generic',FUSION_PLUGIN:'fusion',
    HIDDEN_BASIC_ACTION_IDS:new Set(['hidden']),CATALOG:[['기본',[['a','파일 열기'],['b','폴더 열기'],['hidden','숨김']]]],
    sdkCatalogueLabel:a=>a.name,sdkPlugins:[
      {uuid:'com.deckforge.native.home-assistant',name:'HA',actions:[{uuid:'switch',name:'기기 제어'}]},
      {uuid:'other',name:'기타',actions:[{uuid:'1',name:'파일 열기'},{uuid:'2',name:'파일 열기'},{uuid:'generic',name:'숨김'}]}
    ]};
  vm.createContext(context);vm.runInContext(helpers,context);
  const get=()=>Array.from(context.actionSearchChoices(),c=>c.id);
  assert.deepEqual(get(),['sd::com.deckforge.native.home-assistant::switch','a','b']);
  assert.equal(context.actionSearchMatches('a','파일 열기','열기'),true);
  assert.equal(context.actionSearchMatches('b','폴더 열기','열기'),true);
  context.exactActionId='a';
  assert.equal(context.actionSearchMatches('b','파일 열기','파일'),false);
  assert.equal(context.actionSearchMatches('a','다른 이름','파일'),true);
  context.libraryTab='plugins';context.exactActionId='sd::other::2';
  assert.deepEqual(get(),['sd::other::1','sd::other::2']);
  assert.equal(context.actionSearchMatches('sd::other::1','파일 열기','파일'),false);
  assert.equal(context.actionSearchMatches('sd::other::2','파일 열기','파일'),true);
});

test("real icon catalogue initializes editor and preserves executable IDs",()=>{
  const {panel}=load();
  const editor=fs.readFileSync(path.join(__dirname,"../deckforge-editor/editor.js"),"utf8");
  const startup=editor.slice(0,editor.indexOf("const HOTKEY_PRESETS"));
  const context={window:{D200XPanelIcons:panel}};
  vm.createContext(context);
  const result=vm.runInContext(startup+"\nJSON.stringify({original:ORIGINAL_CATALOG.flatMap(([,items])=>items.map(x=>x[0])),catalog:CATALOG.flatMap(([,items])=>items.map(x=>x[0]))})",context);
  const {original,catalog}=JSON.parse(result);
  assert.equal(catalog.length,46);
  assert.deepEqual([...catalog].sort(),[...original].sort());
  assert.ok(catalog.includes("ha-toggle"));
  assert.ok(!catalog.includes("ha-other"));
  assert.ok(panel.ids.includes("ha-other"));
});
