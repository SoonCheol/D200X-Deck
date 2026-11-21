/* Shared DeckForge message dialogs. No HTML injection or changes to backup state. */
(function(){
  'use strict';
  let serial=0;
  const icons={info:'i',success:'✓',warning:'!',error:'×'};
  function element(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined&&text!==null)node.textContent=String(text);
    return node;
  }
  function show({title,kind='info',intro='',fields=[],included=[],excluded=[],detailLabel='',detail='',warning='',ask=false,actionLabel='확인',cancelLabel='취소'}={}){
    if(typeof title!=='string'||!title.trim()||!Object.hasOwn(icons,kind))throw Error('대화상자 제목 또는 상태가 올바르지 않습니다.');
    return new Promise(resolve=>{
      const dialog=element('dialog','deckforge-message-dialog');
      dialog.setAttribute('aria-labelledby','deckforge-message-title-'+(++serial));
      const header=element('header','deckforge-message-header');
      const product=element('strong','deckforge-message-product','DeckForge');
      const close=element('button','deckforge-message-close','×');
      close.type='button';close.setAttribute('aria-label','닫기');
      close.addEventListener('click',()=>dialog.close('cancel'));
      header.append(product,close);
      const main=element('div','deckforge-message-main');
      const headline=element('div','deckforge-message-heading');
      const icon=element('span','deckforge-message-icon deckforge-message-icon-'+kind,icons[kind]);
      icon.setAttribute('aria-hidden','true');
      const name=element('strong','deckforge-message-title',title);
      name.id=dialog.getAttribute('aria-labelledby');
      headline.append(icon,name);main.append(headline);
      if(intro)main.append(element('p','deckforge-message-intro',intro));
      if(fields.length){
        const fieldBox=element('dl','deckforge-message-fields');
        for(const field of fields){
          fieldBox.append(element('dt','',field.label),element('dd','',field.value));
        }
        main.append(fieldBox);
      }
      function items(heading,values,cls){
        if(!values.length)return;
        const section=element('section','deckforge-message-section '+cls);
        section.append(element('strong','deckforge-message-section-heading',heading));
        const list=element('ul','deckforge-message-list');
        for(const value of values)list.append(element('li','',value));
        section.append(list);main.append(section);
      }
      items('백업에 포함되는 항목',included,'deckforge-message-included');
      items('백업에서 제외되는 항목',excluded,'deckforge-message-excluded');
      if(detail){
        const details=element('section','deckforge-message-detail');
        if(detailLabel)details.append(element('strong','deckforge-message-detail-label',detailLabel));
        details.append(element('div','deckforge-message-detail-value',detail));
        main.append(details);
      }
      if(warning){
        const caution=element('div','deckforge-message-warning');
        caution.append(element('span','deckforge-message-warning-icon','!'),element('span','',warning));
        main.append(caution);
      }
      const footer=element('footer','deckforge-message-footer');
      if(ask){
        const cancel=element('button','deckforge-message-button',cancelLabel);
        cancel.type='button';cancel.addEventListener('click',()=>dialog.close('cancel'));
        footer.append(cancel);
      }
      const accept=element('button','deckforge-message-button deckforge-message-primary',actionLabel);
      accept.type='button';accept.addEventListener('click',()=>dialog.close('accept'));
      footer.append(accept);
      dialog.append(header,main,footer);
      dialog.addEventListener('close',()=>{const accepted=dialog.returnValue==='accept';dialog.remove();resolve(accepted);},{once:true});
      document.body.append(dialog);dialog.showModal();accept.focus();
    });
  }
  window.DeckForgeDialogs=Object.freeze({show});
})();