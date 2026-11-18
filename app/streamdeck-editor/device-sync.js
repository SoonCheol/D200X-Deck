'use strict';
/* Display synchronization only. Do not execute action handlers in this stage.
 * Render each edited slot as PNG and let the isolated main process send a page.
 */
(() => {
  const bridge = window.deckBridge;
  const statusNode = document.getElementById('deck-status');
  const notice = document.querySelector('.prototype-note');
  if (!bridge) {
    if (statusNode) statusNode.title = '브라우저 미리보기: 장치 연결 없음';
    return;
  }

  let renderSerial = 0;
  let timeout = null;
  let lastSentImages = null;
  let online = false;
  const pressedKeys=new Map();
  const releaseTimers=new Map();
  const pageStamp=()=>String(state.profileId)+':'+state.page+':'+(state.folderPath||[]).join('-');
  const keyPressed=index=>pressedKeys.get(index)===pageStamp();
  window.D200XPhysicalKeyPressed=keyPressed;
  const text = message => { if (notice) notice.textContent = message; };

  bridge.onStatus(status => {
    online = Boolean(status?.connected);
    if (statusNode) {
      statusNode.classList.toggle('online', online);
      statusNode.title = online
        ? 'D200X 연결됨 — 액션 등록 시 화면 동기화'
        : 'D200X 미연결 — ' + (status?.message || 'USB 장치를 찾을 수 없습니다.');
    }
    text(online
      ? 'D200X 연결됨 · 화면 동기화 · 페이지 이동/웹사이트 열기 실행 지원'
      : 'D200X 미연결 · ' + (status?.message || '장치 확인 중'));
    if (online) schedule();
  });
  bridge.onError(message => text('D200X 전송 오류: ' + message));
  bridge.onSynced(details => {
    if (online) text('D200X 화면 동기화 전송 완료 (' + details.slots + '개 키) · 실제 화면 확인 필요');
  });
  window.d200xActionStatus = message => text('D200X 동작 · ' + message);
  bridge.onKey(event => {
    // A brief visual press acknowledgement, independent of action/HA state.
    const keyIndex=Number(event?.index);
    // Wide key (13/14) has its own mode switch. Do not schedule full-page
    // press/release repaints: those can overwrite the newly chosen mode.
    if(Number(event?.kind)===1&&Number.isInteger(keyIndex)&&keyIndex>=0&&keyIndex<13){
      const oldTimer=releaseTimers.get(keyIndex);
      if(oldTimer){clearTimeout(oldTimer);releaseTimers.delete(keyIndex);}
      if(event.pressed){
        pressedKeys.set(keyIndex,pageStamp());
        schedule(0);window.refreshKeyPressIcons?.();
      }else{
        const raw=DeckCore.visibleActions(state)[keyIndex];
        const current=window.getD200XDisplayItem?.(raw,keyIndex);
        // Different Down artwork returns at the physical Up event.
        // Identical artwork preserves the existing short shrink animation.
        const release=()=>{
          pressedKeys.delete(keyIndex);releaseTimers.delete(keyIndex);
          schedule(0);window.refreshKeyPressIcons?.();
        };
        if(current?.keyPressAlternate)release();
        else releaseTimers.set(keyIndex,setTimeout(release,120));
      }
    }
    if((keyIndex===13||keyIndex===14)&&event?.pressed===true)
      console.info('[D200X wide display press]',{index:keyIndex,kind:event.kind,state:event.state});
    const result = window.executeD200XKey?.(event);
    if (result) { text('D200X 버튼 #' + event.index + ' · ' + result); return; }
    if((keyIndex===13||keyIndex===14)&&event?.pressed===true){
      text('가로 버튼 입력 수신 ('+keyIndex+') · 화면 전환 처리 안 됨');
      return;
    }
    const where = Number(event?.kind) === 1 ? '버튼' : '입력 종류 ' + event?.kind;
    const direction = event?.pressed ? '누름' : '뗌';
    if (event?.pressed) text('D200X 입력 수신 · ' + where + ' #' + event.index +
      ' · 해당 동작은 아직 실행되지 않음');
  });

  // Stream Deck renders title ON TOP of a fixed full-key icon. The source
  // font size is calibrated to a 72px Stream Deck key; D200X accepts 196px PNG.
  // Rendering both views from this compositor prevents CSS flex layout drift.
  function drawText(ctx, title, width, height, style) {
    if (!title || style?.visible === false) return;
    const alignment = ({left:'bottom',center:'middle',right:'top'})[style?.align]
      || (['top','middle','bottom'].includes(style?.align) ? style.align : 'bottom');
    const baseSize = Math.max(8, Math.min(48, Number(style?.size) || 12));
    const fontSize = baseSize * height / 72;
    const family = style?.family === 'Segoe UI' ? '"Segoe UI"'
      : style?.family === 'Malgun Gothic' ? '"Malgun Gothic"'
      : '"DeckForge Pretendard"';
    ctx.font = (style?.italic ? 'italic ' : '') +
      (style?.bold ? 'bold ' : '') + fontSize + 'px ' + family + ',sans-serif';
    ctx.fillStyle = style?.color || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    // Stream Deck text is overlaid on the icon, never used to reposition it.
    const maxWidth = width - 16;
    const lines = [];
    for (const paragraph of String(title).split(/\r?\n|<br\s*\/?>/gi)) {
      let line = '';
      for (const ch of Array.from(paragraph)) {
        if (ctx.measureText(line + ch).width > maxWidth && line) {
          lines.push(line);
          line = '';
        }
        line += ch;
      }
      if (line || paragraph === '') lines.push(line);
    }
    const lineHeight = fontSize * 1.13;
    const visibleLines = lines.slice(0, Math.max(1, Math.min(3, Math.floor((height - 12) / lineHeight))));
    const blockHeight = visibleLines.length * lineHeight;
    const top = alignment === 'top' ? 6
      : alignment === 'middle' ? (height - blockHeight)/2
      : height - blockHeight - 6;
    // Subtitle background is one rounded block, sized to the longest rendered line.
    if(style?.backgroundEnabled===true&&visibleLines.some(value=>value.trim())){
      const scale=height/144,padX=6*scale,padY=3*scale;
      const longest=Math.max(...visibleLines.map(value=>Math.min(maxWidth,ctx.measureText(value).width)));
      const w=Math.min(width,longest+padX*2),y=Math.max(0,top-padY);
      const h=Math.min(height-y,blockHeight+padY*2);
      const opacity=Number.isFinite(style.backgroundOpacity)?Math.max(0,Math.min(100,style.backgroundOpacity)):65;
      ctx.save();
      ctx.globalAlpha=opacity/100;
      ctx.fillStyle=/^#[0-9a-fA-F]{6}$/.test(style.backgroundColor)?style.backgroundColor:'#000000';
      ctx.beginPath();ctx.roundRect((width-w)/2,y,w,h,Math.min(8*scale,w/2,h/2));ctx.fill();
      ctx.restore();
    }
    visibleLines.forEach((value,index)=>{
      const y = top + (index + 0.5) * lineHeight;
      // A subtle black outline is readable over bright icons without
      // introducing an extra title background not shown in Stream Deck.
      const outlineColor = /^#[0-9a-fA-F]{6}$/.test(style?.outlineColor)
        ? style.outlineColor : '#000000';
      const outlineWidth = {none:0,thin:fontSize/16,medium:fontSize/10,thick:fontSize/6}
        [style?.outlineWidth || 'thin'] ?? fontSize/16;
      if(outlineWidth>0){
        ctx.strokeStyle=outlineColor;
        ctx.lineWidth=Math.max(1,outlineWidth);
        ctx.strokeText(value,width/2,y,maxWidth);
      }
      ctx.fillText(value,width/2,y,maxWidth);
      if(style?.underline){
        const actual = Math.min(maxWidth,ctx.measureText(value).width);
        ctx.fillRect((width-actual)/2,y+fontSize*0.48,actual,Math.max(1,fontSize/15));
      }
    });
  }

  function imageLoaded(source) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = source;
    });
  }

  function drawWidePanel(ctx,width,height,mode){
    const now=new Date();
    const text=(value,x,y,font,align='center',color='#f2f5fa')=>{
      ctx.font=font;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(value,x,y);
    };
    ctx.fillStyle='#111823';ctx.fillRect(0,0,width,height);
    const w=width,h=height;
    if(mode==='clock'){
      const radius=69,cx=88,cy=h/2;
      ctx.strokeStyle='#7e93ab';ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke();
      for(let i=0;i<12;i++){
        const angle=i*Math.PI/6-Math.PI/2;
        const x1=cx+Math.cos(angle)*(radius-12),y1=cy+Math.sin(angle)*(radius-12);
        const x2=cx+Math.cos(angle)*(radius-5),y2=cy+Math.sin(angle)*(radius-5);
        ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      }
      const hands=[[((now.getHours()%12)+now.getMinutes()/60)*Math.PI/6,39,5],
        [(now.getMinutes()+now.getSeconds()/60)*Math.PI/30,56,3],
        [now.getSeconds()*Math.PI/30,60,1]];
      hands.forEach(([angle,len,lineWidth])=>{
        const a=angle-Math.PI/2;ctx.lineWidth=lineWidth;
        ctx.strokeStyle=lineWidth===1?'#fa7272':'#e8f1fa';
        ctx.beginPath();ctx.moveTo(cx,cy);
        ctx.lineTo(cx+Math.cos(a)*len,cy+Math.sin(a)*len);ctx.stroke();
      });
      const hh=String(now.getHours()).padStart(2,'0'),mm=String(now.getMinutes()).padStart(2,'0');
      text(hh+':'+mm,278,82,'bold 49px "Segoe UI",sans-serif');
      text(now.toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit',weekday:'short'}),278,134,'22px "Malgun Gothic",sans-serif','center','#aebbd0');
    }else if(mode==='datetime'){
      const date=now.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'});
      const day=now.toLocaleDateString('ko-KR',{weekday:'long'});
      text(date,w/2,43,'bold 27px "Malgun Gothic",sans-serif');
      text(now.toLocaleTimeString('ko-KR',{hour12:false,hour:'2-digit',minute:'2-digit'}),w/2,107,'bold 60px "Segoe UI",sans-serif');
      text(day,w/2,167,'24px "Malgun Gothic",sans-serif','center','#aebbd0');
    }else if(mode==='knobs'){
      const info=window.D200XKnobInfo?.()||[];
      info.slice(0,3).forEach((knob,i)=>{
        const x=65+i*131;
        if(i){
          ctx.strokeStyle='#364657';ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(i*131,22);ctx.lineTo(i*131,174);ctx.stroke();
        }
        // Bound each label to its own 112px column; never spill into a
        // neighboring knob, even with long Korean titles.
        const draw=(value,y,size,color='#f2f5fa')=>{
          ctx.font='bold '+size+'px "Malgun Gothic",sans-serif';
          ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;
          ctx.fillText(String(value),x,y,112);
        };
        draw(knob.name||'노브 '+(i+1),38,18,'#aebbd0');
        draw(knob.title||'미설정',99,19);
        if(knob.detail&&knob.detail!==knob.title)
          draw(knob.detail,150,14,'#aebbd0');
      });
    }else{
      text('CPU',76,55,'bold 25px "Segoe UI",sans-serif');
      text('RAM',196,55,'bold 25px "Segoe UI",sans-serif');
      text('GPU',316,55,'bold 25px "Segoe UI",sans-serif');
      text('장치에서 실시간 표시',w/2,125,'21px "Malgun Gothic",sans-serif','center','#aebbd0');
    }
  }
  async function drawSlot(item, index) {
    const wide = index === 13;
    const width = wide ? 392 : 196;
    const height = 196;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const background=item?.keyBackground||item?.settings?.keyBackgrounds?.default;
    const baseColor=!wide&&background?.enabled===true&&/^#[0-9a-fA-F]{6}$/.test(background.color)?background.color:'#08090c';
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, width, height);
    if(item?.type==='wide-display'){
      // The custom knobs screen is rendered as PNG; the device-native mode must stay blank.
      drawWidePanel(ctx,width,height,window.D200XWideModeName?.()||'clock');
      return {index,png:canvas.toDataURL('image/png').split(',')[1]};
    }
    if (item) {
      const fallback = ACTIONS.get(item.type)?.icon || '•';
      if (item.icon?.kind === 'file' && typeof item.icon.value === 'string') {
        const image = await imageLoaded(item.icon.value);
        if (image) {
          const limitWidth = width, limitHeight = height;
          const scale = Math.min(limitWidth / image.width, limitHeight / image.height);
          const w = image.width * scale, h = image.height * scale;
          ctx.drawImage(image, (width - w)/2, (height - h)/2, w, h);
        }
      } else if (!item.icon?.glyph && window.D200XPanelIcons?.artwork?.(item.type)) {
        const image = await imageLoaded(window.D200XPanelIcons.artwork(item.type));
        if (image) {
          const side = Math.min(width, height) * 0.79;
          ctx.drawImage(image, (width-side)/2, (height-side)/2, side, side);
        } else {
          ctx.font = '154px "Segoe UI Symbol","Malgun Gothic",sans-serif';
          ctx.fillStyle = '#f3f3f3';
          ctx.textAlign = 'center';ctx.textBaseline = 'middle';
          ctx.fillText(fallback, width/2, height/2);
        }
      } else if ((item.type === 'previous' || item.type === 'next') && !item.icon?.glyph) {
        // The current placeholder font renders arrow symbols inconsistently
        // on some Windows fonts; draw the direction explicitly instead.
        const backward = item.type === 'previous';
        const centerX = width/2;
        const centerY = height/2;
        const extent = Math.min(width,height) * 0.30;
        const sign = backward ? -1 : 1;
        ctx.strokeStyle = '#f3f3f3';
        ctx.lineWidth = Math.max(10,height*0.105);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(centerX-sign*extent,centerY);
        ctx.lineTo(centerX+sign*extent,centerY);
        ctx.moveTo(centerX,centerY-extent*0.72);
        ctx.lineTo(centerX+sign*extent,centerY);
        ctx.lineTo(centerX,centerY+extent*0.72);
        ctx.stroke();
      } else {
        ctx.font = '154px "Segoe UI Symbol","Malgun Gothic",sans-serif';
        ctx.fillStyle = '#f3f3f3';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.icon?.glyph || fallback, width/2, height/2, Math.min(172,width-12));
      }
      drawText(ctx, item.title || '', width, height, item.titleStyle);
      // Offline indicator is an overlay; never alter the original cached PNG.
      if(item.fusionOffline){
        const r=Math.max(11,Math.round(Math.min(width,height)*0.095));
        const x=width-r-8,y=r+8;
        ctx.fillStyle='#15171c';ctx.beginPath();ctx.arc(x,y,r+4,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#e5484d';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(3,r*.2);ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(x-r*.45,y-r*.45);ctx.lineTo(x+r*.45,y+r*.45);
        ctx.moveTo(x+r*.45,y-r*.45);ctx.lineTo(x-r*.45,y+r*.45);ctx.stroke();
      }
      if((keyPressed(index)||item.previewPressed===true)&&!item.keyPressAlternate){
        const snapshot=document.createElement('canvas');
        snapshot.width=width;snapshot.height=height;
        snapshot.getContext('2d').drawImage(canvas,0,0);
        ctx.fillStyle=baseColor;ctx.fillRect(0,0,width,height);
        const inset=Math.round(Math.min(width,height)*0.05);
        ctx.drawImage(snapshot,inset,inset,width-inset*2,height-inset*2);
      }
    }
    return {index, png: canvas.toDataURL('image/png').split(',')[1]};
  }

  // Same compositor feeds the inspector preview and the D200X transfer.
  window.renderDeckKeyImage = async (item,index=0,previewPressed=false) => (await drawSlot(previewPressed?{...item,previewPressed:true}:item, index)).png;
  renderGrid();
  window.refreshSelectedVisual?.();

  async function synchronize() {
    const serial = ++renderSerial;
    const page = DeckCore.visibleActions(state).slice(0, 14).map((item,index) =>
      item?JSON.parse(JSON.stringify(item)):
        state.folderPath?.length&&index===13
          ?{type:'folder-back',title:'뒤로',icon:{kind:'glyph',glyph:'↩'},titleStyle:DeckCore.TITLE}:null);
    try {
      await document.fonts?.ready;
      const images = await Promise.all(page.map((item,index) => drawSlot(
        window.getD200XDisplayItem
          ? window.getD200XDisplayItem(item,index)
          : item?.type === 'indicator'
            ? {...item,icon:{kind:'glyph',glyph:String(state.page+1)}}
            : DeckCore.displaySwitchAction(item),index
      )));
      if (serial !== renderSerial) return;
      lastSentImages=images;
      bridge.syncPage(images,window.getD200XWideMode?.()||'blank');
    } catch (error) {
      text('D200X 아이콘 생성 오류: ' + String(error?.message || error));
    }
  }
  function schedule(delay=250) {
    ++renderSerial;
    if (timeout !== null) clearTimeout(timeout);
    timeout = setTimeout(() => { timeout = null; synchronize(); }, delay);
  }
  window.scheduleDeckSync = schedule;
  // Wide-mode cycling changes only slot 13. Reuse the last complete set
  // of physical key bitmaps rather than re-rendering all fourteen on every
  // press. The existing whole-page synchronization remains the fallback
  // for initial connection, page changes and all other edits.
  window.scheduleD200XWideSync=()=>{
    if(!lastSentImages||lastSentImages.length!==14){schedule(0);return;}
    const serial=++renderSerial;
    if(timeout!==null){clearTimeout(timeout);timeout=null;}
    const wide=window.getD200XDisplayItem?.(null,13);
    if(wide?.type!=='wide-display'){schedule(0);return;}
    drawSlot(wide,13).then(image=>{
      if(serial!==renderSerial)return;
      const images=lastSentImages.slice();
      images[13]=image;
      lastSentImages=images;
      bridge.syncPage(images,window.getD200XWideMode?.()||'blank');
    }).catch(error=>{
      text('가로 화면 전환 이미지 오류: '+String(error?.message||error));
      schedule(0);
    });
  };
  bridge.ready();
  schedule();
  // Refresh the date/time image without polling or overwriting unrelated keys.
  setInterval(()=>{
    if(window.getD200XWideMode?.()==='blank'&&window.D200XWideModeName?.()==='datetime'){
      window.renderGridWideClock?.();schedule();
    }
  },60_000);
})();
