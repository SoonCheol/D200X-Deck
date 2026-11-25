'use strict';
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
// A fresh in-memory browser session: no real device, native bridge or saved profile.
app.whenReady().then(async()=>{
  let win;
  try{
    win=new BrowserWindow({show:false,webPreferences:{partition:'deckforge-editor-startup-smoke',nodeIntegration:false,contextIsolation:true,sandbox:true}});
    const errors=[];
    win.webContents.on('console-message',(_event,details)=>{
      if(details?.level==='error'&&/Uncaught|ReferenceError|TypeError|액션 목록 누락/.test(details.message))errors.push(details.message);
    });
    await win.loadFile(path.join(__dirname,'../app/deckforge-editor/index.html'));
    const run=code=>win.webContents.executeJavaScript(code);
    const initial=await run(`({
      keys:document.querySelectorAll('#key-grid .deck-key').length,
      actions:document.querySelectorAll('#library-list .action-item').length,
      tabs:!document.querySelectorAll('.library-tabs button')[1].disabled,
      dispatch:typeof window.executeD200XKey,
      ai:typeof window.DeckForgeAiEdit?.capture,
      inspector:document.getElementById('inspector').childElementCount
    })`);
    assert.equal(initial.keys,14,JSON.stringify({initial,errors}));
    assert.equal(initial.actions,35);
    assert.equal(initial.tabs,true);
    assert.equal(initial.dispatch,'function');
    assert.equal(initial.ai,'function');
    const filtered=await run(`(()=>{
      const input=document.getElementById('action-search'),list=document.getElementById('action-search-list'),menu=document.getElementById('action-search-menu');
      input.value='열기';input.dispatchEvent(new Event('input',{bubbles:true}));
      const partial=document.querySelectorAll('#library-list .action-item').length;
      list.click();
      const buttons=[...menu.querySelectorAll('button')];
      const names=buttons.map(b=>b.textContent);
      const target=buttons.find(b=>b.textContent==='파일 열기');
      if(!target)throw Error('파일 열기 missing from picker');
      target.click();
      const exact=[...document.querySelectorAll('#library-list .action-item .action-caption>span')].map(b=>b.textContent);
      document.getElementById('action-search-clear').click();
      return {partial,names,exact,restored:document.querySelectorAll('#library-list .action-item').length};
    })()`);
    assert.ok(filtered.partial>1);
    assert.equal(filtered.names.length,35);
    assert.deepEqual(filtered.names,[...filtered.names].sort((a,b)=>a.localeCompare(b,'ko')));
    assert.deepEqual(filtered.exact,['파일 열기']);
    assert.equal(filtered.restored,35);
    const {createHomeAssistantManifest}=require('../app/deckforge-editor/deckforge-ha-plugin.cjs');
    const manifest=createHomeAssistantManifest(null);
    for(const action of manifest.actions){
      const a={...action,uuid:action.id};
      const plugin={uuid:manifest.id,permissions:manifest.permissions};
      const settings={linked:true};
      const layout=await run(`(()=>{
        state.selected=0;currentPage()[0]={type:'sd-plugin',settings:{pluginSettings:${JSON.stringify(settings)}}};
        beginInspectorSession();void openNativeSettings(currentPage()[0],${JSON.stringify(a)},${JSON.stringify(plugin)});
        const dialog=document.querySelector('dialog[open]'),rect=dialog.getBoundingClientRect();
        const result={centered:Math.abs(rect.left+rect.width/2-innerWidth/2)<2&&Math.abs(rect.top+rect.height/2-innerHeight/2)<2,
          clear:[...dialog.querySelectorAll('button')].some(b=>b.textContent==='선택 해제'),
          linkFlags:dialog.querySelectorAll('.ha-link-flags input').length,
          compact:dialog.querySelectorAll('.ha-device-dropdown:not([open])').length,
          save:dialog.querySelector('.deckforge-message-primary').textContent,
          linkedRow:!!dialog.querySelector('.ha-link-enable>label'),
          flagTop:[...dialog.querySelectorAll('.ha-link-flags label')].map(x=>x.getBoundingClientRect().top),
          groups:[...dialog.querySelectorAll('.ha-sensor-compact')].map(x=>x.children.length)};
        dialog.close('cancel');return result;
      })()`);
      assert.equal(layout.centered,true,JSON.stringify(layout));assert.equal(layout.clear,false);
      if(action.id.endsWith('.control')){
        assert.equal(layout.linkFlags,3);assert.equal(layout.compact,2);assert.equal(layout.save,'저장');assert.equal(layout.linkedRow,true);
        assert.ok(layout.flagTop.every(y=>Math.abs(y-layout.flagTop[0])<1),JSON.stringify(layout));
      }
      if(action.id.endsWith('.sensor'))assert.deepEqual(layout.groups,[2,2,3]);
    }
    const control=manifest.actions[0],plugin={uuid:manifest.id,permissions:['display','network.websocket','background.run'],background:true};
    const functional=await run(`(async()=>{
      const originalBridge=window.deckBridge;
      const options=[{value:'switch.a',label:'거실등 1',group:'거실'},{value:'switch.b',label:'거실등 2',group:'거실'},{value:'light.c',label:'주방등',group:'주방'}];
      window.deckBridge={nativeDynamicOptions:async()=>({status:{state:'active',socket:'connected'},phase:'연결됨',fields:{entity:options,linkEntity:options}})};
      state.selected=0;inspectorSession=null;
      const item={type:'sd-plugin',settings:{pluginUUID:'${manifest.id}',actionUUID:'${control.id}',pluginSettings:{entity:'switch.a',linked:false,linkEntity:'switch.b',linkOn:true,linkOff:true,linkReverse:false}}};
      currentPage()[0]=item;beginInspectorSession();
      const open=()=>openNativeSettings(item,${JSON.stringify({...control,uuid:control.id})},${JSON.stringify(plugin)});
      const p=open();await Promise.resolve();await Promise.resolve();
      const dialog=document.querySelector('dialog[open]');
      const base=dialog.querySelector('[data-field=entity]'),link=dialog.querySelector('[data-field=linkEntity]');
      const linked=dialog.querySelector('.ha-link-enable input'),flags=[...dialog.querySelectorAll('.ha-link-flags input')];
      const initialHidden=link.closest('.field').hidden;
      linked.click();link.open=true;
      const visible=!link.closest('.field').hidden;
      const choices=[...link.querySelectorAll('label span')].map(x=>x.textContent);
      const select=(details,name)=>{const row=[...details.querySelectorAll('label')].find(x=>x.textContent===name);if(!row)throw Error('missing '+name);row.querySelector('input').click();};
      select(link,'주방등');
      const closed=!link.open,selected=link.querySelector('summary').textContent;
      flags[1].click();flags[2].click();
      base.open=true;select(base,'주방등');
      dialog.querySelector('.deckforge-message-primary').click();
      const duplicateBlocked=dialog.open&&dialog.querySelector('p.hint').textContent.includes('다른 연동 기기');
      base.open=true;select(base,'거실등 2');
      dialog.querySelector('.deckforge-message-primary').click();
      await p;
      const saved=JSON.parse(JSON.stringify(item.settings.pluginSettings));
      const p2=open();const cancel=document.querySelector('dialog[open]');cancel.querySelector('.ha-link-enable input').click();cancel.close('cancel');await p2;
      const cancelled=JSON.stringify(item.settings.pluginSettings)===JSON.stringify(saved);
      window.deckBridge=originalBridge;
      return {initialHidden,visible,choices,closed,selected,duplicateBlocked,saved,cancelled};
    })()`);
    assert.equal(functional.initialHidden,true);assert.equal(functional.visible,true);
    assert.ok(!functional.choices.includes('거실등 1'));assert.ok(functional.choices.includes('주방등'));
    assert.equal(functional.closed,true);assert.equal(functional.selected,'주방등');assert.equal(functional.duplicateBlocked,true);
    assert.deepEqual(functional.saved,{entity:'switch.b',linked:true,linkEntity:'light.c',linkOn:true,linkOff:false,linkReverse:true});
    assert.equal(functional.cancelled,true);
    console.log('HA_SWITCH_SETTINGS_OK '+JSON.stringify(functional));
    const sensor=manifest.actions.find(a=>a.id.endsWith('.sensor'));
    const removal=await run(`(async()=>{
      const oldBridge=window.deckBridge;
      const options=['a','b','c'].map(value=>({value:'sensor.'+value,label:value.toUpperCase(),group:'센서'}));
      window.deckBridge={nativeDynamicOptions:async()=>({status:{state:'active',socket:'connected'},phase:'연결됨',fields:{entities:options}})};
      state.selected=0;inspectorSession=null;
      const item={type:'sd-plugin',settings:{pluginUUID:'${manifest.id}',actionUUID:'${sensor.id}',pluginSettings:{entities:['sensor.a','sensor.b','sensor.c']}}};
      currentPage()[0]=item;beginInspectorSession();
      const open=()=>openNativeSettings(item,${JSON.stringify({...sensor,uuid:sensor.id})},${JSON.stringify(plugin)});
      const p=open();await Promise.resolve();await Promise.resolve();
      const dialog=document.querySelector('dialog[open]');
      const rows=()=>[...dialog.querySelectorAll('.native-selection-row')];
      const sizes=[...rows()[1].querySelectorAll('button')].map(b=>[b.getBoundingClientRect().width,b.getBoundingClientRect().height]);
      const rect=selector=>dialog.querySelector(selector).getBoundingClientRect();
      const positions={
        left:[rect('.ha-sensor-entities .native-sdk-picker').left,rect('.ha-sensor-mode>.field:first-child select').left,rect('.ha-sensor-labels>.field:first-child input').left,rect('.ha-sensor-decimals>.field:first-child input').left],
        right:[rect('.ha-sensor-mode>.field:nth-child(2) input').left,rect('.ha-sensor-labels>.field:nth-child(2) input').left],
        labelOffset:rect('.ha-sensor-entities>span').top-rect('.ha-sensor-entities .native-sdk-picker').top,
        labelPadding:parseFloat(getComputedStyle(dialog.querySelector('.ha-sensor-entities>span')).paddingTop),
        decimalTops:[...dialog.querySelectorAll('.ha-sensor-decimals>.field')].map(x=>x.getBoundingClientRect().top)
      };
      rows()[1].lastElementChild.click();
      const labels=rows().map(row=>row.firstElementChild.textContent);
      const unchecked=![...dialog.querySelectorAll('.native-sdk-options label')].find(l=>l.textContent==='B').querySelector('input').checked;
      const draftUnchanged=item.settings.pluginSettings.entities.length===3;
      dialog.querySelector('.deckforge-message-primary').click();await p;
      const saved=[...item.settings.pluginSettings.entities];
      const p2=open();const d2=document.querySelector('dialog[open]');d2.querySelector('.native-selection-row').lastElementChild.click();d2.close('cancel');await p2;
      const cancelled=JSON.stringify(item.settings.pluginSettings.entities)===JSON.stringify(saved);
      window.deckBridge=oldBridge;
      return {sizes,labels,unchecked,draftUnchanged,saved,cancelled,positions};
    })()`);
    assert.equal(removal.sizes.length,3);assert.ok(removal.sizes.every(s=>s[0]===removal.sizes[0][0]&&s[1]===removal.sizes[0][1]));
    assert.deepEqual(removal.labels,['1. A','2. C']);assert.equal(removal.unchecked,true);assert.equal(removal.draftUnchanged,true);
    assert.deepEqual(removal.saved,['sensor.a','sensor.c']);assert.equal(removal.cancelled,true);
    assert.ok(removal.positions.left.every(x=>Math.abs(x-removal.positions.left[0])<1),JSON.stringify(removal.positions));
    assert.ok(Math.abs(removal.positions.right[0]-removal.positions.right[1])<1,JSON.stringify(removal.positions));
    // getBoundingClientRect includes padding. Check box alignment and its
    // internal text inset independently, not a fictitious external offset.
    assert.ok(Math.abs(removal.positions.labelOffset)<1,JSON.stringify(removal.positions));
    assert.ok(Math.abs(removal.positions.labelPadding-7)<1,JSON.stringify(removal.positions));
    assert.ok(removal.positions.decimalTops.every(y=>Math.abs(y-removal.positions.decimalTops[0])<1),JSON.stringify(removal.positions));
    console.log('HA_SENSOR_REMOVE_OK '+JSON.stringify(removal));
    assert.deepEqual(errors,[]);
    console.log('EDITOR_STARTUP_OK '+JSON.stringify({initial,partial:filtered.partial,exact:filtered.exact,restored:filtered.restored}));
  }finally{if(win&&!win.isDestroyed())win.destroy();}
  app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
