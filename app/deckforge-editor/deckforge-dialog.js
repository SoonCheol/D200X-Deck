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
  function show({title,kind='info',intro='',fields=[],included=[],excluded=[],content=null,onAccept=null,detailLabel='',detail='',copyDetail=false,warning='',ask=false,actionLabel='확인',cancelLabel='취소',alternateLabel='',anchorTop=false,anchorCard=null}={}){
    if(typeof title!=='string'||!title.trim()||!Object.hasOwn(icons,kind))throw Error('대화상자 제목 또는 상태가 올바르지 않습니다.');
    return new Promise(resolve=>{
      const dialog=element('dialog','deckforge-message-dialog'+(content?' deckforge-message-dialog-selection':''));
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
      if(content){if(typeof content!=='object'||typeof content.append!=='function')throw Error('대화상자 내용이 올바르지 않습니다.');main.append(content);}
      items('백업에서 제외되는 항목',excluded,'deckforge-message-excluded');
      if(detail){
        const details=element('section','deckforge-message-detail');
        if(copyDetail){
          const toolbar=element('div','deckforge-message-detail-toolbar');
          if(detailLabel)toolbar.append(element('strong','deckforge-message-detail-label',detailLabel));
          const copy=element('button','deckforge-message-detail-copy','내용 복사');
          copy.type='button';
          const value=element('textarea','deckforge-message-detail-text');
          value.value=String(detail);value.readOnly=true;value.spellcheck=false;
          value.rows=Math.max(3,Math.min(13,value.value.split('\n').length));
          value.setAttribute('aria-label',detailLabel||'내용');
          copy.addEventListener('click',async()=>{
            try{
              if(window.deckBridge?.copyDialogText)await window.deckBridge.copyDialogText(value.value);
              else if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value.value);
              else throw Error('Clipboard unavailable');
              copy.textContent='복사됨';
            }catch{copy.textContent='복사 실패';}
          });
          toolbar.append(copy);details.append(toolbar,value);
        }else{
          if(detailLabel)details.append(element('strong','deckforge-message-detail-label',detailLabel));
          details.append(element('div','deckforge-message-detail-value',detail));
        }
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
      if(alternateLabel){
        const alternate=element('button','deckforge-message-button',alternateLabel);
        alternate.type='button';alternate.addEventListener('click',()=>dialog.close('alternate'));
        footer.append(alternate);
      }
      const accept=element('button','deckforge-message-button deckforge-message-primary',actionLabel);
      accept.type='button';accept.addEventListener('click',()=>{if(onAccept&&onAccept()===false)return;dialog.close('accept');});
      footer.append(accept);
      dialog.append(header,main,footer);
      dialog.addEventListener('close',()=>{const choice=dialog.returnValue==='accept'?true:dialog.returnValue==='alternate'?'alternate':false;dialog.remove();resolve(choice);},{once:true});
      document.body.append(dialog);dialog.showModal();
      if(anchorCard?.isConnected){
        const rect=anchorCard.getBoundingClientRect();
        const width=window.innerWidth,height=window.innerHeight;
        const top=Math.max(8,Math.min(Math.round(rect.top),height-80));
        const right=Math.round(rect.right)+8,leftSpace=Math.round(rect.left)-16,rightSpace=width-right-8;
        const desired=Math.min(dialog.getBoundingClientRect().width||650,width-16);
        // Prefer the card's right edge + 8px. Only use the opposite side or
        // clamp when the available viewport cannot contain the dialog.
        let left=right,maxWidth=rightSpace;
        if(rightSpace<320&&leftSpace>rightSpace){maxWidth=leftSpace;left=Math.round(rect.left)-8-Math.min(desired,maxWidth);}
        if(maxWidth<320){maxWidth=width-16;left=Math.max(8,Math.min(right,width-8-Math.min(desired,maxWidth)));}
        Object.assign(dialog.style,{position:'fixed',top:top+'px',left:Math.max(8,left)+'px',right:'auto',bottom:'auto',margin:'0',maxWidth:Math.max(0,maxWidth)+'px',maxHeight:'min(720px, calc(100vh - '+(top+8)+'px))'});
      }else if(anchorTop){
        // Capture the initial viewport position once, rather than recentering
        // whenever search results or other dynamic fields change height.
        const top=Math.max(8,Math.round(dialog.getBoundingClientRect().top));
        dialog.style.top=top+'px';dialog.style.bottom='auto';dialog.style.marginBlock='0';
        dialog.style.maxHeight='min(720px, calc(100vh - '+(top+8)+'px))';
      }
      accept.focus();
    });
  }
  window.DeckForgeDialogs=Object.freeze({show});
})();