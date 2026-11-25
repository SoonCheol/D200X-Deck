'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.DeckForgeChatSelection=api;api.install(root.document);}
})(globalThis,()=>{
  function selectMessages(doc){
    const messages=doc.getElementById('messages'),selection=doc.getSelection();
    if(!messages||!selection||!messages.querySelector('.message'))return false;
    const range=doc.createRange();range.selectNodeContents(messages);
    selection.removeAllRanges();selection.addRange(range);return true;
  }
  function inMessages(doc,x,y){
    return !!doc.elementFromPoint(x,y)?.closest('#messages');
  }
  function install(doc){
    doc.addEventListener('keydown',event=>{
      if(event.defaultPrevented||event.isComposing||event.altKey||event.shiftKey||!(event.ctrlKey||event.metaKey)||String(event.key).toLowerCase()!=='a')return;
      // Native field selection and select controls retain their default semantics.
      const node=event.target;
      if(node?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')||node?.isContentEditable)return;
      event.preventDefault();selectMessages(doc);
    },true);
  }
  return {selectMessages,inMessages,install};
});
