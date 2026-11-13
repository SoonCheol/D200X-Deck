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
      ? 'D200X 연결됨 · 편집 내용 화면 전송 활성 · 액션 실행은 아직 미구현'
      : 'D200X 미연결 · ' + (status?.message || '장치 확인 중'));
    if (online) schedule();
  });
  bridge.onError(message => text('D200X 전송 오류: ' + message));
  bridge.onSynced(details => {
    if (online) text('D200X 화면 동기화 전송 완료 (' + details.slots + '개 키) · 실제 화면 확인 필요');
  });
  bridge.onKey(event => {
    const where = Number(event?.kind) === 1 ? '버튼' : '입력 종류 ' + event.kind;
    const direction = event?.pressed ? '누름' : '뗌';
    text('D200X 입력 수신 · ' + where + ' #' + event.index + ' ' + direction +
         ' · 동작 실행은 아직 미구현');
  });

  function drawText(ctx, title, width, height, style) {
    if (!title || style?.visible === false) return;
    const size = Math.max(8, Math.min(48, Number(style?.size) || 12));
    const family = style?.family === 'Segoe UI' ? '"Segoe UI"'
      : style?.family === 'Malgun Gothic' ? '"Malgun Gothic"' : '"Malgun Gothic"';
    ctx.font = (style?.italic ? 'italic ' : '') +
      (style?.bold ? 'bold ' : '') + size + 'px ' + family + ',sans-serif';
    ctx.fillStyle = style?.color || '#ffffff';
    ctx.textAlign = style?.align === 'left' ? 'left' : style?.align === 'right' ? 'right' : 'center';
    const x = ctx.textAlign === 'left' ? 10 : ctx.textAlign === 'right' ? width - 10 : width / 2;
    ctx.textBaseline = 'bottom';
    const lines = [];
    for (const textLine of String(title).split(/\r?\n/)) {
      let line = '';
      for (const ch of Array.from(textLine)) {
        if (ctx.measureText(line + ch).width > width - 20 && line) {
          lines.push(line);
          line = '';
        }
        line += ch;
      }
      if (line) lines.push(line);
    }
    const shown = lines.slice(-Math.max(1, Math.min(3, Math.floor((height * 0.48) / (size + 4)))));
    shown.forEach((value, i) => {
      const y = height - 13 - (shown.length - i - 1) * (size + 4);
      ctx.fillText(value, x, y, width - 20);
      if (style?.underline) {
        const measured = Math.min(width - 20, ctx.measureText(value).width);
        const left = ctx.textAlign === 'left' ? x : ctx.textAlign === 'right' ? x - measured : x - measured/2;
        ctx.fillRect(left, y + 2, measured, Math.max(1, size/14));
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
      } else {
        ctx.font = '67px "Segoe UI Symbol","Malgun Gothic",sans-serif';
        ctx.fillStyle = '#f3f3f3';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.icon?.glyph || fallback, width/2, 78, width - 20);
      }
      drawText(ctx, item.title || ACTIONS.get(item.type)?.label, width, height, item.titleStyle);
    }
    return {index, png: canvas.toDataURL('image/png').split(',')[1]};
  }

  // Same compositor feeds the inspector preview and the D200X transfer.
  window.renderDeckKeyImage = async item => (await drawSlot(item, 0)).png;
  window.refreshSelectedVisual?.();

  async function synchronize() {
    const serial = ++renderSerial;
    const page = currentPage().slice(0, 14).map(item => item ? JSON.parse(JSON.stringify(item)) : null);
    try {
      await document.fonts?.ready;
      const images = await Promise.all(page.map(drawSlot));
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
