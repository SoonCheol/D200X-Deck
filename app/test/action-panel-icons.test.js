"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../streamdeck-editor/action-panel-icons.js"),"utf8");
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
test("All 42 existing action IDs have distinct SVGs and seven groups",()=>{
  const {panel}=load();
  const ids=panel.groups.flatMap(group=>group[1]);
  assert.equal(ids.length,42);
  assert.equal(new Set(ids).size,42);
  assert.equal(panel.ids.length,42);
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
