'use strict';
// Native Chromium text editing only. Never routes to the D200X action clipboard.
const TEXT_FIELDS=new Set(['input-text','input-search','input-email','input-telephone','input-url','input-number','text-area']);
function textMenuTemplate(params,contents,allowSelection=false,scopedSelect=null){
  const f=params.editFlags||{};
  if(params.mediaType!=='none')return [];
  const editable=params.isEditable===true;
  const password=params.formControlType==='input-password';
  const selected=typeof params.selectionText==='string'&&params.selectionText.length>0;
  const readonly=TEXT_FIELDS.has(params.formControlType);
  const row=(label,method,enabled)=>({label,enabled:!!enabled,click:()=>{if(enabled&&!contents.isDestroyed())contents[method]();}});
  if(!editable){
    if(password)return [];
    if(scopedSelect)return [
      row('복사','copy',selected&&f.canCopy),
      {type:'separator'},
      {label:'전체 선택',enabled:true,click:()=>{if(!contents.isDestroyed())scopedSelect();}}
    ];
    if((!readonly&&!allowSelection)||!selected||!f.canCopy)return [];
    return [row('복사','copy',true)];
  }
  return [
    row('실행 취소','undo',f.canUndo),
    {type:'separator'},
    row('잘라내기','cut',!password&&f.canCut),
    row('복사','copy',!password&&f.canCopy),
    row('붙여넣기','paste',f.canPaste),
    row('삭제','delete',f.canDelete),
    {type:'separator'},
    row('전체 선택','selectAll',f.canSelectAll)
  ];
}
function attachTextContextMenu(win,Menu,allowSelection=false,chatScope=false){
  const contents=win.webContents;
  contents.on('context-menu',async(_event,params)=>{
    if(win.isDestroyed()||contents.isDestroyed()||params.frame!==contents.mainFrame)return;
    let scopedSelect=null;
    if(chatScope&&!params.isEditable&&Number.isInteger(params.x)&&Number.isInteger(params.y)){
      const inside=await contents.executeJavaScript('Boolean(window.DeckForgeChatSelection?.inMessages(document,'+params.x+','+params.y+'))').catch(()=>false);
      if(win.isDestroyed()||contents.isDestroyed())return;
      if(inside)scopedSelect=()=>{void contents.executeJavaScript('window.DeckForgeChatSelection?.selectMessages(document)').catch(()=>{});};
    }
    const template=textMenuTemplate(params,contents,allowSelection,scopedSelect);
    if(template.length)Menu.buildFromTemplate(template).popup({window:win});
  });
}
module.exports={textMenuTemplate,attachTextContextMenu};
