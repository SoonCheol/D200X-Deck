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
  let online = false;
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
    const result = window.executeD200XKey?.(event);
    if (result) { text('D200X 버튼 #' + event.index + ' · ' + result); return; }
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
      : '"Malgun Gothic"';
    ctx.font = (style?.italic ? 'italic ' : '') +
      (style?.bold ? 'bold ' : '') + fontSize + 'px ' + family + ',sans-serif';
    ctx.fillStyle = style?.color || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    // Stream Deck text is overlaid on the icon, never used to reposition it.
    const maxWidth = width - 16;
    const lines = [];
    for (const paragraph of String(title).split(/\r?\n/)) {
      let line = '';
      for (const ch of Array.from(paragraph)) {
        if (ctx.measureText(line + ch).width > maxWidth && line) {
          lines.push(line);
          line = '';
        }
        line += ch;
      }
      if (line) lines.push(line);
    }
    const lineHeight = fontSize * 1.13;
    const visibleLines = lines.slice(0, Math.max(1, Math.min(3, Math.floor((height - 12) / lineHeight))));
    const blockHeight = visibleLines.length * lineHeight;
    const top = alignment === 'top' ? 6
      : alignment === 'middle' ? (height - blockHeight)/2
      : height - blockHeight - 6;
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

  async function drawSlot(item, index) {
    const wide = index === 13;
    const width = wide ? 392 : 196;
    const height = 196;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#08090c';
    ctx.fillRect(0, 0, width, height);
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
        ctx.lineTo(centerX-sign*extent,centerY);
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
    }
    return {index, png: canvas.toDataURL('image/png').split(',')[1]};
  }

  // Same compositor feeds the inspector preview and the D200X transfer.
  window.renderDeckKeyImage = async (item,index=0) => (await drawSlot(item, index)).png;
  renderGrid();
  window.refreshSelectedVisual?.();

  async function synchronize() {
    const serial = ++renderSerial;
    const page = currentPage().slice(0, 14).map(item => item ? JSON.parse(JSON.stringify(item)) : null);
    try {
      await document.fonts?.ready;
      const images = await Promise.all(page.map((item,index) => drawSlot(
        item?.type === 'indicator'
          ? {...item, icon:{kind:'glyph',glyph:String(state.page+1)}}
          : item, index
      )));
      if (serial !== renderSerial) return;
      bridge.syncPage(images);
    } catch (error) {
      text('D200X 아이콘 생성 오류: ' + String(error?.message || error));
    }
  }
  function schedule() {
    ++renderSerial;
    if (timeout !== null) clearTimeout(timeout);
    timeout = setTimeout(() => { timeout = null; synchronize(); }, 250);
  }
  window.scheduleDeckSync = schedule;
  bridge.ready();
  schedule();
})();
